import assert from 'node:assert/strict'

import { deriveSourceFeatureModel } from '../shared/sourceFeatureModel.js'
import { SOURCE_TWIN_MANIFEST } from '../shared/sourceTwinManifest.js'
import { runSourceLensWorkflow } from './source-lens-engine.mjs'

const buildSourceTwinManifest = (files, options = {}) => runSourceLensWorkflow({
  files,
  previous: options.previous,
  repository: options.repository,
  sourceProfiles: options.sourceProfiles,
}).manifest

const workflowModel = deriveSourceFeatureModel(SOURCE_TWIN_MANIFEST)
assert.deepEqual(workflowModel.summary, {
  featureAssets: 17,
  capabilities: 13,
  attributes: 22,
  ineligible: 0,
})
assert.deepEqual(
  workflowModel.candidates
    .filter((candidate) => candidate.classification === 'feature-asset' && candidate.eligible && candidate.scope === 'area')
    .map((candidate) => candidate.id),
  [
    'canvas-interface',
    'notes-content',
    'sharing-collaboration',
    'identity-profile',
    'digital-twin-engine',
    'source-code-twin',
    'ai-integration',
    'media-files',
  ],
)
assert.deepEqual(
  workflowModel.candidates
    .filter((candidate) => candidate.classification === 'feature-asset' && candidate.eligible && candidate.scope === 'subsystem')
    .map((candidate) => candidate.id),
  [
    'sharing-entry',
    'participants-presence',
    'twin-reconciliation',
    'twin-runtime',
    'work-intent-governance',
    'source-browser-history',
    'local-connector',
    'git-delivery',
    'mcp-transport',
  ],
)
const sourceCodeFeature = workflowModel.candidates.find((candidate) => candidate.key === 'area:source-code-twin')
assert.ok(sourceCodeFeature.implementations.some((item) => item.targetEntityId === 'map-component-source-feature-classifier'))
const sourceAnalysisCapability = workflowModel.candidates.find((candidate) => candidate.key === 'subsystem:source-analysis')
assert.equal(sourceAnalysisCapability.classification, 'capability')
assert.equal(sourceAnalysisCapability.ownerKey, 'area:source-code-twin')
assert.ok(workflowModel.candidates
  .flatMap((candidate) => candidate.dataAccess)
  .every((access) => ['read', 'write'].includes(access.operation)))
assert.equal(deriveSourceFeatureModel(SOURCE_TWIN_MANIFEST).fingerprint, workflowModel.fingerprint)

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
const fastApiModel = deriveSourceFeatureModel(buildSourceTwinManifest(fastApiFiles))
assert.deepEqual(fastApiModel.summary, {
  featureAssets: 4,
  capabilities: 2,
  attributes: 7,
  ineligible: 0,
})
assert.deepEqual(
  fastApiModel.candidates
    .filter((candidate) => candidate.classification === 'feature-asset' && candidate.eligible)
    .map((candidate) => candidate.key),
  ['area:service-interface', 'area:order-processing', 'area:fulfillment-integration', 'subsystem:order-workflow'],
)
assert.doesNotMatch(JSON.stringify(fastApiModel), /Workflow Canvas|canvas-interface/)

const unsupportedModel = deriveSourceFeatureModel({
  source: {
    profile: {
      id: 'unsupported-reference',
      version: '1.0.0',
      featureModel: {
        schemaVersion: 1,
        defaults: { area: 'attribute', subsystem: 'attribute' },
        decisions: [{
          scope: 'area',
          id: 'visible-area',
          classification: 'feature-asset',
          rationale: '독립 기능 후보',
        }],
        implementationRules: [],
        dataBindings: [],
      },
    },
  },
  areas: [{ id: 'visible-area', label: '보이는 기능' }],
  subsystems: [],
  entities: [{ id: 'file:feature.js', kind: 'file', path: 'feature.js', area: 'visible-area', fingerprint: '12345678' }],
  relations: [],
})
assert.equal(unsupportedModel.summary.featureAssets, 0)
assert.equal(unsupportedModel.summary.ineligible, 1)
assert.deepEqual(unsupportedModel.candidates[0].diagnostics, ['implementation_evidence_missing'])

console.log('Source feature boundary classification checks passed')
