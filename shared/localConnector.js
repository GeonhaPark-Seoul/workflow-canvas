export const LOCAL_CONNECTOR_SCHEMA_VERSION = 1
export const LOCAL_CONNECTOR_SOURCE_ID = 'workflow-local-repository'
export const LOCAL_GIT_SYNC_PART_ID = 'workflow-local-git-sync'
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

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`
}

export function localConnectorShellCommand({
  token,
  serverUrl,
  repositoryPath = '~/workflow-canvas',
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
  return `cd ${directory} && WORKFLOW_CANVAS_LOCAL_CONNECTOR_TOKEN=${shellSingleQuote(token)} npm run local-connector -- --server ${shellSingleQuote(server)} --repo .`
}

function entityDetails(value) {
  if (!plainObject(value)) return undefined
  const result = {
    exports: stringList(value.exports),
    apiRoutes: stringList(value.apiRoutes),
    dbTables: stringList(value.dbTables),
    dbFunctions: stringList(value.dbFunctions),
    environmentVariables: stringList(value.environmentVariables),
    securitySignals: stringList(value.securitySignals),
    parseStatus: text(value.parseStatus, 40),
  }
  return Object.values(result).some((item) => Array.isArray(item) ? item.length : item) ? result : undefined
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
    tags: stringList(value.tags, 40, 120),
  }
  for (const key of ['path', 'layer', 'language', 'parentId']) {
    const next = text(value[key], key === 'path' ? 500 : 180)
    if (next) normalized[key] = next
  }
  for (const key of ['lineStart', 'lineEnd']) {
    if (value[key] != null) normalized[key] = integer(value[key], 1, 5_000_000)
  }
  const details = entityDetails(value.details)
  if (details) normalized.details = details
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
  const perspective = (predicate) => entities.filter(predicate).map((entity) => entity.id)
  const perspectives = {
    all: entities.map((entity) => entity.id),
    functionality: perspective((entity) => ['api-route', 'function'].includes(entity.kind)
      || ['frontend', 'api', 'mcp', 'shared'].includes(entity.layer)),
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
  return {
    schemaVersion: integer(value.schemaVersion, 1, 20),
    id: manifestId,
    generatedAt: text(value.generatedAt, 80),
    source: {
      id: LOCAL_CONNECTOR_SOURCE_ID,
      label: text(source.label, 180) || '로컬 프로젝트 저장소',
      repositoryUrl,
      defaultBranch: text(source.defaultBranch, 120) || 'main',
    },
    perspectives,
    summary: {
      files: entities.filter((entity) => entity.kind === 'file').length,
      functions: entities.filter((entity) => entity.kind === 'function').length,
      apiRoutes: entities.filter((entity) => entity.kind === 'api-route').length,
      dbTables: entities.filter((entity) => entity.kind === 'db-table').length,
      entities: entities.length,
    },
    entities,
    relations: [],
    changeSet: {
      initialBaseline: false,
      summary: { added: 0, changed: 0, removed: 0 },
      added: [], changed: [], removed: [],
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
    else if (previous.fingerprint !== entity.fingerprint) changed.push(id)
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
  const branch = text(value.branch, 120)
  const upstreamRef = text(value.upstreamRef, 300)
  if (!SAFE_SHA.test(headSha) || !branch || !SAFE_REF.test(branch)) return null
  return {
    branch,
    headSha,
    upstreamRef: SAFE_REF.test(upstreamRef) ? upstreamRef : '',
    upstreamSha: SAFE_SHA.test(upstreamSha) ? upstreamSha : '',
    ahead: integer(value.ahead, 0, 100_000),
    behind: integer(value.behind, 0, 100_000),
    dirty: integer(value.dirty, 0, 100_000),
    changedPaths: stringList(value.changedPaths, 120, 500),
    fetchStatus: ['ok', 'failed', 'skipped'].includes(value.fetchStatus) ? value.fetchStatus : 'skipped',
    fetchMessage: text(value.fetchMessage, 240),
  }
}

export function localGitSyncDecision(state) {
  const git = normalizeLocalGitState(state)
  if (!git) return { action: 'blocked', reason: 'Git 상태를 확인할 수 없습니다.' }
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

export function localConnectorIsOnline(connector, now = Date.now()) {
  const seenAt = Date.parse(connector?.lastSeenAt ?? connector?.last_seen_at)
  return Number.isFinite(seenAt) && now - seenAt <= LOCAL_CONNECTOR_ONLINE_MS
}
