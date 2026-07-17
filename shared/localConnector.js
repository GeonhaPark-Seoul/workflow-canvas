export const LOCAL_CONNECTOR_SCHEMA_VERSION = 1
export const LOCAL_CONNECTOR_SOURCE_ID = 'workflow-local-repository'
export const LOCAL_GIT_SYNC_PART_ID = 'workflow-local-git-sync'
export const GITHUB_GIT_SYNC_PART_ID = 'workflow-github-git-sync'
export const LOCAL_GIT_SYNC_CAPABILITY_ID = 'workflow.local.git-sync'
export const LOCAL_CONNECTOR_ONLINE_MS = 45_000

const ENTITY_KINDS = new Set([
  'file', 'function', 'dependency', 'api-route', 'db-table', 'db-function',
  'rls-policy', 'environment-variable', 'deployment', 'npm-script',
])
const SAFE_SHA = /^[a-f0-9]{7,64}$/i
const SAFE_FINGERPRINT = /^[a-f0-9]{8,128}$/i
const SAFE_REF = /^[A-Za-z0-9._/@:-]{1,300}$/
const LOCAL_CONNECTOR_TOKEN_PATTERN = /^wclc_[a-f0-9]{64}$/
const EXPLANATION_METHODS = new Set([
  'curated-product-profile', 'test-file-rule', 'deterministic-source-rule',
  'symbol-and-source-range', 'api-route-and-source', 'database-reference',
  'database-policy-declaration', 'environment-reference', 'deployment-configuration',
  'dependency-reference', 'package-script-declaration',
])
const EXPLANATION_REFERENCE_KINDS = new Set([
  'source', 'symbol', 'api', 'db-table', 'db-function', 'env',
  'security', 'dependency', 'deployment', 'script', 'profile',
])

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value, maximum = 300) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

function integer(value, minimum = 0, maximum = 1_000_000) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : minimum
}

function stringList(value, maximumItems = 80, maximumLength = 240) {
  return Array.isArray(value)
    ? [...new Set(value.slice(0, maximumItems).map((item) => text(item, maximumLength)).filter(Boolean))]
    : []
}

function explanationReference(value) {
  const ref = text(value, 500)
  const separator = ref.indexOf(':')
  if (separator < 1) return ''
  const kind = ref.slice(0, separator)
  const target = ref.slice(separator + 1)
  if (!EXPLANATION_REFERENCE_KINDS.has(kind) || !target || target.includes('://')) return ''
  if (kind === 'source') {
    const match = target.match(/^(.+)#L(\d+)(?:-L(\d+))?$/)
    if (!match) return ''
    const relativePath = match[1]
    if (
      relativePath.startsWith('/')
      || relativePath.startsWith('~/')
      || /^[A-Za-z]:/.test(relativePath)
      || relativePath.includes('\\')
      || relativePath.split('/').includes('..')
    ) return ''
    const start = integer(match[2], 1, 5_000_000)
    const end = integer(match[3] ?? start, start, 5_000_000)
    return `source:${relativePath}#L${start}${end > start ? `-L${end}` : ''}`
  }
  if (kind === 'api' && !/^\/api\/[A-Za-z0-9_./:-]{1,300}$/.test(target)) return ''
  if (['db-table', 'db-function'].includes(kind) && !/^[A-Za-z_][A-Za-z0-9_]{0,179}$/.test(target)) return ''
  if (kind === 'env' && !/^[A-Z][A-Z0-9_]{0,179}$/.test(target)) return ''
  if (kind === 'security' && !/^[a-z0-9-]{1,120}$/.test(target)) return ''
  if (kind === 'profile' && !/^[a-z0-9][a-z0-9.-]{1,119}@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(target)) return ''
  if (['dependency', 'deployment', 'script'].includes(kind) && !/^[A-Za-z0-9@_./:-]{1,240}$/.test(target)) return ''
  if (kind === 'dependency' && (target.startsWith('.') || target.split('/').includes('..'))) return ''
  return `${kind}:${target}`
}

function explanationBasis(value) {
  if (!plainObject(value) || !EXPLANATION_METHODS.has(value.method)) return undefined
  const refs = [...new Set((Array.isArray(value.refs) ? value.refs : [])
    .slice(0, 12)
    .map(explanationReference)
    .filter(Boolean))]
  return refs.length ? { method: value.method, refs } : undefined
}

function normalizeSourceProfileDescriptor(value) {
  if (!plainObject(value)) return null
  if (value.contractVersion !== 1) return null
  const id = text(value.id, 120)
  const version = text(value.version, 80)
  const sourceId = text(value.sourceId, 180)
  if (!/^[a-z0-9][a-z0-9.-]{1,119}$/.test(id)) return null
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version)) return null
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{1,179}$/.test(sourceId)) return null
  const languageSupport = (Array.isArray(value.languageSupport) ? value.languageSupport : [])
    .slice(0, 30)
    .flatMap((item) => {
      if (!plainObject(item)) return []
      const language = text(item.language, 80)
      const level = ['parsed', 'structure-only', 'unsupported'].includes(item.level) ? item.level : ''
      return language && level ? [{ language, level, note: text(item.note, 300) }] : []
    })
  return {
    contractVersion: 1,
    id,
    version,
    sourceId,
    label: text(value.label, 180) || id,
    capabilities: stringList(value.capabilities, 80, 120),
    languageSupport,
    matchEvidence: stringList(value.matchEvidence, 20, 500),
  }
}

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`
}

export function localConnectorShellCommand({
  token,
  serverUrl,
  repositoryPath = '~/workflow-canvas',
  allowGitSync = false,
  allowSourceWrite = false,
} = {}) {
  if (!LOCAL_CONNECTOR_TOKEN_PATTERN.test(token ?? '')) return ''
  let server
  try {
    const parsed = new URL(serverUrl)
    const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return ''
    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    server = parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
  const requestedPath = typeof repositoryPath === 'string'
    ? repositoryPath.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 1_000)
    : ''
  if (!requestedPath) return ''
  const directory = requestedPath === '~'
    ? '"$HOME"'
    : requestedPath.startsWith('~/')
      ? `"$HOME"/${shellSingleQuote(requestedPath.slice(2))}`
      : shellSingleQuote(requestedPath)
  const gitSyncFlag = allowGitSync ? ' --allow-git-sync' : ''
  const sourceWriteFlag = allowSourceWrite ? ' --allow-source-write' : ''
  return `cd ${directory} && WORKFLOW_CANVAS_LOCAL_CONNECTOR_TOKEN=${shellSingleQuote(token)} npm run local-connector -- --server ${shellSingleQuote(server)} --repo .${gitSyncFlag}${sourceWriteFlag}`
}

function entityDetails(value) {
  if (!plainObject(value)) return undefined
  const result = {
    functionCount: integer(value.functionCount, 0, 100_000),
    importCount: integer(value.importCount, 0, 100_000),
    exports: stringList(value.exports),
    apiRoutes: stringList(value.apiRoutes),
    dbTables: stringList(value.dbTables),
    dbFunctions: stringList(value.dbFunctions),
    environmentVariables: stringList(value.environmentVariables),
    securitySignals: stringList(value.securitySignals),
    parseStatus: text(value.parseStatus, 40),
    functionKind: text(value.functionKind, 80),
    exported: value.exported === true,
    async: value.async === true,
    credentialReference: value.credentialReference === true,
    table: text(value.table, 180),
  }
  return Object.values(result).some((item) => Array.isArray(item) ? item.length : item !== false && item !== 0 && item !== '') ? result : undefined
}

function sourceEntity(value) {
  if (!plainObject(value)) return null
  const id = text(value.id, 500)
  const fingerprint = text(value.fingerprint, 128)
  if (!id || !SAFE_FINGERPRINT.test(fingerprint)) return null
  const kind = ENTITY_KINDS.has(value.kind) ? value.kind : 'file'
  const normalized = {
    id,
    kind,
    label: text(value.label, 300) || id,
    fingerprint,
    summary: text(value.summary, 600),
    userImpact: text(value.userImpact, 600),
    technicalSummary: text(value.technicalSummary, 400),
    tags: stringList(value.tags, 40, 120),
  }
  const explanationFingerprint = text(value.explanationFingerprint, 128)
  if (SAFE_FINGERPRINT.test(explanationFingerprint)) normalized.explanationFingerprint = explanationFingerprint
  for (const key of ['path', 'layer', 'language', 'parentId', 'area', 'subsystem']) {
    const next = text(value[key], key === 'path' ? 500 : 180)
    if (next) normalized[key] = next
  }
  for (const key of ['lineStart', 'lineEnd']) {
    if (value[key] != null) normalized[key] = integer(value[key], 1, 5_000_000)
  }
  const details = entityDetails(value.details)
  if (details) normalized.details = details
  const basis = explanationBasis(value.explanationBasis)
  if (basis) normalized.explanationBasis = basis
  return normalized
}

export function normalizeLocalSourceManifest(value) {
  if (!plainObject(value)) return null
  const entities = []
  const seen = new Set()
  for (const raw of Array.isArray(value.entities) ? value.entities.slice(0, 3_000) : []) {
    const entity = sourceEntity(raw)
    if (!entity || seen.has(entity.id)) continue
    seen.add(entity.id)
    entities.push(entity)
  }
  const manifestId = text(value.id, 180)
  if (!manifestId || !entities.length) return null
  const source = plainObject(value.source) ? value.source : {}
  const repositoryUrl = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/i.test(source.repositoryUrl ?? '')
    ? source.repositoryUrl
    : ''
  const sourceProfile = normalizeSourceProfileDescriptor(source.profile)
  const perspective = (predicate) => entities.filter(predicate).map((entity) => entity.id)
  const perspectives = {
    all: entities.map((entity) => entity.id),
    functionality: perspective((entity) => ['api-route', 'function'].includes(entity.kind)
      || ['frontend', 'api', 'backend', 'mcp', 'shared'].includes(entity.layer)),
    code: perspective((entity) => ['file', 'function', 'dependency', 'npm-script'].includes(entity.kind)),
    database: perspective((entity) => entity.layer === 'database'
      || ['db-table', 'db-function', 'rls-policy'].includes(entity.kind)
      || (entity.details?.dbTables?.length ?? 0) > 0
      || (entity.details?.dbFunctions?.length ?? 0) > 0),
    security: perspective((entity) => entity.layer === 'security'
      || (entity.details?.securitySignals?.length ?? 0) > 0
      || entity.tags?.some((tag) => ['security', 'rls', 'credential-reference'].includes(tag))),
    deployment: perspective((entity) => entity.layer === 'deployment' || entity.kind === 'deployment'),
  }
  const areaIds = new Set(entities.map((entity) => entity.area).filter(Boolean))
  const areas = []
  for (const raw of Array.isArray(value.areas) ? value.areas.slice(0, 80) : []) {
    if (!plainObject(raw)) continue
    const id = text(raw.id, 120)
    if (!id || !areaIds.has(id) || areas.some((item) => item.id === id)) continue
    areas.push({
      id,
      label: text(raw.label, 120) || id,
      description: text(raw.description, 300),
      order: integer(raw.order, 0, 10_000),
    })
  }
  const subsystemIds = new Set(entities.map((entity) => entity.subsystem).filter(Boolean))
  const subsystems = []
  for (const raw of Array.isArray(value.subsystems) ? value.subsystems.slice(0, 160) : []) {
    if (!plainObject(raw)) continue
    const id = text(raw.id, 120)
    if (!id || !subsystemIds.has(id) || subsystems.some((item) => item.id === id)) continue
    subsystems.push({
      id,
      area: text(raw.area, 120),
      label: text(raw.label, 120) || id,
      description: text(raw.description, 300),
      order: integer(raw.order, 0, 10_000),
    })
  }
  return {
    schemaVersion: integer(value.schemaVersion, 1, 20),
    id: manifestId,
    generatedAt: text(value.generatedAt, 80),
    source: {
      id: LOCAL_CONNECTOR_SOURCE_ID,
      label: text(source.label, 180) || '로컬 프로젝트 저장소',
      repositoryUrl,
      defaultBranch: text(source.defaultBranch, 120) || 'main',
      ...(sourceProfile ? { profile: sourceProfile } : {}),
    },
    areas,
    subsystems,
    perspectives,
    summary: {
      files: entities.filter((entity) => entity.kind === 'file').length,
      functions: entities.filter((entity) => entity.kind === 'function').length,
      apiRoutes: entities.filter((entity) => entity.kind === 'api-route').length,
      dbTables: entities.filter((entity) => entity.kind === 'db-table').length,
      structureOnlyFiles: entities.filter((entity) => entity.kind === 'file' && entity.details?.parseStatus === 'structure-only').length,
      entities: entities.length,
      subsystems: subsystems.length,
    },
    entities,
    relations: [],
    changeSet: {
      initialBaseline: false,
      summary: { added: 0, changed: 0, explanationChanged: 0, removed: 0, paths: 0, explanationPaths: 0 },
      added: [], changed: [], explanationChanged: [], removed: [],
      changedPaths: [], explanationChangedPaths: [], profileChanged: null,
    },
  }
}

export function compareLocalAndDeployedManifests(deployed, local) {
  const deployedById = new Map((deployed?.entities ?? []).map((entity) => [entity.id, entity]))
  const localById = new Map((local?.entities ?? []).map((entity) => [entity.id, entity]))
  const added = []
  const changed = []
  const removed = []
  for (const [id, entity] of localById) {
    const previous = deployedById.get(id)
    if (!previous) added.push(id)
    else if (
      previous.fingerprint !== entity.fingerprint
      || (previous.explanationFingerprint ?? '') !== (entity.explanationFingerprint ?? '')
    ) changed.push(id)
  }
  for (const id of deployedById.keys()) {
    if (!localById.has(id)) removed.push(id)
  }
  for (const list of [added, changed, removed]) list.sort()
  return {
    added,
    changed,
    removed,
    summary: { added: added.length, changed: changed.length, removed: removed.length },
    inSync: added.length + changed.length + removed.length === 0,
  }
}

export function normalizeLocalGitState(value) {
  if (!plainObject(value)) return null
  const headSha = text(value.headSha, 64)
  const upstreamSha = text(value.upstreamSha, 64)
  const originFingerprint = text(value.originFingerprint, 128)
  const branch = text(value.branch, 120)
  const upstreamRef = text(value.upstreamRef, 300)
  if (!SAFE_SHA.test(headSha) || !branch || !SAFE_REF.test(branch)) return null
  return {
    branch,
    headSha,
    upstreamRef: SAFE_REF.test(upstreamRef) ? upstreamRef : '',
    upstreamSha: SAFE_SHA.test(upstreamSha) ? upstreamSha : '',
    originFingerprint: SAFE_FINGERPRINT.test(originFingerprint) ? originFingerprint : '',
    ahead: integer(value.ahead, 0, 100_000),
    behind: integer(value.behind, 0, 100_000),
    dirty: integer(value.dirty, 0, 100_000),
    syncEnabled: value.syncEnabled === true,
    sourceWriteEnabled: value.sourceWriteEnabled === true,
    changedPaths: stringList(value.changedPaths, 120, 500),
    fetchStatus: ['ok', 'failed', 'skipped'].includes(value.fetchStatus) ? value.fetchStatus : 'skipped',
    fetchMessage: text(value.fetchMessage, 240),
  }
}

export function localGitSyncDecision(state) {
  const git = normalizeLocalGitState(state)
  if (!git) return { action: 'blocked', reason: 'Git 상태를 확인할 수 없습니다.' }
  if (!git.syncEnabled) {
    return { action: 'blocked', reason: '로컬 커넥터가 읽기 전용으로 실행 중입니다. Git 동기화를 허용해 다시 연결해야 합니다.' }
  }
  if (!git.originFingerprint) {
    return { action: 'blocked', reason: '고정된 GitHub origin을 확인할 수 없어 동기화를 차단했습니다.' }
  }
  if (!git.upstreamRef || !git.upstreamSha) {
    return { action: 'blocked', reason: '현재 브랜치에 GitHub upstream이 연결되어 있지 않습니다.' }
  }
  if (!git.upstreamRef.startsWith('origin/')) {
    return { action: 'blocked', reason: '안전을 위해 origin 원격 브랜치만 캔버스에서 동기화할 수 있습니다.' }
  }
  if (git.upstreamRef !== `origin/${git.branch}`) {
    return { action: 'blocked', reason: '현재 브랜치와 같은 이름의 origin upstream만 자동 동기화할 수 있습니다.' }
  }
  if (git.fetchStatus === 'failed') {
    return { action: 'blocked', reason: 'GitHub 최신 상태를 가져오지 못해 동기화 방향을 안전하게 판단할 수 없습니다.' }
  }
  if (git.dirty > 0) {
    return { action: 'blocked', reason: `커밋되지 않은 변경 ${git.dirty}개가 있어 자동 동기화를 막았습니다.` }
  }
  if (git.ahead > 0 && git.behind > 0) {
    return { action: 'blocked', reason: '로컬과 GitHub 이력이 서로 갈라져 있어 사람이 병합해야 합니다.' }
  }
  if (git.ahead > 0) {
    return { action: 'push', reason: `로컬 커밋 ${git.ahead}개를 일반 push로 GitHub에 보냅니다.` }
  }
  if (git.behind > 0) {
    return { action: 'pull_ff_only', reason: `GitHub 커밋 ${git.behind}개를 fast-forward 방식으로 로컬에 반영합니다.` }
  }
  return { action: 'noop', reason: '로컬과 GitHub가 이미 같은 커밋입니다.' }
}

export function localGitSyncEdgePresentation(decision) {
  const action = decision?.action
  if (action === 'push') {
    return {
      action,
      direction: 'local-to-github',
      icon: '→',
      tooltip: 'GitHub 코드를 로컬 코드에 맞춰 동기화합니다. 클릭하면 실행 전 계획을 엽니다.',
    }
  }
  if (action === 'pull_ff_only') {
    return {
      action,
      direction: 'github-to-local',
      icon: '←',
      tooltip: '로컬 코드를 GitHub 코드에 맞춰 동기화합니다. 클릭하면 실행 전 계획을 엽니다.',
    }
  }
  if (action === 'noop') {
    return {
      action,
      direction: 'in-sync',
      icon: '✓',
      tooltip: '로컬 코드와 GitHub 코드가 이미 같은 상태입니다.',
    }
  }
  if (action === 'blocked') {
    return {
      action,
      direction: 'blocked',
      icon: '!',
      tooltip: decision?.reason || '안전한 동기화 방향을 정할 수 없어 실행을 차단했습니다.',
    }
  }
  return {
    action: 'unknown',
    direction: 'unknown',
    icon: '↔',
    tooltip: '로컬 커넥터 상태를 확인해 안전한 동기화 방향을 결정합니다.',
  }
}

export function localConnectorIsOnline(connector, now = Date.now()) {
  const seenAt = Date.parse(connector?.lastSeenAt ?? connector?.last_seen_at)
  return Number.isFinite(seenAt) && now - seenAt <= LOCAL_CONNECTOR_ONLINE_MS
}

export function localConnectorConnectionState(connector, now = Date.now()) {
  if (localConnectorIsOnline(connector, now)) return 'online'
  const seenAt = Date.parse(connector?.lastSeenAt ?? connector?.last_seen_at)
  return Number.isFinite(seenAt) ? 'offline' : 'waiting'
}

function connectorTimestamp(connector, key) {
  const value = key === 'lastSeenAt'
    ? connector?.lastSeenAt ?? connector?.last_seen_at
    : connector?.createdAt ?? connector?.created_at
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function sortLocalConnectorsForDisplay(connectors = [], now = Date.now()) {
  const stateRank = { online: 0, offline: 1, waiting: 2 }
  return [...connectors].sort((left, right) => {
    const stateDifference = stateRank[localConnectorConnectionState(left, now)]
      - stateRank[localConnectorConnectionState(right, now)]
    if (stateDifference) return stateDifference
    const seenDifference = connectorTimestamp(right, 'lastSeenAt') - connectorTimestamp(left, 'lastSeenAt')
    if (seenDifference) return seenDifference
    const createdDifference = connectorTimestamp(right, 'createdAt') - connectorTimestamp(left, 'createdAt')
    if (createdDifference) return createdDifference
    return String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
  })
}
