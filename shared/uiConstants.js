export const SYSTEM_NODE_DEFAULT_WIDTH = 240
export const SYSTEM_NODE_DEFAULT_HEIGHT = 130
export const SYSTEM_MODULE_COLOR = '#0d9488'
export const SOURCE_TWIN_EMPTY_MESSAGE = '일치하는 코드 실체 없음'

// Workshop wire names are stable. Human-facing names stay centralized here so
// the pending W1-W8 naming decision never leaks into storage or API contracts.
export const WORKSHOP_DISPLAY_NAMES = Object.freeze({
  board: '관제실',
  goal: '목표',
  task: '작업',
  backlog: '백로그',
  gate: '게이트',
  thread: '대화',
  artifact: '산출물',
  'control-node': '관제 노드',
})

export const WORKSHOP_STAGE_DISPLAY_NAMES = Object.freeze({
  backlog: WORKSHOP_DISPLAY_NAMES.backlog,
  A: 'A 기획',
  B: 'B 개발',
  C: 'C 배포',
  D: 'D 운영',
  E: 'E 수익',
  F: 'F 성장',
  G: 'G 고객',
  H: 'H 거버넌스',
})
