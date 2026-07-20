import { deriveSourceFeatureModel } from '../shared/sourceFeatureModel.js'
import {
  buildFunctionalContextPack,
  parseGeneratedFunctionalContextPack,
  serializeFunctionalContextPack,
  SOURCE_FUNCTIONAL_CONTEXT_MANIFEST_PATH,
  SOURCE_FUNCTIONAL_CONTEXT_SCHEMA_VERSION,
} from '../shared/sourceFunctionalContext.js'
import {
  buildSourceTwinManifest as buildSourceAnalysisManifest,
  compareSourceTwinText,
  parseGeneratedSourceTwin,
  readSourceRepositoryMetadata,
  readSourceTwinWorkingTree,
  serializeSourceCodePartManifest,
  serializeSourceFlowManifest,
  serializeSourceTwinManifest,
  SOURCE_CODE_PART_MANIFEST_PATH,
  SOURCE_FEATURE_MANIFEST_PATH,
  SOURCE_FLOW_MANIFEST_PATH,
  SOURCE_TWIN_MANIFEST_PATH,
} from './source-twin-scanner.mjs'

export const SOURCE_LENS_ENGINE_ID = 'engine-source-lens'
export const SOURCE_LENS_ENGINE_VERSION = '0.9.0-alpha.0'
export const SOURCE_LENS_WORKFLOW_CONTRACT_VERSION = 2

export const SOURCE_LENS_WORKFLOW = Object.freeze({
  id: 'source-lens.source-analysis',
  version: '1.1.0',
  name: 'Source Analysis Workflow',
  stages: Object.freeze([
    'validate-bounded-corpus',
    'resolve-source-profile',
    'classify-and-parse-files',
    'extract-source-evidence',
    'build-asset-hierarchy-and-code-parts',
    'build-static-relations-and-flows',
    'bootstrap-functional-context',
    'resolve-feature-boundaries',
    'merge-stable-artifacts',
  ]),
})

// This is the inspectable, executable Source Lens boundary. Files outside this
// list may invoke the workflow or consume its artifacts, but they are not part
// of the Source Lens engine itself.
export const SOURCE_LENS_BOUNDARY = Object.freeze({
  publicEntrypoint: 'scripts/source-lens-engine.mjs',
  internalModules: Object.freeze([
    'scripts/source-twin-scanner.mjs',
    'scripts/source-twin-semantics.mjs',
    'scripts/source-profiles/index.mjs',
    'scripts/source-profiles/workflow-canvas.mjs',
    'scripts/source-profiles/fastapi-order-service.mjs',
    'shared/sourceProfileContract.js',
    'shared/sourceAssetHierarchy.js',
    'shared/sourceCodeParts.js',
    'shared/sourceFlows.js',
    'shared/sourceFunctionalContext.js',
    'shared/sourceFeatureModel.js',
  ]),
  excludedResponsibilities: Object.freeze([
    'repository-or-network-connection',
    'artifact-ui-projection',
    'canvas-proposal-or-materialization',
    'source-edit-or-git-write',
    'webhook-or-runtime-observation',
    'state-snapshot-approval-or-storage',
    'external-ai-explanation',
    'graphify-community-or-query',
  ]),
})

export function runSourceLensWorkflow({
  files,
  previous = null,
  previousFunctionalContextPack = null,
  repository = {},
  sourceProfiles,
  outputs = {},
  artifactAdapters = {},
} = {}) {
  const includeCodePartCatalog = outputs.codeParts === true
  const includeFlowCatalog = outputs.flows === true
  const built = buildSourceAnalysisManifest(files, {
    previous,
    repository,
    sourceProfiles,
    includeCodePartCatalog,
    includeFlowCatalog: true,
    codePartAnnotation: artifactAdapters.codePartAnnotation ?? null,
  })
  const { codePartCatalog, flowCatalog, ...manifest } = built
  const featureModel = deriveSourceFeatureModel(manifest)
  const functionalContextPack = buildFunctionalContextPack({
    files,
    manifest,
    featureModel,
    flowCatalog,
    previous: previousFunctionalContextPack,
  })
  return {
    contractVersion: SOURCE_LENS_WORKFLOW_CONTRACT_VERSION,
    engine: { id: SOURCE_LENS_ENGINE_ID, version: SOURCE_LENS_ENGINE_VERSION },
    workflow: { id: SOURCE_LENS_WORKFLOW.id, version: SOURCE_LENS_WORKFLOW.version },
    manifest,
    functionalContextPack,
    ...(outputs.featureModel === true ? { featureModel } : {}),
    ...(includeCodePartCatalog ? { codePartCatalog } : {}),
    ...(includeFlowCatalog ? { flowCatalog } : {}),
  }
}

export function runSourceLensRepositoryWorkflow({
  root,
  previous = null,
  previousFunctionalContextPack = null,
  sourceProfiles,
  outputs = {},
  artifactAdapters = {},
} = {}) {
  return runSourceLensWorkflow({
    files: readSourceTwinWorkingTree(root),
    previous,
    previousFunctionalContextPack,
    repository: readSourceRepositoryMetadata(root),
    sourceProfiles,
    outputs,
    artifactAdapters,
  })
}

// Artifact host helpers are re-exported here so callers never import the
// internal scanner directly. The generator itself is intentionally not
// imported because it performs file writes at module load time.
export {
  compareSourceTwinText,
  parseGeneratedSourceTwin,
  readSourceRepositoryMetadata,
  readSourceTwinWorkingTree,
  serializeSourceCodePartManifest,
  serializeSourceFlowManifest,
  serializeSourceTwinManifest,
  SOURCE_CODE_PART_MANIFEST_PATH,
  SOURCE_FEATURE_MANIFEST_PATH,
  SOURCE_FLOW_MANIFEST_PATH,
  SOURCE_TWIN_MANIFEST_PATH,
  parseGeneratedFunctionalContextPack,
  serializeFunctionalContextPack,
  SOURCE_FUNCTIONAL_CONTEXT_MANIFEST_PATH,
  SOURCE_FUNCTIONAL_CONTEXT_SCHEMA_VERSION,
}
