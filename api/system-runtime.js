import { admin, resolveBrowserUser } from '../mcp/shareAccess.js'
import {
  claimSystemRuntimeCheck,
  readWorkflowSystemOperations,
  requireSystemRuntimeOperator,
  resolveSystemRuntimeTarget,
  runSystemRuntimeCapability,
  SystemRuntimeCheckError,
} from '../mcp/systemRuntime.js'
import { normalizeSystemRuntimeRequest, SystemRuntimeContractError } from '../shared/systemRuntime.js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../src/lib/supabase.js'

const recentChecks = new Map()

function send(res, status, body) {
  res.status(status).json(body)
}

function bearerToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 요청만 허용됩니다.', code: 'METHOD_NOT_ALLOWED' })

  try {
    const token = bearerToken(req)
    const user = await resolveBrowserUser(token)
    if (!user) return send(res, 401, { error: '로그인이 필요합니다.', code: 'AUTH_REQUIRED' })
    const operatorUserId = requireSystemRuntimeOperator(user.id, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)
    const request = normalizeSystemRuntimeRequest(req.body)
    claimSystemRuntimeCheck(recentChecks, `${user.id}:${request.canvasId}:${request.nodeId}:${request.partId}`)

    const { data: canvas, error } = await admin().from('canvases').select('nodes')
      .eq('user_id', operatorUserId).eq('canvas_id', request.canvasId).maybeSingle()
    if (error) throw new SystemRuntimeCheckError(500, 'CANVAS_LOOKUP_FAILED', '등록된 시스템 지도를 확인하지 못했습니다.')
    if (!canvas) throw new SystemRuntimeCheckError(404, 'CANVAS_NOT_FOUND', '등록된 시스템 지도를 찾을 수 없습니다.')

    const target = resolveSystemRuntimeTarget({
      canvas,
      actorUserId: user.id,
      ownerUserId: operatorUserId,
      nodeId: request.nodeId,
      partId: request.partId,
    })
    const result = await runSystemRuntimeCapability({
      capabilityId: target.capability.id,
      actorUserId: user.id,
      accessToken: token,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      readOperationalSnapshot: ({ signal }) => readWorkflowSystemOperations(admin(), signal),
    })
    return send(res, 200, { result })
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
