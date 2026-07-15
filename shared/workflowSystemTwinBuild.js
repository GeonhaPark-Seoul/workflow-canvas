import { createTwinBuildFromCanvasTemplate } from './twinBuildCanvas.js'
import { TWIN_ENGINE_SCHEMA_VERSION } from './twinAdapterContract.js'
import { createWorkflowCanvasSystemMap } from './workflowCanvasSystemMap.js'
import { WORKFLOW_SYSTEM_DISCOVERY_SOURCE_ID } from './workflowSystemDiscovery.js'
import { WORKFLOW_SYSTEM_DISCOVERY } from './workflowSystemDiscoveryManifest.js'
import { WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR } from './workflowSystemTwinAdapterDescriptor.js'

const GIT_SYNC_EVIDENCE_ID = 'evidence:workflow-git-sync-operation'

export function createWorkflowSystemTwinBuild() {
  return createTwinBuildFromCanvasTemplate({
    id: `workflow-system-build:${WORKFLOW_SYSTEM_DISCOVERY.current.id}`,
    source: {
      id: WORKFLOW_SYSTEM_DISCOVERY_SOURCE_ID,
      adapterId: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.id,
      adapterContractVersion: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.contractVersion,
      adapterVersion: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.adapterVersion,
      engineSchemaVersion: TWIN_ENGINE_SCHEMA_VERSION,
      snapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
      label: 'Workflow Canvas 시스템',
      systemKind: 'software-application',
      observationLevel: 'discovered',
      rootEntityId: 'map-group-experience',
    },
    canvas: createWorkflowCanvasSystemMap(),
    evidence: [{
      id: GIT_SYNC_EVIDENCE_ID,
      kind: 'connector',
      ref: 'scripts/local-connector-agent.mjs, shared/localConnector.js',
      summary: '로컬 저장소와 GitHub의 검증된 방향성 동기화 조작 계약',
      confidence: 'high',
    }],
    operations: [{
      id: 'operation:workflow-git-sync',
      capability: 'workflow.local.git-sync',
      label: '로컬 코드와 GitHub 코드 동기화',
      description: '상태를 먼저 확인한 뒤 일반 push 또는 fast-forward pull만 명시적 승인으로 실행합니다.',
      access: 'execute',
      approval: 'explicit',
      reversible: false,
      target: { kind: 'relation', id: 'map-edge-repo-github' },
      evidenceIds: [GIT_SYNC_EVIDENCE_ID],
    }],
  })
}

export const WORKFLOW_SYSTEM_TWIN_BUILD = createWorkflowSystemTwinBuild()
