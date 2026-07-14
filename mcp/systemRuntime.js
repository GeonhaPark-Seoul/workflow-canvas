import { normalizeSystemParts } from '../shared/systemPartOntology.js'
import {
  normalizeSystemRuntimeResult,
  systemRuntimeCapabilityDefinition,
  systemRuntimeCapabilityForPart,
} from '../shared/systemRuntime.js'

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_RATE_WINDOW_MS = 3_000

export class SystemRuntimeCheckError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'SystemRuntimeCheckError'
    this.status = status
    this.code = code
  }
}

export function resolveSystemRuntimeTarget({ canvas, actorUserId, ownerUserId, nodeId, partId }) {
  if (!actorUserId || actorUserId !== ownerUserId) {
    throw new SystemRuntimeCheckError(403, 'SYSTEM_OPERATOR_REQUIRED', '등록된 시스템 운영자만 시스템 작업을 실행할 수 있습니다.')
  }
  const node = (canvas?.nodes ?? []).find((candidate) => candidate.id === nodeId)
  if (!node || node.type !== 'system') {
    throw new SystemRuntimeCheckError(404, 'TARGET_NOT_FOUND', '실행할 시스템 노드를 찾을 수 없습니다.')
  }
  const part = normalizeSystemParts(node.data?.systemParts).find((candidate) => candidate.id === partId)
  if (!part) throw new SystemRuntimeCheckError(404, 'TARGET_NOT_FOUND', '실행할 시스템 파츠를 찾을 수 없습니다.')
  const capability = systemRuntimeCapabilityForPart(part, node.id)
  if (!capability) {
    throw new SystemRuntimeCheckError(400, 'CAPABILITY_NOT_ALLOWED', '이 파츠에는 허용된 시스템 작업이 없습니다.')
  }
  return { node, part, capability }
}

export function requireSystemRuntimeOperator(actorUserId, configuredOperatorId) {
  const operatorUserId = typeof configuredOperatorId === 'string' ? configuredOperatorId.trim() : ''
  if (!operatorUserId) {
    throw new SystemRuntimeCheckError(503, 'SYSTEM_OPERATOR_NOT_CONFIGURED', '시스템 운영자 설정이 준비되지 않았습니다.')
  }
  if (!actorUserId || actorUserId !== operatorUserId) {
    throw new SystemRuntimeCheckError(403, 'SYSTEM_OPERATOR_REQUIRED', '등록된 시스템 운영자만 시스템 작업을 실행할 수 있습니다.')
  }
  return operatorUserId
}

export function claimSystemRuntimeCheck(store, key, now = Date.now(), windowMs = DEFAULT_RATE_WINDOW_MS) {
  const previous = Number(store.get(key))
  if (Number.isFinite(previous) && now - previous < windowMs) {
    throw new SystemRuntimeCheckError(429, 'RATE_LIMITED', '잠시 후 다시 확인해 주세요.')
  }
  store.set(key, now)
  if (store.size > 1_000) {
    for (const [entryKey, checkedAt] of store) {
      if (now - checkedAt > windowMs * 4) store.delete(entryKey)
    }
    while (store.size > 1_000) {
      store.delete(store.keys().next().value)
    }
  }
}

function runtimeResourceId(capabilityId) {
  return capabilityId === 'workflow.supabase.canvas-service.operations'
    ? 'workflow-supabase:canvas-service-operations'
    : 'workflow-supabase:canvases-user-read'
}

function safeFailure(capabilityId, checkedAt, latencyMs, errorCode, summary) {
  return normalizeSystemRuntimeResult({
    capabilityId,
    status: 'failed',
    verification: 'failed',
    resourceId: runtimeResourceId(capabilityId),
    checkedAt,
    latencyMs,
    errorCode,
    summary,
  })
}

function requestHeaders(accessToken, supabaseAnonKey, includeJson = false) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${accessToken}`,
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function runSupabaseHealthCheck({
  capability,
  actorUserId,
  accessToken,
  supabaseUrl,
  supabaseAnonKey,
  fetchImpl,
  now,
  timeoutMs,
}) {
  const endpoint = new URL('/rest/v1/canvases', supabaseUrl)
  endpoint.searchParams.set('select', 'canvas_id')
  endpoint.searchParams.set('user_id', `eq.${actorUserId}`)
  endpoint.searchParams.set('limit', '1')
  const controller = new AbortController()
  const startedAt = now()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))

  try {
    const response = await fetchImpl(endpoint, {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: requestHeaders(accessToken, supabaseAnonKey),
    })
    const completedAt = now()
    const latencyMs = Math.max(0, completedAt - startedAt)
    if (!response?.ok) {
      const permissionFailure = response?.status === 401 || response?.status === 403
      return safeFailure(
        capability.id,
        new Date(completedAt).toISOString(),
        latencyMs,
        permissionFailure ? 'AUTH_OR_RLS_REJECTED' : 'UPSTREAM_REJECTED',
        permissionFailure ? '로그인 또는 읽기 권한을 확인하지 못했습니다.' : 'Supabase 읽기 요청에 실패했습니다.',
      )
    }
    return normalizeSystemRuntimeResult({
      capabilityId: capability.id,
      status: 'healthy',
      verification: 'verified',
      resourceId: runtimeResourceId(capability.id),
      checkedAt: new Date(completedAt).toISOString(),
      latencyMs,
      summary: 'Supabase 인증·RLS 읽기 경로에 연결되었습니다.',
    })
  } catch (error) {
    const completedAt = now()
    const timedOut = error?.name === 'AbortError'
    return safeFailure(
      capability.id,
      new Date(completedAt).toISOString(),
      Math.max(0, completedAt - startedAt),
      timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      timedOut ? '연결 확인 시간이 초과되었습니다.' : 'Supabase에 연결하지 못했습니다.',
    )
  } finally {
    clearTimeout(timer)
  }
}

export const WORKFLOW_SYSTEM_OPERATIONS_RPC = 'get_workflow_system_operational_snapshot'

export async function readWorkflowSystemOperations(db, signal) {
  let query = db.rpc(WORKFLOW_SYSTEM_OPERATIONS_RPC)
  if (signal && typeof query?.abortSignal === 'function') query = query.abortSignal(signal)
  return query
}

async function runCanvasServiceOperationsRead({
  capability,
  readOperationalSnapshot,
  now,
  timeoutMs,
}) {
  const controller = new AbortController()
  const startedAt = now()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))

  try {
    const { data, error } = await readOperationalSnapshot({ signal: controller.signal })
    const completedAt = now()
    const latencyMs = Math.max(0, completedAt - startedAt)
    if (error) {
      const errorCode = String(error.code ?? '')
      const functionMissing = ['PGRST202', '42883'].includes(errorCode)
      return safeFailure(
        capability.id,
        new Date(completedAt).toISOString(),
        latencyMs,
        functionMissing ? 'READ_FUNCTION_UNAVAILABLE' : 'UPSTREAM_REJECTED',
        functionMissing
          ? '앱 운영 집계 DB 함수가 아직 준비되지 않았습니다.'
          : '캔버스 서비스 운영 현황 조회에 실패했습니다.',
      )
    }
    if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') {
      return safeFailure(
        capability.id,
        new Date(completedAt).toISOString(),
        latencyMs,
        'INVALID_UPSTREAM_RESPONSE',
        '앱 운영 지표 응답 형식이 올바르지 않습니다.',
      )
    }
    const row = data[0]
    const countKeys = [
      'account_count',
      'canvas_count',
      'node_count',
      'edge_count',
      'note_count',
      'canvases_updated_24h',
      'accounts_updated_24h',
      'canvases_updated_7d',
      'accounts_updated_7d',
      'invalid_document_count',
    ]
    const counts = Object.fromEntries(countKeys.map((key) => [key, Number(row[key])]))
    if (Object.values(counts).some((value) => !Number.isFinite(value) || value < 0)) {
      return safeFailure(
        capability.id,
        new Date(completedAt).toISOString(),
        latencyMs,
        'INVALID_UPSTREAM_RESPONSE',
        '앱 운영 지표 응답 형식이 올바르지 않습니다.',
      )
    }
    const count = (key) => counts[key]
    const latestCanvasUpdate = typeof row.latest_canvas_update === 'string' && row.latest_canvas_update
      ? row.latest_canvas_update
      : undefined
    const canvasCount = count('canvas_count')
    const updated24h = count('canvases_updated_24h')
    const invalidDocuments = count('invalid_document_count')
    try {
      return normalizeSystemRuntimeResult({
        capabilityId: capability.id,
        status: 'healthy',
        verification: 'verified',
        resourceId: runtimeResourceId(capability.id),
        checkedAt: new Date(completedAt).toISOString(),
        latencyMs,
        summary: `전체 캔버스 ${Number.isFinite(canvasCount) ? canvasCount : 0}개 · 24시간 변경 ${Number.isFinite(updated24h) ? updated24h : 0}개 · 구조 경고 ${Number.isFinite(invalidDocuments) ? invalidDocuments : 0}개`,
        collectionLabel: '앱 운영 지표',
        items: [
          {
            id: 'storage-scale',
            title: '저장 규모',
            ...(latestCanvasUpdate ? { updatedAt: latestCanvasUpdate } : {}),
            metrics: [
              { id: 'accounts', label: '캔버스 보유 사용자', value: count('account_count') },
              { id: 'canvases', label: '캔버스', value: canvasCount },
              { id: 'nodes', label: '노드', value: count('node_count') },
              { id: 'edges', label: '연결선', value: count('edge_count') },
              { id: 'notes', label: '노트', value: count('note_count') },
            ],
          },
          {
            id: 'recent-activity',
            title: '최근 변경',
            metrics: [
              { id: 'canvases-24h', label: '24시간 캔버스', value: updated24h },
              { id: 'accounts-24h', label: '24시간 변경 사용자', value: count('accounts_updated_24h') },
              { id: 'canvases-7d', label: '7일 캔버스', value: count('canvases_updated_7d') },
              { id: 'accounts-7d', label: '7일 변경 사용자', value: count('accounts_updated_7d') },
            ],
          },
          {
            id: 'document-integrity',
            title: '문서 구조',
            metrics: [
              { id: 'invalid-documents', label: '구조 경고', value: invalidDocuments },
            ],
          },
        ],
      })
    } catch {
      return safeFailure(
        capability.id,
        new Date(completedAt).toISOString(),
        latencyMs,
        'INVALID_UPSTREAM_RESPONSE',
        '앱 운영 지표 응답 형식이 올바르지 않습니다.',
      )
    }
  } catch (error) {
    const completedAt = now()
    const timedOut = error?.name === 'AbortError'
    return safeFailure(
      capability.id,
      new Date(completedAt).toISOString(),
      Math.max(0, completedAt - startedAt),
      timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      timedOut ? '앱 운영 현황 조회 시간이 초과되었습니다.' : 'Supabase에 연결하지 못했습니다.',
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function runSystemRuntimeCapability({
  capabilityId,
  actorUserId,
  accessToken,
  supabaseUrl,
  supabaseAnonKey,
  readOperationalSnapshot,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const capability = systemRuntimeCapabilityDefinition(capabilityId)
  if (!capability) {
    throw new SystemRuntimeCheckError(400, 'CAPABILITY_NOT_ALLOWED', '등록되지 않은 시스템 작업입니다.')
  }
  if (!actorUserId) {
    throw new SystemRuntimeCheckError(500, 'RUNTIME_CONFIG_MISSING', '시스템 작업 설정이 준비되지 않았습니다.')
  }
  if (capability.id === 'workflow.supabase.user-canvases.read') {
    if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
      throw new SystemRuntimeCheckError(500, 'RUNTIME_CONFIG_MISSING', '시스템 작업 설정이 준비되지 않았습니다.')
    }
    return runSupabaseHealthCheck({
      capability, actorUserId, accessToken, supabaseUrl, supabaseAnonKey, fetchImpl, now, timeoutMs,
    })
  }
  if (capability.id === 'workflow.supabase.canvas-service.operations') {
    if (typeof readOperationalSnapshot !== 'function') {
      throw new SystemRuntimeCheckError(500, 'RUNTIME_CONFIG_MISSING', '앱 운영 집계 연결이 준비되지 않았습니다.')
    }
    return runCanvasServiceOperationsRead({
      capability, readOperationalSnapshot, now, timeoutMs,
    })
  }
  throw new SystemRuntimeCheckError(400, 'CAPABILITY_NOT_ALLOWED', '실행기가 등록되지 않은 시스템 작업입니다.')
}
