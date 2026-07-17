import { createHash, randomBytes } from 'node:crypto'
import {
  localConnectorIsOnline,
  localGitSyncDecision,
  normalizeLocalGitState,
  normalizeLocalSourceManifest,
  sortLocalConnectorsForDisplay,
} from '../shared/localConnector.js'
import {
  createSignedSystemOperationPlan,
  systemOperationSigningSecret,
  verifySignedSystemOperationPlan,
} from './systemOperationPlan.js'
import {
  WORKFLOW_GIT_SYNC_CONFIRMATION,
  WORKFLOW_GIT_SYNC_OPERATION_DEFINITION,
  WORKFLOW_SOURCE_EDIT_CONFIRMATION,
  WORKFLOW_SOURCE_EDIT_OPERATION_DEFINITION,
  WORKFLOW_SOURCE_EDIT_ROLLBACK_CONFIRMATION,
  WORKFLOW_SOURCE_EDIT_ROLLBACK_OPERATION_DEFINITION,
} from '../shared/workflowOperationDefinitions.js'
import { SOURCE_CODE_PART_MANIFEST } from '../shared/sourceCodePartManifest.js'
import { sourceCodePartsForModule } from '../shared/sourceCodeParts.js'
import { normalizeSourceEditableValue } from '../shared/workflowSourceEditableProperties.js'

export const LOCAL_GIT_SYNC_CONFIRMATION = WORKFLOW_GIT_SYNC_CONFIRMATION
export const LOCAL_SOURCE_EDIT_CONFIRMATION = WORKFLOW_SOURCE_EDIT_CONFIRMATION
export const LOCAL_SOURCE_EDIT_ROLLBACK_CONFIRMATION = WORKFLOW_SOURCE_EDIT_ROLLBACK_CONFIRMATION

const OPERATION_TYPE = 'local_git_sync'
const SOURCE_EDIT_OPERATION_TYPE = 'local_source_edit'
const SOURCE_EDIT_ROLLBACK_OPERATION_TYPE = 'local_source_edit_rollback'
const SOURCE_EDIT_ACTION = 'source_edit'
const SOURCE_EDIT_ROLLBACK_ACTION = 'source_edit_rollback'
const TOKEN_PATTERN = /^wclc_[a-f0-9]{64}$/
const OPERATION_ID_PATTERN = /^op-[a-f0-9]{64}$/
const CONNECTOR_SELECT = [
  'id', 'user_id', 'token_prefix', 'label', 'repository_label', 'repository_url',
  'manifest', 'manifest_id', 'git_state', 'state_fingerprint', 'agent_version',
  'last_seen_at', 'revoked_at', 'created_at',
].join(',')
const OPERATION_CLAIM_SELECT = 'operation_id,connector_id,user_id,action,status,state_fingerprint,expected_state,requested_at,claimed_at'

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

export function normalizeLocalGitSyncVerification(value, expectedState) {
  if (!value || typeof value !== 'object' || value.status !== 'verified') return null
  const sha = (candidate) => {
    const normalized = cleanText(candidate, 64)
    return /^[a-f0-9]{40,64}$/i.test(normalized) ? normalized.toLowerCase() : ''
  }
  const verification = {
    status: 'verified',
    branch: cleanText(value.branch, 160),
    headSha: sha(value.headSha),
    upstreamRef: cleanText(value.upstreamRef, 200),
    upstreamSha: sha(value.upstreamSha),
    originFingerprint: sha(value.originFingerprint),
    ahead: Number(value.ahead),
    behind: Number(value.behind),
    dirty: Number(value.dirty),
  }
  const expected = expectedState ?? {}
  if (
    !verification.headSha
    || verification.headSha !== verification.upstreamSha
    || verification.branch !== expected.branch
    || verification.upstreamRef !== expected.upstreamRef
    || verification.originFingerprint !== expected.originFingerprint
    || verification.ahead !== 0
    || verification.behind !== 0
    || verification.dirty !== 0
  ) return null
  return verification
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
    .select(CONNECTOR_SELECT)
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
    .select(CONNECTOR_SELECT)
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
  const connectors = sortLocalConnectorsForDisplay((data ?? []).map((row) => connectorRow(row, now)), now)
  const rolledBackOperationIds = new Set(operations
    .filter((row) => row.action === SOURCE_EDIT_ROLLBACK_ACTION && row.status === 'succeeded')
    .map((row) => row.result?.originalOperationId)
    .filter(Boolean))
  return {
    connectors,
    operations: operations.map((row) => ({
      operationId: row.operation_id,
      connectorId: row.connector_id,
      action: row.action,
      status: row.status,
      requestedAt: row.requested_at,
      claimedAt: row.claimed_at,
      completedAt: row.completed_at,
      result: row.result ?? null,
      rolledBack: rolledBackOperationIds.has(row.operation_id),
    })),
  }
}

export async function createLocalConnector(db, { userId, label }) {
  const token = `wclc_${randomBytes(32).toString('hex')}`
  const row = {
    user_id: userId,
    token_hash: tokenHash(token),
    token_prefix: token.slice(0, 13),
    label: cleanText(label, 120) || '새 로컬 연결',
  }
  const { data, error } = await db.from('local_connectors').insert(row).select(CONNECTOR_SELECT).single()
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
    .select(CONNECTOR_SELECT)
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
      originFingerprint: git.originFingerprint,
      ahead: git.ahead,
      behind: git.behind,
      dirty: git.dirty,
      syncEnabled: git.syncEnabled,
      sourceWriteEnabled: git.sourceWriteEnabled,
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
    .select(CONNECTOR_SELECT)
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
      originFingerprint: connector.git.originFingerprint,
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
    contract: {
      definitionId: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.id,
      definitionFingerprint: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.fingerprint,
      initiatorKind: 'human_ui',
      risk: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.risk,
      sideEffect: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.sideEffect,
      approval: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.approval,
      timeoutMs: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.timeoutMs,
      verification: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.verification,
      recovery: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.recovery,
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
    definitionId: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.id,
    definitionFingerprint: WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.fingerprint,
    initiatorKind: 'human_ui',
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
      originFingerprint: connector.git.originFingerprint,
      ahead: connector.git.ahead,
      behind: connector.git.behind,
      dirty: connector.git.dirty,
      syncEnabled: connector.git.syncEnabled,
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

function requireSourceEditOwner(userId, env) {
  const ownerId = cleanText(env?.WORKFLOW_CANVAS_OWNER_USER_ID, 160)
  if (!ownerId || ownerId !== userId) {
    throw new LocalConnectorError(403, 'SOURCE_EDIT_OWNER_ONLY', '안전한 코드 편집 MVP는 시스템 지도 소유자만 사용할 수 있습니다.')
  }
}

function sourceEditPart(moduleId, partId) {
  const module = sourceCodePartsForModule(SOURCE_CODE_PART_MANIFEST, cleanText(moduleId, 800))
  const part = module?.parts?.find((item) => item.id === cleanText(partId, 240))
  if (!module || !part) throw new LocalConnectorError(404, 'SOURCE_EDIT_PART_NOT_FOUND', '편집할 코드 파츠를 찾을 수 없습니다.')
  if (!part.editable?.eligible || !part.editable?.property) {
    throw new LocalConnectorError(409, 'SOURCE_EDIT_NOT_REGISTERED', '이 코드 파츠는 안전 편집 대상으로 등록되지 않았습니다.')
  }
  return { module, part, property: part.editable.property }
}

function assertSourceEditConnector(connector, module, now) {
  if (!connector.online || !localConnectorIsOnline(connector, now.getTime())) {
    throw new LocalConnectorError(409, 'LOCAL_CONNECTOR_OFFLINE', '로컬 커넥터가 실행 중이 아닙니다.')
  }
  if (!connector.git?.sourceWriteEnabled) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_WRITE_DISABLED', '별도 코드 쓰기 동의로 로컬 커넥터를 다시 연결해야 합니다.')
  }
  if (!connector.git.originFingerprint) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_ORIGIN_UNPINNED', '고정된 GitHub origin을 확인할 수 없어 코드 편집을 차단했습니다.')
  }
  if (connector.git.dirty > 0) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_DIRTY', '커밋되지 않은 로컬 변경이 있어 격리 편집을 시작할 수 없습니다.')
  }
  const localEntity = connector.manifest?.entities?.find((item) => item.id === module.moduleId)
  if (
    connector.manifestId !== module.sourceManifestId
    || !localEntity
    || localEntity.fingerprint !== module.moduleFingerprint
  ) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_BASELINE_MISMATCH', '배포 코드 파츠와 로컬 저장소 기준이 다릅니다. 먼저 동기화·배포 상태를 맞춰 주세요.')
  }
}

function operationContract(definition) {
  return {
    definitionId: definition.id,
    definitionFingerprint: definition.fingerprint,
    initiatorKind: 'human_ui',
    risk: definition.risk,
    sideEffect: definition.sideEffect,
    approval: definition.approval,
    timeoutMs: definition.timeoutMs,
    verification: definition.verification,
    recovery: definition.recovery,
  }
}

async function queueLocalOperation(db, connector, userId, verified, action, expectedState) {
  const operation = {
    operation_id: verified.id,
    connector_id: connector.id,
    user_id: userId,
    action,
    status: 'queued',
    state_fingerprint: connector.stateFingerprint,
    expected_state: expectedState,
  }
  const { error } = await db.from('local_connector_operations').insert(operation)
  if (error) {
    if (/duplicate|unique/i.test(String(error.message))) {
      throw new LocalConnectorError(409, 'LOCAL_OPERATION_REPLAYED', '같은 승인 계획은 다시 실행할 수 없습니다.')
    }
    throw databaseError(error, '로컬 코드 작업을 대기열에 넣지 못했습니다.')
  }
  const eventResult = await db.from('local_connector_operation_events').insert({
    operation_id: verified.id,
    connector_id: connector.id,
    user_id: userId,
    event_type: 'queued',
    detail: { action, stateFingerprint: connector.stateFingerprint },
  })
  if (eventResult.error) throw databaseError(eventResult.error, '로컬 코드 작업 감사 기록을 만들지 못했습니다.')
  return { queued: true, operationId: verified.id, status: 'queued', action }
}

export async function previewLocalSourceEdit(db, {
  userId,
  connectorId,
  moduleId,
  partId,
  nextValue,
  env = process.env,
  now = new Date(),
}) {
  requireSourceEditOwner(userId, env)
  const context = sourceEditPart(moduleId, partId)
  const normalizedNext = normalizeSourceEditableValue(context.property.id, nextValue)
  if (!normalizedNext.valid) throw new LocalConnectorError(400, 'INVALID_SOURCE_EDIT_VALUE', normalizedNext.error)
  if (JSON.stringify(normalizedNext.value) === JSON.stringify(context.property.currentValue)) {
    throw new LocalConnectorError(409, 'SOURCE_EDIT_NO_CHANGE', '현재 값과 새 값이 같습니다.')
  }
  const row = await loadOwnedConnector(db, userId, connectorId)
  const connector = connectorRow(row, now.getTime())
  assertSourceEditConnector(connector, context.module, now)
  const definition = WORKFLOW_SOURCE_EDIT_OPERATION_DEFINITION
  const signed = createSignedSystemOperationPlan({
    operation: SOURCE_EDIT_OPERATION_TYPE,
    actorId: userId,
    targetKey: `local-connector:${connectorId}:${context.property.id}`,
    stateFingerprint: connector.stateFingerprint,
    confirmation: LOCAL_SOURCE_EDIT_CONFIRMATION,
    scope: {
      label: context.property.label,
      action: SOURCE_EDIT_ACTION,
      propertyId: context.property.id,
      propertyType: context.property.type,
      unit: context.property.unit,
      beforeValue: context.property.currentValue,
      afterValue: normalizedNext.value,
      owner: context.property.owner,
      impactScope: context.property.impactScope,
      requiredChecks: context.property.requiredChecks,
      moduleId: context.module.moduleId,
      partId: context.part.id,
      sourceManifestId: context.module.sourceManifestId,
      moduleFingerprint: context.module.moduleFingerprint,
      anchor: context.part.anchor,
      branch: connector.git.branch,
      headSha: connector.git.headSha,
      originFingerprint: connector.git.originFingerprint,
    },
    writeSet: [
      { resource: 'registered_ui_constant', maximumRows: 1 },
      { resource: 'isolated_local_git_worktree', maximumRows: 1 },
      { resource: 'local_git_commit', maximumRows: 1 },
      { resource: 'local_connector_operations', maximumRows: 1 },
      { resource: 'local_connector_operation_events', maximumRows: 8 },
    ],
    excludes: ['arbitrary-source-edit', 'automatic-push', 'credential-values', 'force-push', 'unregistered-property'],
    recovery: { available: true, note: '완료 뒤 별도 승인되는 롤백이 Git 이력을 지우지 않고 새 revert 커밋을 만듭니다.' },
    contract: operationContract(definition),
  }, systemOperationSigningSecret(env), { now })
  return { plan: signed.publicPlan, plan_token: signed.token, property: context.property }
}

export async function applyLocalSourceEdit(db, {
  userId,
  connectorId,
  planToken,
  confirmation,
  env = process.env,
  now = new Date(),
}) {
  requireSourceEditOwner(userId, env)
  const definition = WORKFLOW_SOURCE_EDIT_OPERATION_DEFINITION
  const verified = verifySignedSystemOperationPlan(planToken, systemOperationSigningSecret(env), {
    actorId: userId,
    operation: SOURCE_EDIT_OPERATION_TYPE,
    confirmation,
    definitionId: definition.id,
    definitionFingerprint: definition.fingerprint,
    initiatorKind: 'human_ui',
    now,
  })
  const scope = verified.payload.scope ?? {}
  if (verified.payload.targetKey !== `local-connector:${connectorId}:${scope.propertyId}`) {
    throw new LocalConnectorError(409, 'LOCAL_CONNECTOR_PLAN_MISMATCH', '편집 계획의 로컬 커넥터나 속성이 일치하지 않습니다.')
  }
  const context = sourceEditPart(scope.moduleId, scope.partId)
  if (
    context.property.id !== scope.propertyId
    || context.module.sourceManifestId !== scope.sourceManifestId
    || context.module.moduleFingerprint !== scope.moduleFingerprint
    || context.part.anchor.fingerprint !== scope.anchor?.fingerprint
    || JSON.stringify(context.property.currentValue) !== JSON.stringify(scope.beforeValue)
  ) throw new LocalConnectorError(409, 'SOURCE_EDIT_PLAN_STALE', '미리보기 이후 코드 파츠나 등록 속성이 달라졌습니다.')
  const row = await loadOwnedConnector(db, userId, connectorId)
  const connector = connectorRow(row, now.getTime())
  if (connector.stateFingerprint !== verified.payload.stateFingerprint) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_STATE_CHANGED', '미리보기 이후 로컬 코드 또는 Git 상태가 달라졌습니다.')
  }
  assertSourceEditConnector(connector, context.module, now)
  return queueLocalOperation(db, connector, userId, verified, SOURCE_EDIT_ACTION, {
    branch: connector.git.branch,
    headSha: connector.git.headSha,
    originFingerprint: connector.git.originFingerprint,
    dirty: connector.git.dirty,
    sourceWriteEnabled: connector.git.sourceWriteEnabled,
    sourceManifestId: context.module.sourceManifestId,
    moduleFingerprint: context.module.moduleFingerprint,
    moduleId: context.module.moduleId,
    partId: context.part.id,
    propertyId: context.property.id,
    label: context.property.label,
    path: context.property.anchor.path,
    beforeValue: context.property.currentValue,
    afterValue: scope.afterValue,
    anchor: context.part.anchor,
  })
}

async function loadCompletedSourceEdit(db, userId, connectorId, operationId) {
  const query = await db
    .from('local_connector_operations')
    .select('operation_id,connector_id,user_id,action,status,result')
    .eq('operation_id', operationId)
    .eq('connector_id', connectorId)
    .eq('user_id', userId)
    .maybeSingle()
  if (query.error) throw databaseError(query.error, '되돌릴 편집 작업을 확인하지 못했습니다.')
  if (!query.data || query.data.action !== SOURCE_EDIT_ACTION || query.data.status !== 'succeeded' || !query.data.result?.verification) {
    throw new LocalConnectorError(404, 'SOURCE_EDIT_RESULT_NOT_FOUND', '완료된 Source Lens 편집 작업을 찾을 수 없습니다.')
  }
  return query.data
}

export async function previewLocalSourceEditRollback(db, {
  userId,
  connectorId,
  operationId,
  env = process.env,
  now = new Date(),
}) {
  requireSourceEditOwner(userId, env)
  const original = await loadCompletedSourceEdit(db, userId, connectorId, operationId)
  const row = await loadOwnedConnector(db, userId, connectorId)
  const connector = connectorRow(row, now.getTime())
  if (!connector.online || !connector.git?.sourceWriteEnabled || connector.git.dirty > 0 || !connector.git.originFingerprint) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_ROLLBACK_BLOCKED', '온라인 코드 쓰기 커넥터와 깨끗한 Git 상태가 필요합니다.')
  }
  if (connector.git.headSha !== original.result.commitSha) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_ROLLBACK_HEAD_CHANGED', '편집 뒤 다른 커밋이 생겨 자동 롤백을 막았습니다. Git 이력을 검토해 주세요.')
  }
  const definition = WORKFLOW_SOURCE_EDIT_ROLLBACK_OPERATION_DEFINITION
  const signed = createSignedSystemOperationPlan({
    operation: SOURCE_EDIT_ROLLBACK_OPERATION_TYPE,
    actorId: userId,
    targetKey: `local-connector:${connectorId}:${original.operation_id}`,
    stateFingerprint: connector.stateFingerprint,
    confirmation: LOCAL_SOURCE_EDIT_ROLLBACK_CONFIRMATION,
    scope: {
      label: `${original.result.label} 되돌리기`,
      action: SOURCE_EDIT_ROLLBACK_ACTION,
      originalOperationId: original.operation_id,
      originalCommitSha: original.result.commitSha,
      propertyId: original.result.propertyId,
      beforeValue: original.result.afterValue,
      afterValue: original.result.beforeValue,
      branch: connector.git.branch,
      headSha: connector.git.headSha,
      originFingerprint: connector.git.originFingerprint,
    },
    writeSet: [
      { resource: 'registered_ui_constant', maximumRows: 1 },
      { resource: 'isolated_local_git_worktree', maximumRows: 1 },
      { resource: 'local_git_commit', maximumRows: 1 },
      { resource: 'local_connector_operations', maximumRows: 1 },
      { resource: 'local_connector_operation_events', maximumRows: 8 },
    ],
    excludes: ['git-reset', 'history-rewrite', 'automatic-push', 'credential-values', 'force-push'],
    recovery: { available: true, note: 'Git 이력을 지우지 않고 원래 편집을 되돌리는 새 커밋을 만듭니다.' },
    contract: operationContract(definition),
  }, systemOperationSigningSecret(env), { now })
  return { plan: signed.publicPlan, plan_token: signed.token }
}

export async function applyLocalSourceEditRollback(db, {
  userId,
  connectorId,
  planToken,
  confirmation,
  env = process.env,
  now = new Date(),
}) {
  requireSourceEditOwner(userId, env)
  const definition = WORKFLOW_SOURCE_EDIT_ROLLBACK_OPERATION_DEFINITION
  const verified = verifySignedSystemOperationPlan(planToken, systemOperationSigningSecret(env), {
    actorId: userId,
    operation: SOURCE_EDIT_ROLLBACK_OPERATION_TYPE,
    confirmation,
    definitionId: definition.id,
    definitionFingerprint: definition.fingerprint,
    initiatorKind: 'human_ui',
    now,
  })
  const scope = verified.payload.scope ?? {}
  if (verified.payload.targetKey !== `local-connector:${connectorId}:${scope.originalOperationId}`) {
    throw new LocalConnectorError(409, 'LOCAL_CONNECTOR_PLAN_MISMATCH', '롤백 계획의 로컬 커넥터나 원본 작업이 일치하지 않습니다.')
  }
  const original = await loadCompletedSourceEdit(db, userId, connectorId, scope.originalOperationId)
  const row = await loadOwnedConnector(db, userId, connectorId)
  const connector = connectorRow(row, now.getTime())
  if (connector.stateFingerprint !== verified.payload.stateFingerprint || connector.git.headSha !== original.result.commitSha) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_STATE_CHANGED', '미리보기 이후 로컬 코드 또는 Git 상태가 달라졌습니다.')
  }
  if (!connector.online || !connector.git?.sourceWriteEnabled || connector.git.dirty > 0 || !connector.git.originFingerprint) {
    throw new LocalConnectorError(409, 'LOCAL_SOURCE_ROLLBACK_BLOCKED', '온라인 코드 쓰기 커넥터와 깨끗한 Git 상태가 필요합니다.')
  }
  return queueLocalOperation(db, connector, userId, verified, SOURCE_EDIT_ROLLBACK_ACTION, {
    branch: connector.git.branch,
    headSha: connector.git.headSha,
    originFingerprint: connector.git.originFingerprint,
    dirty: connector.git.dirty,
    sourceWriteEnabled: connector.git.sourceWriteEnabled,
    originalOperationId: original.operation_id,
    originalCommitSha: original.result.commitSha,
    propertyId: original.result.propertyId,
    label: original.result.label,
    beforeValue: original.result.afterValue,
    afterValue: original.result.beforeValue,
    path: original.result.path,
  })
}

export async function claimLocalConnectorOperation(db, connector) {
  const query = await db
    .from('local_connector_operations')
    .select(OPERATION_CLAIM_SELECT)
    .eq('connector_id', connector.id)
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (query.error) throw databaseError(query.error, '로컬 작업 대기열을 읽지 못했습니다.')
  if (!query.data) return { operation: null }
  const claimedAt = new Date().toISOString()
  const claimed = await db
    .from('local_connector_operations')
    .update({ status: 'running', claimed_at: claimedAt })
    .eq('operation_id', query.data.operation_id)
    .eq('status', 'queued')
    .select(OPERATION_CLAIM_SELECT)
    .maybeSingle()
  if (claimed.error) throw databaseError(claimed.error, '로컬 작업을 시작하지 못했습니다.')
  if (!claimed.data) return { operation: null }
  const eventResult = await db.from('local_connector_operation_events').insert({
    operation_id: claimed.data.operation_id,
    connector_id: connector.id,
    user_id: connector.user_id,
    event_type: 'running',
    detail: { action: claimed.data.action },
  })
  if (eventResult.error) throw databaseError(eventResult.error, '로컬 작업 시작 기록을 남기지 못했습니다.')
  return {
    operation: {
      operationId: claimed.data.operation_id,
      action: claimed.data.action,
      stateFingerprint: claimed.data.state_fingerprint,
      expectedState: claimed.data.expected_state,
    },
  }
}

export const claimLocalGitSyncOperation = claimLocalConnectorOperation

function normalizeLocalSourceEditVerification(value, expectedState) {
  if (!value || typeof value !== 'object' || value.status !== 'verified') return null
  const sha = (candidate) => {
    const normalized = cleanText(candidate, 64)
    return /^[a-f0-9]{40,64}$/i.test(normalized) ? normalized.toLowerCase() : ''
  }
  const checks = value.checks && typeof value.checks === 'object' ? value.checks : {}
  const normalized = {
    status: 'verified',
    propertyId: cleanText(value.propertyId, 180),
    path: cleanText(value.path, 500),
    branch: cleanText(value.branch, 160),
    previousHeadSha: sha(value.previousHeadSha),
    commitSha: sha(value.commitSha),
    originFingerprint: sha(value.originFingerprint),
    beforeValue: value.beforeValue,
    afterValue: value.afterValue,
    dirty: Number(value.dirty),
    diffFingerprint: sha(value.diffFingerprint),
    checks: {
      propertyContract: checks.propertyContract === 'passed' ? 'passed' : '',
      build: checks.build === 'passed' ? 'passed' : '',
      diffCheck: checks.diffCheck === 'passed' ? 'passed' : '',
    },
  }
  if (
    !normalized.propertyId
    || normalized.propertyId !== expectedState?.propertyId
    || normalized.path !== expectedState?.path
    || normalized.branch !== expectedState?.branch
    || normalized.previousHeadSha !== expectedState?.headSha
    || normalized.originFingerprint !== expectedState?.originFingerprint
    || !normalized.commitSha
    || normalized.commitSha === normalized.previousHeadSha
    || normalized.dirty !== 0
    || !normalized.diffFingerprint
    || Object.values(normalized.checks).some((status) => status !== 'passed')
    || JSON.stringify(normalized.beforeValue) !== JSON.stringify(expectedState?.beforeValue)
    || JSON.stringify(normalized.afterValue) !== JSON.stringify(expectedState?.afterValue)
  ) return null
  return normalized
}

export async function completeLocalConnectorOperation(db, connector, payload) {
  const operationId = cleanText(payload?.operationId, 80)
  if (!OPERATION_ID_PATTERN.test(operationId)) {
    throw new LocalConnectorError(400, 'INVALID_LOCAL_OPERATION_ID', '로컬 작업 ID가 올바르지 않습니다.')
  }
  const running = await db
    .from('local_connector_operations')
    .select('action,expected_state')
    .eq('operation_id', operationId)
    .eq('connector_id', connector.id)
    .eq('status', 'running')
    .maybeSingle()
  if (running.error) throw databaseError(running.error, '실행 중인 로컬 작업을 확인하지 못했습니다.')
  if (!running.data) throw new LocalConnectorError(409, 'LOCAL_OPERATION_NOT_RUNNING', '실행 중인 로컬 작업을 찾을 수 없습니다.')
  const requestedSuccess = payload?.status === 'succeeded'
  const sourceAction = [SOURCE_EDIT_ACTION, SOURCE_EDIT_ROLLBACK_ACTION].includes(running.data.action)
  const verification = sourceAction
    ? normalizeLocalSourceEditVerification(payload?.result?.verification, running.data.expected_state)
    : normalizeLocalGitSyncVerification(payload?.result?.verification, running.data.expected_state)
  const succeeded = requestedSuccess && !!verification
  const result = sourceAction ? {
    summary: requestedSuccess && !verification
      ? '로컬 편집 명령은 끝났지만 AST·빌드·Git 검증에 실패했습니다.'
      : cleanText(payload?.result?.summary, 400) || (succeeded ? '등록된 UI 상수 편집과 검증을 완료했습니다.' : '로컬 코드 편집이 실패했습니다.'),
    action: running.data.action,
    propertyId: cleanText(running.data.expected_state?.propertyId, 180),
    label: cleanText(running.data.expected_state?.label, 180),
    path: cleanText(running.data.expected_state?.path, 500),
    beforeValue: running.data.expected_state?.beforeValue,
    afterValue: running.data.expected_state?.afterValue,
    previousHeadSha: verification?.previousHeadSha ?? '',
    commitSha: verification?.commitSha ?? '',
    diffFingerprint: verification?.diffFingerprint ?? '',
    originalOperationId: running.data.action === SOURCE_EDIT_ROLLBACK_ACTION
      ? cleanText(running.data.expected_state?.originalOperationId, 80)
      : '',
    rollbackAvailable: running.data.action === SOURCE_EDIT_ACTION && succeeded,
    verification,
  } : {
    summary: requestedSuccess && !verification
      ? 'Git 명령은 끝났지만 실행 후 상태 검증에 실패했습니다.'
      : cleanText(payload?.result?.summary, 400) || (succeeded ? 'Git 동기화를 완료하고 상태를 검증했습니다.' : 'Git 동기화가 실패했습니다.'),
    beforeHeadSha: cleanText(payload?.result?.beforeHeadSha, 64),
    afterHeadSha: verification?.headSha ?? cleanText(payload?.result?.afterHeadSha, 64),
    remoteSha: verification?.upstreamSha ?? cleanText(payload?.result?.remoteSha, 64),
    verification,
  }
  const completed = await db
    .from('local_connector_operations')
    .update({ status: succeeded ? 'succeeded' : 'failed', completed_at: new Date().toISOString(), result })
    .eq('operation_id', operationId)
    .eq('connector_id', connector.id)
    .eq('status', 'running')
    .select('operation_id')
    .maybeSingle()
  if (completed.error) throw databaseError(completed.error, '로컬 작업 결과를 저장하지 못했습니다.')
  if (!completed.data) throw new LocalConnectorError(409, 'LOCAL_OPERATION_NOT_RUNNING', '실행 중인 로컬 작업을 찾을 수 없습니다.')
  const eventResult = await db.from('local_connector_operation_events').insert({
    operation_id: operationId,
    connector_id: connector.id,
    user_id: connector.user_id,
    event_type: succeeded ? 'succeeded' : 'failed',
    detail: result,
  })
  if (eventResult.error) throw databaseError(eventResult.error, '로컬 작업 완료 기록을 남기지 못했습니다.')
  return { completed: true, operationId, status: succeeded ? 'succeeded' : 'failed' }
}

export const completeLocalGitSyncOperation = completeLocalConnectorOperation
