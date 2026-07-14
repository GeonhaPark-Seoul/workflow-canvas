import { normalizeSystemParts } from '../shared/systemPartOntology.js'
import {
  SYSTEM_RUNTIME_CAPABILITY_DEFS,
  normalizeSystemRuntimeResult,
  systemRuntimeCapabilityDefinition,
  systemRuntimeCapabilityForPart,
} from '../shared/systemRuntime.js'

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_RATE_WINDOW_MS = 3_000
const SYSTEM_RUNTIME_SOURCE_ID = 'workflow-canvas:self-system'
export const SYSTEM_RUNTIME_OBSERVATION_TABLE = 'system_runtime_observations'

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

export function resolveSystemRuntimeTargets({ canvas, actorUserId, ownerUserId }) {
  if (!actorUserId || actorUserId !== ownerUserId) {
    throw new SystemRuntimeCheckError(403, 'SYSTEM_OPERATOR_REQUIRED', '등록된 시스템 운영자만 시스템 작업을 실행할 수 있습니다.')
  }
  const targets = []
  for (const node of canvas?.nodes ?? []) {
    if (node?.type !== 'system') continue
    for (const part of normalizeSystemParts(node.data?.systemParts)) {
      const capability = systemRuntimeCapabilityForPart(part, node.id)
      if (capability) targets.push({ node, part, capability })
    }
  }
  return targets.sort((left, right) => (
    SYSTEM_RUNTIME_CAPABILITY_DEFS.indexOf(left.capability) - SYSTEM_RUNTIME_CAPABILITY_DEFS.indexOf(right.capability)
  ))
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
  return {
    'workflow.vercel.deployment.runtime': 'workflow-vercel:production-runtime',
    'workflow.api.shared-canvas.health': 'workflow-api:shared-canvas',
    'workflow.api.mcp.route': 'workflow-api:mcp-route',
    'workflow.supabase.auth.session': 'workflow-supabase:auth-session',
    'workflow.supabase.user-canvases.read': 'workflow-supabase:canvases-user-read',
    'workflow.supabase.canvas-service.operations': 'workflow-supabase:canvas-service-operations',
  }[capabilityId] ?? 'workflow-runtime:unknown'
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

function observation(id, label, valueType, value, options = {}) {
  return {
    id,
    category: options.category ?? 'runtime',
    label,
    valueType,
    value,
    unit: options.unit ?? '',
    sensitivity: options.sensitivity ?? 'internal',
    sourceKind: options.sourceKind ?? 'runtime',
    verification: options.verification ?? 'verified',
    availability: options.availability ?? 'available',
    evidenceRef: options.evidenceRef ?? '',
    observedAt: options.observedAt,
  }
}

function unknownResult(capability, checkedAt, summary, errorCode = 'NOT_OBSERVABLE') {
  return normalizeSystemRuntimeResult({
    capabilityId: capability.id,
    status: 'unknown',
    verification: 'unavailable',
    resourceId: runtimeResourceId(capability.id),
    checkedAt,
    latencyMs: 0,
    summary,
    errorCode,
  })
}

function fixedRuntimeEndpoint(baseUrl, pathname) {
  try {
    const endpoint = new URL(pathname, baseUrl)
    const localHttp = endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname)
    if (endpoint.protocol !== 'https:' && !localHttp) return null
    endpoint.username = ''
    endpoint.password = ''
    endpoint.hash = ''
    return endpoint
  } catch {
    return null
  }
}

async function runFixedRouteCheck({
  capability,
  accessToken,
  runtimeBaseUrl,
  pathname,
  expectedStatus,
  expectedAllow,
  fullCoverage,
  fetchImpl,
  now,
  timeoutMs,
}) {
  const endpoint = fixedRuntimeEndpoint(runtimeBaseUrl, pathname)
  const checkedAt = new Date(now()).toISOString()
  if (!endpoint) return unknownResult(capability, checkedAt, '현재 배포 주소를 확인할 수 없어 경로를 점검하지 못했습니다.')
  const controller = new AbortController()
  const startedAt = now()
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs))
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
    const completedAt = now()
    const allow = response?.headers?.get?.('allow') ?? ''
    const statusMatches = response?.status === expectedStatus
    const allowMatches = !expectedAllow || allow.toUpperCase().includes(expectedAllow)
    if (!statusMatches || !allowMatches) {
      return safeFailure(
        capability.id,
        new Date(completedAt).toISOString(),
        Math.max(0, completedAt - startedAt),
        'UNEXPECTED_ROUTE_RESPONSE',
        '배포 경로가 예상한 응답 규약과 다릅니다.',
      )
    }
    const status = fullCoverage ? 'healthy' : 'degraded'
    return normalizeSystemRuntimeResult({
      capabilityId: capability.id,
      status,
      verification: fullCoverage ? 'verified' : 'partial',
      resourceId: runtimeResourceId(capability.id),
      checkedAt: new Date(completedAt).toISOString(),
      latencyMs: Math.max(0, completedAt - startedAt),
      summary: fullCoverage
        ? `${pathname} 인증 경로가 정상 응답했습니다.`
        : `${pathname} 배포 경로는 응답하지만 실제 도구 호출은 아직 확인하지 않았습니다.`,
      collectionLabel: '경로 관측',
      observations: [
        observation('route', '경로', 'text', pathname, { category: 'endpoint', evidenceRef: pathname }),
        observation('http-status', 'HTTP 상태', 'number', response.status, { category: 'endpoint' }),
        observation('coverage', '검증 범위', 'status', fullCoverage ? '인증 포함' : '라우트만', {
          category: 'verification',
          verification: fullCoverage ? 'verified' : 'partial',
        }),
      ],
    })
  } catch (error) {
    const completedAt = now()
    const timedOut = error?.name === 'AbortError'
    return safeFailure(
      capability.id,
      new Date(completedAt).toISOString(),
      Math.max(0, completedAt - startedAt),
      timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      timedOut ? '배포 경로 확인 시간이 초과되었습니다.' : '배포 경로에 연결하지 못했습니다.',
    )
  } finally {
    clearTimeout(timer)
  }
}

async function runSupabaseAuthSessionCheck({ capability, actorUserId, accessToken, verifyAccessToken, now }) {
  const startedAt = now()
  try {
    const user = await verifyAccessToken(accessToken)
    const completedAt = now()
    if (!user?.id || user.id !== actorUserId) {
      return safeFailure(
        capability.id,
        new Date(completedAt).toISOString(),
        Math.max(0, completedAt - startedAt),
        'AUTH_SESSION_MISMATCH',
        'Supabase Auth가 현재 운영자 세션을 확인하지 못했습니다.',
      )
    }
    return normalizeSystemRuntimeResult({
      capabilityId: capability.id,
      status: 'healthy',
      verification: 'verified',
      resourceId: runtimeResourceId(capability.id),
      checkedAt: new Date(completedAt).toISOString(),
      latencyMs: Math.max(0, completedAt - startedAt),
      summary: 'Supabase Auth가 현재 운영자 세션을 검증했습니다.',
      collectionLabel: '인증 관측',
      observations: [
        observation('session-valid', '세션 검증', 'boolean', true, { category: 'authentication' }),
        observation('identity-match', '운영자 일치', 'boolean', true, { category: 'authorization' }),
      ],
    })
  } catch {
    const completedAt = now()
    return safeFailure(
      capability.id,
      new Date(completedAt).toISOString(),
      Math.max(0, completedAt - startedAt),
      'AUTH_UPSTREAM_REJECTED',
      'Supabase Auth 세션 확인에 실패했습니다.',
    )
  }
}

function runVercelDeploymentCheck({ capability, deploymentContext, now }) {
  const checkedAt = new Date(now()).toISOString()
  if (!deploymentContext?.isVercel) {
    return unknownResult(capability, checkedAt, 'Vercel 실행 환경 메타데이터가 없어 프로덕션 배포를 확인하지 못했습니다.')
  }
  const values = [
    observation('environment', '환경', 'status', deploymentContext.environment || 'production', {
      category: 'deployment', evidenceRef: 'VERCEL_ENV', sourceKind: 'runtime',
    }),
    observation('region', '실행 리전', 'text', deploymentContext.region || 'unknown', {
      category: 'deployment', evidenceRef: 'VERCEL_REGION', sourceKind: 'runtime',
    }),
  ]
  if (deploymentContext.commitSha) {
    values.push(observation('commit', '배포 커밋', 'text', deploymentContext.commitSha.slice(0, 12), {
      category: 'version', evidenceRef: 'VERCEL_GIT_COMMIT_SHA', sourceKind: 'runtime',
    }))
  }
  if (deploymentContext.host) {
    values.push(observation('host', '배포 호스트', 'text', deploymentContext.host, {
      category: 'endpoint', evidenceRef: 'VERCEL_URL', sourceKind: 'runtime',
    }))
  }
  return normalizeSystemRuntimeResult({
    capabilityId: capability.id,
    status: 'healthy',
    verification: 'verified',
    resourceId: runtimeResourceId(capability.id),
    checkedAt,
    latencyMs: 0,
    summary: `Vercel ${deploymentContext.environment || 'production'} 함수가 실행 중입니다.`,
    collectionLabel: '배포 관측',
    observations: values,
  })
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

function observationStoreUnavailable(error) {
  return ['42P01', 'PGRST202', 'PGRST205'].includes(String(error?.code ?? ''))
}

export async function persistSystemRuntimeObservation(db, { canvasId, target, result }) {
  const normalized = normalizeSystemRuntimeResult(result)
  const row = {
    system_id: SYSTEM_RUNTIME_SOURCE_ID,
    canvas_id: canvasId,
    node_id: target.node.id,
    part_id: target.part.id,
    capability_id: target.capability.id,
    resource_id: normalized.resourceId,
    status: normalized.status,
    verification: normalized.verification,
    observed_at: normalized.checkedAt,
    result: normalized,
  }
  const { error } = await db.from(SYSTEM_RUNTIME_OBSERVATION_TABLE).insert(row)
  if (error) {
    return {
      available: !observationStoreUnavailable(error),
      persisted: false,
      errorCode: observationStoreUnavailable(error) ? 'OBSERVATION_STORE_UNAVAILABLE' : 'OBSERVATION_WRITE_FAILED',
    }
  }
  const cutoff = new Date(Date.parse(normalized.checkedAt) - 30 * 24 * 60 * 60 * 1000).toISOString()
  await db.from(SYSTEM_RUNTIME_OBSERVATION_TABLE)
    .delete()
    .eq('system_id', SYSTEM_RUNTIME_SOURCE_ID)
    .lt('observed_at', cutoff)
  return { available: true, persisted: true }
}

export async function loadLatestSystemRuntimeObservations(db, { canvasId, canvas, actorUserId, ownerUserId }) {
  const targets = resolveSystemRuntimeTargets({ canvas, actorUserId, ownerUserId })
  const targetByKey = new Map(targets.map((target) => [`${target.node.id}:${target.part.id}`, target]))
  const { data, error } = await db.from(SYSTEM_RUNTIME_OBSERVATION_TABLE)
    .select('node_id, part_id, capability_id, result, observed_at')
    .eq('system_id', SYSTEM_RUNTIME_SOURCE_ID)
    .eq('canvas_id', canvasId)
    .order('observed_at', { ascending: false })
    .limit(300)
  if (error) {
    return {
      available: !observationStoreUnavailable(error),
      results: [],
      errorCode: observationStoreUnavailable(error) ? 'OBSERVATION_STORE_UNAVAILABLE' : 'OBSERVATION_READ_FAILED',
    }
  }
  const seen = new Set()
  const results = []
  for (const row of data ?? []) {
    const key = `${row.node_id}:${row.part_id}`
    if (seen.has(key)) continue
    const target = targetByKey.get(key)
    if (!target || target.capability.id !== row.capability_id) continue
    try {
      const result = normalizeSystemRuntimeResult(row.result)
      if (result.capabilityId !== target.capability.id) continue
      seen.add(key)
      results.push({ nodeId: target.node.id, partId: target.part.id, result })
    } catch {
      // Ignore malformed historical rows instead of letting one stale record
      // hide the rest of the operational dashboard.
    }
  }
  return { available: true, results }
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
  verifyAccessToken,
  runtimeBaseUrl,
  deploymentContext,
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
  if (capability.id === 'workflow.vercel.deployment.runtime') {
    return runVercelDeploymentCheck({ capability, deploymentContext, now })
  }
  if (capability.id === 'workflow.api.shared-canvas.health') {
    return runFixedRouteCheck({
      capability,
      accessToken,
      runtimeBaseUrl,
      pathname: '/api/shared-canvas?mode=health',
      expectedStatus: 204,
      fullCoverage: true,
      fetchImpl,
      now,
      timeoutMs,
    })
  }
  if (capability.id === 'workflow.api.mcp.route') {
    return runFixedRouteCheck({
      capability,
      runtimeBaseUrl,
      pathname: '/api/mcp',
      expectedStatus: 405,
      expectedAllow: 'POST',
      fullCoverage: false,
      fetchImpl,
      now,
      timeoutMs,
    })
  }
  if (capability.id === 'workflow.supabase.auth.session') {
    if (!accessToken || typeof verifyAccessToken !== 'function') {
      throw new SystemRuntimeCheckError(500, 'RUNTIME_CONFIG_MISSING', '인증 점검 설정이 준비되지 않았습니다.')
    }
    return runSupabaseAuthSessionCheck({ capability, actorUserId, accessToken, verifyAccessToken, now })
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
