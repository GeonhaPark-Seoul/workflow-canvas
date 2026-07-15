import { supabase } from './supabase.js'

async function localConnectorRequest(options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('로그인이 필요합니다.')
  const response = await fetch('/api/local-connector', {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || `로컬 커넥터 요청 실패 (${response.status})`)
    error.code = payload.code
    throw error
  }
  return payload
}

function post(body) {
  return localConnectorRequest({ method: 'POST', body: JSON.stringify(body) })
}

export function loadLocalConnectors() {
  return localConnectorRequest()
}

export function createLocalConnector(label) {
  return post({ action: 'create_connector', label })
}

export function revokeLocalConnector(connectorId) {
  return post({ action: 'revoke_connector', connector_id: connectorId })
}

export function previewLocalGitSync(connectorId) {
  return post({ action: 'preview_sync', connector_id: connectorId })
}

export function applyLocalGitSync(connectorId, planToken, confirmation) {
  return post({ action: 'apply_sync', connector_id: connectorId, plan_token: planToken, confirmation })
}
