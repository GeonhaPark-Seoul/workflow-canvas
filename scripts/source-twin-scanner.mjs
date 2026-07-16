import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import { SOURCE_TWIN_SCHEMA_VERSION } from '../shared/sourceTwin.js'
import { sourceProfileDescriptor } from '../shared/sourceProfileContract.js'
import { sourceTwinAreaCatalog, sourceTwinSubsystemCatalog } from '../shared/sourceTwinSemantics.js'
import { DEFAULT_SOURCE_PROFILES, registeredSourceProfile } from './source-profiles/index.mjs'
import {
  areaForSourceResource,
  explainDatabaseResource,
  explainEnvironmentVariable,
  explainSourceFile,
  explainSourceFunction,
  sourceTwinSubsystemForRecord,
  sourceTwinProjectIdentity,
  sourceTwinTechnicalSummary,
  subsystemForSourceResource,
} from './source-twin-semantics.mjs'

export const SOURCE_TWIN_MANIFEST_PATH = 'shared/sourceTwinManifest.js'

const INCLUDED_ROOT_FILES = new Set([
  'README.md', 'Dockerfile', 'index.html', 'package.json', 'pyproject.toml',
  'requirements.txt', 'vercel.json', 'vite.config.js',
])
const EXCLUDED_FILES = new Set([SOURCE_TWIN_MANIFEST_PATH, 'shared/workflowSystemDiscoveryManifest.js'])
const JAVASCRIPT_EXTENSIONS = ['.js', '.jsx', '.mjs']
const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete'])
const DATABASE_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const CREDENTIAL_PATTERN = /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i
const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024
const MAX_SOURCE_TOTAL_BYTES = 24 * 1024 * 1024

function shouldInspect(relativePath) {
  if (EXCLUDED_FILES.has(relativePath)) return false
  if (relativePath.startsWith('scripts/fixtures/')) return false
  if (INCLUDED_ROOT_FILES.has(relativePath)) return true
  if (/^[^/]+\.sql$/i.test(relativePath)) return true
  return /^(api|app|mcp|scripts|shared|src|tests)\/.*\.(css|js|jsx|mjs|py)$/i.test(relativePath)
}

function normalized(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
}

function redactedForFingerprint(value) {
  return normalized(value)
    .replace(/((?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*=\s*['"])[^'"\n]+/gi, '$1<redacted>')
    .replace(/(process\.env\.[A-Z][A-Z0-9_]*\s*(?:\|\||\?\?)\s*['"])[^'"\n]+/g, '$1<redacted>')
}

function hash(value, length = 20) {
  return createHash('sha256').update(normalized(value)).digest('hex').slice(0, length)
}

export function compareSourceTwinText(left, right) {
  const leftText = String(left)
  const rightText = String(right)
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(compareSourceTwinText).map((key) => [key, stable(value[key])]))
  }
  return value
}

function semanticHash(value, length = 20) {
  return hash(JSON.stringify(stable(value)), length)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort(compareSourceTwinText)
}

function layerForFile(relativePath) {
  if (/\.sql$/i.test(relativePath)) return 'database'
  if (/^(scripts\/test-|.*(?:\.test|\.spec)\.)/i.test(relativePath)) return 'test'
  if (relativePath.startsWith('api/')) return 'api'
  if (relativePath.startsWith('mcp/')) return 'mcp'
  if (/^(app|tests)\//.test(relativePath) && /\.py$/i.test(relativePath)) {
    if (/^tests\//.test(relativePath)) return 'test'
    if (/^app\/(?:api\/|main\.py$)/.test(relativePath)) return 'api'
    return 'backend'
  }
  if (relativePath.startsWith('shared/')) return 'shared'
  if (relativePath.startsWith('src/')) return 'frontend'
  if (['package.json', 'vercel.json', 'vite.config.js'].includes(relativePath)) return 'deployment'
  return 'documentation'
}

function languageForFile(relativePath) {
  if (/\.sql$/i.test(relativePath)) return 'sql'
  if (/\.css$/i.test(relativePath)) return 'css'
  if (/\.html$/i.test(relativePath)) return 'html'
  if (/\.jsx$/i.test(relativePath)) return 'jsx'
  if (/\.m?js$/i.test(relativePath)) return 'javascript'
  if (/\.py$/i.test(relativePath)) return 'python'
  if (/\.json$/i.test(relativePath)) return 'json'
  return 'markdown'
}

function analysisLevelForLanguage(profile, language) {
  return profile?.languageSupport?.find((item) => item.language === language)?.level ?? 'unsupported'
}

function nodeName(node) {
  if (!node) return ''
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') return node.name
  if (node.type === 'StringLiteral' || node.type === 'Literal') return String(node.value ?? '')
  if (node.type === 'PrivateName') return nodeName(node.id)
  return ''
}

function stringArgument(node) {
  return ['StringLiteral', 'Literal'].includes(node?.type) && typeof node.value === 'string' ? node.value : ''
}

function memberProperty(node) {
  return node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression'
    ? nodeName(node.property)
    : ''
}

function importedNames(node) {
  return (node.specifiers ?? []).map((specifier) => (
    specifier.type === 'ImportDefaultSpecifier' ? 'default'
      : specifier.type === 'ImportNamespaceSpecifier' ? '*'
        : nodeName(specifier.imported) || nodeName(specifier.local)
  )).filter(Boolean)
}

function parseJavaScript(relativePath, content) {
  const record = {
    imports: [], functions: [], exports: [], apiRoutes: [], dbTables: [], dbAccess: [], dbFunctions: [],
    env: [], securitySignals: [], externalApiRoutes: [], parseError: '',
  }
  let ast
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      errorRecovery: false,
      plugins: ['jsx', 'importAttributes', 'topLevelAwait'],
    })
  } catch (error) {
    record.parseError = String(error?.message ?? 'parse failed').slice(0, 240)
    return record
  }

  const exported = new Set()
  const functionKeys = new Map()
  const addFunction = (name, node, kind = 'function') => {
    if (!name || !node?.loc || !Number.isInteger(node.start) || !Number.isInteger(node.end)) return
    const base = name.slice(0, 180)
    const duplicate = functionKeys.get(base) ?? 0
    functionKeys.set(base, duplicate + 1)
    const stableName = duplicate ? `${base}#${duplicate + 1}` : base
    record.functions.push({
      name: stableName,
      displayName: base,
      kind,
      async: !!node.async,
      exported: false,
      lineStart: node.loc.start.line,
      lineEnd: node.loc.end.line,
      fingerprint: hash(redactedForFingerprint(content.slice(node.start, node.end))),
    })
  }

  const visit = (node, ancestors = []) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'ImportDeclaration') {
      record.imports.push({ source: stringArgument(node.source), names: importedNames(node), dynamic: false })
    }
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
      const declaration = node.declaration
      if (declaration?.id) exported.add(nodeName(declaration.id))
      if (declaration?.type === 'VariableDeclaration') {
        for (const item of declaration.declarations ?? []) exported.add(nodeName(item.id))
      }
      for (const specifier of node.specifiers ?? []) exported.add(nodeName(specifier.exported) || nodeName(specifier.local))
      if (node.type === 'ExportDefaultDeclaration') exported.add(nodeName(declaration?.id) || 'default')
      if (node.source) record.imports.push({ source: stringArgument(node.source), names: ['re-export'], dynamic: false })
    }
    if (node.type === 'FunctionDeclaration') addFunction(nodeName(node.id) || 'default', node)
    if (node.type === 'VariableDeclarator' && ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init?.type)) {
      addFunction(nodeName(node.id), node.init, node.init.type === 'ArrowFunctionExpression' ? 'arrow' : 'function')
    }
    if (['ClassMethod', 'ClassPrivateMethod', 'ObjectMethod'].includes(node.type)) {
      const owner = [...ancestors].reverse().map((ancestor) => nodeName(ancestor.id)).find(Boolean)
      const name = [owner, nodeName(node.key)].filter(Boolean).join('.')
      addFunction(name, node, node.type === 'ObjectMethod' ? 'method' : 'class-method')
    }
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      const calleeName = nodeName(node.callee)
      const property = memberProperty(node.callee)
      const firstString = stringArgument(node.arguments?.[0])
      if (calleeName === 'require' && firstString) record.imports.push({ source: firstString, names: ['require'], dynamic: true })
      if (calleeName === 'fetch' && firstString.startsWith('/api/')) record.externalApiRoutes.push(firstString.split('?')[0])
      if (calleeName === 'eval') record.securitySignals.push('dynamic-code-eval')
      if (calleeName === 'Function' && ancestors.some((ancestor) => ancestor.type === 'NewExpression')) record.securitySignals.push('dynamic-function-constructor')
      if (property === 'from' && DATABASE_IDENTIFIER_PATTERN.test(firstString)) {
        const surroundingMethods = ancestors.map(memberProperty).filter(Boolean)
        const operation = surroundingMethods.some((name) => WRITE_METHODS.has(name)) ? 'write' : 'read'
        record.dbTables.push(firstString)
        record.dbAccess.push({ table: firstString, operation })
      }
      if (property === 'rpc' && DATABASE_IDENTIFIER_PATTERN.test(firstString)) record.dbFunctions.push(firstString)
    }
    if (node.type === 'ImportExpression') {
      const source = stringArgument(node.source)
      if (source) record.imports.push({ source, names: ['dynamic'], dynamic: true })
    }
    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      const property = memberProperty(node)
      const objectProperty = memberProperty(node.object)
      if (nodeName(node.object) === 'process' && property === 'env') return
      if (objectProperty === 'env' && property && (
        nodeName(node.object?.object) === 'process'
        || node.object?.object?.type === 'MetaProperty'
      )) record.env.push(property)
      if (property === 'innerHTML') record.securitySignals.push('raw-inner-html')
    }
    if (node.type === 'JSXAttribute' && nodeName(node.name) === 'dangerouslySetInnerHTML') {
      record.securitySignals.push('dangerously-set-inner-html')
    }
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments', 'extra'].includes(key)) continue
      if (Array.isArray(child)) {
        for (const item of child) if (item?.type) visit(item, [...ancestors, node])
      } else if (child?.type) visit(child, [...ancestors, node])
    }
  }
  visit(ast.program)
  for (const fn of record.functions) fn.exported = exported.has(fn.displayName) || exported.has(fn.name) || exported.has('default') && fn.displayName === 'default'
  record.exports = unique([...exported])
  record.imports = [...new Map(record.imports.filter((item) => item.source).map((item) => [
    `${item.source}:${item.names.join(',')}:${item.dynamic}`,
    { ...item, names: unique(item.names) },
  ])).values()].sort((left, right) => compareSourceTwinText(left.source, right.source))
  record.functions.sort((left, right) => left.lineStart - right.lineStart || compareSourceTwinText(left.name, right.name))
  for (const key of ['dbTables', 'dbFunctions', 'env', 'securitySignals', 'externalApiRoutes']) record[key] = unique(record[key])
  record.dbAccess = [...new Map(record.dbAccess.map((item) => [`${item.table}:${item.operation}`, item])).values()]
    .sort((left, right) => compareSourceTwinText(`${left.table}:${left.operation}`, `${right.table}:${right.operation}`))
  if (relativePath.startsWith('api/')) record.apiRoutes = [`/api/${relativePath.slice(4).replace(/\.js$/, '')}`]
  return record
}

function lineFor(content, index) {
  return content.slice(0, index).split('\n').length
}

function parseSql(content) {
  const tables = []
  const dbFunctions = []
  const policies = []
  const securitySignals = []
  let match
  const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi
  while ((match = tableRegex.exec(content))) tables.push({ name: match[1], line: lineFor(content, match.index), definition: true })
  const functionRegex = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(/gi
  while ((match = functionRegex.exec(content))) dbFunctions.push({ name: match[1], line: lineFor(content, match.index), definition: true })
  const policyRegex = /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-zA-Z_][\w]*)/gi
  while ((match = policyRegex.exec(content))) policies.push({ name: match[1], table: match[2], line: lineFor(content, match.index) })
  if (/enable\s+row\s+level\s+security/i.test(content)) securitySignals.push('row-level-security')
  if (/security\s+definer/i.test(content)) securitySignals.push('security-definer-function')
  if (/service_role/i.test(content)) securitySignals.push('service-role-grant')
  return { tables, dbFunctions, policies, securitySignals: unique(securitySignals) }
}

function resolveLocalImport(relativePath, source, filePaths) {
  if (!source.startsWith('.')) return ''
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), source))
  for (const candidate of [base, ...JAVASCRIPT_EXTENSIONS.map((ext) => `${base}${ext}`), ...JAVASCRIPT_EXTENSIONS.map((ext) => `${base}/index${ext}`)]) {
    if (filePaths.has(candidate)) return candidate
  }
  return ''
}

function entity(id, kind, label, fingerprint, fields = {}) {
  const explanationFingerprint = fields.summary || fields.userImpact || fields.area || fields.subsystem
    ? semanticHash({
        area: fields.area ?? '',
        subsystem: fields.subsystem ?? '',
        summary: fields.summary ?? '',
        userImpact: fields.userImpact ?? '',
        technicalSummary: fields.technicalSummary ?? '',
        explanationBasis: fields.explanationBasis ?? null,
      })
    : ''
  return { id, kind, label, fingerprint, ...(explanationFingerprint ? { explanationFingerprint } : {}), ...fields }
}

function sourceEvidenceRef(relativePath, lineStart = 1, lineEnd = lineStart) {
  const start = Math.max(1, Number(lineStart) || 1)
  const end = Math.max(start, Number(lineEnd) || start)
  return `source:${relativePath}#L${start}${end > start ? `-L${end}` : ''}`
}

function explanationBasis(method, refs = []) {
  return {
    method,
    refs: unique(refs.filter(Boolean)).slice(0, 12),
  }
}

function relation(type, source, target, fields = {}) {
  return { id: `relation:${semanticHash({ type, source, target, ...fields }, 16)}`, type, source, target, ...fields }
}

function repositoryUrl(raw) {
  const value = String(raw ?? '').trim().replace(/^git\+/, '').replace(/\.git$/, '')
  if (/^git@github\.com:/i.test(value)) return `https://github.com/${value.replace(/^git@github\.com:/i, '')}`
  try {
    const parsed = new URL(value)
    if (parsed.hostname.toLocaleLowerCase() !== 'github.com') return ''
    return `https://github.com${parsed.pathname}`.replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function readSourceRepositoryMetadata(root) {
  let remote = ''
  try {
    remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {}
  let defaultBranch = 'main'
  try {
    const ref = execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    defaultBranch = ref.replace(/^origin\//, '') || 'main'
  } catch {}
  let resolvedRepositoryUrl = repositoryUrl(remote)
  if (!resolvedRepositoryUrl) {
    try {
      const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
      const declared = typeof packageJson.repository === 'string' ? packageJson.repository : packageJson.repository?.url
      resolvedRepositoryUrl = repositoryUrl(declared)
    } catch {}
  }
  return { repositoryUrl: resolvedRepositoryUrl, defaultBranch }
}

export function buildSourceTwinManifest(filesInput, {
  previous = null,
  repository = {},
  sourceProfiles = DEFAULT_SOURCE_PROFILES,
} = {}) {
  const files = filesInput instanceof Map ? filesInput : new Map(Object.entries(filesInput ?? {}))
  const project = sourceTwinProjectIdentity(files)
  const profileResolution = registeredSourceProfile({ project, files }, sourceProfiles)
  const profile = profileResolution.profile
  const profileInfo = sourceProfileDescriptor(profile, profileResolution.matchEvidence)
  const projectLabel = profile.match.fallback
    ? (project.label || profile.projectLabel || '소프트웨어')
    : (profile.projectLabel || project.label || '소프트웨어')
  const filePaths = new Set(files.keys())
  const records = []
  for (const [relativePath, rawContent] of [...files.entries()].sort(([left], [right]) => compareSourceTwinText(left, right))) {
    const content = normalized(rawContent)
    const layer = layerForFile(relativePath)
    const language = languageForFile(relativePath)
    const declaredAnalysisLevel = analysisLevelForLanguage(profile, language)
    const parserAvailable = JAVASCRIPT_EXTENSIONS.includes(path.posix.extname(relativePath)) || language === 'sql'
    if (declaredAnalysisLevel === 'parsed' && !parserAvailable) {
      throw new Error(`Source Profile ${profile.id}@${profile.version}이 ${language} 분석을 선언했지만 등록된 parser가 없습니다.`)
    }
    const parsed = declaredAnalysisLevel === 'parsed' && JAVASCRIPT_EXTENSIONS.includes(path.posix.extname(relativePath))
      ? parseJavaScript(relativePath, content)
      : declaredAnalysisLevel === 'parsed' && language === 'sql' ? parseSql(content) : {}
    const analysisStatus = declaredAnalysisLevel === 'parsed'
      ? (parsed.parseError ? 'failed' : 'parsed')
      : declaredAnalysisLevel
    records.push({
      path: relativePath,
      content,
      layer,
      language,
      fingerprint: hash(redactedForFingerprint(content)),
      lineCount: content ? content.split('\n').length : 0,
      imports: parsed.imports ?? [],
      functions: parsed.functions ?? [],
      exports: parsed.exports ?? [],
      apiRoutes: parsed.apiRoutes ?? [],
      externalApiRoutes: parsed.externalApiRoutes ?? [],
      dbTables: (parsed.dbTables ?? parsed.tables ?? []).map((item) => typeof item === 'string' ? item : item.name),
      dbTableDefinitions: (parsed.tables ?? []).filter((item) => item.definition),
      dbAccess: parsed.dbAccess ?? [],
      dbFunctions: (parsed.dbFunctions ?? []).map((item) => typeof item === 'string' ? item : item.name),
      dbFunctionDefinitions: (parsed.dbFunctions ?? []).filter((item) => typeof item === 'object'),
      policies: parsed.policies ?? [],
      env: parsed.env ?? [],
      securitySignals: parsed.securitySignals ?? [],
      parseError: parsed.parseError ?? '',
      analysisStatus,
    })
  }
  for (const record of records) {
    record.explanation = explainSourceFile(record, project, profile)
    record.subsystem = sourceTwinSubsystemForRecord(record, project, record.explanation.area, profile)
  }

  const entities = []
  const relations = []
  const byId = new Map()
  const addEntity = (value) => {
    const existing = byId.get(value.id)
    if (existing) return existing
    byId.set(value.id, value)
    entities.push(value)
    return value
  }
  const addRelation = (value) => relations.push(value)

  for (const record of records) {
    const fileId = `file:${record.path}`
    const technicalSummary = sourceTwinTechnicalSummary(record)
    const tags = unique([
      record.layer,
      record.explanation.area,
      record.subsystem,
      ...record.apiRoutes,
      ...record.dbTables,
      ...record.env,
      ...record.securitySignals,
    ])
    const fileEntity = addEntity(entity(fileId, 'file', record.path, record.fingerprint, {
      path: record.path,
      layer: record.layer,
      language: record.language,
      lineStart: 1,
      lineEnd: record.lineCount,
      area: record.explanation.area,
      subsystem: record.subsystem,
      summary: record.explanation.summary,
      userImpact: record.explanation.userImpact,
      technicalSummary,
      explanationBasis: explanationBasis(record.explanation.explanationMethod, [
        sourceEvidenceRef(record.path, 1, record.lineCount),
        `profile:${profile.id}@${profile.version}`,
        ...record.apiRoutes.map((route) => `api:${route}`),
        ...unique(record.dbTables).map((table) => `db-table:${table}`),
        ...unique(record.dbFunctions).map((name) => `db-function:${name}`),
        ...unique(record.env).map((name) => `env:${name}`),
        ...unique(record.securitySignals).map((signal) => `security:${signal}`),
      ]),
      tags,
      details: {
        functionCount: record.functions.length,
        importCount: record.imports.length,
        exports: record.exports,
        apiRoutes: record.apiRoutes,
        dbTables: unique(record.dbTables),
        dbFunctions: unique(record.dbFunctions),
        environmentVariables: unique(record.env),
        securitySignals: unique(record.securitySignals),
        parseStatus: record.analysisStatus,
      },
    }))
    for (const fn of record.functions) {
      const id = `function:${record.path}:${fn.name}`
      addEntity(entity(id, 'function', fn.displayName, fn.fingerprint, {
        name: fn.displayName,
        path: record.path,
        parentId: fileId,
        layer: record.layer,
        area: record.explanation.area,
        subsystem: record.subsystem,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
        summary: explainSourceFunction(fn, record, record.explanation),
        technicalSummary: `${fn.exported ? '다른 파일에서 사용 가능' : '이 파일 내부에서 사용'}${fn.async ? ' · 서버나 저장소 응답을 기다림' : ''}`,
        explanationBasis: explanationBasis('symbol-and-source-range', [
          sourceEvidenceRef(record.path, fn.lineStart, fn.lineEnd),
          `symbol:${fn.displayName}`,
        ]),
        tags: unique([record.layer, record.explanation.area, record.subsystem, fn.kind, fn.exported ? 'exported' : '', fn.async ? 'async' : '']),
        details: { functionKind: fn.kind, exported: fn.exported, async: fn.async },
      }))
      addRelation(relation('contains', fileId, id))
    }
    for (const route of record.apiRoutes) {
      const id = `api:${route}`
      addEntity(entity(id, 'api-route', route, semanticHash({ route, file: record.fingerprint }), {
        name: route,
        path: record.path,
        parentId: fileId,
        layer: 'api',
        area: record.explanation.area,
        subsystem: record.subsystem,
        lineStart: 1,
        summary: `${route}로 들어온 요청을 받아 “${record.explanation.summary.replace(/합니다\.$/, '')}” 역할을 실행하는 서버 입구입니다.`,
        userImpact: record.explanation.userImpact,
        explanationBasis: explanationBasis('api-route-and-source', [
          sourceEvidenceRef(record.path, 1, record.lineCount),
          `api:${route}`,
        ]),
        tags: ['api', 'server', record.explanation.area, record.subsystem],
      }))
      addRelation(relation('serves', fileId, id))
    }
    for (const table of unique(record.dbTables)) {
      const id = `db-table:${table}`
      const area = areaForSourceResource('db-table', table, record.explanation.area)
      const subsystem = subsystemForSourceResource('db-table', table, area, record.subsystem)
      addEntity(entity(id, 'db-table', table, semanticHash({ table }), {
        name: table,
        layer: 'database',
        area,
        subsystem,
        summary: explainDatabaseResource('db-table', table),
        explanationBasis: explanationBasis('database-reference', [
          sourceEvidenceRef(record.path, 1, record.lineCount),
          `db-table:${table}`,
        ]),
        tags: ['database', 'table', area, subsystem],
      }))
      const operations = unique(record.dbAccess.filter((item) => item.table === table).map((item) => item.operation))
      addRelation(relation('accesses', fileId, id, { operations: operations.length ? operations : ['declares'] }))
    }
    for (const fnName of unique(record.dbFunctions)) {
      const id = `db-function:${fnName}`
      const area = areaForSourceResource('db-function', fnName, record.explanation.area)
      const subsystem = subsystemForSourceResource('db-function', fnName, area, record.subsystem)
      addEntity(entity(id, 'db-function', fnName, semanticHash({ fnName }), {
        name: fnName,
        layer: 'database',
        area,
        subsystem,
        summary: explainDatabaseResource('db-function', fnName),
        explanationBasis: explanationBasis('database-reference', [
          sourceEvidenceRef(record.path, 1, record.lineCount),
          `db-function:${fnName}`,
        ]),
        tags: ['database', 'function', area, subsystem],
      }))
      addRelation(relation('calls-db-function', fileId, id))
    }
    for (const policy of record.policies) {
      const id = `rls-policy:${policy.table}:${policy.name}`
      const area = areaForSourceResource('rls-policy', `${policy.table} ${policy.name}`, record.explanation.area)
      const subsystem = subsystemForSourceResource('rls-policy', `${policy.table} ${policy.name}`, area, record.subsystem)
      addEntity(entity(id, 'rls-policy', policy.name, semanticHash(policy), {
        name: policy.name,
        path: record.path,
        parentId: fileId,
        layer: 'database',
        area,
        subsystem,
        lineStart: policy.line,
        summary: `${policy.table} 자료 중 어떤 행을 누가 읽거나 바꿀 수 있는지 데이터베이스에서 강제하는 규칙입니다.`,
        explanationBasis: explanationBasis('database-policy-declaration', [
          sourceEvidenceRef(record.path, policy.line, policy.line),
          `db-table:${policy.table}`,
        ]),
        tags: ['database', 'security', 'rls', policy.table, area, subsystem],
        details: { table: policy.table },
      }))
      addRelation(relation('defines-policy', fileId, id))
    }
    for (const envName of unique(record.env)) {
      const id = `env:${envName}`
      const area = areaForSourceResource('environment-variable', envName, record.explanation.area)
      const subsystem = subsystemForSourceResource('environment-variable', envName, area, record.subsystem)
      addEntity(entity(id, 'environment-variable', envName, semanticHash({ envName }), {
        name: envName,
        layer: CREDENTIAL_PATTERN.test(envName) ? 'security' : 'deployment',
        area,
        subsystem,
        summary: explainEnvironmentVariable(envName),
        explanationBasis: explanationBasis('environment-reference', [
          sourceEvidenceRef(record.path, 1, record.lineCount),
          `env:${envName}`,
        ]),
        tags: unique(['environment', area, subsystem, CREDENTIAL_PATTERN.test(envName) ? 'credential-reference' : 'configuration']),
        details: { credentialReference: CREDENTIAL_PATTERN.test(envName) },
      }))
      addRelation(relation('reads-env', fileId, id))
    }
    if (record.layer === 'deployment') {
      const id = 'deployment:vercel-web'
      addEntity(entity(id, 'deployment', 'Vercel 웹 배포', semanticHash({ files: records.filter((item) => item.layer === 'deployment').map((item) => [item.path, item.fingerprint]) }), {
        layer: 'deployment',
        area: 'deployment-operations',
        subsystem: 'build-release',
        summary: 'Vite 빌드 결과를 Vercel에 배포하는 경로입니다.',
        userImpact: '검증을 통과한 현재 커밋이 실제 사용자가 여는 웹사이트가 되게 합니다.',
        explanationBasis: explanationBasis('deployment-configuration', [
          sourceEvidenceRef(record.path, 1, record.lineCount),
          'deployment:vercel',
        ]),
        tags: ['deployment', 'vercel', 'vite', 'deployment-operations'],
      }))
      addRelation(relation('configures', fileId, id))
    }
    for (const imported of record.imports) {
      const resolved = resolveLocalImport(record.path, imported.source, filePaths)
      const target = resolved ? `file:${resolved}` : `dependency:${imported.source}`
      if (!resolved) {
        addEntity(entity(target, 'dependency', imported.source, semanticHash({ dependency: imported.source }), {
          name: imported.source,
          layer: 'code',
          area: 'project-foundation',
          subsystem: 'project-config',
          summary: `${imported.source} 라이브러리에서 이미 검증된 기능을 가져와 사용하는 연결입니다.`,
          explanationBasis: explanationBasis('dependency-reference', [
            sourceEvidenceRef(record.path, 1, record.lineCount),
            imported.source.startsWith('.') ? '' : `dependency:${imported.source}`,
          ]),
          tags: ['dependency', 'project-foundation'],
        }))
      }
      addRelation(relation('imports', fileId, target, { names: imported.names, dynamic: imported.dynamic }))
    }
    for (const route of record.externalApiRoutes) {
      const target = `api:${route}`
      if (!byId.has(target)) addEntity(entity(target, 'api-route', route, semanticHash({ route }), {
        name: route, layer: 'api', area: record.explanation.area,
        subsystem: record.subsystem,
        summary: `${route} 서버 기능에 자료를 요청하는 연결 대상입니다.`,
        explanationBasis: explanationBasis('api-route-and-source', [
          sourceEvidenceRef(record.path, 1, record.lineCount),
          `api:${route}`,
        ]),
        tags: ['api', record.explanation.area, record.subsystem],
      }))
      addRelation(relation('calls-api', fileId, target))
    }
  }

  const packageRecord = records.find((record) => record.path === 'package.json')
  if (packageRecord) {
    try {
      const packageJson = JSON.parse(packageRecord.content)
      for (const [name, command] of Object.entries(packageJson.scripts ?? {}).sort(([left], [right]) => compareSourceTwinText(left, right))) {
        const area = /test|check/.test(name) ? 'testing-quality' : /build|deploy|preview/.test(name) ? 'deployment-operations' : 'project-foundation'
        const subsystem = sourceTwinSubsystemForRecord({ path: `npm:${name}`, imports: [], layer: area === 'testing-quality' ? 'test' : 'deployment' }, project, area)
        addEntity(entity(`npm-script:${name}`, 'npm-script', `npm run ${name}`, semanticHash({ command }), {
          name,
          path: 'package.json',
          parentId: 'file:package.json',
          layer: /test|check/.test(name) ? 'test' : /build|deploy|preview/.test(name) ? 'deployment' : 'code',
          area,
          subsystem,
          summary: /test|check/.test(name)
            ? `${name} 검증 묶음을 실행해 코드와 보안 규칙의 회귀를 찾는 명령입니다.`
            : /build|deploy|preview/.test(name)
              ? `${name} 단계의 웹 빌드 또는 배포 확인을 실행하는 명령입니다.`
              : `${name} 개발 작업을 정해진 순서로 실행하는 프로젝트 명령입니다.`,
          explanationBasis: explanationBasis('package-script-declaration', [
            sourceEvidenceRef('package.json', 1, packageRecord.lineCount),
            `script:${name}`,
          ]),
          tags: unique(['npm', area, subsystem, /test|check/.test(name) ? 'test' : '', /build|deploy|preview/.test(name) ? 'deployment' : '']),
        }))
        addRelation(relation('contains', 'file:package.json', `npm-script:${name}`))
      }
    } catch {}
  }

  entities.sort((left, right) => compareSourceTwinText(left.id, right.id))
  relations.sort((left, right) => compareSourceTwinText(left.id, right.id))
  const entityFingerprintMap = Object.fromEntries(entities.map((item) => [item.id, item.fingerprint]))
  const perspective = (predicate) => entities.filter(predicate).map((item) => item.id)
  const perspectives = {
    functionality: perspective((item) => ['api-route', 'function'].includes(item.kind) || ['frontend', 'api', 'backend', 'mcp', 'shared'].includes(item.layer)),
    code: perspective((item) => ['file', 'function', 'dependency', 'npm-script'].includes(item.kind)),
    database: perspective((item) => item.layer === 'database'
      || ['db-table', 'db-function', 'rls-policy'].includes(item.kind)
      || (item.details?.dbTables?.length ?? 0) > 0
      || (item.details?.dbFunctions?.length ?? 0) > 0),
    security: perspective((item) => item.layer === 'security'
      || (item.details?.securitySignals?.length ?? 0) > 0
      || item.tags?.some((tag) => ['security', 'rls', 'credential-reference'].includes(tag))),
    deployment: perspective((item) => item.layer === 'deployment' || item.kind === 'deployment'),
  }
  for (const key of Object.keys(perspectives)) perspectives[key] = unique(perspectives[key])
  const fingerprints = {
    code: semanticHash(perspectives.code.map((id) => [id, entityFingerprintMap[id]])),
    database: semanticHash(perspectives.database.map((id) => [id, entityFingerprintMap[id]])),
    security: semanticHash(perspectives.security.map((id) => [id, entityFingerprintMap[id]])),
    deployment: semanticHash(perspectives.deployment.map((id) => [id, entityFingerprintMap[id]])),
  }
  const explanationFingerprintMap = Object.fromEntries(entities.map((item) => [item.id, item.explanationFingerprint ?? '']))
  fingerprints.explanations = semanticHash({ profile: profileInfo, entities: explanationFingerprintMap })
  const id = `source-twin-v1-${semanticHash({
    profile: profileInfo,
    entities: entityFingerprintMap,
    explanations: explanationFingerprintMap,
    relations,
  }, 12)}`
  const previousMap = new Map((previous?.entities ?? []).map((item) => [item.id, item]))
  const currentMap = new Map(entities.map((item) => [item.id, item]))
  const added = entities.filter((item) => !previousMap.has(item.id)).map((item) => item.id)
  const changed = entities.filter((item) => {
    const prior = previousMap.get(item.id)
    return prior && prior.fingerprint !== item.fingerprint
  }).map((item) => item.id)
  const explanationChanged = entities.filter((item) => {
    const prior = previousMap.get(item.id)
    return prior
      && prior.fingerprint === item.fingerprint
      && (prior.explanationFingerprint ?? '') !== (item.explanationFingerprint ?? '')
  }).map((item) => item.id)
  const removed = [...previousMap.values()].filter((item) => !currentMap.has(item.id)).map((item) => item.id)
  const changedPaths = unique([...added, ...changed, ...removed].map((entityId) => (
    currentMap.get(entityId)?.path || previousMap.get(entityId)?.path
  )))
  const explanationChangedPaths = unique(explanationChanged.map((entityId) => currentMap.get(entityId)?.path))
  const previousProfile = previous?.source?.profile ?? null
  const profileChanged = previous?.id && semanticHash(previousProfile) !== semanticHash(profileInfo)
    ? {
        before: previousProfile ? { id: previousProfile.id ?? '', version: previousProfile.version ?? '' } : null,
        after: { id: profileInfo.id, version: profileInfo.version },
      }
    : null
  const areas = sourceTwinAreaCatalog(entities.map((item) => item.area), profile.areas)
  const subsystems = sourceTwinSubsystemCatalog(entities.map((item) => item.subsystem), profile.subsystems)
  const manifest = {
    schemaVersion: SOURCE_TWIN_SCHEMA_VERSION,
    id,
    source: {
      id: profile.sourceId,
      label: `${projectLabel} 소스 코드`,
      repositoryUrl: repository.repositoryUrl ?? '',
      defaultBranch: repository.defaultBranch ?? 'main',
      observationMode: 'build-time-ast',
      contentIncluded: false,
      credentialValuesIncluded: false,
      profile: profileInfo,
    },
    areas,
    subsystems,
    entities,
    relations,
    perspectives,
    fingerprints,
    summary: {
      entities: entities.length,
      areas: areas.length,
      subsystems: subsystems.length,
      files: entities.filter((item) => item.kind === 'file').length,
      functions: entities.filter((item) => item.kind === 'function').length,
      imports: relations.filter((item) => item.type === 'imports').length,
      apiRoutes: entities.filter((item) => item.kind === 'api-route').length,
      dbTables: entities.filter((item) => item.kind === 'db-table').length,
      dbFunctions: entities.filter((item) => item.kind === 'db-function').length,
      rlsPolicies: entities.filter((item) => item.kind === 'rls-policy').length,
      environmentVariables: entities.filter((item) => item.kind === 'environment-variable').length,
      testFiles: entities.filter((item) => item.kind === 'file' && item.layer === 'test').length,
      deploymentEntities: perspectives.deployment.length,
      securityEntities: perspectives.security.length,
      parseFailures: records.filter((record) => record.parseError).length,
      structureOnlyFiles: records.filter((record) => record.analysisStatus === 'structure-only').length,
    },
    changeSet: {
      baseManifestId: previous?.id ?? null,
      initialBaseline: !previous?.id,
      added: unique(added),
      changed: unique(changed),
      explanationChanged: unique(explanationChanged),
      removed: unique(removed),
      changedPaths,
      explanationChangedPaths,
      profileChanged,
      summary: {
        added: added.length,
        changed: changed.length,
        explanationChanged: explanationChanged.length,
        removed: removed.length,
        paths: changedPaths.length,
        explanationPaths: explanationChangedPaths.length,
      },
    },
  }
  return manifest
}

function nulSeparated(output) {
  return output.split('\0').filter(Boolean)
}

const FALLBACK_EXCLUDED_DIRECTORIES = new Set([
  '.git', '.vercel', 'Codex', 'coverage', 'dist', 'node_modules',
])

function filesystemSourceTwinPaths(root) {
  const paths = []
  const visit = (absoluteDirectory, relativeDirectory = '') => {
    const entries = readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => compareSourceTwinText(left.name, right.name))
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name
      if (entry.isDirectory()) {
        if (!FALLBACK_EXCLUDED_DIRECTORIES.has(entry.name)) {
          visit(path.join(absoluteDirectory, entry.name), relativePath)
        }
      } else if (entry.isFile() && shouldInspect(relativePath)) {
        paths.push(relativePath)
      }
    }
  }
  visit(root)
  return paths.sort(compareSourceTwinText)
}

export function sourceTwinFilePaths(root) {
  try {
    const output = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return nulSeparated(output).filter(shouldInspect).sort(compareSourceTwinText)
  } catch {
    return filesystemSourceTwinPaths(root)
  }
}

function safeSourceFile(root, relativePath) {
  const repositoryRoot = realpathSync(root)
  const absolutePath = path.resolve(repositoryRoot, relativePath)
  const relative = path.relative(repositoryRoot, absolutePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Source twin path escapes the repository: ${relativePath}`)
  }
  const stat = lstatSync(absolutePath)
  if (stat.isSymbolicLink()) {
    throw new Error(`Source twin refuses symbolic links: ${relativePath}`)
  }
  if (!stat.isFile()) {
    throw new Error(`Source twin accepts regular files only: ${relativePath}`)
  }
  if (stat.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`Source twin file exceeds the 2 MiB limit: ${relativePath}`)
  }
  const resolvedPath = realpathSync(absolutePath)
  const resolvedRelative = path.relative(repositoryRoot, resolvedPath)
  if (!resolvedRelative || resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) {
    throw new Error(`Source twin resolved path escapes the repository: ${relativePath}`)
  }
  return { absolutePath: resolvedPath, size: stat.size }
}

export function readSourceTwinWorkingTree(root) {
  const files = new Map()
  let totalBytes = 0
  for (const relativePath of sourceTwinFilePaths(root)) {
    if (!existsSync(path.resolve(root, relativePath))) continue
    const sourceFile = safeSourceFile(root, relativePath)
    totalBytes += sourceFile.size
    if (totalBytes > MAX_SOURCE_TOTAL_BYTES) {
      throw new Error('Source twin files exceed the 24 MiB repository limit.')
    }
    files.set(relativePath, readFileSync(sourceFile.absolutePath, 'utf8'))
  }
  return files
}

export function parseGeneratedSourceTwin(source) {
  const marker = 'Object.freeze('
  const start = source.indexOf(marker)
  const end = source.lastIndexOf('\n)')
  if (start < 0 || end < 0) return null
  return JSON.parse(source.slice(start + marker.length, end))
}

export function serializeSourceTwinManifest(value) {
  return [
    '// Generated by scripts/generate-source-twin.mjs. Do not edit by hand.',
    'export const SOURCE_TWIN_MANIFEST = Object.freeze(',
    JSON.stringify(value, null, 2),
    ')',
    '',
  ].join('\n')
}
