import { createHash, randomBytes } from 'node:crypto'
import {
  localConnectorIsOnline,
  localGitSyncDecision,
  normalizeLocalGitState,
  normalizeLocalSourceManifest,
} from '../shared/localConnector.js'
import {
  createSignedSystemOperationPlan,
  systemOperationSigningSecret,
  verifySignedSystemOperationPlan,
} from './systemOperationPlan.js'

export const LOCAL_GIT_SYNC_CONFIRMATION = 'QUEUE_LOCAL_GIT_SYNC'

const OPERATION_TYPE = 'local_git_sync'
const TOKEN_PATTERN = /^wclc_[a-f0-9]{64}$/
const OPERATION_ID_PATTERN = /^op-[a-f0-9]{64}$/

export class LocalConnectorError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'LocalConnectorError'
    this.status = status
    this.code = code
  }
}

function cleanText(value, maximum = 200) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  }
  return value
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function databaseError(error, fallback) {
  const message = String(error?.message ?? '')
  if (/local_connectors|does not exist|schema cache/i.test(message)) {
    return new LocalConnectorError(503, 'LOCAL_CONNECTOR_SQL_REQUIRED', '로컬 커넥터 SQL이 아직 적용되지 않았습니다.')
  }
  return new LocalConnectorError(500, 'LOCAL_CONNECTOR_DATABASE_ERROR', fallback)
}

function connectorRow(row, now = Date.now()) {
  if (!row) return null
  const connector = {
    id: row.id,
    label: row.label,
    tokenPrefix: row.token_prefix,
    repositoryLabel: row.repository_label ?? '',
    repositoryUrl: row.repository_url ?? '',
    manifest: row.manifest ?? null,
    manifestId: row.manifest_id ?? '',
    git: row.git_state ?? null,
    stateFingerprint: row.state_fingerprint ?? '',
    agentVersion: row.agent_version ?? '',
    lastSeenAt: row.last_seen_at ?? null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? null,
  }
  return {
    ...connector,
    online: !connector.revokedAt && localConnectorIsOnline(connector, now),
    sync: localGitSyncDecision(connector.git),
  }
}

async function loadOwnedConnector(db, userId, connectorId) {
  const { data, error } = await db
    .from('local_connectors')
    .select('*')
    .eq('id', connectorId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw databaseError(error, '로컬 커넥터를 불러오지 못했습니다.')
  if (!data) throw new LocalConnectorError(404, 'LOCAL_CONNECTOR_NOT_FOUND', '로컬 커넥터를 찾을 수 없습니다.')
  return data
}

export async function listLocalConnectors(db, userId, now = Date.now()) {
  const { data, error } = await db
    .from('local_connectors')
    .select('*')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw databaseError(error, '로컬 커넥터 목록을 불러오지 못했습니다.')
  const connectorIds = (data ?? []).map((row) => row.id)
  let operations = []
  if (connectorIds.length) {
    const result = await db
      .from('local_connector_operations')
      .select('operation_id,connector_id,action,status,requested_at,claimed_at,completed_at,result')
      .in('connector_id', connectorIds)
      .order('requested_at', { ascending: false })
      .limit(20)
    if (result.error) throw databaseError(result.error, 'Git 동기화 실행 이력을 불러오지 못했습니다.')
    operations = result.data ?? []
  }
  return {
    connectors: (data ?? []).map((row) => connectorRow(row, now)),
    operations: operations.map((row) => ({
      operationId: row.operation_id,
      connectorId: row.connector_id,
      action: row.action,
      status: row.status,
      requestedAt: row.requested_at,
      claimedAt: row.claimed_at,
      completedAt: row.completed_at,
      result: row.result ?? null,
    })),
  }
}

export async function createLocalConnector(db, { userId, label }) {
  const token = `wclc_${randomBytes(32).toString('hex')}`
  const row = {
    user_id: userId,
    token_hash: tokenHash(token),
    token_prefix: token.slice(0, 13),
    label: cleanText(label, 120) || '내 Mac 프로젝트',
  }
  const { data, error } = await db.from('local_connectors').insert(row).select('*').single()
  if (error) throw databaseError(error, '로컬 커넥터를 만들지 못했습니다.')
  return { connector: connectorRow(data), token }
}

export async function revokeLocalConnector(db, { userId, connectorId }) {
  const { data, error } = await db
    .from('local_connectors')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', connectorId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw databaseError(error, '로컬 커넥터를 해제하지 못했습니다.')
  if (!data) throw new LocalConnectorError(404, 'LOCAL_CONNECTOR_NOT_FOUND', '해제할 로컬 커넥터가 없습니다.')
  return { revoked: true, connectorId }
}

export async function resolveLocalConnectorToken(db, token) {
  if (!TOKEN_PATTERN.test(token ?? '')) return null
  const { data, error } = await db
    .from('local_connectors')
    .select('*')
    .eq('token_hash', tokenHash(token))
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw databaseError(error, '로컬 커넥터 인증을 확인하지 못했습니다.')
  return data ?? null
}

export async function recordLocalConnectorHeartbeat(db, connector, payload) {
  const manifest = normalizeLocalSourceManifest(payload?.manifest)
  const git = normalizeLocalGitState(payload?.git)
  if (!manifest || !git) {
    throw new LocalConnectorError(400, 'INVALID_LOCAL_CONNECTOR_STATE', '로컬 코드 구조 또는 Git 상태가 올바르지 않습니다.')
  }
  if (Buffer.byteLength(JSON.stringify(manifest), 'utf8') > 2_500_000) {
    throw new LocalConnectorError(413, 'LOCAL_MANIFEST_TOO_LARGE', '로컬 코드 구조가 허용 크기를 초과했습니다.')
  }
  const stateFingerprint = fingerprint({
    manifestId: manifest.id,
    git: {
      branch: git.branch,
      headSha: git.headSha,
      upstreamRef: git.upstreamRef,
      upstreamSha: git.upstreamSha,
      ahead: git.ahead,
      behind: git.behind,
      dirty: git.dirty,
    },
  })
  const update = {
    repository_label: cleanText(payload.repositoryLabel, 180) || manifest.source.label,
    repository_url: manifest.source.repositoryUrl,
    manifest,
    manifest_id: manifest.id,
    git_state: git,
    state_fingerprint: stateFingerprint,
    agent_version: cleanText(payload.agentVersion, 40),
    last_seen_at: new Date().toISOString(),
  }
  const { data, error } = await db
    .from('local_connectors')
    .update(update)
    .eq('id', connector.id)
    .is('revoked_at', null)
    .select('*')
    .single()
  if (error) throw databaseError(error, '로컬 프로젝트 상태를 저장하지 못했습니다.')
  return { connector: connectorRow(data), stateFingerprint }
}

export async function previewLocalGitSync(db, { userId, connectorId, env = process.env, now = new Date() }) {
  const row = await loadOwnedConnector(db, userId, connectorId)
  const connector = connectorRow(row, now.getTime())
  if (!connector.online) throw new LocalConnectorError(409, 'LOCAL_CONNECTOR_OFFLINE', '로컬 커넥터가 실행 중이 아닙니다.')
  const decision = localGitSyncDecision(connector.git)
  if (decision.action === 'blocked') throw new LocalConnectorError(409, 'LOCAL_GIT_SYNC_BLOCKED', decision.reason)
  const signed = createSignedSystemOperationPlan({
    operation: OPERATION_TYPE,
    actorId: userId,
    targetKey: `local-connector:${connectorId}`,
    stateFingerprint: connector.stateFingerprint,
    confirmation: LOCAL_GIT_SYNC_CONFIRMATION,
    scope: {
      label: '로컬 저장소와 GitHub 동기화',
      action: decision.action,
      reason: decision.reason,
      branch: connector.git.branch,
      headSha: connector.git.headSha,
      upstreamRef: connector.git.upstreamRef,
      upstreamSha: connector.git.upstreamSha,
      ahead: connector.git.ahead,
      behind: connector.git.behind,
    },
    writeSet: decision.action === 'noop' ? [] : [
      { resource: decision.action === 'push' ? 'github_remote_branch' : 'local_git_worktree', maximumRows: 1 },
      { resource: 'local_connector_operations', maximumRows: 1 },
      { resource: 'local_connector_operation_events', maximumRows: 2 },
    ],
    excludes: ['uncommitted-files', 'source-content', 'credential-values', 'force-push', 'automatic-commit'],
    recovery: {
      available: true,
      note: decision.action === 'push'
        ? '강제 push를 사용하지 않으며 기존 Git 커밋 이력이 보존됩니다.'
        : decision.action === 'pull_ff_only'
          ? 'fast-forward만 허용하므로 병합 커밋을 만들지 않으며 이전 커밋은 Git 이력에 남습니다.'
          : '변경할 내용이 없어 실행하지 않습니다.',
    },
  }, systemOperationSigningSecret(env), { now })
  return { plan: signed.publicPlan, plan_token: signed.token, decision }
}

export async function applyLocalGitSync(db, {
  userId,
  connectorId,
  planToken,
  confirmation,
  env = process.env,
  now = new Date(),
}) {
  const verified = verifySignedSystemOperationPlan(planToken, systemOperationSigningSecret(env), {
    actorId: userId,
    operation: OPERATION_TYPE,
    confirmation,
    now,
  })
  if (verified.payload.targetKey !== `local-connector:${connectorId}`) {
    throw new LocalConnectorError(409, 'LOCAL_CONNECTOR_PLAN_MISMATCH', '동기화 계획의 로컬 커넥터가 일치하지 않습니다.')
  }
  const row = await loadOwnedConnector(db, userId, connectorId)
  const connector = connectorRow(row, now.getTime())
  if (!connector.online) throw new LocalConnectorError(409, 'LOCAL_CONNECTOR_OFFLINE', '로컬 커넥터가 실행 중이 아닙니다.')
  if (connector.stateFingerprint !== verified.payload.stateFingerprint) {
    throw new LocalConnectorError(409, 'LOCAL_GIT_STATE_CHANGED', '미리보기 이후 로컬 또는 GitHub 상태가 달라졌습니다. 다시 미리보세요.')
  }
  const decision = localGitSyncDecision(connector.git)
  if (decision.action !== verified.payload.scope?.action) {
    throw new LocalConnectorError(409, 'LOCAL_GIT_DIRECTION_CHANGED', '동기화 방향이 달라졌습니다. 최신 상태로 다시 미리보세요.')
  }
  if (decision.action === 'blocked') throw new LocalConnectorError(409, 'LOCAL_GIT_SYNC_BLOCKED', decision.reason)
  if (decision.action === 'noop') return { queued: false, operationId: verified.id, status: 'already_synced' }
  const operation = {
    operation_id: verified.id,
    connector_id: connectorId,
    user_id: userId,
    action: decision.action,
    status: 'queued',
    state_fingerprint: connector.stateFingerprint,
    expected_state: {
      branch: connector.git.branch,
      headSha: connector.git.headSha,
      upstreamRef: connector.git.upstreamRef,
      upstreamSha: connector.git.upstreamSha,
      ahead: connector.git.ahead,
      behind: connector.git.behind,
      dirty: connector.git.dirty,
    },
  }
  const { error } = await db.from('local_connector_operations').insert(operation)
  if (error) {
    if (/duplicate|unique/i.test(String(error.message))) {
      throw new LocalConnectorError(409, 'LOCAL_GIT_OPERATION_REPLAYED', '같은 동기화 계획은 다시 실행할 수 없습니다.')
    }
    throw databaseError(error, 'Git 동기화 작업을 대기열에 넣지 못했습니다.')
  }
  const eventResult = await db.from('local_connector_operation_events').insert({
    operation_id: verified.id,
    connector_id: connectorId,
    user_id: userId,
    event_type: 'queued',
    detail: { action: decision.action, stateFingerprint: connector.stateFingerprint },
  })
  if (eventResult.error) throw databaseError(eventResult.error, 'Git 동기화 감사 기록을 만들지 못했습니다.')
  return { queued: true, operationId: verified.id, status: 'queued', action: decision.action }
}

export async function claimLocalGitSyncOperation(db, connector) {
  const query = await db
    .from('local_connector_operations')
    .select('*')
    .eq('connector_id', connector.id)
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (query.error) throw databaseError(query.error, 'Git 동기화 대기열을 읽지 못했습니다.')
  if (!query.data) return { operation: null }
  const claimedAt = new Date().toISOString()
  const claimed = await db
    .from('local_connector_operations')
    .update({ status: 'running', claimed_at: claimedAt })
    .eq('operation_id', query.data.operation_id)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle()
  if (claimed.error) throw databaseError(claimed.error, 'Git 동기화 작업을 시작하지 못했습니다.')
  if (!claimed.data) return { operation: null }
  const eventResult = await db.from('local_connector_operation_events').insert({
    operation_id: claimed.data.operation_id,
    connector_id: connector.id,
    user_id: connector.user_id,
    event_type: 'running',
    detail: { action: claimed.data.action },
  })
  if (eventResult.error) throw databaseError(eventResult.error, 'Git 동기화 시작 기록을 남기지 못했습니다.')
  return {
    operation: {
      operationId: claimed.data.operation_id,
      action: claimed.data.action,
      stateFingerprint: claimed.data.state_fingerprint,
      expectedState: claimed.data.expected_state,
    },
  }
}

export async function completeLocalGitSyncOperation(db, connector, payload) {
  const operationId = cleanText(payload?.operationId, 80)
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw new LocalConnectorError(400, 'INVALID_LOCAL_OPERATION_ID', 'Git 동기화 작업 ID가 올바르지 않습니다.')
  }
  const succeeded = payload?.status === 'succeeded'
  const result = {
    summary: cleanText(payload?.result?.summary, 400) || (succeeded ? 'Git 동기화를 완료했습니다.' : 'Git 동기화가 실패했습니다.'),
    beforeHeadSha: cleanText(payload?.result?.beforeHeadSha, 64),
    afterHeadSha: cleanText(payload?.result?.afterHeadSha, 64),
    remoteSha: cleanText(payload?.result?.remoteSha, 64),
  }
  const completed = await db
    .from('local_connector_operations')
    .update({ status: succeeded ? 'succeeded' : 'failed', completed_at: new Date().toISOString(), result })
    .eq('operation_id', operationId)
    .eq('connector_id', connector.id)
    .eq('status', 'running')
    .select('operation_id')
    .maybeSingle()
  if (completed.error) throw databaseError(completed.error, 'Git 동기화 결과를 저장하지 못했습니다.')
  if (!completed.data) throw new LocalConnectorError(409, 'LOCAL_OPERATION_NOT_RUNNING', '실행 중인 Git 동기화 작업을 찾을 수 없습니다.')
  const eventResult = await db.from('local_connector_operation_events').insert({
    operation_id: operationId,
    connector_id: connector.id,
    user_id: connector.user_id,
    event_type: succeeded ? 'succeeded' : 'failed',
    detail: result,
  })
  if (eventResult.error) throw databaseError(eventResult.error, 'Git 동기화 완료 기록을 남기지 못했습니다.')
  return { completed: true, operationId, status: succeeded ? 'succeeded' : 'failed' }
}
