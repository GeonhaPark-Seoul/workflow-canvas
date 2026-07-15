import { createTwinAdapterDescriptor } from './twinAdapterContract.js'

export const WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR = createTwinAdapterDescriptor({
  id: 'workflow-system-discovery',
  contractVersion: 1,
  adapterVersion: '1.0.0',
  minimumEngineSchemaVersion: 1,
  maximumEngineSchemaVersion: 1,
  label: 'Workflow Canvas 시스템 어댑터',
  description: '배포 빌드의 소스·DB·보안·운영 manifest를 현재 시스템 지도와 대조합니다.',
  systemKinds: ['software-application'],
  interfaces: ['describe', 'canInspect', 'inspect'],
  features: ['deterministic-discovery', 'evidence-review', 'fingerprinted-proposals'],
  dataClasses: [
    {
      id: 'canvas-graph',
      label: '시스템 지도 구조',
      description: '선택한 캔버스의 노드, 파츠, 연결선과 검토 지문',
      sensitivity: 'internal',
      leavesSource: false,
      includesContent: false,
    },
    {
      id: 'deployment-source-metadata',
      label: '배포 소스 메타데이터',
      description: '파일·함수·API·DB 선언의 이름, 경로, 지문과 구현 근거',
      sensitivity: 'internal',
      leavesSource: true,
      includesContent: false,
    },
    {
      id: 'aggregate-runtime-evidence',
      label: '집계 운영 근거',
      description: '사용자 본문이나 행 데이터가 없는 제한된 운영 상태',
      sensitivity: 'internal',
      leavesSource: true,
      includesContent: false,
    },
  ],
  permissions: [
    {
      id: 'selected-canvas-read',
      label: '선택한 시스템 지도 읽기',
      access: 'read',
      scope: 'selected-canvas-graph',
      required: true,
      reason: '발견 manifest와 현재 지도 차이를 계산하기 위해 필요합니다.',
    },
  ],
  operationCapabilities: [],
})

export function canInspectWorkflowSystemCanvas(canvas) {
  const ids = new Set((canvas?.nodes ?? []).map((node) => node.id))
  return ['map-web-app', 'map-mcp-api', 'map-postgres', 'map-canvases-table']
    .every((id) => ids.has(id))
}
