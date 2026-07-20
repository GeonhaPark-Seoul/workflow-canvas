export const SOURCE_TWIN_SCHEMA_VERSION = 1
export const SOURCE_TWIN_SOURCE_ID = 'workflow-canvas:self-source'

export const SOURCE_TWIN_PERSPECTIVES = Object.freeze({
  all: '전체',
  functionality: '제품 기능',
  code: '코드 전체',
  database: 'DB·저장',
  security: '보안·권한',
  deployment: '배포·운영',
})

export const SOURCE_TWIN_AUDIENCE_MODES = Object.freeze({
  easy: '쉬운 설명',
  developer: '개발자 정보',
})

const VALID_PERSPECTIVES = new Set(Object.keys(SOURCE_TWIN_PERSPECTIVES))
const VALID_AUDIENCE_MODES = new Set(Object.keys(SOURCE_TWIN_AUDIENCE_MODES))
const EXPLANATION_METHOD_LABELS = Object.freeze({
  'curated-product-profile': '제품 역할 사전과 실제 코드',
  'test-file-rule': '테스트 파일 규칙과 실제 코드',
  'deterministic-source-rule': '경로·구조·참조 분석',
  'symbol-and-source-range': '함수 이름과 실제 함수 범위',
  'api-route-and-source': 'API 경로와 실제 코드',
  'database-reference': 'DB 참조와 실제 코드',
  'database-policy-declaration': 'DB 보안 정책 선언',
  'environment-reference': '환경변수 이름 참조',
  'deployment-configuration': '배포 설정 선언',
  'dependency-reference': '외부 라이브러리 참조',
  'package-script-declaration': '프로젝트 명령 선언',
})

export function sourceTwinAudienceMode(value) {
  return VALID_AUDIENCE_MODES.has(value) ? value : 'easy'
}

function explanationReference(value) {
  const ref = typeof value === 'string' ? value.trim() : ''
  const separator = ref.indexOf(':')
  if (separator < 1) return null
  const kind = ref.slice(0, separator)
  const target = ref.slice(separator + 1)
  if (!target) return null
  const labels = {
    source: target.replace('#L', ' · L'),
    symbol: `함수·기호 ${target}`,
    api: `API ${target}`,
    'db-table': `DB 테이블 ${target}`,
    'db-function': `DB 함수 ${target}`,
    env: `환경변수 이름 ${target}`,
    security: `보안 신호 ${target}`,
    dependency: `외부 라이브러리 ${target}`,
    deployment: `배포 대상 ${target}`,
    script: `프로젝트 명령 ${target}`,
    profile: `Source Profile ${target}`,
  }
  return { kind, ref, label: labels[kind] ?? target }
}

export function sourceTwinExplanationEvidence(entity = {}) {
  const method = typeof entity.explanationBasis?.method === 'string'
    ? entity.explanationBasis.method
    : 'deterministic-source-rule'
  let refs = Array.isArray(entity.explanationBasis?.refs)
    ? entity.explanationBasis.refs.map(explanationReference).filter(Boolean)
    : []
  if (refs.length === 0 && entity.path) {
    const start = Number.isInteger(entity.lineStart) ? entity.lineStart : 1
    const end = Number.isInteger(entity.lineEnd) ? entity.lineEnd : start
    refs = [explanationReference(`source:${entity.path}#L${start}${end > start ? `-L${end}` : ''}`)].filter(Boolean)
  }
  return {
    method,
    methodLabel: EXPLANATION_METHOD_LABELS[method] ?? '결정적 코드 구조 분석',
    refs: refs.slice(0, 12),
  }
}

export function sourceTwinEntityMap(manifest) {
  return new Map((manifest?.entities ?? []).map((entity) => [entity.id, entity]))
}

export function sourceTwinEntities(manifest, { perspective = 'all', query = '', limit = 500 } = {}) {
  const selectedPerspective = VALID_PERSPECTIVES.has(perspective) ? perspective : 'all'
  const allowed = selectedPerspective === 'all'
    ? null
    : new Set(manifest?.perspectives?.[selectedPerspective] ?? [])
  const normalizedQuery = String(query ?? '').trim().toLocaleLowerCase()
  return (manifest?.entities ?? [])
    .filter((entity) => !allowed || allowed.has(entity.id))
    .filter((entity) => {
      if (!normalizedQuery) return true
      return [
        entity.label,
        entity.path,
        entity.name,
        entity.summary,
        entity.userImpact,
        entity.technicalSummary,
        entity.explanationBasis?.method,
        ...(entity.explanationBasis?.refs ?? []),
        entity.area,
        entity.subsystem,
        ...(entity.tags ?? []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
    })
    .slice(0, Math.max(1, Math.min(2_000, Number(limit) || 500)))
}

export function sourceTwinCodeUrl(manifest, entity, commitSha = '') {
  const repositoryUrl = String(manifest?.source?.repositoryUrl ?? '').replace(/\/$/, '')
  const path = String(entity?.path ?? '').replace(/^\/+/, '')
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/i.test(repositoryUrl) || !path) return ''
  const ref = /^[a-f0-9]{7,64}$/i.test(commitSha) ? commitSha : (manifest?.source?.defaultBranch || 'main')
  const line = Number.isInteger(entity?.lineStart) && entity.lineStart > 0 ? `#L${entity.lineStart}` : ''
  return `${repositoryUrl}/blob/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}${line}`
}
