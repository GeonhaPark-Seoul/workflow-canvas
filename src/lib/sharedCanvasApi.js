import { supabase } from './supabase'

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
  if (!response.ok) throw new Error(body.error || '공유 캔버스 요청에 실패했습니다.')
  return body
}

export function listSharedCanvases() {
  return request('/api/shared-canvas?mode=list').then((body) => body.canvases ?? [])
}

export function getSharedCanvas(ownerId, canvasId) {
  return request(`/api/shared-canvas?ownerId=${encodeURIComponent(ownerId)}&canvasId=${encodeURIComponent(canvasId)}`)
}

export function updateSharedCanvas(ownerId, canvasId, nodes, edges) {
  return request('/api/shared-canvas', { method: 'PUT', body: JSON.stringify({ ownerId, canvasId, nodes, edges }) })
}
