export const SOURCE_PROFILE_CONTRACT_VERSION = 1

const ID_PATTERN = /^[a-z0-9][a-z0-9.-]{1,119}$/
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{1,179}$/
const ANALYSIS_LEVELS = new Set(['parsed', 'structure-only', 'unsupported'])

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value, maximum = 300) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function stringList(value, maximumItems = 100, maximumLength = 300) {
  return Array.isArray(value)
    ? [...new Set(value.slice(0, maximumItems).map((item) => text(item, maximumLength)).filter(Boolean))]
    : []
}

function relativePathList(value, maximumItems = 80) {
  return stringList(value, maximumItems, 500).map((path) => {
    if (path.startsWith('/') || path.startsWith('~/') || /^[A-Za-z]:/.test(path) || path.includes('\\') || path.split('/').includes('..')) {
      throw new Error(`Source Profile match 경로가 올바르지 않습니다: ${path}`)
    }
    return path
  })
}

function assertUniqueIds(items, label) {
  const ids = new Set()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Source Profile ${label} ID가 중복됩니다: ${item.id}`)
    ids.add(item.id)
  }
  return items
}

function freeze(value) {
  if (Array.isArray(value)) {
    value.forEach(freeze)
    return Object.freeze(value)
  }
  if (plainObject(value)) {
    Object.values(value).forEach(freeze)
    return Object.freeze(value)
  }
  return value
}

function definition(value, { subsystem = false } = {}) {
  if (!plainObject(value)) throw new Error('Source Profile 분류 정의가 객체가 아닙니다.')
  const id = text(value.id, 120)
  if (!ID_PATTERN.test(id)) throw new Error(`Source Profile 분류 ID가 올바르지 않습니다: ${id}`)
  const area = subsystem ? text(value.area, 120) : ''
  if (subsystem && !ID_PATTERN.test(area)) throw new Error(`Source Profile 하위 시스템 영역이 올바르지 않습니다: ${area}`)
  return {
    id,
    ...(area ? { area } : {}),
    label: text(value.label, 120) || id,
    description: text(value.description, 300),
    order: Number.isInteger(value.order) ? Math.max(0, Math.min(10_000, value.order)) : 1_000,
  }
}

function role(value, path) {
  if (!plainObject(value)) throw new Error(`Source Profile 파일 역할이 객체가 아닙니다: ${path}`)
  const area = text(value.area, 120)
  const subsystem = text(value.subsystem, 120)
  const summary = text(value.summary, 800)
  const userImpact = text(value.userImpact, 800)
  if (!ID_PATTERN.test(area) || !summary || !userImpact) {
    throw new Error(`Source Profile 파일 역할이 불완전합니다: ${path}`)
  }
  if (subsystem && !ID_PATTERN.test(subsystem)) throw new Error(`Source Profile 하위 시스템이 올바르지 않습니다: ${path}`)
  return { area, ...(subsystem ? { subsystem } : {}), summary, userImpact }
}

function rule(value, kind) {
  if (!plainObject(value)) throw new Error(`Source Profile ${kind} 규칙이 객체가 아닙니다.`)
  const result = text(value[kind], 120)
  const area = text(value.area, 120)
  const pathPattern = text(value.pathPattern, 500)
  const layers = stringList(value.layers, 20, 80)
  if (!ID_PATTERN.test(result) || (!pathPattern && !layers.length)) {
    throw new Error(`Source Profile ${kind} 규칙이 불완전합니다.`)
  }
  if (area && !ID_PATTERN.test(area)) throw new Error(`Source Profile 규칙 영역이 올바르지 않습니다: ${area}`)
  if (pathPattern) {
    try { new RegExp(pathPattern, 'i') } catch { throw new Error(`Source Profile 경로 규칙이 올바르지 않습니다: ${pathPattern}`) }
  }
  return { [kind]: result, ...(area ? { area } : {}), ...(pathPattern ? { pathPattern } : {}), ...(layers.length ? { layers } : {}) }
}

function matchContract(value = {}) {
  if (!plainObject(value)) throw new Error('Source Profile match 계약이 객체가 아닙니다.')
  const packageNames = stringList(value.packageNames, 30, 180)
  const requiredFiles = relativePathList(value.requiredFiles)
  const anyFiles = relativePathList(value.anyFiles)
  const fallback = value.fallback === true
  if (fallback && (packageNames.length || requiredFiles.length || anyFiles.length)) {
    throw new Error('Source Profile fallback은 다른 match 조건과 함께 사용할 수 없습니다.')
  }
  if (!fallback && !packageNames.length && !requiredFiles.length && !anyFiles.length) {
    throw new Error('Source Profile에는 최소 하나의 결정적 match 근거가 필요합니다.')
  }
  return { packageNames, requiredFiles, anyFiles, fallback }
}

function languageSupport(value) {
  if (!plainObject(value)) throw new Error('Source Profile 언어 지원 선언이 객체가 아닙니다.')
  const language = text(value.language, 80)
  const level = ANALYSIS_LEVELS.has(value.level) ? value.level : ''
  if (!language || !level) throw new Error('Source Profile 언어 지원 선언이 불완전합니다.')
  return { language, level, note: text(value.note, 300) }
}

export function defineSourceProfile(value) {
  if (!plainObject(value)) throw new Error('Source Profile이 객체가 아닙니다.')
  if (value.contractVersion !== SOURCE_PROFILE_CONTRACT_VERSION) {
    throw new Error(`지원하지 않는 Source Profile 계약 버전입니다: ${value.contractVersion}`)
  }
  const id = text(value.id, 120)
  const version = text(value.version, 80)
  const sourceId = text(value.sourceId, 180)
  if (!ID_PATTERN.test(id)) throw new Error(`Source Profile ID가 올바르지 않습니다: ${id}`)
  if (!SEMVER_PATTERN.test(version)) throw new Error(`Source Profile 버전이 올바르지 않습니다: ${version}`)
  if (!SOURCE_ID_PATTERN.test(sourceId)) throw new Error(`Source Profile sourceId가 올바르지 않습니다: ${sourceId}`)
  const fileRoles = Object.fromEntries(Object.entries(plainObject(value.fileRoles) ? value.fileRoles : {})
    .slice(0, 2_000)
    .map(([path, item]) => {
      const safePath = text(path, 500)
      if (!safePath || safePath.startsWith('/') || safePath.split('/').includes('..')) {
        throw new Error(`Source Profile 파일 경로가 올바르지 않습니다: ${path}`)
      }
      return [safePath, role(item, safePath)]
    }))
  const languages = (Array.isArray(value.languageSupport) ? value.languageSupport : []).slice(0, 50).map(languageSupport)
  assertUniqueIds(languages.map((item) => ({ id: item.language })), '언어 지원')
  const areas = assertUniqueIds((Array.isArray(value.areas) ? value.areas : []).slice(0, 100).map((item) => definition(item)), '영역')
  const subsystems = assertUniqueIds((Array.isArray(value.subsystems) ? value.subsystems : []).slice(0, 300).map((item) => definition(item, { subsystem: true })), '하위 시스템')
  const normalized = {
    contractVersion: SOURCE_PROFILE_CONTRACT_VERSION,
    id,
    version,
    sourceId,
    label: text(value.label, 180) || id,
    projectLabel: text(value.projectLabel, 180) || text(value.label, 180) || id,
    priority: Number.isInteger(value.priority) ? Math.max(-1_000, Math.min(1_000, value.priority)) : 0,
    match: matchContract(value.match),
    capabilities: stringList(value.capabilities, 80, 120),
    languageSupport: languages,
    areas,
    subsystems,
    fileRoles,
    areaRules: (Array.isArray(value.areaRules) ? value.areaRules : []).slice(0, 200).map((item) => rule(item, 'area')),
    subsystemRules: (Array.isArray(value.subsystemRules) ? value.subsystemRules : []).slice(0, 400).map((item) => rule(item, 'subsystem')),
  }
  return freeze(normalized)
}

function profileMatch(profile, { project = {}, files = new Map() } = {}) {
  if (profile.match.fallback) return { matched: true, evidence: ['fallback'] }
  const evidence = []
  const packageMatched = profile.match.packageNames.includes(String(project.name ?? ''))
  if (packageMatched) evidence.push(`package:${project.name}`)
  const requiredMatched = profile.match.requiredFiles.length > 0
    && profile.match.requiredFiles.every((path) => files.has(path))
  if (requiredMatched) evidence.push(...profile.match.requiredFiles.map((path) => `required-file:${path}`))
  const anyMatched = profile.match.anyFiles.length > 0
    && profile.match.anyFiles.some((path) => files.has(path))
  if (anyMatched) evidence.push(`any-file:${profile.match.anyFiles.find((path) => files.has(path))}`)
  return { matched: packageMatched || requiredMatched || anyMatched, evidence }
}

export function resolveSourceProfile(profiles, context = {}) {
  const candidates = (Array.isArray(profiles) ? profiles : [])
    .map((profile) => ({ profile, result: profileMatch(profile, context) }))
    .filter((item) => item.result.matched)
    .sort((left, right) => (
      Number(left.profile.match.fallback) - Number(right.profile.match.fallback)
      || right.profile.priority - left.profile.priority
      || right.result.evidence.length - left.result.evidence.length
      || left.profile.id.localeCompare(right.profile.id)
    ))
  if (!candidates.length) throw new Error('일치하는 Source Profile과 fallback이 없습니다.')
  const selected = candidates[0]
  return { profile: selected.profile, matchEvidence: selected.result.evidence }
}

export function sourceProfileRole(profile, path) {
  return profile?.fileRoles?.[path] ?? null
}

export function sourceProfileRuleResult(profile, kind, record, area = '') {
  const rules = kind === 'area' ? profile?.areaRules : profile?.subsystemRules
  const path = String(record?.path ?? '')
  const layer = String(record?.layer ?? '')
  for (const item of rules ?? []) {
    if (item.area && item.area !== area) continue
    if (item.layers?.length && !item.layers.includes(layer)) continue
    if (item.pathPattern && !new RegExp(item.pathPattern, 'i').test(path)) continue
    return item[kind]
  }
  return ''
}

export function sourceProfileDescriptor(profile, matchEvidence = []) {
  return {
    contractVersion: profile.contractVersion,
    id: profile.id,
    version: profile.version,
    label: profile.label,
    sourceId: profile.sourceId,
    capabilities: profile.capabilities,
    languageSupport: profile.languageSupport,
    matchEvidence: stringList(matchEvidence, 20, 500),
  }
}
