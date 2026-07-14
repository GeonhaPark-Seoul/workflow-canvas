import { admin, resolveBrowserUser } from '../mcp/shareAccess.js'
import {
  captureSourceTwinSnapshot,
  compareStoredSourceTwinSnapshots,
  currentSourceTwinState,
  listSourceTwinSnapshots,
  requireSourceTwinOwner,
  SourceTwinError,
} from '../mcp/sourceTwinStore.js'

function send(res, status, body) {
  res.status(status).json(body)
}

function bearerToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'GET 또는 POST 요청만 허용됩니다.', code: 'METHOD_NOT_ALLOWED' })
  try {
    const user = await resolveBrowserUser(bearerToken(req))
    if (!user) return send(res, 401, { error: '로그인이 필요합니다.', code: 'AUTH_REQUIRED' })
    requireSourceTwinOwner(user.id, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)
    const db = admin()

    if (req.method === 'GET' && req.query.mode === 'history') {
      return send(res, 200, await listSourceTwinSnapshots(db, req.query.limit))
    }
    if (req.method === 'GET' && req.query.mode === 'compare') {
      if (!req.query.from || !req.query.to) return send(res, 400, { error: '비교할 from과 to 상태 ID가 필요합니다.', code: 'COMPARE_IDS_REQUIRED' })
      return send(res, 200, { comparison: await compareStoredSourceTwinSnapshots(db, req.query.from, req.query.to) })
    }
    if (req.method === 'GET') return send(res, 200, await currentSourceTwinState(db))
    if (req.body?.action === 'capture') {
      const reason = req.body.reason === 'deployment' ? 'deployment' : 'manual'
      const result = await captureSourceTwinSnapshot(db, { reason })
      return send(res, result.created ? 201 : 200, {
        created: result.created,
        snapshot: {
          id: result.snapshot.id,
          manifestId: result.snapshot.manifestId,
          commitSha: result.snapshot.commitSha,
          capturedAt: result.snapshot.capturedAt,
          reason: result.snapshot.reason,
        },
      })
    }
    return send(res, 400, { error: '지원하지 않는 소스 트윈 작업입니다.', code: 'INVALID_ACTION' })
  } catch (error) {
    if (error instanceof SourceTwinError) return send(res, error.status, { error: error.message, code: error.code })
    console.error('[source-twin] request failed:', error)
    return send(res, 500, { error: '소스 트윈을 처리하지 못했습니다.', code: 'INTERNAL_ERROR' })
  }
}
