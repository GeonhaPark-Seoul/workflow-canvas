export const EDGE_OPERATION_STATUS_DEFS = Object.freeze([
  { id: 'idle', label: '실행 준비', icon: '↻' },
  { id: 'planning', label: '미리보기 확인 중', icon: '…' },
  { id: 'preview', label: '승인 대기', icon: '↻' },
  { id: 'queued', label: '실행 대기', icon: '…' },
  { id: 'running', label: '실행 중', icon: '↻' },
  { id: 'succeeded', label: '완료', icon: '✓' },
  { id: 'failed', label: '실패', icon: '!' },
])

const STATUS_BY_ID = new Map(EDGE_OPERATION_STATUS_DEFS.map((item) => [item.id, item]))

export function edgeOperationStatusDefinition(status) {
  return STATUS_BY_ID.get(status) ?? STATUS_BY_ID.get('idle')
}

export function edgeOperationIsActive(status) {
  return status === 'queued' || status === 'running'
}

export function edgeOperationIsTerminal(status) {
  return status === 'succeeded' || status === 'failed'
}
