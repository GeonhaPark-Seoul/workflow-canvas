import { supabase } from './supabase.js'
import { SOURCE_TWIN_OPERATION_CONFIRMATION } from '../../shared/sourceTwin.js'

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

export const loadSourceCodeParts = (moduleId) => (
  sourceTwinRequest(`?mode=code-parts&module_id=${encodeURIComponent(moduleId)}`)
)

export const loadSourceFlows = (moduleId) => (
  sourceTwinRequest(`?mode=flows&module_id=${encodeURIComponent(moduleId)}`)
)

export const loadSourceAiExplanation = (moduleId, partId) => sourceTwinRequest('', {
  method: 'POST',
  body: JSON.stringify({ action: 'explain_code_part', module_id: moduleId, part_id: partId }),
})

export const previewLocalSourceEdit = (connectorId, moduleId, partId, nextValue) => sourceTwinRequest('', {
  method: 'POST',
  body: JSON.stringify({
    action: 'preview_source_edit',
    connector_id: connectorId,
    module_id: moduleId,
    part_id: partId,
    next_value: nextValue,
  }),
})

export const applyLocalSourceEdit = (connectorId, planToken, confirmation) => sourceTwinRequest('', {
  method: 'POST',
  body: JSON.stringify({ action: 'apply_source_edit', connector_id: connectorId, plan_token: planToken, confirmation }),
})

export const previewLocalSourceEditRollback = (connectorId, operationId) => sourceTwinRequest('', {
  method: 'POST',
  body: JSON.stringify({ action: 'preview_source_edit_rollback', connector_id: connectorId, operation_id: operationId }),
})

export const applyLocalSourceEditRollback = (connectorId, planToken, confirmation) => sourceTwinRequest('', {
  method: 'POST',
  body: JSON.stringify({ action: 'apply_source_edit_rollback', connector_id: connectorId, plan_token: planToken, confirmation }),
})

export const previewSourceTwinHistoryCapture = () => sourceTwinRequest('', {
  method: 'POST',
  body: JSON.stringify({ action: 'preview_capture' }),
})

export const applySourceTwinHistoryCapture = (planToken) => sourceTwinRequest('', {
  method: 'POST',
  body: JSON.stringify({
    action: 'apply_capture',
    plan_token: planToken,
    confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  }),
})
