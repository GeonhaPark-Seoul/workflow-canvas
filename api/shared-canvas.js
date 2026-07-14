import {
  admin, applySharedCanvasUpdate, listCanvasParticipants, mySharesFor, redactCanvas,
  setCanvasMemberViewRestriction, resolveBrowserUser, resolveSharedCanvasAccess,
} from '../mcp/shareAccess.js'
import { composeSharePermission } from '../shared/sharePermissions.js'
import { recordCanvasDataAccess } from '../mcp/dataAccessAudit.js'

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

    if (req.method === 'GET' && req.query.mode === 'health') {
      res.status(204).end()
      return
    }

    if (req.method === 'GET' && req.query.mode === 'list') {
      const shares = await mySharesFor(user.id)
      const grouped = new Map()
      for (const share of shares) {
        const key = `${share.owner_id}:${share.canvas_id}`
        const current = grouped.get(key) ?? { ownerId: share.owner_id, canvasId: share.canvas_id, grants: [] }
        current.grants.push(share)
        grouped.set(key, current)
      }
      const canvases = await Promise.all([...grouped.values()].map(async (item) => {
        const { data } = await admin().from('canvases').select('name')
          .eq('user_id', item.ownerId).eq('canvas_id', item.canvasId).maybeSingle()
        const permission = composeSharePermission(item.grants)
        return data ? {
          ownerId: item.ownerId, canvasId: item.canvasId, name: data.name,
          scope: permission.scope, targetId: permission.targetId,
          restrictView: permission.restrictView, canEdit: permission.canEdit,
          canEditCanvas: permission.canEditCanvas, grants: permission.grants,
        } : null
      }))
      return send(res, 200, { canvases: canvases.filter(Boolean) })
    }

    if (req.method === 'GET' && req.query.mode === 'participants') {
      const { ownerId, canvasId } = req.query
      if (!ownerId || !canvasId) return send(res, 400, { error: 'ownerId와 canvasId가 필요합니다.' })
      const participants = await listCanvasParticipants(ownerId, canvasId, user.id)
      return send(res, 200, { participants })
    }

    const input = req.method === 'GET' ? req.query : req.body
    const { ownerId, canvasId } = input ?? {}
    if (!ownerId || !canvasId) return send(res, 400, { error: 'ownerId와 canvasId가 필요합니다.' })

    if (req.method === 'PATCH' && input.action === 'set-view-restriction') {
      if (typeof input.restricted !== 'boolean') return send(res, 400, { error: 'restricted 값이 필요합니다.' })
      await setCanvasMemberViewRestriction(ownerId, canvasId, input.userId, input.restricted, user.id)
      return send(res, 200, { ok: true })
    }

    const access = await resolveSharedCanvasAccess(user.id, ownerId, canvasId, {
      operation: req.method === 'PUT' ? 'read_for_write' : 'read',
    })

    if (req.method === 'GET') return send(res, 200, redactCanvas(access))
    if (req.method === 'PUT') {
      if (typeof input.revision !== 'string' || input.revision !== access.row.updated_at) throw conflict()
      const update = applySharedCanvasUpdate(access, input.nodes, input.edges, {
        notes: input.notes,
        views: input.views,
        stageTypes: input.stageTypes,
      })
      const patch = { nodes: update.nodes, edges: update.edges, updated_at: nextRevision(input.revision) }
      if (access.canEditCanvas) {
        patch.notes = update.notes
        patch.views = update.views
        patch.stage_types = update.stageTypes
      }
      const { data, error } = await admin().from('canvases').update(patch)
        .eq('user_id', ownerId).eq('canvas_id', canvasId).eq('updated_at', input.revision)
        .select('updated_at').maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw conflict()
      await recordCanvasDataAccess(admin(), {
        actorUserId: user.id,
        ownerUserId: ownerId,
        canvasId,
        source: 'shared_canvas_api',
        purpose: 'collaborator_canvas_write',
        operation: 'write',
      })
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
      : message.includes('workflow_canvas_relation_metadata_guard') ? 428
      : message.includes('권한') || message.includes('읽기 전용') || message.includes('범위') ? 403 : 500
    return send(res, status, { error: message })
  }
}
