import {
  admin, applySharedCanvasUpdate, mySharesFor, redactCanvas,
  resolveBrowserUser, resolveSharedCanvasAccess,
} from '../mcp/shareAccess.js'

function send(res, status, body) {
  res.status(status).json(body)
}

async function currentUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  return resolveBrowserUser(token)
}

export default async function handler(req, res) {
  try {
    const user = await currentUser(req)
    if (!user) return send(res, 401, { error: '로그인이 필요합니다.' })

    if (req.method === 'GET' && req.query.mode === 'list') {
      const shares = await mySharesFor(user.id)
      const best = new Map()
      for (const share of shares) {
        const key = `${share.owner_id}:${share.canvas_id}`
        const previous = best.get(key)
        const rank = { canvas: 0, group: 1, node: 2 }
        if (!previous || rank[share.scope] < rank[previous.scope]) best.set(key, share)
      }
      const canvases = await Promise.all([...best.values()].map(async (share) => {
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
      const { nodes, edges } = applySharedCanvasUpdate(access, input.nodes, input.edges)
      const { error } = await admin().from('canvases').update({ nodes, edges, updated_at: new Date().toISOString() })
        .eq('user_id', ownerId).eq('canvas_id', canvasId)
      if (error) throw new Error(error.message)
      return send(res, 200, { ok: true })
    }
    return send(res, 405, { error: '지원하지 않는 요청입니다.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '공유 캔버스 요청에 실패했습니다.'
    return send(res, message.includes('권한') || message.includes('읽기 전용') || message.includes('범위') ? 403 : 500, { error: message })
  }
}
