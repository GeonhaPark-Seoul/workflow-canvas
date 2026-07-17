import { normalizeDigitalTwinBinding, normalizeSystemParts } from './systemPartOntology.js'
import { normalizeNodePresentation } from './systemLayers.js'
import { normalizeTrustZone } from './trustTopology.js'

export const SYSTEM_KIND_DEFS = Object.freeze([
  { id: 'actor', label: '사용자·주체', icon: '◎', color: '#22c55e' },
  { id: 'feature', label: '기능 Asset', icon: '◆', color: '#16a34a' },
  { id: 'engine', label: '제품 엔진', icon: '◈', color: '#14b8a6' },
  { id: 'frontend', label: '프론트엔드', icon: '▣', color: '#3b82f6' },
  { id: 'service', label: '백엔드 서비스', icon: '◆', color: '#06b6d4' },
  { id: 'api', label: 'API', icon: '↔', color: '#0ea5e9' },
  { id: 'function', label: '서버 함수', icon: 'ƒ', color: '#6366f1' },
  { id: 'database', label: '데이터베이스', icon: '▤', color: '#a855f7' },
  { id: 'table', label: '테이블', icon: '▦', color: '#8b5cf6' },
  { id: 'auth', label: '인증', icon: '◇', color: '#f59e0b' },
  { id: 'policy', label: '권한 정책', icon: '⚿', color: '#ef4444' },
  { id: 'storage', label: '파일 저장소', icon: '▧', color: '#14b8a6' },
  { id: 'queue', label: '이벤트·대기열', icon: '⇄', color: '#84cc16' },
  { id: 'deployment', label: '배포 환경', icon: '⬡', color: '#64748b' },
  { id: 'external', label: '외부 서비스', icon: '↗', color: '#ec4899' },
  { id: 'mcp', label: 'MCP', icon: '⌘', color: '#f97316' },
  { id: 'credential', label: '키 참조', icon: '✦', color: '#eab308' },
])

export const SYSTEM_COMPONENT_KIND_DEFS = Object.freeze([
  { id: 'engine', label: 'Engine', description: '여러 단계를 조율해 하나의 제품 능력을 수행합니다.' },
  { id: 'contract', label: 'Contract', description: '서로 다른 구성요소가 지켜야 할 입력·출력 형식을 정합니다.' },
  { id: 'resolver', label: 'Resolver', description: '여러 후보 중 증거에 맞는 대상이나 의미를 결정합니다.' },
  { id: 'builder', label: 'Builder', description: '검증된 입력을 구조화된 결과물로 조립합니다.' },
  { id: 'pipeline', label: 'Pipeline', description: '여러 처리 단계를 정해진 순서와 조건으로 연결합니다.' },
  { id: 'agent-skill', label: 'Agent Skill', description: 'AI가 특정 작업을 수행하도록 안내하는 재사용 절차입니다.' },
  { id: 'agent-policy', label: 'Agent Policy', description: 'AI가 지켜야 할 허용 범위와 승인 조건을 정합니다.' },
  { id: 'guardrail', label: 'Hard Guardrail', description: 'AI나 화면에서 우회할 수 없도록 코드로 강제하는 제한입니다.' },
  { id: 'workflow', label: 'Workflow', description: '호환성을 위해 유지하는 기존 작업 흐름 분류입니다.', legacy: true },
  { id: 'tool', label: 'Tool', description: '호환성을 위해 유지하는 기존 단일 명령 분류입니다.', legacy: true },
  { id: 'connector', label: 'Connector', description: '외부 시스템과 제한된 데이터·명령을 주고받는 경계입니다.' },
  { id: 'manifest', label: 'Manifest', description: '버전이 있는 구성요소와 지원 범위를 선언한 목록입니다.' },
])

export const SYSTEM_COMPONENT_MATURITY_DEFS = Object.freeze([
  { id: 'planned', label: '계획' },
  { id: 'prototype', label: '프로토타입' },
  { id: 'alpha', label: '알파' },
  { id: 'beta', label: '베타' },
  { id: 'stable', label: '안정화' },
  { id: 'deprecated', label: '폐기 예정' },
])

export const SYSTEM_ENVIRONMENT_DEFS = Object.freeze([
  { id: 'unknown', label: '환경 미지정' },
  { id: 'local', label: '로컬' },
  { id: 'development', label: '개발' },
  { id: 'staging', label: '스테이징' },
  { id: 'production', label: '프로덕션' },
])

export const SYSTEM_SOURCE_DEFS = Object.freeze([
  { id: 'manual', label: '수동 모델' },
  { id: 'code', label: '코드에서 발견' },
  { id: 'connector', label: '커넥터에서 발견' },
  { id: 'runtime', label: '실행 기록에서 관측' },
])

export const SYSTEM_ONTOLOGY_TEXT_FIELDS = Object.freeze([
  'label',
  'description',
  'purpose',
  'responsibility',
  'constraints',
  'evidence',
])

const KIND_BY_ID = new Map(SYSTEM_KIND_DEFS.map((item) => [item.id, item]))
const ENVIRONMENT_IDS = new Set(SYSTEM_ENVIRONMENT_DEFS.map((item) => item.id))
const SOURCE_IDS = new Set(SYSTEM_SOURCE_DEFS.map((item) => item.id))
const COMPONENT_KIND_IDS = new Set(SYSTEM_COMPONENT_KIND_DEFS.map((item) => item.id))
const COMPONENT_KIND_BY_ID = new Map(SYSTEM_COMPONENT_KIND_DEFS.map((item) => [item.id, item]))
const COMPONENT_MATURITY_IDS = new Set(SYSTEM_COMPONENT_MATURITY_DEFS.map((item) => item.id))

export function systemKindDefinition(id) {
  return KIND_BY_ID.get(id) ?? KIND_BY_ID.get('service')
}

export function systemComponentKindDefinition(id) {
  return COMPONENT_KIND_BY_ID.get(id) ?? COMPONENT_KIND_BY_ID.get('engine')
}

export function normalizeSystemPlainText(value, maxLength = 240) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function normalizeTextList(value, maxItems = 12, maxLength = 240) {
  const result = []
  const seen = new Set()
  for (const item of Array.isArray(value) ? value.slice(0, maxItems) : []) {
    const normalized = normalizeSystemPlainText(item, maxLength)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  return result
}

export function normalizeLogicalComponent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (value.schemaVersion != null && value.schemaVersion !== 1) return null
  const kind = COMPONENT_KIND_IDS.has(value.kind) ? value.kind : 'engine'
  const maturity = COMPONENT_MATURITY_IDS.has(value.maturity) ? value.maturity : 'prototype'
  const normalized = {
    schemaVersion: 1,
    id: normalizeSystemPlainText(value.id, 180),
    kind,
    productVersion: normalizeSystemPlainText(value.productVersion, 80),
    technicalVersion: normalizeSystemPlainText(value.technicalVersion, 80),
    maturity,
    maintainerAgentId: normalizeSystemPlainText(value.maintainerAgentId, 180),
    inputs: normalizeTextList(value.inputs),
    outputs: normalizeTextList(value.outputs),
    codeEvidence: normalizeTextList(value.codeEvidence, 16, 300),
    testEvidence: normalizeTextList(value.testEvidence, 16, 300),
    compatibility: normalizeTextList(value.compatibility, 12, 160),
  }
  return normalized.id ? normalized : null
}

export function normalizeSystemNodeData(data = {}) {
  const systemKind = KIND_BY_ID.has(data.systemKind) ? data.systemKind : 'service'
  const environment = ENVIRONMENT_IDS.has(data.environment) ? data.environment : 'unknown'
  const sourceKind = SOURCE_IDS.has(data.sourceKind) ? data.sourceKind : 'manual'
  const normalized = {
    ...data,
    systemKind,
    environment,
    sourceKind,
    provider: normalizeSystemPlainText(data.provider, 120),
    externalRef: normalizeSystemPlainText(data.externalRef, 300),
  }
  delete normalized.securityOverlay
  const trustZone = normalizeTrustZone(data.trustZone)
  if (trustZone) normalized.trustZone = trustZone
  else delete normalized.trustZone
  if (Array.isArray(data.systemParts)) normalized.systemParts = normalizeSystemParts(data.systemParts)
  const digitalTwinBinding = normalizeDigitalTwinBinding(data.digitalTwinBinding)
  if (digitalTwinBinding) normalized.digitalTwinBinding = digitalTwinBinding
  else delete normalized.digitalTwinBinding
  const logicalComponent = normalizeLogicalComponent(data.logicalComponent)
  if (logicalComponent) normalized.logicalComponent = logicalComponent
  else delete normalized.logicalComponent
  const presentation = normalizeNodePresentation(data.presentation)
  if (presentation) normalized.presentation = presentation
  else delete normalized.presentation
  return normalized
}

export function createSystemNodeData(systemKind = 'service') {
  const kind = systemKindDefinition(systemKind)
  return normalizeSystemNodeData({
    label: `새 ${kind.label}`,
    description: '',
    purpose: '',
    responsibility: '',
    constraints: '',
    evidence: '',
    systemKind: kind.id,
    environment: 'unknown',
    sourceKind: 'manual',
    provider: '',
    externalRef: '',
  })
}

// A persisted canvas node can describe a real system, but it only becomes a
// verified digital twin when server-supplied runtime evidence is present.
// `twinRuntime` is stripped before canvas persistence and must never be treated
// as user-authored proof by a control action.
export function systemNodeReality(data = {}) {
  if (normalizeLogicalComponent(data.logicalComponent)) {
    return { id: 'logical', label: '논리 구성', color: '#14b8a6' }
  }
  const runtime = data.twinRuntime
  const verifiedAt = Date.parse(runtime?.verifiedAt ?? '')
  const serverRuntime = typeof runtime?.resourceId === 'string'
    && runtime.resourceId.length > 0
    && Number.isFinite(verifiedAt)
  if (!serverRuntime) return { id: 'declared', label: '설계', color: '#f59e0b' }
  const status = runtime.status ?? (runtime.verification === 'verified' ? 'healthy' : 'unknown')
  if (status === 'checking') return { id: 'checking', label: '확인 중', color: '#60a5fa' }
  if (status === 'failed') return { id: 'failed', label: '오류', color: '#ef4444' }
  if (status === 'stale') return { id: 'stale', label: '오래됨', color: '#f59e0b' }
  if (status === 'degraded') return { id: 'degraded', label: '부분 확인', color: '#eab308' }
  if (status === 'unknown') return { id: 'unknown', label: '미확인', color: '#94a3b8' }
  return status === 'healthy' && runtime.verification === 'verified'
    ? { id: 'twin', label: 'LIVE', color: '#22c55e' }
    : { id: 'unknown', label: '미확인', color: '#94a3b8' }
}

export function systemNodeTwinLink(data = {}) {
  const binding = normalizeDigitalTwinBinding(data.digitalTwinBinding)
  if (!binding) {
    return {
      id: 'unbound',
      label: '연결 안 됨',
      color: '#94a3b8',
      linked: false,
      title: '코드, 커넥터 또는 실행 근거와 연결되지 않은 캔버스 모델입니다.',
    }
  }
  return {
    id: 'code-twin',
    label: 'CODE',
    color: '#38bdf8',
    linked: true,
    sourceId: binding.sourceId,
    entityKey: binding.entityKey,
    observedFingerprint: binding.observedFingerprint,
    observedSnapshotId: binding.observedSnapshotId,
    title: '코드 또는 manifest 근거에 연결된 디지털 트윈 스냅샷입니다. 실제 실행 상태를 확인한 LIVE와는 다릅니다.',
  }
}
