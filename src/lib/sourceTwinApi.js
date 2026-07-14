import { supabase } from './supabase.js'

async function sourceTwinRequest(path = '', options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('로그인이 필요합니다.')
  const response = await fetch(`/api/source-twin${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers ?? {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || '소스 트윈 요청에 실패했습니다.')
    error.code = body.code || 'SOURCE_TWIN_REQUEST_FAILED'
    error.status = response.status
    throw error
  }
  return body
}

export const loadSourceTwinCurrent = () => sourceTwinRequest()

export const loadSourceTwinHistory = (limit = 30) => (
  sourceTwinRequest(`?mode=history&limit=${encodeURIComponent(limit)}`)
)

export const compareSourceTwinHistory = (from, to) => (
  sourceTwinRequest(`?mode=compare&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
)

export const captureSourceTwinHistory = (reason = 'manual') => sourceTwinRequest('', {
  method: 'POST',
  body: JSON.stringify({ action: 'capture', reason }),
})
