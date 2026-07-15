const SOURCE_TWIN_NODE_ENTRIES = Object.freeze({
  'map-local-repo': Object.freeze({
    nodeId: 'map-local-repo',
    view: 'structure',
    actionLabel: '로컬 코드',
    panelTitle: '로컬 프로젝트 저장소',
    description: '허용한 로컬 커넥터가 실제 프로젝트 구조와 Git 상태를 갱신합니다. 미연결 때만 현재 배포 코드를 대체 표시합니다.',
  }),
  'map-github': Object.freeze({
    nodeId: 'map-github',
    view: 'changes',
    actionLabel: '커밋 변경',
    panelTitle: 'GitHub 저장소',
    description: '배포 manifest의 변경분과 서명이 확인된 GitHub push 신호입니다.',
  }),
  'map-vercel': Object.freeze({
    nodeId: 'map-vercel',
    view: 'history',
    actionLabel: '상태 이력',
    panelTitle: 'Vercel 배포 상태 이력',
    description: '코드·DB 선언·배포·집계 운영 상태를 한 시점으로 묶은 내부 기록입니다.',
  }),
})

export function workflowSourceTwinEntryForNode(nodeId) {
  return SOURCE_TWIN_NODE_ENTRIES[nodeId] ?? null
}

export const WORKFLOW_SOURCE_TWIN_NODE_IDS = Object.freeze(Object.keys(SOURCE_TWIN_NODE_ENTRIES))
