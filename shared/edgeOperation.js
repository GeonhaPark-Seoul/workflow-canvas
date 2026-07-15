export const EDGE_OPERATION_STATUS_DEFS = Object.freeze([
  { id: 'idle', label: '실행 준비', icon: '↻' },
  { id: 'planned', label: '계획 생성', icon: '…' },
  { id: 'planning', label: '미리보기 확인 중', icon: '…' },
  { id: 'preview', label: '승인 대기', icon: '↻' },
  { id: 'awaiting_approval', label: '승인 대기', icon: '↻' },
  { id: 'approved', label: '승인 완료', icon: '✓' },
  { id: 'rejected', label: '승인 거절', icon: '×' },
  { id: 'queued', label: '실행 대기', icon: '…' },
  { id: 'running', label: '실행 중', icon: '↻' },
  { id: 'verifying', label: '결과 검증 중', icon: '↻' },
  { id: 'succeeded', label: '완료', icon: '✓' },
  { id: 'failed', label: '실패', icon: '!' },
  { id: 'cancelled', label: '중지됨', icon: '×' },
  { id: 'recovery_pending', label: '복구 대기', icon: '…' },
  { id: 'recovering', label: '복구 중', icon: '↻' },
  { id: 'recovered', label: '복구 완료', icon: '✓' },
  { id: 'recovery_failed', label: '복구 실패', icon: '!' },
])

const STATUS_BY_ID = new Map(EDGE_OPERATION_STATUS_DEFS.map((item) => [item.id, item]))

export function edgeOperationStatusDefinition(status) {
  return STATUS_BY_ID.get(status) ?? STATUS_BY_ID.get('idle')
}

export function edgeOperationIsActive(status) {
  return ['queued', 'running', 'verifying', 'recovery_pending', 'recovering'].includes(status)
}

export function edgeOperationIsTerminal(status) {
  return ['rejected', 'succeeded', 'failed', 'cancelled', 'recovered', 'recovery_failed'].includes(status)
}
