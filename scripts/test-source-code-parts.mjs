import assert from 'node:assert/strict'
import { buildSourceTwinManifest } from './source-twin-scanner.mjs'
import { sourceCodePartsForModule } from '../shared/sourceCodeParts.js'
import { sourceFlowsForModule } from '../shared/sourceFlows.js'
import { createSourceModuleMaterializationItem } from '../shared/sourceModuleProposal.js'
import { systemNodeShouldDim } from '../shared/systemOntology.js'
import { deriveDefaultSystemLayer } from '../shared/systemLayers.js'
import { explainSourceCodePartWithAi } from '../shared/sourceAiExplanation.js'

const files = new Map([
  ['package.json', JSON.stringify({ name: 'fixture-app', dependencies: { react: '^18.0.0' } })],
  ['src/example.jsx', `
import client from './client.js'
import { Panel } from './panel.jsx'
const API_MODE = process.env.API_MODE
export function loadOrders(limit) {
  if (!limit) return []
  for (const item of [limit]) client.track(item)
  fetch('/api/orders')
  return client.from('orders').select('*')
}
export function App() { return <Panel onSave={loadOrders} /> }
`],
  ['src/client.js', 'export default { track() {}, from() { return { select() {} } } }'],
  ['src/panel.jsx', 'export function Panel({ onSave }) { return <button onClick={onSave}>Save</button> }'],
  ['api/orders.js', 'export default function handler() { return loadOrders() }\nfunction loadOrders() { return [] }'],
  ['mcp/tools.js', "export function register(server) { server.registerTool('load_orders', {}, () => run()) }\nfunction run() { return true }"],
  ['shared/uiConstants.js', `
export const SYSTEM_NODE_DEFAULT_WIDTH = 240
export const SYSTEM_NODE_DEFAULT_HEIGHT = 130
export const SYSTEM_MODULE_COLOR = '#0d9488'
export const SOURCE_TWIN_EMPTY_MESSAGE = '일치하는 코드 실체 없음'
`],
])

const build = () => buildSourceTwinManifest(files, {
  repository: { repositoryUrl: 'https://github.com/example/fixture-app', defaultBranch: 'main' },
  includeCodePartCatalog: true,
  includeFlowCatalog: true,
})

const first = build()
const second = build()
assert.deepEqual(first, second, '같은 입력은 같은 코드 파츠와 앵커를 만들어야 합니다.')

const moduleId = 'file:src/example.jsx'
const module = sourceCodePartsForModule(first.codePartCatalog, moduleId)
assert.ok(module)
assert.equal(module.moduleId, moduleId)
assert.equal(module.sourceManifestId, first.id)
for (const kind of ['declaration', 'command', 'branch', 'loop', 'return', 'resource', 'config', 'data']) {
  assert.ok(module.parts.some((part) => part.kind === kind), `${kind} 코드 파츠가 필요합니다.`)
}
assert.ok(module.parts.every((part) => part.editable.eligible === false))
assert.ok(module.parts.every((part) => part.evidenceRef.startsWith('source:src/example.jsx#L')))
assert.equal(sourceCodePartsForModule(first.codePartCatalog, '__proto__'), null)
const editableModule = sourceCodePartsForModule(first.codePartCatalog, 'file:shared/uiConstants.js')
assert.equal(editableModule.parts.filter((part) => part.editable.eligible).length, 4)
assert.deepEqual(
  editableModule.parts.filter((part) => part.editable.eligible).map((part) => part.editable.propertyId).sort(),
  ['ui.source-twin.empty-message', 'ui.system-module.color', 'ui.system-node.default-height', 'ui.system-node.default-width'],
)

const flowModule = sourceFlowsForModule(first.flowCatalog, moduleId)
assert.ok(flowModule)
assert.ok(flowModule.relations.some((relation) => relation.kind === 'render' && relation.label === 'Panel'))
assert.ok(Object.values(first.flowCatalog.flows).length >= 3)
const allFlowKinds = new Set(Object.keys(first.flowCatalog.flows).map((flowId) => sourceFlowsForModule(
  first.flowCatalog,
  Object.keys(first.flowCatalog.modules).find((id) => first.flowCatalog.modules[id].flowIds.includes(flowId)),
)?.flows.find((flow) => flow.id === flowId)?.kind).filter(Boolean))
assert.ok(allFlowKinds.has('ui-event'))
assert.ok(allFlowKinds.has('api-route'))
assert.ok(allFlowKinds.has('mcp-tool'))

const entity = first.entities.find((item) => item.id === moduleId)
const item = createSourceModuleMaterializationItem({
  reviewSourceId: 'fixture-review',
  manifest: first,
  entity,
  codeParts: module.parts,
  flows: flowModule.flows,
  position: { x: 120, y: 240 },
})
assert.equal(item.proposal.operations.length, 1)
assert.equal(item.proposal.operations[0].action, 'add_node')
const proposedNode = item.proposal.operations[0].node
assert.equal(proposedNode.data.systemKind, 'module')
assert.equal(proposedNode.data.digitalTwinBinding.entityKey, moduleId)
assert.ok(proposedNode.data.systemParts.length > 0)
assert.ok(proposedNode.data.systemParts.some((part) => part.kind === 'capability'))
assert.ok(proposedNode.data.systemParts.every((part) => part.digitalTwinBinding))
assert.equal(deriveDefaultSystemLayer(proposedNode.data), 'L2')
assert.equal(systemNodeShouldDim(proposedNode.data), false)
assert.equal(systemNodeShouldDim({ systemKind: 'module', assetStatus: 'candidate' }), true)
assert.equal(systemNodeShouldDim({ systemKind: 'service', sourceKind: 'manual', evidence: '' }), true)
assert.equal(systemNodeShouldDim({ systemKind: 'service', sourceKind: 'code', evidence: 'source:api/example.js#L1' }), false)
assert.equal(systemNodeShouldDim({ systemKind: 'service', twinRuntime: { status: 'failed', verification: 'verified', verifiedAt: new Date().toISOString(), resourceId: 'x' } }), true)

const disabledAi = await explainSourceCodePartWithAi(module.parts[0], { env: {} })
assert.equal(disabledAi.available, false)
assert.equal(disabledAi.transmission.sourceBodyIncluded, false)
assert.equal(disabledAi.transmission.canvasContentIncluded, false)
let transmittedBody = ''
const enabledAi = await explainSourceCodePartWithAi(module.parts[0], {
  env: {
    SOURCE_LENS_AI_ENABLED: 'true',
    SOURCE_LENS_AI_PROVIDER: 'anthropic',
    SOURCE_LENS_AI_MODEL: 'approved-test-model',
    SOURCE_LENS_AI_API_KEY: 'test-only-key-not-a-real-secret',
  },
  fetchImpl: async (_url, options) => {
    transmittedBody = options.body
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '다른 코드 자원을 연결해 사용할 준비를 합니다.' }] }) }
  },
})
assert.equal(enabledAi.available, true)
assert.equal(enabledAi.artifact.generated, true)
assert.equal(enabledAi.artifact.kind, 'ai-explanation')
assert.doesNotMatch(transmittedBody, /test-only-key/)
assert.doesNotMatch(transmittedBody, /client\.from\(|fetch\('/)

console.log(`Source code-part tests passed (${module.parts.length} fixture parts).`)
