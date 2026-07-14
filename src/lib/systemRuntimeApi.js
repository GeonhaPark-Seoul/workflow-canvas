import { normalizeSystemRuntimeResult } from '../../shared/systemRuntime.js'
import { supabase } from './supabase.js'

export class SystemRuntimeApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SystemRuntimeApiError'
    this.code = code
  }
}

export async function checkSystemPartRuntime({ canvasId, nodeId, partId }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new SystemRuntimeApiError('AUTH_REQUIRED', '로그인이 필요합니다.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch('/api/system-runtime', {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ canvasId, nodeId, partId }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new SystemRuntimeApiError(body.code || 'REQUEST_FAILED', body.error || '연결 상태를 확인하지 못했습니다.')
    }
    return normalizeSystemRuntimeResult(body.result)
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new SystemRuntimeApiError('CLIENT_TIMEOUT', '연결 확인 응답을 기다리는 시간이 초과되었습니다.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
