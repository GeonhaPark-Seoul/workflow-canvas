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
    throw new SystemRuntimeCheckError(403, 'OWNER_REQUIRED', '캔버스 소유자만 연결 상태를 확인할 수 있습니다.')
  }
  const node = (canvas?.nodes ?? []).find((candidate) => candidate.id === nodeId)
  if (!node || node.type !== 'system') {
    throw new SystemRuntimeCheckError(404, 'TARGET_NOT_FOUND', '확인할 시스템 노드를 찾을 수 없습니다.')
  }
  const part = normalizeSystemParts(node.data?.systemParts).find((candidate) => candidate.id === partId)
  if (!part) throw new SystemRuntimeCheckError(404, 'TARGET_NOT_FOUND', '확인할 시스템 파츠를 찾을 수 없습니다.')
  const capability = systemRuntimeCapabilityForPart(part, node.id)
  if (!capability) {
    throw new SystemRuntimeCheckError(400, 'CAPABILITY_NOT_ALLOWED', '이 파츠에는 실행이 허용된 연결 검사가 없습니다.')
  }
  return { node, part, capability }
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

function safeFailure(capabilityId, checkedAt, latencyMs, errorCode, summary) {
  return normalizeSystemRuntimeResult({
    capabilityId,
    status: 'failed',
    verification: 'failed',
    resourceId: 'workflow-supabase:canvases-user-read',
    checkedAt,
    latencyMs,
    errorCode,
    summary,
  })
}

export async function runSystemRuntimeCapability({
  capabilityId,
  actorUserId,
  accessToken,
  supabaseUrl,
  supabaseAnonKey,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const capability = systemRuntimeCapabilityDefinition(capabilityId)
  if (!capability) {
    throw new SystemRuntimeCheckError(400, 'CAPABILITY_NOT_ALLOWED', '등록되지 않은 연결 검사입니다.')
  }
  if (capability.id !== 'workflow.supabase.user-canvases.read') {
    throw new SystemRuntimeCheckError(400, 'CAPABILITY_NOT_ALLOWED', '실행기가 등록되지 않은 연결 검사입니다.')
  }
  if (!actorUserId || !accessToken || !supabaseUrl || !supabaseAnonKey) {
    throw new SystemRuntimeCheckError(500, 'RUNTIME_CONFIG_MISSING', '연결 검사 설정이 준비되지 않았습니다.')
  }

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
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
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
      resourceId: 'workflow-supabase:canvases-user-read',
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
