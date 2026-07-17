import {
  publicSourceEditableProperty,
  sourceEditablePropertyDefinition,
} from './workflowSourceEditableProperties.js'

export const SOURCE_CODE_PART_SCHEMA_VERSION = 1

export const SOURCE_CODE_PART_KIND_DEFS = Object.freeze([
  { id: 'declaration', label: '선언', description: '이름, 함수, 클래스 또는 값을 사용할 수 있게 정의합니다.' },
  { id: 'command', label: '명령', description: '함수를 호출하거나 값을 바꾸는 실제 처리 한 단계입니다.' },
  { id: 'branch', label: '가정·분기', description: '조건에 따라 서로 다른 처리 경로를 선택합니다.' },
  { id: 'loop', label: '반복', description: '조건이나 목록에 따라 같은 처리를 반복합니다.' },
  { id: 'return', label: '응답·반환', description: '처리 결과를 호출한 곳에 돌려주거나 오류로 중단합니다.' },
  { id: 'resource', label: '리소스', description: '다른 파일, 라이브러리 또는 서버 경로를 사용합니다.' },
  { id: 'config', label: '설정', description: '실행 환경이나 등록된 설정 값을 참조합니다.' },
  { id: 'data', label: '데이터', description: '데이터베이스 테이블이나 저장 함수를 읽거나 바꿉니다.' },
])

const KIND_BY_ID = new Map(SOURCE_CODE_PART_KIND_DEFS.map((item) => [item.id, item]))
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,239}$/

function text(value, maximum = 500) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

export function sourceCodePartKindDefinition(id) {
  return KIND_BY_ID.get(id) ?? KIND_BY_ID.get('command')
}

export function sourceCodePartSummary(kind, subject = '') {
  const definition = sourceCodePartKindDefinition(kind)
  const target = text(subject, 180)
  const prefix = target ? `“${target}”에 대해 ` : ''
  const summaries = {
    declaration: `${prefix}뒤의 코드가 사용할 이름이나 동작을 정의합니다.`,
    command: `${prefix}현재 처리 단계에서 필요한 동작을 실행합니다.`,
    branch: `${prefix}조건을 확인하고 다음 처리 경로를 선택합니다.`,
    loop: `${prefix}목록이나 조건이 끝날 때까지 처리를 반복합니다.`,
    return: `${prefix}현재 처리의 결과를 돌려주거나 오류로 중단합니다.`,
    resource: `${prefix}다른 코드나 외부 경로를 연결해 사용합니다.`,
    config: `${prefix}실행 환경에 등록된 설정 이름을 참조합니다.`,
    data: `${prefix}저장된 데이터를 읽거나 변경하는 연결을 사용합니다.`,
  }
  return summaries[definition.id]
}

export function normalizeSourceCodePart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = text(value.id, 240)
  const kind = KIND_BY_ID.has(value.kind) ? value.kind : ''
  const path = text(value.anchor?.path, 500)
  const nodeType = text(value.anchor?.nodeType, 100)
  const fingerprint = text(value.anchor?.fingerprint, 80)
  const lineStart = Math.max(1, Number(value.anchor?.lineStart) || 1)
  const lineEnd = Math.max(lineStart, Number(value.anchor?.lineEnd) || lineStart)
  if (!SAFE_ID.test(id) || !kind || !path || !nodeType || !/^[a-f0-9]{12,80}$/i.test(fingerprint)) return null
  const editableDefinition = sourceEditablePropertyDefinition(value.editable?.propertyId)
  const editableProperty = editableDefinition
    ? publicSourceEditableProperty(editableDefinition, value.editable?.currentValue)
    : null
  return {
    schemaVersion: SOURCE_CODE_PART_SCHEMA_VERSION,
    id,
    kind,
    label: text(value.label, 180) || sourceCodePartKindDefinition(kind).label,
    summary: text(value.summary, 800) || sourceCodePartSummary(kind, value.subject),
    subject: text(value.subject, 180),
    anchor: {
      path,
      nodeType,
      symbol: text(value.anchor?.symbol, 180) || 'module',
      lineStart,
      lineEnd,
      fingerprint,
      structureFingerprint: text(value.anchor?.structureFingerprint, 80),
    },
    evidenceRef: `source:${path}#L${lineStart}${lineEnd > lineStart ? `-L${lineEnd}` : ''}`,
    editable: {
      schemaVersion: 1,
      eligible: value.editable?.eligible === true && !!editableProperty,
      propertyId: editableProperty?.id ?? '',
      currentValue: editableProperty?.currentValue,
      property: editableProperty,
      reason: text(value.editable?.reason, 240) || (editableProperty ? '' : '현재 버전은 읽기 전용입니다.'),
    },
  }
}

export function sourceCodePartToSystemPart(value) {
  const part = normalizeSourceCodePart(value)
  if (!part) return null
  return {
    id: `cp-${part.anchor.fingerprint.slice(0, 20)}`,
    kind: 'code',
    label: `${sourceCodePartKindDefinition(part.kind).label} · ${part.subject || part.anchor.symbol}`.slice(0, 120),
    ref: `${part.anchor.path}#L${part.anchor.lineStart}${part.anchor.lineEnd > part.anchor.lineStart ? `-L${part.anchor.lineEnd}` : ''}`,
    exposure: 'internal',
    sourceKind: 'code',
    evidenceRef: part.evidenceRef,
  }
}

export function compactSourceCodePart(value) {
  const part = normalizeSourceCodePart(value)
  if (!part) return null
  return [
    part.kind,
    part.anchor.nodeType,
    part.anchor.symbol,
    part.anchor.lineStart,
    part.anchor.lineEnd,
    part.anchor.fingerprint,
    part.anchor.structureFingerprint,
    part.subject,
    part.editable.propertyId,
    part.editable.currentValue,
  ]
}

export function expandSourceCodePart(path, row) {
  if (!Array.isArray(row) || row.length < 8) return null
  const [kind, nodeType, symbol, lineStart, lineEnd, fingerprint, structureFingerprint, subject, propertyId, currentValue] = row
  return normalizeSourceCodePart({
    id: `code-part:${fingerprint}`,
    kind,
    subject,
    anchor: { path, nodeType, symbol, lineStart, lineEnd, fingerprint, structureFingerprint },
    editable: propertyId
      ? { schemaVersion: 1, eligible: true, propertyId, currentValue }
      : { schemaVersion: 1, eligible: false, reason: '등록되지 않은 코드는 읽기 전용입니다.' },
  })
}

export function sourceCodePartsForModule(catalog, moduleId, { limit = 800 } = {}) {
  const id = text(moduleId, 800)
  if (!id || id !== moduleId || !catalog?.modules || !Object.hasOwn(catalog.modules, id)) return null
  const module = catalog.modules[id]
  const file = catalog.files?.[module.path]
  if (!file || !Array.isArray(file.parts)) return null
  const maximum = Math.max(1, Math.min(800, Number(limit) || 800))
  const parts = file.parts
    .map((row) => expandSourceCodePart(module.path, row))
    .filter((part) => part && (
      module.symbol === 'module'
      || (
        part.anchor.symbol === module.symbol
        && part.anchor.lineStart >= module.lineStart
        && part.anchor.lineEnd <= module.lineEnd
      )
    ))
    .slice(0, maximum)
  return {
    schemaVersion: SOURCE_CODE_PART_SCHEMA_VERSION,
    sourceId: text(catalog.sourceId, 240),
    sourceManifestId: text(catalog.sourceManifestId, 240),
    moduleId: id,
    moduleFingerprint: text(module.fingerprint, 80),
    truncated: parts.length < Number(module.count || 0),
    total: Number(module.count || parts.length),
    parts,
  }
}
