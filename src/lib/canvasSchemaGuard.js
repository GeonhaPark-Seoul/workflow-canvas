export const RELATION_METADATA_GUARD_MARKER = 'workflow_canvas_relation_metadata_guard'

export class CanvasSchemaGuardError extends Error {
  constructor(message = '관계 정보 손실이 감지되어 저장을 중단했습니다. 다른 Workflow Canvas 탭을 모두 닫고 최신 앱을 다시 여세요.') {
    super(message)
    this.name = 'CanvasSchemaGuardError'
    this.code = 'CANVAS_SCHEMA_GUARD'
  }
}

export function canvasWriteError(error, operation = 'saveCanvas') {
  if (error?.message?.includes(RELATION_METADATA_GUARD_MARKER)) return new CanvasSchemaGuardError()
  return new Error(`${operation}: ${error?.message ?? '클라우드 저장에 실패했습니다.'}`)
}
