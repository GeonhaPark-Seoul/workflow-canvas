import { admin, resolveBrowserUser } from '../mcp/shareAccess.js'
import {
  claimSystemRuntimeCheck,
  loadLatestSystemRuntimeObservations,
  persistSystemRuntimeObservation,
  readWorkflowSystemOperations,
  requireSystemRuntimeOperator,
  resolveSystemRuntimeTarget,
  resolveSystemRuntimeTargets,
  runSystemRuntimeCapability,
  SystemRuntimeCheckError,
} from '../mcp/systemRuntime.js'
import {
  normalizeSystemRuntimeBatchRequest,
  normalizeSystemRuntimeCanvasRequest,
  normalizeSystemRuntimeRequest,
  SystemRuntimeContractError,
} from '../shared/systemRuntime.js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../src/lib/supabase.js'
import { recordCanvasDataAccess } from '../mcp/dataAccessAudit.js'

const recentChecks = new Map()

function send(res, status, body) {
  res.status(status).json(body)
}

function bearerToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
}

function deploymentHost() {
  const raw = process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || ''
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function runtimeBaseUrl(req) {
  const host = deploymentHost()
  if (host) return `https://${host}`
  const requestHost = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host
  if (/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(requestHost ?? '')) return `http://${requestHost}`
  return ''
}

function deploymentContext() {
  return {
    isVercel: process.env.VERCEL === '1' || !!deploymentHost(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    region: process.env.VERCEL_REGION || '',
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || '',
    host: deploymentHost(),
  }
}

async function loadSystemCanvas(operatorUserId, canvasId, actorUserId) {
  const { data: canvas, error } = await admin().from('canvases').select('nodes, edges')
    .eq('user_id', operatorUserId).eq('canvas_id', canvasId).maybeSingle()
  if (error) throw new SystemRuntimeCheckError(500, 'CANVAS_LOOKUP_FAILED', '등록된 시스템 지도를 확인하지 못했습니다.')
  if (!canvas) throw new SystemRuntimeCheckError(404, 'CANVAS_NOT_FOUND', '등록된 시스템 지도를 찾을 수 없습니다.')
  await recordCanvasDataAccess(admin(), {
    actorUserId,
    ownerUserId: operatorUserId,
    canvasId,
    source: 'system_runtime',
    purpose: 'system_map_runtime',
    operation: 'read',
  })
  return canvas
}

async function runTarget(target, { user, token, req }) {
  return runSystemRuntimeCapability({
    capabilityId: target.capability.id,
    actorUserId: user.id,
    accessToken: token,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    readOperationalSnapshot: ({ signal }) => readWorkflowSystemOperations(admin(), signal),
    verifyAccessToken: async (accessToken) => {
      const { data } = await admin().auth.getUser(accessToken)
      return data?.user ?? null
    },
    runtimeBaseUrl: runtimeBaseUrl(req),
    deploymentContext: deploymentContext(),
  })
}

async function persistResults(canvasId, records) {
  const outcomes = await Promise.all(records.map(({ target, result }) => (
    persistSystemRuntimeObservation(admin(), { canvasId, target, result })
  )))
  return {
    available: outcomes.every((outcome) => outcome.available),
    persisted: outcomes.filter((outcome) => outcome.persisted).length,
    errorCode: outcomes.find((outcome) => !outcome.persisted)?.errorCode ?? '',
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return send(res, 405, { error: 'GET 또는 POST 요청만 허용됩니다.', code: 'METHOD_NOT_ALLOWED' })
  }

  try {
    const token = bearerToken(req)
    const user = await resolveBrowserUser(token)
    if (!user) return send(res, 401, { error: '로그인이 필요합니다.', code: 'AUTH_REQUIRED' })
    const operatorUserId = requireSystemRuntimeOperator(user.id, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)

    if (req.method === 'GET') {
      const request = normalizeSystemRuntimeCanvasRequest(req.query)
      const canvas = await loadSystemCanvas(operatorUserId, request.canvasId, user.id)
      const latest = await loadLatestSystemRuntimeObservations(admin(), {
        canvasId: request.canvasId,
        canvas,
        actorUserId: user.id,
        ownerUserId: operatorUserId,
      })
      return send(res, 200, {
        results: latest.results,
        persistenceAvailable: latest.available,
        ...(latest.errorCode ? { persistenceErrorCode: latest.errorCode } : {}),
      })
    }

    if (req.body?.action === 'check_all') {
      const request = normalizeSystemRuntimeBatchRequest(req.body)
      claimSystemRuntimeCheck(recentChecks, `${user.id}:${request.canvasId}:all`)
      const canvas = await loadSystemCanvas(operatorUserId, request.canvasId, user.id)
      const targets = resolveSystemRuntimeTargets({ canvas, actorUserId: user.id, ownerUserId: operatorUserId })
      const records = await Promise.all(targets.map(async (target) => ({
        target,
        result: await runTarget(target, { user, token, req }),
      })))
      const persistence = await persistResults(request.canvasId, records)
      return send(res, 200, {
        results: records.map(({ target, result }) => ({ nodeId: target.node.id, partId: target.part.id, result })),
        persistenceAvailable: persistence.available,
        persistedCount: persistence.persisted,
        ...(persistence.errorCode ? { persistenceErrorCode: persistence.errorCode } : {}),
      })
    }

    const request = normalizeSystemRuntimeRequest(req.body)
    claimSystemRuntimeCheck(recentChecks, `${user.id}:${request.canvasId}:${request.nodeId}:${request.partId}`)
    const canvas = await loadSystemCanvas(operatorUserId, request.canvasId, user.id)
    const target = resolveSystemRuntimeTarget({
      canvas,
      actorUserId: user.id,
      ownerUserId: operatorUserId,
      nodeId: request.nodeId,
      partId: request.partId,
    })
    const result = await runTarget(target, { user, token, req })
    const persistence = await persistResults(request.canvasId, [{ target, result }])
    return send(res, 200, {
      result,
      persistenceAvailable: persistence.available,
      persisted: persistence.persisted === 1,
      ...(persistence.errorCode ? { persistenceErrorCode: persistence.errorCode } : {}),
    })
  } catch (error) {
    if (error instanceof SystemRuntimeCheckError) {
      return send(res, error.status, { error: error.message, code: error.code })
    }
    if (error instanceof SystemRuntimeContractError) {
      return send(res, 400, { error: error.message, code: error.code })
    }
    console.error('[system-runtime] execution failed:', error)
    return send(res, 500, { error: '시스템 작업을 실행하지 못했습니다.', code: 'INTERNAL_ERROR' })
  }
}
