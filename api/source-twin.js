import { admin, resolveBrowserUser } from '../mcp/shareAccess.js'
import { SOURCE_CODE_PART_MANIFEST } from '../shared/sourceCodePartManifest.js'
import { sourceCodePartsForModule } from '../shared/sourceCodeParts.js'
import { SOURCE_FLOW_MANIFEST } from '../shared/sourceFlowManifest.js'
import { sourceFlowsForModule } from '../shared/sourceFlows.js'
import { explainSourceCodePartWithAi } from '../shared/sourceAiExplanation.js'
import {
  applySourceTwinSnapshotOperation,
  compareStoredSourceTwinSnapshots,
  currentSourceTwinState,
  listSourceTwinSnapshots,
  previewSourceTwinSnapshotOperation,
  requireSourceTwinOwner,
  SourceTwinError,
} from '../mcp/sourceTwinStore.js'
import {
  applyLocalSourceEdit,
  applyLocalSourceEditRollback,
  LocalConnectorError,
  previewLocalSourceEdit,
  previewLocalSourceEditRollback,
} from '../mcp/localConnectorStore.js'
import { SystemOperationPlanError } from '../mcp/systemOperationPlan.js'

function send(res, status, body) {
  res.status(status).json(body)
}

function bearerToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
}

const aiRequestWindows = new Map()
function allowAiRequest(userId, now = Date.now()) {
  const recent = (aiRequestWindows.get(userId) ?? []).filter((value) => now - value < 60_000)
  if (recent.length >= 6) return false
  recent.push(now)
  aiRequestWindows.set(userId, recent)
  return true
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'GET 또는 POST 요청만 허용됩니다.', code: 'METHOD_NOT_ALLOWED' })
  try {
    const user = await resolveBrowserUser(bearerToken(req))
    if (!user) return send(res, 401, { error: '로그인이 필요합니다.', code: 'AUTH_REQUIRED' })
    requireSourceTwinOwner(user.id, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)
    const db = admin()

    if (req.method === 'GET' && req.query.mode === 'history') {
      return send(res, 200, await listSourceTwinSnapshots(db, req.query.limit))
    }
    if (req.method === 'GET' && req.query.mode === 'compare') {
      if (!req.query.from || !req.query.to) return send(res, 400, { error: '비교할 from과 to 상태 ID가 필요합니다.', code: 'COMPARE_IDS_REQUIRED' })
      return send(res, 200, { comparison: await compareStoredSourceTwinSnapshots(db, req.query.from, req.query.to) })
    }
    if (req.method === 'GET' && req.query.mode === 'code-parts') {
      const moduleId = typeof req.query.module_id === 'string' ? req.query.module_id : ''
      const module = sourceCodePartsForModule(SOURCE_CODE_PART_MANIFEST, moduleId)
      if (!module) return send(res, 404, { error: '코드 모듈을 찾을 수 없습니다.', code: 'SOURCE_MODULE_NOT_FOUND' })
      return send(res, 200, { module })
    }
    if (req.method === 'GET' && req.query.mode === 'flows') {
      const moduleId = typeof req.query.module_id === 'string' ? req.query.module_id : ''
      const module = sourceFlowsForModule(SOURCE_FLOW_MANIFEST, moduleId)
      if (!module) return send(res, 404, { error: '코드 흐름 모듈을 찾을 수 없습니다.', code: 'SOURCE_FLOW_MODULE_NOT_FOUND' })
      return send(res, 200, { module })
    }
    if (req.method === 'GET') return send(res, 200, await currentSourceTwinState(db))
    if (req.body?.action === 'preview_capture') {
      return send(res, 200, await previewSourceTwinSnapshotOperation(db, { actorUserId: user.id }))
    }
    if (req.body?.action === 'explain_code_part') {
      if (!allowAiRequest(user.id)) return send(res, 429, { error: 'AI 설명 요청은 분당 6회까지 가능합니다.', code: 'SOURCE_AI_RATE_LIMIT' })
      const module = sourceCodePartsForModule(SOURCE_CODE_PART_MANIFEST, typeof req.body.module_id === 'string' ? req.body.module_id : '')
      const part = module?.parts?.find((item) => item.id === req.body.part_id)
      if (!part) return send(res, 404, { error: '설명할 코드 파츠를 찾을 수 없습니다.', code: 'SOURCE_CODE_PART_NOT_FOUND' })
      try {
        return send(res, 200, await explainSourceCodePartWithAi(part))
      } catch (providerError) {
        console.error('[source-twin] AI explanation provider failed:', providerError?.message)
        return send(res, 502, { error: 'AI 설명 제공자 호출에 실패했습니다.', code: 'SOURCE_AI_PROVIDER_FAILED' })
      }
    }
    if (req.body?.action === 'preview_source_edit') {
      return send(res, 200, await previewLocalSourceEdit(db, {
        userId: user.id,
        connectorId: req.body.connector_id,
        moduleId: req.body.module_id,
        partId: req.body.part_id,
        nextValue: req.body.next_value,
      }))
    }
    if (req.body?.action === 'apply_source_edit') {
      return send(res, 202, await applyLocalSourceEdit(db, {
        userId: user.id,
        connectorId: req.body.connector_id,
        planToken: req.body.plan_token,
        confirmation: req.body.confirmation,
      }))
    }
    if (req.body?.action === 'preview_source_edit_rollback') {
      return send(res, 200, await previewLocalSourceEditRollback(db, {
        userId: user.id,
        connectorId: req.body.connector_id,
        operationId: req.body.operation_id,
      }))
    }
    if (req.body?.action === 'apply_source_edit_rollback') {
      return send(res, 202, await applyLocalSourceEditRollback(db, {
        userId: user.id,
        connectorId: req.body.connector_id,
        planToken: req.body.plan_token,
        confirmation: req.body.confirmation,
      }))
    }
    if (req.body?.action === 'apply_capture') {
      const result = await applySourceTwinSnapshotOperation(db, {
        actorUserId: user.id,
        planToken: req.body.plan_token,
        confirmation: req.body.confirmation,
      })
      return send(res, result.created ? 201 : 200, result)
    }
    return send(res, 400, { error: '지원하지 않는 소스 트윈 작업입니다.', code: 'INVALID_ACTION' })
  } catch (error) {
    if (error instanceof SourceTwinError || error instanceof LocalConnectorError || error instanceof SystemOperationPlanError) {
      return send(res, error.status, { error: error.message, code: error.code })
    }
    console.error('[source-twin] request failed:', error)
    return send(res, 500, { error: '소스 트윈을 처리하지 못했습니다.', code: 'INTERNAL_ERROR' })
  }
}
