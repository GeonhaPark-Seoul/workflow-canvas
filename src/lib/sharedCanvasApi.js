import { supabase } from './supabase'
import { CanvasConflictError } from './cloudStorage'

async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('로그인이 필요합니다.')
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (response.status === 409) throw new CanvasConflictError(body.error)
  if (!response.ok) throw new Error(body.error || '공유 캔버스 요청에 실패했습니다.')
  return body
}

export function listSharedCanvases() {
  return request('/api/shared-canvas?mode=list').then((body) => body.canvases ?? [])
}

export function listCanvasParticipants(ownerId, canvasId) {
  return request(`/api/shared-canvas?mode=participants&ownerId=${encodeURIComponent(ownerId)}&canvasId=${encodeURIComponent(canvasId)}`)
    .then((body) => body.participants ?? [])
}

export function getSharedCanvas(ownerId, canvasId) {
  return request(`/api/shared-canvas?ownerId=${encodeURIComponent(ownerId)}&canvasId=${encodeURIComponent(canvasId)}`)
}

export function updateSharedCanvas(ownerId, canvasId, nodes, edges, notes, views, stageTypes, revision) {
  return request('/api/shared-canvas', {
    method: 'PUT',
    body: JSON.stringify({ ownerId, canvasId, nodes, edges, notes, views, stageTypes, revision }),
  })
}

export function setMemberViewRestriction(ownerId, canvasId, userId, restricted) {
  return request('/api/shared-canvas', {
    method: 'PATCH',
    body: JSON.stringify({ action: 'set-view-restriction', ownerId, canvasId, userId, restricted }),
  })
}
