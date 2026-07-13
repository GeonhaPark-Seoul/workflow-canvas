import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  buildDiscoveryManifest,
  DISCOVERY_MANIFEST_PATH,
  parseGeneratedManifest,
  readGitTree,
  readWorkingTree,
  serializeGeneratedManifest,
} from './system-discovery.mjs'

const LEGACY_BASELINE_ID = 'phase3-41ca765'
const LEGACY_BASELINE_REF = '41ca7657278b55aed4746059b8f6014b9730559b'
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const target = path.join(root, DISCOVERY_MANIFEST_PATH)
const checkOnly = process.argv.includes('--check')

const current = buildDiscoveryManifest(readWorkingTree(root))
const legacy = buildDiscoveryManifest(readGitTree(root, LEGACY_BASELINE_REF))
const existingSource = existsSync(target) ? readFileSync(target, 'utf8') : ''
let committed = null
try {
  committed = parseGeneratedManifest(execFileSync(
    'git',
    ['show', `HEAD:${DISCOVERY_MANIFEST_PATH}`],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ))
} catch {}
const baselines = { ...(committed?.baselines ?? {}) }

baselines[LEGACY_BASELINE_ID] = legacy
if (committed?.current?.id && committed.current.id !== current.id) {
  baselines[committed.current.id] = committed.current
}

const generated = serializeGeneratedManifest({
  schemaVersion: 1,
  current,
  baselines: Object.fromEntries(Object.keys(baselines).sort().map((key) => [key, baselines[key]])),
})

if (checkOnly) {
  if (generated !== existingSource) {
    console.error('System discovery manifest is stale. Run: npm run discover:update')
    process.exitCode = 1
  } else {
    console.log(`System discovery manifest is current: ${current.id}`)
  }
} else {
  writeFileSync(target, generated)
  console.log(`Updated ${DISCOVERY_MANIFEST_PATH}: ${current.id}`)
}
