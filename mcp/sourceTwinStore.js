import { SOURCE_TWIN_MANIFEST } from '../shared/sourceTwinManifest.js'
import {
  compareSourceTwinSnapshots,
  createSourceTwinSnapshot,
  SOURCE_TWIN_SOURCE_ID,
  sourceTwinEntities,
} from '../shared/sourceTwin.js'
import { CANVAS_PRIVACY_CAPABILITIES } from '../shared/privacyCapabilities.js'
import { WORKFLOW_SYSTEM_OPERATIONS_RPC } from './systemRuntime.js'

export const SOURCE_TWIN_SNAPSHOT_TABLE = 'source_twin_snapshots'
export const SOURCE_TWIN_EVENT_TABLE = 'source_twin_events'

const SNAPSHOT_SELECT = 'snapshot_id, snapshot_key, manifest_id, commit_sha, captured_at, reason, snapshot'

export class SourceTwinError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'SourceTwinError'
    this.status = status
    this.code = code
  }
}

export function requireSourceTwinOwner(actorUserId, ownerUserId) {
  if (!ownerUserId) throw new SourceTwinError(503, 'SOURCE_TWIN_DISABLED', '소스 트윈 운영자 설정이 없습니다.')
  if (actorUserId !== ownerUserId) throw new SourceTwinError(403, 'SOURCE_TWIN_FORBIDDEN', '제품 소유자만 소스 트윈을 조회할 수 있습니다.')
  return actorUserId
}

export function sourceTwinDeploymentContext(env = process.env) {
  const host = String(env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
  return {
    provider: env.VERCEL === '1' || host ? 'vercel' : 'local',
    environment: env.VERCEL_ENV || env.NODE_ENV || 'unknown',
    commitSha: env.VERCEL_GIT_COMMIT_SHA || '',
    commitRef: env.VERCEL_GIT_COMMIT_REF || '',
    deploymentId: env.VERCEL_DEPLOYMENT_ID || '',
    region: env.VERCEL_REGION || '',
    host,
  }
}

function unavailable(error) {
  return ['42P01', 'PGRST202', 'PGRST205'].includes(String(error?.code ?? ''))
}

function metricsFromOperationRow(row) {
  return Object.fromEntries(Object.entries(row ?? {})
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .sort(([left], [right]) => left.localeCompare(right)))
}

async function readOperationalState(db) {
  const { data, error } = await db.rpc(WORKFLOW_SYSTEM_OPERATIONS_RPC)
  if (error) return { available: false, errorCode: String(error.code ?? 'OPERATIONAL_READ_FAILED'), metrics: {} }
  const row = Array.isArray(data) ? data[0] : null
  return {
    available: !!row,
    metrics: metricsFromOperationRow(row),
    latestCanvasUpdate: typeof row?.latest_canvas_update === 'string' ? row.latest_canvas_update : null,
  }
}

async function readRuntimeState(db) {
  const { data, error } = await db.from('system_runtime_observations')
    .select('capability_id, status, verification, observed_at')
    .eq('system_id', 'workflow-canvas:self-system')
    .order('observed_at', { ascending: false })
    .limit(300)
  if (error) return { available: false, errorCode: unavailable(error) ? 'RUNTIME_HISTORY_UNAVAILABLE' : 'RUNTIME_HISTORY_READ_FAILED', capabilities: {} }
  const capabilities = {}
  for (const row of data ?? []) {
    if (capabilities[row.capability_id]) continue
    capabilities[row.capability_id] = {
      status: row.status,
      verification: row.verification,
      observedAt: row.observed_at,
    }
  }
  return { available: true, capabilities }
}

function declaredDatabaseState() {
  const entities = sourceTwinEntities(SOURCE_TWIN_MANIFEST, { perspective: 'database', limit: 2_000 })
  return {
    observation: 'declared-from-source',
    fingerprint: SOURCE_TWIN_MANIFEST.fingerprints.database,
    tables: entities.filter((entity) => entity.kind === 'db-table').map((entity) => entity.name).sort(),
    functions: entities.filter((entity) => entity.kind === 'db-function').map((entity) => entity.name).sort(),
    policies: entities.filter((entity) => entity.kind === 'rls-policy').map((entity) => entity.label).sort(),
  }
}

function snapshotRow(row) {
  if (!row) return null
  const snapshot = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {}
  return {
    ...snapshot,
    id: row.snapshot_id,
    snapshotKey: row.snapshot_key,
    manifestId: row.manifest_id,
    commitSha: row.commit_sha ?? '',
    capturedAt: row.captured_at,
    reason: row.reason,
  }
}

function snapshotSummary(row) {
  const snapshot = snapshotRow(row)
  if (!snapshot) return null
  return {
    id: snapshot.id,
    snapshotKey: snapshot.snapshotKey,
    manifestId: snapshot.manifestId,
    commitSha: snapshot.commitSha,
    capturedAt: snapshot.capturedAt,
    reason: snapshot.reason,
    codeSummary: snapshot.sections?.code?.summary ?? {},
    operationalMetrics: snapshot.sections?.operations?.metrics ?? {},
    sectionFingerprints: Object.fromEntries(Object.entries(snapshot.sections ?? {}).map(([key, section]) => [key, section.fingerprint ?? ''])),
  }
}

export async function currentSourceTwinState(db, env = process.env) {
  const [operations, runtime, latestEvents] = await Promise.all([
    readOperationalState(db),
    readRuntimeState(db),
    listSourceTwinEvents(db, 10),
  ])
  return {
    manifest: SOURCE_TWIN_MANIFEST,
    deployment: sourceTwinDeploymentContext(env),
    database: declaredDatabaseState(),
    operations,
    runtime,
    privacy: CANVAS_PRIVACY_CAPABILITIES,
    events: latestEvents,
    webhookConfigured: !!env.WORKFLOW_CANVAS_GITHUB_WEBHOOK_SECRET,
  }
}

export async function captureSourceTwinSnapshot(db, { reason = 'manual', env = process.env } = {}) {
  const state = await currentSourceTwinState(db, env)
  const snapshot = createSourceTwinSnapshot({
    manifest: state.manifest,
    reason,
    deployment: state.deployment,
    database: state.database,
    operations: state.operations,
    runtime: state.runtime,
    privacy: state.privacy,
  })
  const row = {
    source_id: SOURCE_TWIN_SOURCE_ID,
    snapshot_id: snapshot.id,
    snapshot_key: snapshot.snapshotKey,
    manifest_id: snapshot.manifestId,
    commit_sha: snapshot.commitSha || null,
    captured_at: snapshot.capturedAt,
    reason: snapshot.reason,
    snapshot,
  }
  const { data, error } = await db.from(SOURCE_TWIN_SNAPSHOT_TABLE).insert(row).select(SNAPSHOT_SELECT).maybeSingle()
  if (!error) return { snapshot: snapshotRow(data), created: true, state }
  if (String(error.code ?? '') === '23505') {
    const { data: existing, error: readError } = await db.from(SOURCE_TWIN_SNAPSHOT_TABLE)
      .select(SNAPSHOT_SELECT).eq('source_id', SOURCE_TWIN_SOURCE_ID).eq('snapshot_key', snapshot.snapshotKey).maybeSingle()
    if (readError || !existing) throw new SourceTwinError(500, 'SOURCE_TWIN_HISTORY_READ_FAILED', '기존 상태 스냅샷을 불러오지 못했습니다.')
    return { snapshot: snapshotRow(existing), created: false, state }
  }
  if (unavailable(error)) throw new SourceTwinError(503, 'SOURCE_TWIN_HISTORY_UNAVAILABLE', '소스 트윈 이력 SQL이 아직 적용되지 않았습니다.')
  throw new SourceTwinError(500, 'SOURCE_TWIN_CAPTURE_FAILED', '통합 상태 스냅샷을 기록하지 못했습니다.')
}

export async function listSourceTwinSnapshots(db, limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30))
  const { data, error } = await db.from(SOURCE_TWIN_SNAPSHOT_TABLE)
    .select(SNAPSHOT_SELECT)
    .eq('source_id', SOURCE_TWIN_SOURCE_ID)
    .order('captured_at', { ascending: false })
    .limit(safeLimit)
  if (error) {
    if (unavailable(error)) return { available: false, snapshots: [], errorCode: 'SOURCE_TWIN_HISTORY_UNAVAILABLE' }
    throw new SourceTwinError(500, 'SOURCE_TWIN_HISTORY_READ_FAILED', '소스 트윈 이력을 불러오지 못했습니다.')
  }
  return { available: true, snapshots: (data ?? []).map(snapshotSummary).filter(Boolean) }
}

async function loadSnapshot(db, snapshotId) {
  const { data, error } = await db.from(SOURCE_TWIN_SNAPSHOT_TABLE)
    .select(SNAPSHOT_SELECT)
    .eq('source_id', SOURCE_TWIN_SOURCE_ID)
    .eq('snapshot_id', snapshotId)
    .maybeSingle()
  if (error) throw new SourceTwinError(500, 'SOURCE_TWIN_HISTORY_READ_FAILED', '상태 스냅샷을 불러오지 못했습니다.')
  if (!data) throw new SourceTwinError(404, 'SOURCE_TWIN_SNAPSHOT_NOT_FOUND', '비교할 상태 스냅샷을 찾을 수 없습니다.')
  return snapshotRow(data)
}

export async function compareStoredSourceTwinSnapshots(db, fromId, toId) {
  const [from, to] = await Promise.all([loadSnapshot(db, fromId), loadSnapshot(db, toId)])
  return compareSourceTwinSnapshots(from, to)
}

export async function listSourceTwinEvents(db, limit = 20) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20))
  const { data, error } = await db.from(SOURCE_TWIN_EVENT_TABLE)
    .select('delivery_id, event_type, ref, before_sha, after_sha, received_at, changed_paths, commits')
    .eq('source_id', SOURCE_TWIN_SOURCE_ID)
    .order('received_at', { ascending: false })
    .limit(safeLimit)
  if (error) return { available: !unavailable(error), events: [], errorCode: unavailable(error) ? 'SOURCE_TWIN_EVENTS_UNAVAILABLE' : 'SOURCE_TWIN_EVENTS_READ_FAILED' }
  return { available: true, events: data ?? [] }
}

export async function recordSourceTwinPushEvent(db, event) {
  const row = {
    source_id: SOURCE_TWIN_SOURCE_ID,
    delivery_id: event.deliveryId,
    event_type: 'push',
    ref: event.ref,
    before_sha: event.beforeSha || null,
    after_sha: event.afterSha || null,
    repository: event.repository,
    changed_paths: event.changedPaths,
    commits: event.commits,
  }
  const { error } = await db.from(SOURCE_TWIN_EVENT_TABLE).insert(row)
  if (!error) return { recorded: true, duplicate: false }
  if (String(error.code ?? '') === '23505') return { recorded: false, duplicate: true }
  if (unavailable(error)) throw new SourceTwinError(503, 'SOURCE_TWIN_EVENTS_UNAVAILABLE', '소스 트윈 webhook SQL이 아직 적용되지 않았습니다.')
  throw new SourceTwinError(500, 'SOURCE_TWIN_EVENT_WRITE_FAILED', 'GitHub 변경 이벤트를 기록하지 못했습니다.')
}
