export const WORKFLOW_GIT_SYNC_EDGE_ID = 'map-edge-repo-github'

export const WORKFLOW_SOURCE_TWIN_PART_IDS = Object.freeze({
  localCode: 'workflow-local-code-structure',
  githubCode: 'workflow-github-code',
  githubChanges: 'workflow-github-commit-changes',
  vercelHistory: 'workflow-vercel-status-history',
})

export const WORKFLOW_SOURCE_TWIN_PART_REFS = Object.freeze({
  localCode: 'workflow.source.local.code',
  githubCode: 'workflow.source.github.code',
  githubChanges: 'workflow.source.github.changes',
  vercelHistory: 'workflow.source.vercel.history',
})

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
    view: 'github-code',
    actionLabel: 'GitHub 코드',
    panelTitle: 'GitHub 저장소',
    description: '현재 배포에 포함된 GitHub 커밋의 코드 구조입니다. 최신 원격 HEAD와 다를 수 있습니다.',
  }),
  'map-vercel': Object.freeze({
    nodeId: 'map-vercel',
    view: 'history',
    actionLabel: '상태 이력',
    panelTitle: 'Vercel 배포 상태 이력',
    description: '코드·DB 선언·배포·집계 운영 상태를 한 시점으로 묶은 내부 기록입니다.',
  }),
})

const GITHUB_CHANGES_ENTRY = Object.freeze({
  ...SOURCE_TWIN_NODE_ENTRIES['map-github'],
  view: 'changes',
  actionLabel: '커밋 변경',
  description: '배포 manifest의 변경분과 서명이 확인된 GitHub push 신호입니다.',
})

const PART_REF_ENTRIES = Object.freeze({
  [`map-local-repo:${WORKFLOW_SOURCE_TWIN_PART_REFS.localCode}`]: SOURCE_TWIN_NODE_ENTRIES['map-local-repo'],
  [`map-github:${WORKFLOW_SOURCE_TWIN_PART_REFS.githubCode}`]: SOURCE_TWIN_NODE_ENTRIES['map-github'],
  [`map-github:${WORKFLOW_SOURCE_TWIN_PART_REFS.githubChanges}`]: GITHUB_CHANGES_ENTRY,
  [`map-vercel:${WORKFLOW_SOURCE_TWIN_PART_REFS.vercelHistory}`]: SOURCE_TWIN_NODE_ENTRIES['map-vercel'],
})

const GIT_SYNC_ENTRY = Object.freeze({
  ...SOURCE_TWIN_NODE_ENTRIES['map-local-repo'],
  actionLabel: 'Git 동기화',
  focus: 'git-sync',
})

export function workflowSourceTwinEntryForNode(nodeId) {
  return SOURCE_TWIN_NODE_ENTRIES[nodeId] ?? null
}

export function workflowSourceTwinEntryForPart(nodeId, part) {
  const ref = typeof part === 'string' ? part : part?.ref
  if (!ref) return null
  return PART_REF_ENTRIES[`${nodeId}:${ref}`] ?? null
}

export function workflowSourceTwinEntryForEdgeOperation(edgeId) {
  return edgeId === WORKFLOW_GIT_SYNC_EDGE_ID ? GIT_SYNC_ENTRY : null
}

export const WORKFLOW_SOURCE_TWIN_NODE_IDS = Object.freeze(Object.keys(SOURCE_TWIN_NODE_ENTRIES))
