import { normalizeSystemRuntimeRecords, normalizeSystemRuntimeResult } from '../../shared/systemRuntime.js'
import { supabase } from './supabase.js'

export class SystemRuntimeApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SystemRuntimeApiError'
    this.code = code
  }
}

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new SystemRuntimeApiError('AUTH_REQUIRED', '로그인이 필요합니다.')
  return session.access_token
}

async function runtimeRequest({ method, canvasId, body, timeoutMs = 15_000 }) {
  const token = await accessToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const query = method === 'GET' ? `?canvasId=${encodeURIComponent(canvasId)}` : ''
  try {
    const response = await fetch(`/api/system-runtime${query}`, {
      method,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new SystemRuntimeApiError(payload.code || 'REQUEST_FAILED', payload.error || '시스템 작업을 실행하지 못했습니다.')
    }
    return payload
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new SystemRuntimeApiError('CLIENT_TIMEOUT', '시스템 작업 응답을 기다리는 시간이 초과되었습니다.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function checkSystemPartRuntime({ canvasId, nodeId, partId }) {
  const payload = await runtimeRequest({
    method: 'POST',
    canvasId,
    body: { canvasId, nodeId, partId },
    timeoutMs: 10_000,
  })
  return {
    result: normalizeSystemRuntimeResult(payload.result),
    persistenceAvailable: payload.persistenceAvailable !== false,
    persisted: payload.persisted === true,
    persistenceErrorCode: typeof payload.persistenceErrorCode === 'string' ? payload.persistenceErrorCode : '',
  }
}

export async function checkAllSystemRuntime({ canvasId }) {
  const payload = await runtimeRequest({
    method: 'POST',
    canvasId,
    body: { canvasId, action: 'check_all' },
    timeoutMs: 20_000,
  })
  return {
    results: normalizeSystemRuntimeRecords(payload.results),
    persistenceAvailable: payload.persistenceAvailable !== false,
    persistedCount: Number.isInteger(payload.persistedCount) ? payload.persistedCount : 0,
    persistenceErrorCode: typeof payload.persistenceErrorCode === 'string' ? payload.persistenceErrorCode : '',
  }
}

export async function loadLatestSystemRuntime({ canvasId }) {
  const payload = await runtimeRequest({ method: 'GET', canvasId })
  return {
    results: normalizeSystemRuntimeRecords(payload.results),
    persistenceAvailable: payload.persistenceAvailable !== false,
    persistenceErrorCode: typeof payload.persistenceErrorCode === 'string' ? payload.persistenceErrorCode : '',
  }
}
