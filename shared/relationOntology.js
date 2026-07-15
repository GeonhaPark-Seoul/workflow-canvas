import { normalizeTrustGateway } from './trustTopology.js'

export const RELATION_FAMILY_DEFS = Object.freeze([
  { id: 'general', label: '일반', color: '#8b94a7' },
  { id: 'structure', label: '구조', color: '#a855f7' },
  { id: 'flow', label: '흐름·변화', color: '#3b82f6' },
  { id: 'responsibility', label: '책임·협업', color: '#22c55e' },
  { id: 'dependency', label: '조건·의존', color: '#f59e0b' },
  { id: 'knowledge', label: '정보·판단', color: '#ec4899' },
  { id: 'system', label: '디지털 시스템', color: '#06b6d4' },
])

export const RELATION_SOURCE_DEFS = Object.freeze([
  { id: 'manual', label: '직접 판단' },
  { id: 'document', label: '문서·자료' },
  { id: 'code', label: '코드·설정' },
  { id: 'connector', label: '커넥터 결과' },
  { id: 'runtime', label: '실행 기록' },
])

export const RELATION_CONFIDENCE_DEFS = Object.freeze([
  { id: 'unknown', label: '판단 미정' },
  { id: 'low', label: '낮음' },
  { id: 'medium', label: '보통' },
  { id: 'high', label: '높음' },
])

// `phrase` reads as: source [phrase] target. Symmetric relationships omit the
// arrowhead, while every directed relationship keeps source/target semantics.
export const RELATION_DEFS = Object.freeze([
  { id: 'flows_to', family: 'general', label: '이어짐', phrase: '이어진다', directed: true },
  { id: 'related_to', family: 'general', label: '관련됨', phrase: '관련 있다', directed: false },
  { id: 'same_as', family: 'general', label: '동일함', phrase: '같다', directed: false },

  { id: 'is_a', family: 'structure', label: '종류임', phrase: '종류다', directed: true },
  { id: 'part_of', family: 'structure', label: '일부임', phrase: '일부다', directed: true },
  { id: 'contains', family: 'structure', label: '포함함', phrase: '포함한다', directed: true },
  { id: 'located_at', family: 'structure', label: '위치함', phrase: '에 위치한다', directed: true },

  { id: 'precedes', family: 'flow', label: '앞섬', phrase: '보다 먼저다', directed: true },
  { id: 'triggers', family: 'flow', label: '촉발함', phrase: '촉발한다', directed: true },
  { id: 'consumes', family: 'flow', label: '소비함', phrase: '소비한다', directed: true },
  { id: 'produces', family: 'flow', label: '생산함', phrase: '생산한다', directed: true },
  { id: 'transforms_into', family: 'flow', label: '변환됨', phrase: '로 변환된다', directed: true },
  { id: 'moves_to', family: 'flow', label: '이동함', phrase: '로 이동한다', directed: true },
  { id: 'uses', family: 'flow', label: '사용함', phrase: '사용한다', directed: true },

  { id: 'owned_by', family: 'responsibility', label: '소유됨', phrase: '가 소유한다', directed: true },
  { id: 'assigned_to', family: 'responsibility', label: '담당 배정', phrase: '에게 배정된다', directed: true },
  { id: 'performs', family: 'responsibility', label: '수행함', phrase: '수행한다', directed: true },
  { id: 'reviews', family: 'responsibility', label: '검토함', phrase: '검토한다', directed: true },
  { id: 'approves', family: 'responsibility', label: '승인함', phrase: '승인한다', directed: true },
  { id: 'reports_to', family: 'responsibility', label: '보고함', phrase: '에게 보고한다', directed: true },
  { id: 'participates_in', family: 'responsibility', label: '참여함', phrase: '에 참여한다', directed: true },

  { id: 'depends_on', family: 'dependency', label: '의존함', phrase: '에 의존한다', directed: true },
  { id: 'requires', family: 'dependency', label: '필요로 함', phrase: '을 필요로 한다', directed: true },
  { id: 'blocks', family: 'dependency', label: '막음', phrase: '막는다', directed: true },
  { id: 'enables', family: 'dependency', label: '가능하게 함', phrase: '가능하게 한다', directed: true },
  { id: 'constrains', family: 'dependency', label: '제약함', phrase: '제약한다', directed: true },

  { id: 'references', family: 'knowledge', label: '참조함', phrase: '참조한다', directed: true },
  { id: 'evidences', family: 'knowledge', label: '증명함', phrase: '의 근거다', directed: true },
  { id: 'supports', family: 'knowledge', label: '뒷받침함', phrase: '뒷받침한다', directed: true },
  { id: 'contradicts', family: 'knowledge', label: '모순됨', phrase: '와 모순된다', directed: false },
  { id: 'derived_from', family: 'knowledge', label: '도출됨', phrase: '에서 도출된다', directed: true },
  { id: 'decides', family: 'knowledge', label: '결정함', phrase: '결정한다', directed: true },

  { id: 'calls', family: 'system', label: '호출함', phrase: '호출한다', directed: true },
  { id: 'reads', family: 'system', label: '읽음', phrase: '읽는다', directed: true },
  { id: 'writes', family: 'system', label: '씀', phrase: '쓴다', directed: true },
  { id: 'authenticates', family: 'system', label: '인증함', phrase: '인증한다', directed: true },
  { id: 'authorizes', family: 'system', label: '권한 판정', phrase: '권한을 판정한다', directed: true },
  { id: 'deploys_to', family: 'system', label: '배포함', phrase: '에 배포한다', directed: true },
  { id: 'syncs_with', family: 'system', label: '동기화함', phrase: '와 동기화한다', directed: false },

  { id: 'custom', family: 'general', label: '사용자 정의', phrase: '관계가 있다', directed: true },
])

export const RELATION_TYPE_IDS = Object.freeze(RELATION_DEFS.map(({ id }) => id))

const FAMILY_BY_ID = new Map(RELATION_FAMILY_DEFS.map((item) => [item.id, item]))
const RELATION_BY_ID = new Map(RELATION_DEFS.map((item) => [item.id, item]))
const SOURCE_BY_ID = new Map(RELATION_SOURCE_DEFS.map((item) => [item.id, item]))
const CONFIDENCE_BY_ID = new Map(RELATION_CONFIDENCE_DEFS.map((item) => [item.id, item]))

export function relationFamilyDefinition(id) {
  return FAMILY_BY_ID.get(id) ?? FAMILY_BY_ID.get('general')
}

export function relationDefinition(id) {
  return RELATION_BY_ID.get(id) ?? RELATION_BY_ID.get('flows_to')
}

export function relationSourceDefinition(id) {
  return SOURCE_BY_ID.get(id) ?? SOURCE_BY_ID.get('manual')
}

export function relationConfidenceDefinition(id) {
  return CONFIDENCE_BY_ID.get(id) ?? CONFIDENCE_BY_ID.get('unknown')
}

export function normalizeRelationPlainText(value, maxLength = 40) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

// Only these edge-data fields are persisted. Unknown keys and future runtime
// verification evidence are intentionally dropped at the browser/server save
// boundary so a canvas author cannot forge an observed relationship.
export function normalizeEdgeRelationData(data = {}, fallbackType = 'flows_to') {
  const out = {}
  if (data?.partsLink === true) out.partsLink = true

  const hasRelation = data?.relationType != null
    || data?.relationLabel != null
    || data?.relationExplicit != null
    || data?.relationSourceKind != null
    || data?.relationConfidence != null
    || data?.relationEvidence != null
    || data?.relationEvidenceRef != null
    || data?.trustGateway != null
  if (!hasRelation) return out

  const fallback = relationDefinition(fallbackType)
  const relation = RELATION_BY_ID.get(data.relationType) ?? fallback
  out.relationType = relation.id
  out.relationExplicit = data.relationExplicit === true
  if (relation.id === 'custom') {
    out.relationLabel = normalizeRelationPlainText(data.relationLabel) || relation.label
  }
  out.relationSourceKind = relationSourceDefinition(data.relationSourceKind).id
  out.relationConfidence = relationConfidenceDefinition(data.relationConfidence).id
  const evidence = normalizeRelationPlainText(data.relationEvidence, 500)
  const evidenceRef = normalizeRelationPlainText(data.relationEvidenceRef, 300)
  if (evidence) out.relationEvidence = evidence
  if (evidenceRef) out.relationEvidenceRef = evidenceRef
  const trustGateway = normalizeTrustGateway(data?.trustGateway)
  if (trustGateway) out.trustGateway = trustGateway
  return out
}

export function createEdgeRelationData(relationType = 'flows_to', relationLabel = '', explicit = true, provenance = {}) {
  return normalizeEdgeRelationData({
    relationType,
    relationLabel,
    relationExplicit: explicit,
    relationSourceKind: provenance.relationSourceKind,
    relationConfidence: provenance.relationConfidence,
    relationEvidence: provenance.relationEvidence,
    relationEvidenceRef: provenance.relationEvidenceRef,
    trustGateway: provenance.trustGateway,
  }, relationType)
}

// User-authored evidence can make a relationship better documented, but only
// server-owned runtime proof can make it verified. `relationRuntime` is never
// returned by normalizeEdgeRelationData, so browser/MCP saves cannot forge it.
export function edgeRelationProvenance(data = {}) {
  const source = relationSourceDefinition(data?.relationSourceKind)
  const confidence = relationConfidenceDefinition(data?.relationConfidence)
  const evidence = normalizeRelationPlainText(data?.relationEvidence, 500)
  const evidenceRef = normalizeRelationPlainText(data?.relationEvidenceRef, 300)
  const runtime = data?.relationRuntime
  const verifiedAt = Date.parse(runtime?.verifiedAt ?? '')
  const verified = runtime?.verification === 'verified'
    && typeof runtime?.evidenceId === 'string'
    && runtime.evidenceId.trim().length > 0
    && Number.isFinite(verifiedAt)

  const reality = verified
    ? { id: 'verified', label: '서버 검증', color: '#22c55e' }
    : (source.id !== 'manual' || evidence || evidenceRef)
        ? { id: 'evidenced', label: '근거 기록', color: '#06b6d4' }
        : { id: 'declared', label: '주장', color: '#f59e0b' }

  return {
    source,
    confidence,
    evidence,
    evidenceRef,
    reality,
    verifiedAt: verified ? new Date(verifiedAt).toISOString() : null,
  }
}

export function edgeRelationInfo(data = {}, fallbackType = 'flows_to') {
  const relation = relationDefinition(data?.relationType ?? fallbackType)
  const family = relationFamilyDefinition(relation.family)
  const label = relation.id === 'custom'
    ? normalizeRelationPlainText(data?.relationLabel) || relation.label
    : relation.label
  return {
    ...relation,
    label,
    color: family.color,
    familyLabel: family.label,
    explicit: data?.relationExplicit === true,
    provenance: edgeRelationProvenance(data),
  }
}
