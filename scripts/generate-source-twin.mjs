import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  buildSourceTwinManifest,
  parseGeneratedSourceTwin,
  readSourceRepositoryMetadata,
  readSourceTwinWorkingTree,
  serializeSourceTwinManifest,
  SOURCE_TWIN_MANIFEST_PATH,
} from './source-twin-scanner.mjs'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const target = path.join(root, SOURCE_TWIN_MANIFEST_PATH)
const checkOnly = process.argv.includes('--check')
let previous = null
try {
  previous = parseGeneratedSourceTwin(execFileSync(
    'git',
    ['show', `HEAD:${SOURCE_TWIN_MANIFEST_PATH}`],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ))
} catch {}

const manifest = buildSourceTwinManifest(readSourceTwinWorkingTree(root), {
  previous,
  repository: readSourceRepositoryMetadata(root),
})
const generated = serializeSourceTwinManifest(manifest)
const existing = existsSync(target) ? readFileSync(target, 'utf8') : ''

if (checkOnly) {
  const existingManifest = parseGeneratedSourceTwin(existing)
  // changeSet intentionally describes the parent-to-current commit delta. On a
  // clean deployment HEAD already contains the generated manifest, so
  // recalculating against HEAD would erase that historical delta. Validate all
  // deterministic source fields while preserving the committed delta envelope.
  const expected = existingManifest
    ? serializeSourceTwinManifest({ ...manifest, changeSet: existingManifest.changeSet })
    : generated
  if (expected !== existing) {
    console.error('Source twin manifest is stale. Run: npm run source-twin:update')
    process.exitCode = 1
  } else {
    console.log(`Source twin manifest is current: ${manifest.id}`)
  }
} else {
  writeFileSync(target, generated)
  console.log(`Updated ${SOURCE_TWIN_MANIFEST_PATH}: ${manifest.id}`)
}
