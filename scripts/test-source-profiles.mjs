import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  defineSourceProfile,
  resolveSourceProfile,
  SOURCE_PROFILE_CONTRACT_VERSION,
} from '../shared/sourceProfileContract.js'
import { groupSourceTwinEntitiesByArea, groupSourceTwinEntitiesBySubsystem } from '../shared/sourceTwinSemantics.js'
import { buildSourceTwinManifest } from './source-twin-scanner.mjs'
import {
  DEFAULT_SOURCE_PROFILES,
  GENERIC_SOURCE_PROFILE,
  registeredSourceProfile,
} from './source-profiles/index.mjs'

const workflowFiles = new Map([
  ['package.json', JSON.stringify({ name: 'workflow-canvas' })],
  ['src/App.jsx', 'export default function App() { return null }\n'],
])
const workflowSelection = registeredSourceProfile({ project: { name: 'workflow-canvas' }, files: workflowFiles })
assert.equal(workflowSelection.profile.id, 'workflow-canvas')
assert.equal(workflowSelection.profile.version, '0.4.0')
assert.ok(workflowSelection.profile.components.some((item) => item.id === 'engine-source-lens'))
assert.equal(workflowSelection.profile.featureModel.schemaVersion, 1)
assert.deepEqual(workflowSelection.matchEvidence, ['package:workflow-canvas'])

const genericFiles = new Map([
  ['package.json', JSON.stringify({ name: 'another-web-app' })],
  ['src/main.js', 'export function start() { return true }\n'],
])
const genericSelection = registeredSourceProfile({ project: { name: 'another-web-app' }, files: genericFiles })
assert.equal(genericSelection.profile.id, GENERIC_SOURCE_PROFILE.id)
assert.deepEqual(genericSelection.matchEvidence, ['fallback'])

const fastApiFiles = new Map([
  ['pyproject.toml', '[project]\nname = "order-service"\n'],
  ['app/main.py', 'from fastapi import FastAPI\napp = FastAPI()\n'],
  ['app/api/orders.py', 'def create_order():\n    return {"ok": True}\n'],
  ['app/services/order_service.py', 'def place_order():\n    return "created"\n'],
  ['app/models/order.py', 'class Order:\n    pass\n'],
  ['app/repositories/order_repository.py', 'def save_order(order):\n    return order\n'],
  ['app/integrations/inventory.py', 'def reserve_stock():\n    return True\n'],
  ['tests/test_orders.py', 'def test_order():\n    assert True\n'],
])
const fastApiSelection = registeredSourceProfile({ project: {}, files: fastApiFiles })
assert.equal(fastApiSelection.profile.id, 'fastapi-order-service-reference')
assert.ok(fastApiSelection.matchEvidence.every((item) => item.startsWith('required-file:')))

const fastApiManifest = buildSourceTwinManifest(fastApiFiles)
assert.equal(fastApiManifest.source.id, 'fastapi-order-service:source')
assert.equal(fastApiManifest.source.label, '주문 처리 서비스 소스 코드')
assert.equal(fastApiManifest.source.profile.id, 'fastapi-order-service-reference')
assert.equal(fastApiManifest.source.profile.version, '0.2.0')
assert.equal(fastApiManifest.summary.structureOnlyFiles, 7)
assert.equal(fastApiManifest.entities.filter((item) => item.kind === 'function').length, 0)

const pythonFiles = fastApiManifest.entities.filter((item) => item.kind === 'file' && item.language === 'python')
assert.equal(pythonFiles.length, 7)
assert.ok(pythonFiles.every((item) => item.details.parseStatus === 'structure-only'))
assert.ok(pythonFiles.every((item) => /함수 구조는 아직 분석하지 않음/.test(item.technicalSummary)))
assert.ok(pythonFiles.every((item) => item.explanationBasis.refs.includes('profile:fastapi-order-service-reference@0.2.0')))
assert.doesNotMatch(JSON.stringify(fastApiManifest), /canvas-interface|Workflow Canvas/)

const orderService = fastApiManifest.entities.find((item) => item.id === 'file:app/services/order_service.py')
assert.equal(orderService.area, 'order-processing')
assert.equal(orderService.subsystem, 'order-workflow')
assert.match(orderService.summary, /주문 가능 여부/)
assert.match(orderService.userImpact, /중복 주문/)
assert.doesNotMatch(orderService.summary, /함수 \d+개|모듈 \d+개/)
assert.ok(groupSourceTwinEntitiesByArea(fastApiManifest, pythonFiles).some((group) => group.id === 'order-processing'))
assert.ok(groupSourceTwinEntitiesBySubsystem(fastApiManifest, pythonFiles).some((group) => group.id === 'inventory-gateway'))

const referenceProfile = defineSourceProfile({
  contractVersion: SOURCE_PROFILE_CONTRACT_VERSION,
  id: 'reference-console',
  version: '1.0.0',
  sourceId: 'reference-console:source',
  label: 'Reference Console',
  projectLabel: '참조 콘솔',
  priority: 500,
  match: { requiredFiles: ['console.entry'] },
  capabilities: ['file-structure'],
  languageSupport: [],
  components: [{
    id: 'reference-component', label: 'Reference Component', kind: 'engine',
    description: '명시된 파일만 묶는 참조 Component입니다.', codeEvidence: ['console.entry'],
  }],
  fileRoles: {
    'console.entry': {
      area: 'project-foundation',
      subsystem: 'project-config',
      summary: '참조 콘솔을 시작하는 선언 파일입니다.',
      userImpact: '새 저장소 형식도 공통 스캐너를 고치지 않고 등록할 수 있음을 확인합니다.',
    },
  },
})
const referenceFiles = new Map([['console.entry', 'REFERENCE']])
const referenceManifest = buildSourceTwinManifest(referenceFiles, {
  sourceProfiles: [referenceProfile, GENERIC_SOURCE_PROFILE],
})
assert.equal(referenceManifest.source.profile.id, 'reference-console')
assert.equal(referenceManifest.entities[0].summary, '참조 콘솔을 시작하는 선언 파일입니다.')
assert.deepEqual(referenceManifest.assetHierarchy.levels, ['product-area', 'subsystem', 'component', 'module', 'code-part'])
assert.equal(referenceManifest.assetHierarchy.materialization, 'proposal-required')
assert.deepEqual(referenceManifest.assetHierarchy.components[0].moduleIds, ['file:console.entry'])

const revisedProfile = defineSourceProfile({
  ...referenceProfile,
  version: '1.0.1',
})
const revisedManifest = buildSourceTwinManifest(referenceFiles, {
  previous: referenceManifest,
  sourceProfiles: [revisedProfile, GENERIC_SOURCE_PROFILE],
})
assert.notEqual(revisedManifest.id, referenceManifest.id)
assert.notEqual(revisedManifest.fingerprints.explanations, referenceManifest.fingerprints.explanations)
assert.deepEqual(revisedManifest.changeSet.changed, [])
assert.deepEqual(revisedManifest.changeSet.explanationChanged, ['file:console.entry'])
assert.deepEqual(revisedManifest.changeSet.profileChanged, {
  before: { id: 'reference-console', version: '1.0.0' },
  after: { id: 'reference-console', version: '1.0.1' },
})

assert.throws(() => defineSourceProfile({
  contractVersion: SOURCE_PROFILE_CONTRACT_VERSION,
  id: 'invalid-profile',
  version: 'latest',
  sourceId: 'invalid:source',
  match: { fallback: true },
}), /버전이 올바르지 않습니다/)
assert.throws(() => defineSourceProfile({
  contractVersion: SOURCE_PROFILE_CONTRACT_VERSION,
  id: 'unsafe-profile',
  version: '1.0.0',
  sourceId: 'unsafe:source',
  match: { requiredFiles: ['/Users/private/source.py'] },
}), /match 경로가 올바르지 않습니다/)
assert.throws(() => defineSourceProfile({
  contractVersion: SOURCE_PROFILE_CONTRACT_VERSION,
  id: 'mixed-fallback',
  version: '1.0.0',
  sourceId: 'mixed:source',
  match: { fallback: true, packageNames: ['unexpected'] },
}), /fallback은 다른 match 조건/)
assert.throws(() => resolveSourceProfile([], {}), /일치하는 Source Profile/)
assert.ok(Object.isFrozen(DEFAULT_SOURCE_PROFILES[0]))

assert.throws(() => defineSourceProfile({
  ...referenceProfile,
  featureModel: {
    schemaVersion: 1,
    decisions: [{ scope: 'area', id: 'missing-area', classification: 'feature-asset', rationale: '존재하지 않는 분류' }],
  },
}), /분류 사전에 없습니다/)

const dishonestPythonProfile = defineSourceProfile({
  contractVersion: SOURCE_PROFILE_CONTRACT_VERSION,
  id: 'dishonest-python-profile',
  version: '1.0.0',
  sourceId: 'dishonest-python:source',
  match: { requiredFiles: ['main.py'] },
  languageSupport: [{ language: 'python', level: 'parsed' }],
})
assert.throws(() => buildSourceTwinManifest(new Map([['main.py', 'print("not parsed")\n']]), {
  sourceProfiles: [dishonestPythonProfile, GENERIC_SOURCE_PROFILE],
}), /등록된 parser가 없습니다/)

const scannerSource = await readFile(new URL('./source-twin-scanner.mjs', import.meta.url), 'utf8')
assert.doesNotMatch(scannerSource, /WORKFLOW_CANVAS_FILE_ROLES|project\.name\s*===\s*['"]workflow-canvas/)

console.log('Source Profile contract and second-software compatibility checks passed')
