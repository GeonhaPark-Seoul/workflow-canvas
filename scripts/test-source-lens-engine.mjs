import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  runSourceLensWorkflow,
  SOURCE_LENS_BOUNDARY,
  SOURCE_LENS_ENGINE_ID,
  SOURCE_LENS_ENGINE_VERSION,
  SOURCE_LENS_WORKFLOW,
  SOURCE_LENS_WORKFLOW_CONTRACT_VERSION,
} from './source-lens-engine.mjs'

const files = new Map([
  ['package.json', JSON.stringify({ name: 'source-lens-boundary-fixture' })],
  ['src/main.js', 'export function start(value) { return value ? true : false }\n'],
])

const first = runSourceLensWorkflow({ files })
const second = runSourceLensWorkflow({ files })
assert.deepEqual(first, second, '같은 입력은 같은 Source Analysis Bundle을 만들어야 합니다.')
assert.equal(first.contractVersion, SOURCE_LENS_WORKFLOW_CONTRACT_VERSION)
assert.deepEqual(first.engine, { id: SOURCE_LENS_ENGINE_ID, version: SOURCE_LENS_ENGINE_VERSION })
assert.deepEqual(first.workflow, { id: SOURCE_LENS_WORKFLOW.id, version: SOURCE_LENS_WORKFLOW.version })
assert.ok(first.manifest?.id)
assert.equal(first.functionalContextPack?.type, 'FunctionalContextPack')
assert.ok(first.functionalContextPack?.fingerprint)
assert.equal(Object.hasOwn(first, 'featureModel'), false)
assert.equal(Object.hasOwn(first, 'codePartCatalog'), false)
assert.equal(Object.hasOwn(first, 'flowCatalog'), false)

const complete = runSourceLensWorkflow({
  files,
  outputs: { featureModel: true, codeParts: true, flows: true },
})
assert.ok(complete.featureModel?.fingerprint)
assert.equal(complete.codePartCatalog?.sourceManifestId, complete.manifest.id)
assert.equal(complete.flowCatalog?.sourceManifestId, complete.manifest.id)
assert.equal(Object.hasOwn(complete.manifest, 'codePartCatalog'), false)
assert.equal(Object.hasOwn(complete.manifest, 'flowCatalog'), false)

assert.equal(SOURCE_LENS_WORKFLOW.stages.length, 9)
assert.equal(new Set(SOURCE_LENS_WORKFLOW.stages).size, SOURCE_LENS_WORKFLOW.stages.length)
assert.ok(SOURCE_LENS_WORKFLOW.stages.includes('bootstrap-functional-context'))
for (const responsibility of [
  'source-edit-or-git-write',
  'state-snapshot-approval-or-storage',
  'external-ai-explanation',
  'graphify-community-or-query',
]) {
  assert.ok(SOURCE_LENS_BOUNDARY.excludedResponsibilities.includes(responsibility))
}

for (const caller of [
  './generate-source-twin.mjs',
  './local-connector-agent.mjs',
  './test-source-twin.mjs',
  './test-source-profiles.mjs',
  './test-source-feature-model.mjs',
  './test-source-code-parts.mjs',
]) {
  const source = await readFile(new URL(caller, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]\.\/source-twin-scanner\.mjs['"]/, `${caller}는 Source Lens 공개 진입점을 우회하면 안 됩니다.`)
}

for (const ownedCore of ['./source-twin-scanner.mjs', '../shared/sourceCodeParts.js']) {
  const source = await readFile(new URL(ownedCore, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /workflowSourceEditableProperties/, `${ownedCore}는 Safe Operations 편집 Manifest를 직접 import하면 안 됩니다.`)
}

console.log('Source Lens single-workflow boundary checks passed')
