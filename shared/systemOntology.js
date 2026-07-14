import { normalizeSystemParts } from './systemPartOntology.js'

export const SYSTEM_KIND_DEFS = Object.freeze([
  { id: 'actor', label: '사용자·주체', icon: '◎', color: '#22c55e' },
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

export function systemKindDefinition(id) {
  return KIND_BY_ID.get(id) ?? KIND_BY_ID.get('service')
}

export function normalizeSystemPlainText(value, maxLength = 240) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
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
  if (Array.isArray(data.systemParts)) normalized.systemParts = normalizeSystemParts(data.systemParts)
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
  const runtime = data.twinRuntime
  const verifiedAt = Date.parse(runtime?.verifiedAt ?? '')
  const isTwin = runtime?.verification === 'verified'
    && typeof runtime?.resourceId === 'string'
    && runtime.resourceId.length > 0
    && Number.isFinite(verifiedAt)

  return isTwin
    ? { id: 'twin', label: 'LIVE', color: '#22c55e' }
    : { id: 'declared', label: '설계', color: '#f59e0b' }
}
