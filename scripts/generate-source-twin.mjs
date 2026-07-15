import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  buildSourceTwinManifest,
  compareSourceTwinText,
  parseGeneratedSourceTwin,
  readSourceRepositoryMetadata,
  readSourceTwinWorkingTree,
  serializeSourceTwinManifest,
  SOURCE_TWIN_MANIFEST_PATH,
} from './source-twin-scanner.mjs'

function firstDifference(existing, expected, pointer = '$') {
  if (Object.is(existing, expected)) return null
  if (Array.isArray(existing) || Array.isArray(expected)) {
    if (!Array.isArray(existing) || !Array.isArray(expected)) return { pointer, existing, expected }
    if (existing.length !== expected.length) {
      return { pointer: `${pointer}.length`, existing: existing.length, expected: expected.length }
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifference(existing[index], expected[index], `${pointer}[${index}]`)
      if (difference) return difference
    }
    return null
  }
  if (existing && expected && typeof existing === 'object' && typeof expected === 'object') {
    const keys = [...new Set([...Object.keys(existing), ...Object.keys(expected)])].sort(compareSourceTwinText)
    for (const key of keys) {
      const difference = firstDifference(existing[key], expected[key], `${pointer}.${key}`)
      if (difference) return difference
    }
    return null
  }
  return { pointer, existing, expected }
}

function diagnosticValue(value) {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return String(value)
  return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized
}

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const target = path.join(root, SOURCE_TWIN_MANIFEST_PATH)
const checkOnly = process.argv.includes('--check')
const prepareOnly = process.argv.includes('--prepare')
let previous = null
try {
  previous = parseGeneratedSourceTwin(execFileSync(
    'git',
    ['show', `HEAD:${SOURCE_TWIN_MANIFEST_PATH}`],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 20 * 1024 * 1024 },
  ))
} catch {}

const manifest = buildSourceTwinManifest(readSourceTwinWorkingTree(root), {
  previous,
  repository: readSourceRepositoryMetadata(root),
})
const generated = serializeSourceTwinManifest(manifest)
const existing = existsSync(target) ? readFileSync(target, 'utf8') : ''
const existingManifest = parseGeneratedSourceTwin(existing)
const preparedManifest = existingManifest
  ? { ...manifest, changeSet: existingManifest.changeSet }
  : manifest
const prepared = serializeSourceTwinManifest(preparedManifest)

if (checkOnly) {
  // changeSet intentionally describes the parent-to-current commit delta. On a
  // clean deployment HEAD already contains the generated manifest, so
  // recalculating against HEAD would erase that historical delta. Validate all
  // deterministic source fields while preserving the committed delta envelope.
  if (prepared !== existing) {
    console.error('Source twin manifest is stale. Run: npm run source-twin:update')
    const difference = firstDifference(existingManifest, preparedManifest)
    console.error(`Committed manifest: ${existingManifest?.id ?? 'unreadable'}`)
    console.error(`Generated manifest: ${manifest.id}`)
    if (difference) {
      console.error(`First difference: ${difference.pointer}`)
      console.error(`Committed value: ${diagnosticValue(difference.existing)}`)
      console.error(`Generated value: ${diagnosticValue(difference.expected)}`)
    }
    process.exitCode = 1
  } else {
    console.log(`Source twin manifest is current: ${manifest.id}`)
  }
} else if (prepareOnly) {
  if (prepared !== existing) writeFileSync(target, prepared)
  console.log(`Prepared ${SOURCE_TWIN_MANIFEST_PATH}: ${manifest.id}${prepared !== existing ? ' (refreshed)' : ''}`)
} else {
  writeFileSync(target, generated)
  console.log(`Updated ${SOURCE_TWIN_MANIFEST_PATH}: ${manifest.id}`)
}
