import { admin, resolveBrowserUser } from '../mcp/shareAccess.js'
import {
  applyLocalGitSync,
  claimLocalConnectorOperation,
  completeLocalConnectorOperation,
  createLocalConnector,
  listLocalConnectors,
  LocalConnectorError,
  previewLocalGitSync,
  recordLocalConnectorHeartbeat,
  resolveLocalConnectorToken,
  revokeLocalConnector,
} from '../mcp/localConnectorStore.js'
import { SystemOperationPlanError } from '../mcp/systemOperationPlan.js'

function send(res, status, body) {
  res.status(status).json(body)
}

function bearerToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
}

function localToken(req) {
  return String(req.headers['x-workflow-local-token'] ?? '')
}

async function handleAgent(db, req, res, token) {
  const connector = await resolveLocalConnectorToken(db, token)
  if (!connector) return send(res, 401, { error: '로컬 커넥터 토큰이 유효하지 않습니다.', code: 'LOCAL_CONNECTOR_AUTH_REQUIRED' })
  if (req.method !== 'POST') return send(res, 405, { error: '로컬 에이전트는 POST 요청만 허용됩니다.', code: 'METHOD_NOT_ALLOWED' })
  if (req.body?.action === 'heartbeat') {
    return send(res, 200, await recordLocalConnectorHeartbeat(db, connector, req.body))
  }
  if (req.body?.action === 'poll') {
    return send(res, 200, await claimLocalConnectorOperation(db, connector))
  }
  if (req.body?.action === 'complete') {
    return send(res, 200, await completeLocalConnectorOperation(db, connector, req.body))
  }
  return send(res, 400, { error: '지원하지 않는 로컬 에이전트 작업입니다.', code: 'INVALID_AGENT_ACTION' })
}

async function handleBrowser(db, req, res) {
  const user = await resolveBrowserUser(bearerToken(req))
  if (!user) return send(res, 401, { error: '로그인이 필요합니다.', code: 'AUTH_REQUIRED' })
  if (req.method === 'GET') return send(res, 200, await listLocalConnectors(db, user.id))
  if (req.body?.action === 'create_connector') {
    return send(res, 201, await createLocalConnector(db, { userId: user.id, label: req.body.label }))
  }
  if (req.body?.action === 'revoke_connector') {
    return send(res, 200, await revokeLocalConnector(db, { userId: user.id, connectorId: req.body.connector_id }))
  }
  if (req.body?.action === 'preview_sync') {
    return send(res, 200, await previewLocalGitSync(db, { userId: user.id, connectorId: req.body.connector_id }))
  }
  if (req.body?.action === 'apply_sync') {
    const result = await applyLocalGitSync(db, {
      userId: user.id,
      connectorId: req.body.connector_id,
      planToken: req.body.plan_token,
      confirmation: req.body.confirmation,
    })
    return send(res, result.queued ? 202 : 200, result)
  }
  return send(res, 400, { error: '지원하지 않는 로컬 커넥터 작업입니다.', code: 'INVALID_ACTION' })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'GET 또는 POST 요청만 허용됩니다.', code: 'METHOD_NOT_ALLOWED' })
  try {
    const db = admin()
    const token = localToken(req)
    return token ? await handleAgent(db, req, res, token) : await handleBrowser(db, req, res)
  } catch (error) {
    if (error instanceof LocalConnectorError || error instanceof SystemOperationPlanError) {
      return send(res, error.status, { error: error.message, code: error.code })
    }
    console.error('[local-connector] request failed:', error)
    return send(res, 500, { error: '로컬 커넥터 요청을 처리하지 못했습니다.', code: 'INTERNAL_ERROR' })
  }
}
