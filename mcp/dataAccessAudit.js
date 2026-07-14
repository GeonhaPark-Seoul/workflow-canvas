const SOURCES = new Set(['shared_canvas_api', 'mcp', 'system_runtime'])
const OPERATIONS = new Set(['read', 'write', 'read_for_write'])
const PURPOSES = new Set([
  'collaborator_canvas_read',
  'collaborator_canvas_write',
  'mcp_canvas_operation',
  'system_map_runtime',
])

export class DataAccessAuditError extends Error {
  constructor(message = '서버 데이터 접근 감사 기록을 남기지 못했습니다.') {
    super(message)
    this.name = 'DataAccessAuditError'
    this.code = 'DATA_ACCESS_AUDIT_REQUIRED'
  }
}

export function dataAccessAuditRequired(env = process.env) {
  return env.WORKFLOW_CANVAS_ACCESS_AUDIT_MODE === 'required'
}

export async function recordCanvasDataAccess(db, entry, env = process.env) {
  if (!SOURCES.has(entry.source) || !OPERATIONS.has(entry.operation) || !PURPOSES.has(entry.purpose)) {
    throw new DataAccessAuditError('허용되지 않은 데이터 접근 감사 분류입니다.')
  }
  const row = {
    actor_user_id: entry.actorUserId,
    owner_user_id: entry.ownerUserId,
    canvas_id: entry.canvasId,
    source: entry.source,
    purpose: entry.purpose,
    operation: entry.operation,
    outcome: entry.outcome === 'denied' ? 'denied' : 'allowed',
  }
  const { error } = await db.from('server_data_access_audit').insert(row)
  if (!error) return { available: true, recorded: true }
  if (dataAccessAuditRequired(env)) throw new DataAccessAuditError()
  return { available: false, recorded: false, errorCode: 'AUDIT_STORE_UNAVAILABLE' }
}
