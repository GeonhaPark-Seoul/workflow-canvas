import {
  admin, applySharedCanvasUpdate, mySharesFor, redactCanvas,
  resolveBrowserUser, resolveSharedCanvasAccess,
} from '../mcp/shareAccess.js'

function send(res, status, body) {
  res.status(status).json(body)
}

function conflict() {
  const error = new Error('다른 곳에서 캔버스가 먼저 변경되었습니다.')
  error.code = 'CANVAS_CONFLICT'
  return error
}

function nextRevision(previousRevision) {
  const previous = Date.parse(previousRevision)
  return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString()
}

async function currentUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  return resolveBrowserUser(token)
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const user = await currentUser(req)
    if (!user) return send(res, 401, { error: '로그인이 필요합니다.' })

    if (req.method === 'GET' && req.query.mode === 'list') {
      const shares = await mySharesFor(user.id)
      const canvases = await Promise.all(shares.map(async (share) => {
        const { data } = await admin().from('canvases').select('name')
          .eq('user_id', share.owner_id).eq('canvas_id', share.canvas_id).maybeSingle()
        return data ? {
          ownerId: share.owner_id, canvasId: share.canvas_id, name: data.name,
          scope: share.scope, targetId: share.target_id, restrictView: !!share.restrict_view,
          canEdit: share.can_edit !== false,
        } : null
      }))
      return send(res, 200, { canvases: canvases.filter(Boolean) })
    }

    const input = req.method === 'GET' ? req.query : req.body
    const { ownerId, canvasId } = input ?? {}
    if (!ownerId || !canvasId) return send(res, 400, { error: 'ownerId와 canvasId가 필요합니다.' })
    const access = await resolveSharedCanvasAccess(user.id, ownerId, canvasId)

    if (req.method === 'GET') return send(res, 200, redactCanvas(access))
    if (req.method === 'PUT') {
      if (typeof input.revision !== 'string' || input.revision !== access.row.updated_at) throw conflict()
      const update = applySharedCanvasUpdate(access, input.nodes, input.edges, {
        views: input.views,
        stageTypes: input.stageTypes,
      })
      const patch = { nodes: update.nodes, edges: update.edges, updated_at: nextRevision(input.revision) }
      if (access.scope === 'canvas') {
        patch.views = update.views
        patch.stage_types = update.stageTypes
      }
      const { data, error } = await admin().from('canvases').update(patch)
        .eq('user_id', ownerId).eq('canvas_id', canvasId).eq('updated_at', input.revision)
        .select('updated_at').maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw conflict()
      const saved = redactCanvas({
        ...access,
        row: { ...access.row, ...patch, updated_at: data.updated_at },
      })
      return send(res, 200, { ok: true, ...saved })
    }
    return send(res, 405, { error: '지원하지 않는 요청입니다.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '공유 캔버스 요청에 실패했습니다.'
    const status = error?.code === 'CANVAS_CONFLICT'
      ? 409
      : message.includes('권한') || message.includes('읽기 전용') || message.includes('범위') ? 403 : 500
    return send(res, status, { error: message })
  }
}
