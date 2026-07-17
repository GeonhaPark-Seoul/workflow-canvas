import { createDigitalTwinGraphProposal } from './digitalTwinProposal.js'
import { createDigitalTwinReviewItem, digitalTwinReviewFingerprint } from './digitalTwinReview.js'
import { sourceCodePartToSystemPart } from './sourceCodeParts.js'
import { sourceFlowToSystemPart } from './sourceFlows.js'

function text(value, maximum = 500) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

function finite(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(1_000_000, Math.max(-1_000_000, number)) : fallback
}

export function createSourceModuleMaterializationItem({
  reviewSourceId,
  manifest,
  entity,
  codeParts = [],
  flows = [],
  position = { x: 0, y: 0 },
}) {
  const sourceId = text(reviewSourceId, 240)
  const sourceManifestId = text(manifest?.id, 180)
  const sourceEntityId = text(entity?.id, 300)
  const entityFingerprint = text(entity?.fingerprint, 80)
  const sourceManifestSourceId = text(manifest?.source?.id, 160)
  if (!sourceId || !sourceManifestId || !sourceEntityId || !sourceManifestSourceId || !/^[a-f0-9]{8,80}$/i.test(entityFingerprint)) {
    throw new Error('코드 모듈의 manifest 근거가 올바르지 않습니다.')
  }
  if (!['file', 'function'].includes(entity?.kind)) throw new Error('파일이나 함수 모듈만 캔버스에 올릴 수 있습니다.')

  const nodeId = `source-module-${digitalTwinReviewFingerprint({ sourceManifestSourceId, sourceEntityId }).slice(0, 16)}`
  const itemKey = `source-module:${digitalTwinReviewFingerprint({ sourceManifestId, sourceEntityId }).slice(0, 16)}`
  const safePosition = { x: finite(position?.x, 0), y: finite(position?.y, 0) }
  const partRecords = [
    ...codeParts.slice(0, 32).map((value) => ({
      part: sourceCodePartToSystemPart(value),
      entityKey: value?.id,
      fingerprint: value?.anchor?.fingerprint,
    })),
    ...flows.slice(0, 8).map((value) => ({
      part: sourceFlowToSystemPart(value),
      entityKey: value?.id,
      fingerprint: digitalTwinReviewFingerprint(value),
    })),
  ].filter((record) => record.part)
  const parts = partRecords.map((record) => record.part)
  const item = createDigitalTwinReviewItem({
    sourceId,
    itemKey,
    category: 'entity',
    changeType: 'added',
    severity: 'info',
    title: `${text(entity.label, 150) || sourceEntityId} 캔버스에 올리기`,
    summary: '선택한 코드 모듈과 읽기 전용 코드 파츠를 L2 앱 구조 층의 CODE 근거 노드로 제안합니다.',
    evidence: [
      text(entity.path, 500),
      ...(entity.explanationBasis?.refs ?? []).slice(0, 8),
      ...parts.slice(0, 8).map((part) => part.evidenceRef),
    ],
    focus: { nodeId },
    status: 'source_module_candidate',
    observation: {
      sourceManifestId,
      sourceEntityId,
      entityFingerprint,
      position: safePosition,
      partFingerprints: partRecords.map((record) => record.fingerprint).filter(Boolean),
    },
  })
  const proposalKey = itemKey
  const proposalId = `${sourceId}::${proposalKey}`
  const binding = {
    schemaVersion: 1,
    sourceId: sourceManifestSourceId,
    entityKey: sourceEntityId,
    observedFingerprint: entityFingerprint,
    observedSnapshotId: sourceManifestId,
    proposalId,
    itemId: item.id,
    itemFingerprint: item.fingerprint,
  }
  const systemParts = partRecords.map((record) => ({
    ...record.part,
    digitalTwinBinding: {
      ...binding,
      entityKey: `${sourceEntityId}::${record.entityKey ?? record.part.id}`,
      observedFingerprint: record.fingerprint ?? entityFingerprint,
    },
  }))
  const node = {
    id: nodeId,
    type: 'system',
    position: safePosition,
    width: 280,
    height: 170,
    data: {
      label: text(entity.label, 180) || sourceEntityId,
      description: text(entity.summary, 800),
      purpose: text(entity.userImpact, 800),
      responsibility: text(entity.technicalSummary, 800),
      constraints: '정적 코드 근거를 나타내며 실제 실행 상태(LIVE)를 의미하지 않습니다.',
      evidence: text(entity.explanationBasis?.refs?.join(', ') || entity.path, 1200),
      systemKind: 'module',
      environment: 'unknown',
      sourceKind: 'code',
      provider: text(manifest?.source?.label, 120),
      externalRef: text(entity.path, 300),
      assetStatus: 'confirmed',
      digitalTwinBinding: binding,
      systemParts,
    },
  }
  const proposal = createDigitalTwinGraphProposal({
    sourceId,
    proposalKey,
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: sourceManifestId,
    title: item.title,
    summary: '새 CODE 근거 노드 하나만 추가합니다. 기존 노드 위치, 메모와 검토 결정은 바꾸지 않습니다.',
    operations: [{ action: 'add_node', label: `${node.data.label} 추가`, node }],
  })
  return { ...item, proposal }
}
