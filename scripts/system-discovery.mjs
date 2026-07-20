import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { SYSTEM_RUNTIME_CAPABILITY_DEFS } from '../shared/systemRuntime.js'

export const DISCOVERY_MANIFEST_PATH = 'shared/workflowSystemDiscoveryManifest.js'

const INCLUDED_ROOT_FILES = new Set([
  'CLAUDE.md',
  'README.md',
  'index.html',
  'package.json',
  'vercel.json',
  'vite.config.js',
])

function shouldInspect(relativePath) {
  if (relativePath === DISCOVERY_MANIFEST_PATH) return false
  if (relativePath === 'shared/sourceTwinManifest.js') return false
  if (relativePath === 'shared/sourceFeatureManifest.js') return false
  if (relativePath === 'shared/sourceCodePartManifest.js') return false
  if (relativePath === 'shared/sourceFlowManifest.js') return false
  if (relativePath === 'shared/sourceFunctionalContextManifest.js') return false
  if (INCLUDED_ROOT_FILES.has(relativePath)) return true
  if (/^[^/]+\.sql$/i.test(relativePath)) return true
  return /^(api|mcp|scripts|shared|src)\/.*\.(js|jsx|mjs)$/i.test(relativePath)
}

function normalizedContent(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n')
}

const CREDENTIAL_NAME_PATTERN = '(?:[A-Z][A-Z0-9_]*_)?(?:(?:API|ANON|PUBLISHABLE|SERVICE_ROLE|PRIVATE|ACCESS)_KEY|TOKEN|SECRET|PASSWORD)'

function contentForFingerprint(value) {
  return normalizedContent(value)
    .replace(
      new RegExp(`\\b(const|let|var)\\s+(${CREDENTIAL_NAME_PATTERN})\\s*=\\s*(['"])([^'"\\n]+)\\3`, 'g'),
      '$1 $2 = $3<credential-value-excluded>$3',
    )
    .replace(
      new RegExp(`(process\\.env\\.(${CREDENTIAL_NAME_PATTERN})\\s*(?:\\|\\||\\?\\?)\\s*)(['"])([^'"\\n]+)\\3`, 'g'),
      '$1$3<credential-fallback-excluded>$3',
    )
}

export function fingerprint(value) {
  return createHash('sha256').update(normalizedContent(value)).digest('hex').slice(0, 20)
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

function semanticFingerprint(value) {
  return fingerprint(JSON.stringify(stableValue(value)))
}

function matches(content, regex, pick = (match) => match[1]) {
  const result = []
  let match
  regex.lastIndex = 0
  while ((match = regex.exec(content)) !== null) result.push(pick(match))
  return result
}

function createResource(resources, key, kind, label, sourceRefs, signature, details) {
  const refs = sortedUnique(sourceRefs)
  resources[key] = {
    key,
    kind,
    label,
    fingerprint: semanticFingerprint({ signature, sourceRefs: refs }),
    sourceRefs: refs,
    ...(details === undefined ? {} : { details: stableValue(details) }),
  }
}

function fileEntries(files) {
  return [...files.entries()].sort(([left], [right]) => left.localeCompare(right))
}

export function buildDiscoveryManifest(filesInput) {
  const files = filesInput instanceof Map ? filesInput : new Map(Object.entries(filesInput ?? {}))
  const resources = {}
  const fileFingerprints = {}

  for (const [relativePath, rawContent] of fileEntries(files)) {
    const content = normalizedContent(rawContent)
    const fileHash = fingerprint(contentForFingerprint(content))
    fileFingerprints[relativePath] = fileHash
    createResource(resources, `file:${relativePath}`, 'file', relativePath, [relativePath], fileHash)
  }

  for (const capability of SYSTEM_RUNTIME_CAPABILITY_DEFS) {
    const sourceRefs = sortedUnique((capability.sourceRefs ?? []).filter((ref) => files.has(ref)))
    createResource(
      resources,
      `runtime-capability:${capability.id}`,
      'runtime-capability',
      capability.label,
      sourceRefs,
      {
        id: capability.id,
        operation: capability.operation,
        sideEffect: capability.sideEffect,
        risk: capability.risk,
        resultKind: capability.resultKind,
        authorization: capability.authorization,
        dataScope: capability.dataScope,
        targetNodeId: capability.targetNodeId,
        pathEdgeIds: capability.pathEdgeIds,
        freshnessMs: capability.freshnessMs,
        partKinds: capability.partKinds,
        partRefs: capability.partRefs,
        catalogFields: capability.catalogFields.map((field) => ({
          id: field.id,
          category: field.category,
          valueType: field.valueType,
          sensitivity: field.sensitivity,
          sourceKind: field.sourceKind,
          refreshMode: field.refreshMode,
          evidenceRef: field.evidenceRef,
          defaultAvailability: field.defaultAvailability,
          lockedAvailability: field.lockedAvailability,
        })),
        implementation: sourceRefs.map((ref) => [ref, fileFingerprints[ref]]),
      },
      {
        authorization: capability.authorization,
        dataScope: capability.dataScope,
        operation: capability.operation,
        sideEffect: capability.sideEffect,
        risk: capability.risk,
        resultKind: capability.resultKind,
        targetNodeId: capability.targetNodeId,
        pathEdgeIds: capability.pathEdgeIds,
        freshnessMs: capability.freshnessMs,
        catalogFieldCount: capability.catalogFields.length,
        catalogFieldIds: capability.catalogFields.map((field) => field.id),
      },
    )
  }

  const packageJson = files.has('package.json') ? JSON.parse(files.get('package.json')) : {}
  const dependencies = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) }
  for (const name of Object.keys(dependencies).sort()) {
    createResource(
      resources,
      `dependency:${name}`,
      'dependency',
      name,
      ['package.json'],
      { version: dependencies[name] },
      { version: dependencies[name] },
    )
  }
  for (const name of Object.keys(packageJson.scripts ?? {}).sort()) {
    createResource(
      resources,
      `npm-script:${name}`,
      'npm-script',
      `npm run ${name}`,
      ['package.json'],
      { command: packageJson.scripts[name] },
    )
  }

  const apiRoutes = []
  for (const [relativePath, content] of fileEntries(files)) {
    const match = /^api\/([^/]+)\.js$/.exec(relativePath)
    if (!match) continue
    const route = `/api/${match[1]}`
    apiRoutes.push(route)
    createResource(resources, `api:${route}`, 'api', route, [relativePath], fileFingerprints[relativePath])
  }
  createResource(
    resources,
    'collection:api-routes',
    'collection',
    'API 경로 목록',
    apiRoutes.map((route) => `api/${route.slice('/api/'.length)}.js`),
    sortedUnique(apiRoutes),
    { items: sortedUnique(apiRoutes) },
  )

  const tableSources = new Map()
  const tableDefinitions = new Map()
  const policies = []
  const dbFunctions = []
  const storageBuckets = []
  const realtimeTables = []
  const environmentNames = new Map()
  const credentialReferences = new Map()

  const addTableSource = (table, relativePath, role) => {
    if (!tableSources.has(table)) tableSources.set(table, [])
    tableSources.get(table).push(relativePath)
    if (role === 'definition') {
      if (!tableDefinitions.has(table)) tableDefinitions.set(table, [])
      tableDefinitions.get(table).push(relativePath)
    }
  }

  for (const [relativePath, content] of fileEntries(files)) {
    const sqlSource = /\.sql$/i.test(relativePath)
    if (sqlSource) {
      for (const table of matches(content, /create\s+table\s+if\s+not\s+exists\s+(?:public\.)?([a-zA-Z_][\w]*)/gi)) {
        addTableSource(table, relativePath, 'definition')
      }
    }
    for (const table of matches(content, /\.from\(\s*['"]([a-zA-Z_][\w]*)['"]\s*\)/g)) {
      addTableSource(table, relativePath, 'reference')
    }
    if (sqlSource) {
      for (const policy of matches(
        content,
        /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-zA-Z_][\w]*)/gi,
        (match) => ({ name: match[1], table: match[2], sourceRef: relativePath }),
      )) policies.push(policy)
      for (const fn of matches(
        content,
        /create\s+or\s+replace\s+function\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(/gi,
        (match) => ({ name: match[1], sourceRef: relativePath }),
      )) dbFunctions.push(fn)
      for (const bucket of matches(
        content,
        /insert\s+into\s+storage\.buckets[\s\S]{0,500}?values\s*\(\s*'([^']+)'/gi,
        (match) => ({ name: match[1], sourceRef: relativePath }),
      )) storageBuckets.push(bucket)
      for (const table of matches(
        content,
        /alter\s+publication\s+supabase_realtime\s+add\s+table\s+(?:public\.)?([a-zA-Z_][\w]*)/gi,
        (match) => ({ name: match[1], sourceRef: relativePath }),
      )) realtimeTables.push(table)
    }

    const envNames = [
      ...matches(content, /process\.env\.([A-Z][A-Z0-9_]*)/g),
      ...matches(content, /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g),
    ]
    for (const envName of envNames) {
      if (!environmentNames.has(envName)) environmentNames.set(envName, [])
      environmentNames.get(envName).push(relativePath)
    }

    for (const credential of matches(
      content,
      new RegExp(`\\b(?:const|let|var)\\s+(${CREDENTIAL_NAME_PATTERN})\\s*=\\s*(['"])([^'"\\n]+)\\2`, 'g'),
      (match) => ({ name: match[1], sourceRef: relativePath }),
    )) {
      if (!credentialReferences.has(credential.name)) credentialReferences.set(credential.name, [])
      credentialReferences.get(credential.name).push(credential.sourceRef)
    }
  }

  for (const table of [...tableSources.keys()].sort()) {
    const refs = sortedUnique(tableSources.get(table))
    const definitions = sortedUnique(tableDefinitions.get(table) ?? [])
    createResource(
      resources,
      `db-table:${table}`,
      'db-table',
      table,
      refs,
      {
        definitions: definitions.map((ref) => [ref, fileFingerprints[ref]]),
        references: refs,
      },
      { definitions, references: refs },
    )
  }

  const mcpToolNames = []
  const mcpServer = files.get('mcp/server.js') ?? ''
  for (const name of matches(mcpServer, /server\.registerTool\(\s*['"]([^'"]+)['"]/g)) mcpToolNames.push(name)
  createResource(
    resources,
    'collection:mcp-tools',
    'collection',
    'MCP 도구 목록',
    ['mcp/server.js'],
    sortedUnique(mcpToolNames),
    { items: sortedUnique(mcpToolNames) },
  )

  const normalizedPolicies = policies
    .map(({ name, table, sourceRef }) => ({ name, table, sourceRef }))
    .sort((left, right) => `${left.table}:${left.name}`.localeCompare(`${right.table}:${right.name}`))
  createResource(
    resources,
    'collection:rls-policies',
    'collection',
    'RLS 정책 목록',
    normalizedPolicies.map((item) => item.sourceRef),
    normalizedPolicies,
    { items: normalizedPolicies },
  )

  const normalizedFunctions = dbFunctions
    .map(({ name, sourceRef }) => ({ name, sourceRef }))
    .sort((left, right) => left.name.localeCompare(right.name))
  createResource(
    resources,
    'collection:db-functions',
    'collection',
    'DB 함수 목록',
    normalizedFunctions.map((item) => item.sourceRef),
    normalizedFunctions,
    { items: normalizedFunctions },
  )

  for (const bucket of storageBuckets.sort((left, right) => left.name.localeCompare(right.name))) {
    createResource(
      resources,
      `storage-bucket:${bucket.name}`,
      'storage-bucket',
      bucket.name,
      [bucket.sourceRef],
      { name: bucket.name, file: fileFingerprints[bucket.sourceRef] },
    )
  }
  for (const table of realtimeTables.sort((left, right) => left.name.localeCompare(right.name))) {
    createResource(
      resources,
      `realtime-table:${table.name}`,
      'realtime-table',
      table.name,
      [table.sourceRef],
      { name: table.name, file: fileFingerprints[table.sourceRef] },
    )
  }

  for (const envName of [...environmentNames.keys()].sort()) {
    const refs = sortedUnique(environmentNames.get(envName))
    createResource(resources, `env:${envName}`, 'environment-variable', envName, refs, { name: envName, sourceRefs: refs })
  }
  createResource(
    resources,
    'collection:environment-variables',
    'collection',
    '환경변수 이름 목록',
    [...environmentNames.values()].flat(),
    [...environmentNames.keys()].sort(),
    { items: [...environmentNames.keys()].sort() },
  )

  for (const name of [...credentialReferences.keys()].sort()) {
    const refs = sortedUnique(credentialReferences.get(name))
    const classification = /(?:ANON|PUBLISHABLE)/.test(name)
      ? 'public-client-reference'
      : 'review-required-literal'
    createResource(
      resources,
      `credential-reference:${name}`,
      'credential-reference',
      name,
      refs,
      { name, classification, sourceRefs: refs },
      { classification },
    )
  }

  const orderedResources = Object.fromEntries(Object.keys(resources).sort().map((key) => [key, resources[key]]))
  const orderedFiles = Object.fromEntries(Object.keys(fileFingerprints).sort().map((key) => [key, fileFingerprints[key]]))
  const manifestId = `discovery-v1-${semanticFingerprint(
    Object.values(orderedResources).map(({ key, fingerprint: resourceHash }) => [key, resourceHash]),
  ).slice(0, 12)}`

  return {
    schemaVersion: 1,
    id: manifestId,
    resources: orderedResources,
    files: orderedFiles,
    summary: {
      resources: Object.keys(orderedResources).length,
      files: Object.keys(orderedFiles).length,
      apiRoutes: apiRoutes.length,
      dbTables: tableSources.size,
      mcpTools: sortedUnique(mcpToolNames).length,
      rlsPolicies: normalizedPolicies.length,
      dbFunctions: normalizedFunctions.length,
      environmentVariableNames: environmentNames.size,
      credentialReferences: credentialReferences.size,
      runtimeCapabilities: SYSTEM_RUNTIME_CAPABILITY_DEFS.length,
    },
  }
}

function nulSeparated(output) {
  return output.split('\0').filter(Boolean)
}

export function readWorkingTree(root) {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  )
  const files = new Map()
  for (const relativePath of nulSeparated(output).filter(shouldInspect).sort()) {
    const absolutePath = path.join(root, relativePath)
    if (!existsSync(absolutePath)) continue
    files.set(relativePath, readFileSync(absolutePath, 'utf8'))
  }
  return files
}

export function readGitTree(root, ref) {
  const output = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', ref], { cwd: root, encoding: 'utf8' })
  const files = new Map()
  for (const relativePath of nulSeparated(output).filter(shouldInspect).sort()) {
    files.set(
      relativePath,
      execFileSync('git', ['show', `${ref}:${relativePath}`], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }),
    )
  }
  return files
}

export function parseGeneratedManifest(source) {
  const startMarker = 'Object.freeze('
  const start = source.indexOf(startMarker)
  const end = source.lastIndexOf('\n)')
  if (start < 0 || end < 0) return null
  return JSON.parse(source.slice(start + startMarker.length, end))
}

export function serializeGeneratedManifest(value) {
  return [
    '// Generated by scripts/generate-system-discovery.mjs. Do not edit by hand.',
    'export const WORKFLOW_SYSTEM_DISCOVERY = Object.freeze(',
    JSON.stringify(value, null, 2),
    ')',
    '',
  ].join('\n')
}
