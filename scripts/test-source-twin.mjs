import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildSourceTwinManifest,
  compareSourceTwinText,
  readSourceTwinWorkingTree,
  serializeSourceTwinManifest,
  parseGeneratedSourceTwin,
} from './source-twin-scanner.mjs'
import {
  compareSourceTwinSnapshots,
  createSourceTwinSnapshot,
  SOURCE_TWIN_AUDIENCE_MODES,
  SOURCE_TWIN_OPERATION_CONFIRMATION,
  SOURCE_TWIN_SNAPSHOT_OPERATION,
  sourceTwinAudienceMode,
  sourceTwinCodeUrl,
  sourceTwinEntities,
  sourceTwinExplanationEvidence,
} from '../shared/sourceTwin.js'
import {
  groupSourceTwinEntitiesByArea,
  groupSourceTwinEntitiesBySubsystem,
} from '../shared/sourceTwinSemantics.js'
import {
  APPLY_SOURCE_TWIN_OPERATION_RPC,
  applySourceTwinSnapshotOperation,
  previewSourceTwinSnapshotOperation,
  requireSourceTwinOwner,
  sourceTwinDeploymentContext,
} from '../mcp/sourceTwinStore.js'
import {
  createSignedSystemOperationPlan,
  verifySignedSystemOperationPlan,
} from '../mcp/systemOperationPlan.js'
import {
  applyLocalGitSync as applyLocalGitSyncOperation,
  completeLocalGitSyncOperation,
  LOCAL_GIT_SYNC_CONFIRMATION,
  normalizeLocalGitSyncVerification,
  previewLocalGitSync as previewLocalGitSyncOperation,
} from '../mcp/localConnectorStore.js'
import {
  compactGitHubPush,
  sourceTwinRepositoryName,
  validGitHubSignature,
} from '../api/source-twin-webhook.js'
import {
  WORKFLOW_GIT_SYNC_EDGE_ID,
  WORKFLOW_SOURCE_TWIN_PART_REFS,
  workflowSourceTwinEntryForEdgeOperation,
  workflowSourceTwinEntryForNode,
  workflowSourceTwinEntryForPart,
  WORKFLOW_SOURCE_TWIN_NODE_IDS,
} from '../shared/workflowSourceTwinCanvas.js'
import { SOURCE_TWIN_MANIFEST } from '../shared/sourceTwinManifest.js'
import { sourceComponentsForSubsystem, sourceEntityIsModuleAsset } from '../shared/sourceAssetHierarchy.js'
import {
  WORKFLOW_GIT_SYNC_OPERATION_DEFINITION,
  WORKFLOW_SOURCE_SNAPSHOT_OPERATION_DEFINITION,
} from '../shared/workflowOperationDefinitions.js'
import {
  compareLocalAndDeployedManifests,
  localConnectorConnectionState,
  localGitSyncEdgePresentation,
  localConnectorShellCommand,
  localGitSyncDecision,
  normalizeLocalSourceManifest,
  sortLocalConnectorsForDisplay,
} from '../shared/localConnector.js'

const repository = {
  repositoryUrl: 'https://github.com/example/workflow-canvas',
  defaultBranch: 'main',
}

assert.deepEqual(WORKFLOW_SOURCE_TWIN_NODE_IDS, ['map-local-repo', 'map-github', 'map-vercel'])
assert.equal(workflowSourceTwinEntryForNode('map-local-repo').view, 'structure')
assert.equal(workflowSourceTwinEntryForNode('map-github').view, 'github-code')
assert.equal(workflowSourceTwinEntryForNode('map-vercel').view, 'history')
assert.equal(workflowSourceTwinEntryForNode('map-web-app'), null)
assert.equal(workflowSourceTwinEntryForPart('map-local-repo', WORKFLOW_SOURCE_TWIN_PART_REFS.localCode).view, 'structure')
assert.equal(workflowSourceTwinEntryForPart('map-github', WORKFLOW_SOURCE_TWIN_PART_REFS.githubCode).view, 'github-code')
assert.equal(workflowSourceTwinEntryForPart('map-github', WORKFLOW_SOURCE_TWIN_PART_REFS.githubChanges).view, 'changes')
assert.equal(workflowSourceTwinEntryForPart('map-vercel', WORKFLOW_SOURCE_TWIN_PART_REFS.vercelHistory).view, 'history')
assert.equal(workflowSourceTwinEntryForPart('map-web-app', WORKFLOW_SOURCE_TWIN_PART_REFS.localCode), null)
assert.equal(workflowSourceTwinEntryForEdgeOperation(WORKFLOW_GIT_SYNC_EDGE_ID).focus, 'git-sync')
assert.equal(workflowSourceTwinEntryForEdgeOperation('map-edge-github-vercel'), null)
assert.deepEqual(localGitSyncEdgePresentation({ action: 'push' }), {
  action: 'push', direction: 'local-to-github', icon: '→',
  tooltip: 'GitHub 코드를 로컬 코드에 맞춰 동기화합니다. 클릭하면 실행 전 계획을 엽니다.',
})
assert.equal(localGitSyncEdgePresentation({ action: 'pull_ff_only' }).direction, 'github-to-local')
assert.equal(localGitSyncEdgePresentation({ action: 'noop' }).icon, '✓')
assert.equal(SOURCE_TWIN_MANIFEST.changeSet.initialBaseline, false, 'generated source history must keep the committed parent manifest')
assert.equal(SOURCE_TWIN_MANIFEST.assetHierarchy.schemaVersion, 1)
assert.equal(SOURCE_TWIN_MANIFEST.assetHierarchy.materialization, 'proposal-required')
assert.ok(SOURCE_TWIN_MANIFEST.assetHierarchy.components.some((item) => item.id === 'engine-source-lens'))
assert.ok(SOURCE_TWIN_MANIFEST.assetHierarchy.components.some((item) => item.id === 'component-source-component-mapper'))
assert.equal(sourceEntityIsModuleAsset(SOURCE_TWIN_MANIFEST, SOURCE_TWIN_MANIFEST.entities.find((item) => item.kind === 'file')), true)
const sourceLensComponent = SOURCE_TWIN_MANIFEST.assetHierarchy.components.find((item) => item.id === 'engine-source-lens')
assert.ok(sourceComponentsForSubsystem(SOURCE_TWIN_MANIFEST, sourceLensComponent.area, sourceLensComponent.subsystem, SOURCE_TWIN_MANIFEST.entities).some((item) => item.id === 'engine-source-lens'))
assert.ok(SOURCE_TWIN_MANIFEST.assetHierarchy.components.find((item) => item.id === 'component-source-code-part-translator').moduleIds.includes('file:shared/sourceCodeParts.js'))
assert.ok(SOURCE_TWIN_MANIFEST.assetHierarchy.components.find((item) => item.id === 'component-source-flow-discovery').moduleIds.includes('file:shared/sourceFlows.js'))
assert.ok(SOURCE_TWIN_MANIFEST.assetHierarchy.components.find((item) => item.id === 'component-source-ai-explanation').moduleIds.includes('file:shared/sourceAiExplanation.js'))
assert.ok(SOURCE_TWIN_MANIFEST.assetHierarchy.components.find((item) => item.id === 'component-source-roundtrip-editor').moduleIds.includes('file:shared/workflowSourceEditableProperties.js'))

const connectorNow = Date.parse('2026-07-15T08:00:00.000Z')
const waitingConnector = { id: 'waiting', createdAt: '2026-07-15T07:59:00.000Z', lastSeenAt: null }
const offlineConnector = { id: 'offline', createdAt: '2026-07-15T07:00:00.000Z', lastSeenAt: '2026-07-15T07:30:00.000Z' }
const onlineConnector = { id: 'online', createdAt: '2026-07-14T07:00:00.000Z', lastSeenAt: '2026-07-15T07:59:50.000Z' }
assert.equal(localConnectorConnectionState(waitingConnector, connectorNow), 'waiting')
assert.equal(localConnectorConnectionState(offlineConnector, connectorNow), 'offline')
assert.equal(localConnectorConnectionState(onlineConnector, connectorNow), 'online')
assert.deepEqual(
  sortLocalConnectorsForDisplay([waitingConnector, offlineConnector, onlineConnector], connectorNow).map((item) => item.id),
  ['online', 'offline', 'waiting'],
  'the currently connected registration must appear before stale duplicate-looking records',
)

const fixtureEntries = [
  ['package.json', JSON.stringify({ scripts: { build: 'vite build', test: 'node scripts/test-sample.mjs' } }, null, 2)],
  ['api/example.js', `
import { helper } from '../src/helper.js'
export async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'literal-secret-must-not-appear'
  const body = Buffer.from('{"zen":"source twin"}')
  await db.from('canvases').select('id')
  await db.from('source_events').insert({ id: serviceKey.length })
  await db.rpc('get_operational_state')
  return helper(req, res, body)
}
`],
  ['src/helper.js', `
export function helper(req, res) {
  fetch('/api/runtime')
  return res.status(200).json({ ok: true })
}
`],
  ['scripts/test-sample.mjs', 'export const testValue = () => true\n'],
  ['supabase-example.sql', `
create table if not exists public.source_events (id bigint primary key);
alter table public.source_events enable row level security;
create policy "owner reads source events" on public.source_events for select using (true);
create or replace function public.get_operational_state() returns jsonb language sql as $$ select '{}'::jsonb $$;
`],
  ['vercel.json', '{"rewrites":[]}'],
]

const manifest = buildSourceTwinManifest(new Map(fixtureEntries), { repository })
const reversed = buildSourceTwinManifest(new Map([...fixtureEntries].reverse()), { repository })

assert.deepEqual(
  ['a', '_', 'Z', '10', '-'].sort(compareSourceTwinText),
  ['-', '10', 'Z', '_', 'a'],
  'source twin sorting must use locale-independent code-point order',
)
assert.equal(manifest.id, reversed.id, 'file iteration order must not affect the manifest')
assert.deepEqual(manifest.entities, reversed.entities, 'entities must be deterministic')
assert.deepEqual(manifest.relations, reversed.relations, 'relations must be deterministic')
assert.equal(manifest.summary.parseFailures, 0)
assert.ok(manifest.areas.length > 0)
assert.ok(manifest.subsystems.length > 0)
assert.ok(manifest.entities.some((entity) => entity.id === 'function:api/example.js:handler'))
assert.ok(manifest.entities.some((entity) => entity.id === 'api:/api/example'))
assert.ok(manifest.entities.some((entity) => entity.id === 'db-table:source_events'))
assert.ok(!manifest.entities.some((entity) => entity.id === 'db-table:{"zen":"source twin"}'))
assert.ok(manifest.entities.some((entity) => entity.id === 'db-function:get_operational_state'))
assert.ok(manifest.entities.some((entity) => entity.id === 'env:SUPABASE_SERVICE_ROLE_KEY'))
assert.ok(manifest.entities.some((entity) => entity.kind === 'rls-policy'))
assert.ok(manifest.relations.some((relation) => relation.type === 'imports'))
assert.ok(manifest.relations.some((relation) => relation.type === 'calls-api'))
assert.ok(manifest.relations.some((relation) => relation.type === 'accesses' && relation.operations.includes('write')))
assert.equal(manifest.source.contentIncluded, false)
assert.equal(manifest.source.credentialValuesIncluded, false)
assert.doesNotMatch(JSON.stringify(manifest), /literal-secret-must-not-appear/)
assert.deepEqual(Object.keys(SOURCE_TWIN_AUDIENCE_MODES), ['easy', 'developer'])
assert.equal(sourceTwinAudienceMode('developer'), 'developer')
assert.equal(sourceTwinAudienceMode('unknown'), 'easy')
const exampleFile = manifest.entities.find((entity) => entity.id === 'file:api/example.js')
const exampleHandler = manifest.entities.find((entity) => entity.id === 'function:api/example.js:handler')
assert.ok(exampleFile.area)
assert.ok(exampleFile.subsystem)
assert.match(exampleFile.summary, /브라우저 요청|\/api\/example/)
assert.match(exampleFile.userImpact, /권한|화면/)
assert.match(exampleFile.technicalSummary, /함수 1개/)
assert.equal(exampleFile.explanationBasis.method, 'deterministic-source-rule')
assert.ok(exampleFile.explanationBasis.refs.some((ref) => ref.startsWith('source:api/example.js#L1-L')))
assert.ok(exampleFile.explanationBasis.refs.includes('api:/api/example'))
const exampleEvidence = sourceTwinExplanationEvidence(exampleFile)
assert.match(exampleEvidence.methodLabel, /구조|참조/)
assert.ok(exampleEvidence.refs.some((item) => item.kind === 'source' && item.label.includes('api/example.js')))
assert.doesNotMatch(exampleFile.summary, /함수 \d+개|모듈 \d+개/)
assert.match(exampleHandler.summary, /로그인|입력/)
assert.equal(exampleHandler.explanationBasis.method, 'symbol-and-source-range')
assert.ok(exampleHandler.explanationBasis.refs.some((ref) => ref.startsWith('source:api/example.js#L')))
assert.doesNotMatch(exampleHandler.summary, /handler을\(를\) 처리/)
assert.ok(manifest.entities.every((entity) => entity.explanationBasis?.method && entity.explanationBasis.refs.length > 0))
const groupedFixtureEntities = groupSourceTwinEntitiesByArea(manifest, sourceTwinEntities(manifest, { perspective: 'functionality' }))
assert.ok(groupedFixtureEntities.length > 0)
assert.ok(groupedFixtureEntities.every((group) => group.label && group.description && group.entities.length))

const workflowCanvasSemanticManifest = buildSourceTwinManifest(new Map([
  ['package.json', JSON.stringify({ name: 'workflow-canvas' })],
  ['src/App.jsx', 'export default function App() { return null }\n'],
  ['src/components/SourceTwinPanel.jsx', 'export function SourceTwinPanel() { return null }\n'],
  ['shared/twinBuild.js', 'export function normalizeTwinBuild() { return null }\n'],
  ['shared/twinBuildReconciler.js', 'export function reconcileTwinBuild() { return null }\n'],
  ['shared/twinBuildCanvas.js', 'export function materializeTwinBuildEntity() { return null }\n'],
  ['shared/systemRuntime.js', 'export function normalizeSystemRuntimeResult() { return null }\n'],
  ['shared/workflowSystemTwinAdapter.js', 'export function inspectWorkflowSystemTwin() { return null }\n'],
  ['shared/workOntology.js', 'export function normalizeWorkDefinition() { return null }\n'],
  ['src/components/IntentWorkspace.jsx', 'export default function IntentWorkspace() { return null }\n'],
]))
assert.equal(workflowCanvasSemanticManifest.source.profile.id, 'workflow-canvas')
assert.equal(workflowCanvasSemanticManifest.source.profile.version, '0.7.0')
const appSemanticEntity = workflowCanvasSemanticManifest.entities.find((entity) => entity.id === 'file:src/App.jsx')
const sourcePanelSemanticEntity = workflowCanvasSemanticManifest.entities.find((entity) => entity.id === 'file:src/components/SourceTwinPanel.jsx')
assert.equal(appSemanticEntity.area, 'canvas-interface')
assert.match(appSemanticEntity.summary, /노드·연결선 편집/)
assert.equal(appSemanticEntity.explanationBasis.method, 'curated-product-profile')
assert.equal(sourcePanelSemanticEntity.area, 'source-code-twin')
assert.match(sourcePanelSemanticEntity.summary, /코드 트리/)
assert.match(sourcePanelSemanticEntity.userImpact, /비개발자/)
const workflowEngineFiles = workflowCanvasSemanticManifest.entities.filter((entity) => entity.kind === 'file' && entity.area === 'digital-twin-engine')
const workflowEngineSubsystems = groupSourceTwinEntitiesBySubsystem(workflowCanvasSemanticManifest, workflowEngineFiles)
assert.deepEqual(workflowEngineSubsystems.map((group) => group.id), [
  'twin-core',
  'twin-reconciliation',
  'twin-materialization',
  'twin-runtime',
  'twin-workflow-adapter',
  'work-intent-governance',
])
assert.ok(workflowEngineSubsystems.every((group) => group.label && group.description && group.entities.length >= 1))
const workIntentSubsystem = workflowEngineSubsystems.find((group) => group.id === 'work-intent-governance')
assert.equal(workIntentSubsystem.entities.length, 2)
assert.ok(workIntentSubsystem.entities.every((entity) => entity.explanationBasis.method === 'curated-product-profile'))

const generated = serializeSourceTwinManifest(manifest)
assert.deepEqual(parseGeneratedSourceTwin(generated), manifest, 'generated manifest must round-trip')

const changedFiles = new Map(fixtureEntries)
changedFiles.set('src/helper.js', `${changedFiles.get('src/helper.js')}\nexport const secondHelper = () => 2\n`)
const changedManifest = buildSourceTwinManifest(changedFiles, { previous: manifest, repository })
assert.equal(changedManifest.changeSet.initialBaseline, false)
assert.ok(changedManifest.changeSet.changedPaths.includes('src/helper.js'))
assert.ok(changedManifest.changeSet.added.includes('function:src/helper.js:secondHelper'))

const localManifest = normalizeLocalSourceManifest({
  ...changedManifest,
  source: { ...changedManifest.source, label: 'actual-local-repo' },
  content: 'source-body-must-not-survive',
  entities: changedManifest.entities.map((entity) => ({
    ...entity,
    content: 'source-body-must-not-survive',
    ...(entity.id === exampleFile.id ? {
      explanationBasis: {
        ...entity.explanationBasis,
        refs: [
          ...entity.explanationBasis.refs,
          'source:/Users/private/project.js#L1',
          'dependency:../private-package',
          'env:SUPABASE_SERVICE_ROLE_KEY=literal-secret',
        ],
      },
    } : {}),
  })),
})
assert.ok(localManifest)
assert.equal(localManifest.source.label, 'actual-local-repo')
assert.equal(localManifest.source.profile.id, changedManifest.source.profile.id)
assert.equal(localManifest.source.profile.version, changedManifest.source.profile.version)
assert.doesNotMatch(JSON.stringify(localManifest), /source-body-must-not-survive/)
assert.doesNotMatch(JSON.stringify(localManifest), /\/Users\/private|\.\.\/private-package|literal-secret/)
assert.ok(localManifest.perspectives.code.length > 0)
assert.equal(localManifest.entities.find((entity) => entity.id === exampleFile.id)?.area, exampleFile.area)
assert.equal(localManifest.entities.find((entity) => entity.id === exampleFile.id)?.subsystem, exampleFile.subsystem)
assert.equal(localManifest.entities.find((entity) => entity.id === exampleFile.id)?.userImpact, exampleFile.userImpact)
assert.match(localManifest.entities.find((entity) => entity.id === exampleFile.id)?.technicalSummary ?? '', /함수 1개/)
assert.deepEqual(
  localManifest.entities.find((entity) => entity.id === exampleFile.id)?.explanationBasis,
  exampleFile.explanationBasis,
)
assert.ok(localManifest.areas.some((area) => area.id === exampleFile.area))
assert.ok(localManifest.subsystems.some((subsystem) => subsystem.id === exampleFile.subsystem))
const localDifference = compareLocalAndDeployedManifests(manifest, localManifest)
assert.ok(localDifference.summary.added + localDifference.summary.changed > 0)
assert.equal(localDifference.inSync, false)
const cleanGit = {
  branch: 'main', headSha: 'a'.repeat(40), upstreamRef: 'origin/main', upstreamSha: 'b'.repeat(40),
  originFingerprint: 'c'.repeat(64), ahead: 1, behind: 0, dirty: 0, syncEnabled: true,
  changedPaths: [], fetchStatus: 'ok',
}
assert.equal(localGitSyncDecision(cleanGit).action, 'push')
assert.equal(localGitSyncDecision({ ...cleanGit, syncEnabled: false }).action, 'blocked')
assert.equal(localGitSyncDecision({ ...cleanGit, originFingerprint: '' }).action, 'blocked')
assert.equal(localGitSyncDecision({ ...cleanGit, ahead: 0, behind: 2 }).action, 'pull_ff_only')
assert.equal(localGitSyncDecision({ ...cleanGit, dirty: 1 }).action, 'blocked')
assert.equal(localGitSyncDecision({ ...cleanGit, ahead: 2, behind: 2 }).action, 'blocked')
assert.equal(localGitSyncDecision({ ...cleanGit, upstreamRef: 'fork/main' }).action, 'blocked')
assert.equal(localGitSyncDecision({ ...cleanGit, upstreamRef: 'origin/release' }).action, 'blocked')
const verifiedGitState = {
  status: 'verified',
  branch: cleanGit.branch,
  headSha: 'd'.repeat(40),
  upstreamRef: cleanGit.upstreamRef,
  upstreamSha: 'd'.repeat(40),
  originFingerprint: cleanGit.originFingerprint,
  ahead: 0,
  behind: 0,
  dirty: 0,
}
assert.equal(normalizeLocalGitSyncVerification(verifiedGitState, cleanGit)?.status, 'verified')
assert.equal(normalizeLocalGitSyncVerification({ ...verifiedGitState, behind: 1 }, cleanGit), null)
assert.equal(normalizeLocalGitSyncVerification({ ...verifiedGitState, branch: 'other' }, cleanGit), null)
const localConnectorToken = `wclc_${'a'.repeat(64)}`
assert.equal(
  localConnectorShellCommand({
    token: localConnectorToken,
    serverUrl: 'https://workflow.example.com/source?ignored=yes',
    repositoryPath: '~/workflow-canvas',
  }),
  `cd "$HOME"/'workflow-canvas' && WORKFLOW_CANVAS_LOCAL_CONNECTOR_TOKEN='${localConnectorToken}' npm run local-connector -- --server 'https://workflow.example.com' --repo .`,
)
assert.match(localConnectorShellCommand({
  token: localConnectorToken,
  serverUrl: 'https://workflow.example.com',
  repositoryPath: "/Users/example/Client's Project",
}), /^cd '\/Users\/example\/Client'"'"'s Project' && /)
assert.match(localConnectorShellCommand({
  token: localConnectorToken,
  serverUrl: 'https://workflow.example.com',
  allowGitSync: true,
}), / --allow-git-sync$/)
assert.match(localConnectorShellCommand({
  token: localConnectorToken,
  serverUrl: 'https://workflow.example.com',
  allowSourceWrite: true,
}), / --allow-source-write$/)
assert.match(localConnectorShellCommand({
  token: localConnectorToken,
  serverUrl: 'https://workflow.example.com',
  allowGitSync: true,
  allowSourceWrite: true,
}), / --allow-git-sync --allow-source-write$/)
assert.equal(localConnectorShellCommand({ token: 'exposed-token', serverUrl: 'https://workflow.example.com' }), '')
assert.equal(localConnectorShellCommand({ token: localConnectorToken, serverUrl: 'http://remote.example.com' }), '')

const codeEntity = sourceTwinEntities(manifest, { perspective: 'code', query: 'handler' })[0]
assert.equal(
  sourceTwinCodeUrl(manifest, codeEntity, 'a'.repeat(40)),
  'https://github.com/example/workflow-canvas/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/api/example.js#L3',
)
assert.equal(sourceTwinEntities(manifest, { perspective: 'database' }).some((entity) => entity.id === 'db-table:source_events'), true)

const snapshotA = createSourceTwinSnapshot({
  manifest,
  capturedAt: '2026-07-15T01:00:00.000Z',
  reason: 'deployment',
  deployment: { commitSha: 'a'.repeat(40), environment: 'production' },
  operations: { metrics: { canvasCount: 2 } },
})
const repeatedDeployment = createSourceTwinSnapshot({
  manifest,
  capturedAt: '2026-07-15T02:00:00.000Z',
  reason: 'deployment',
  deployment: { commitSha: 'a'.repeat(40), environment: 'production' },
  operations: { metrics: { canvasCount: 9 } },
})
assert.equal(snapshotA.snapshotKey, repeatedDeployment.snapshotKey, 'one deployment must produce one baseline key')

const snapshotB = createSourceTwinSnapshot({
  manifest: changedManifest,
  capturedAt: '2026-07-15T03:00:00.000Z',
  reason: 'manual',
  deployment: { commitSha: 'b'.repeat(40), environment: 'production' },
  operations: { metrics: { canvasCount: 4 } },
})
const comparison = compareSourceTwinSnapshots(snapshotA, snapshotB)
assert.ok(comparison.summary.changedSections >= 2)
assert.ok(comparison.summary.addedEntities >= 1)
assert.deepEqual(comparison.metrics.find((item) => item.key === 'canvasCount'), {
  key: 'canvasCount', before: 2, after: 4, delta: 2,
})

const operationIdA = `op-${'1'.repeat(64)}`
const operationIdB = `op-${'2'.repeat(64)}`
const approvedSnapshotA = createSourceTwinSnapshot({
  manifest,
  capturedAt: '2026-07-15T03:30:00.000Z',
  reason: 'manual',
  operationId: operationIdA,
  deployment: { commitSha: 'b'.repeat(40), environment: 'production' },
})
const approvedSnapshotB = createSourceTwinSnapshot({
  manifest,
  capturedAt: '2026-07-15T03:30:00.000Z',
  reason: 'manual',
  operationId: operationIdB,
  deployment: { commitSha: 'b'.repeat(40), environment: 'production' },
})
assert.equal(approvedSnapshotA.operationId, operationIdA)
assert.notEqual(approvedSnapshotA.snapshotKey, approvedSnapshotB.snapshotKey, 'each approved operation needs its own snapshot key')

const operationSecret = 'operation-test-secret-'.repeat(3)
const operationNow = new Date('2026-07-15T04:00:00.000Z')
const operationDefinition = {
  operation: SOURCE_TWIN_SNAPSHOT_OPERATION,
  actorId: 'owner-user-id',
  targetKey: 'workflow-canvas:self-source',
  stateFingerprint: 'a'.repeat(64),
  confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  scope: { sections: ['code', 'database'] },
  writeSet: [{ resource: 'source_twin_snapshots', operation: 'insert', maximumRows: 1 }],
  excludes: ['source-content', 'credential-values'],
  recovery: { strategy: 'append-only-evidence' },
}
const signedOperation = createSignedSystemOperationPlan(operationDefinition, operationSecret, { now: operationNow })
assert.match(signedOperation.publicPlan.id, /^op-[a-f0-9]{64}$/)
assert.equal(signedOperation.publicPlan.confirmation, SOURCE_TWIN_OPERATION_CONFIRMATION)
assert.deepEqual(signedOperation.publicPlan.writeSet, operationDefinition.writeSet)
assert.equal(verifySignedSystemOperationPlan(signedOperation.token, operationSecret, {
  actorId: 'owner-user-id',
  operation: SOURCE_TWIN_SNAPSHOT_OPERATION,
  confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  now: new Date('2026-07-15T04:00:30.000Z'),
}).id, signedOperation.publicPlan.id)
const [encodedPlan, planSignature] = signedOperation.token.split('.')
const changedSignature = `${planSignature[0] === 'a' ? 'b' : 'a'}${planSignature.slice(1)}`
assert.throws(() => verifySignedSystemOperationPlan(`${encodedPlan}.${changedSignature}`, operationSecret, {
  actorId: 'owner-user-id',
  operation: SOURCE_TWIN_SNAPSHOT_OPERATION,
  confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  now: operationNow,
}), (error) => error.code === 'OPERATION_PLAN_TAMPERED')
assert.throws(() => verifySignedSystemOperationPlan(signedOperation.token, operationSecret, {
  actorId: 'different-user-id',
  operation: SOURCE_TWIN_SNAPSHOT_OPERATION,
  confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  now: operationNow,
}), (error) => error.code === 'OPERATION_ACTOR_MISMATCH')
assert.throws(() => verifySignedSystemOperationPlan(signedOperation.token, operationSecret, {
  actorId: 'owner-user-id',
  operation: SOURCE_TWIN_SNAPSHOT_OPERATION,
  confirmation: 'UNAPPROVED',
  now: operationNow,
}), (error) => error.code === 'OPERATION_CONFIRMATION_REQUIRED')
assert.throws(() => verifySignedSystemOperationPlan(signedOperation.token, operationSecret, {
  actorId: 'owner-user-id',
  operation: SOURCE_TWIN_SNAPSHOT_OPERATION,
  confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  now: new Date('2026-07-15T04:06:00.000Z'),
}), (error) => error.code === 'OPERATION_PLAN_EXPIRED')

const localConnectorRow = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'owner-user-id',
  token_prefix: 'wclc_1234567',
  label: 'Test Mac',
  repository_label: 'workflow-canvas',
  repository_url: repository.repositoryUrl,
  manifest: localManifest,
  manifest_id: localManifest.id,
  git_state: cleanGit,
  state_fingerprint: 'b'.repeat(64),
  agent_version: '1.0.0',
  last_seen_at: operationNow.toISOString(),
  revoked_at: null,
  created_at: operationNow.toISOString(),
}
const localConnectorWrites = []
const localConnectorDb = {
  from(table) {
    if (table === 'local_connectors') {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({ data: localConnectorRow, error: null }),
      }
      return query
    }
    return {
      insert: async (row) => {
        localConnectorWrites.push({ table, row })
        return { data: row, error: null }
      },
    }
  },
}
const localSyncPreview = await previewLocalGitSyncOperation(localConnectorDb, {
  userId: 'owner-user-id',
  connectorId: localConnectorRow.id,
  env: { SUPABASE_SERVICE_ROLE_KEY: operationSecret },
  now: operationNow,
})
assert.equal(localSyncPreview.decision.action, 'push')
assert.equal(localSyncPreview.plan.scope.action, 'push')
assert.equal(localSyncPreview.plan.contract.definitionId, WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.id)
assert.equal(localSyncPreview.plan.contract.definitionFingerprint, WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.fingerprint)
assert.equal(localSyncPreview.plan.contract.initiatorKind, 'human_ui')
assert.equal(localConnectorWrites.length, 0, 'local sync preview must not queue or mutate anything')
const localSyncApplied = await applyLocalGitSyncOperation(localConnectorDb, {
  userId: 'owner-user-id',
  connectorId: localConnectorRow.id,
  planToken: localSyncPreview.plan_token,
  confirmation: LOCAL_GIT_SYNC_CONFIRMATION,
  env: { SUPABASE_SERVICE_ROLE_KEY: operationSecret },
  now: new Date('2026-07-15T04:00:30.000Z'),
})
assert.equal(localSyncApplied.queued, true)
assert.deepEqual(localConnectorWrites.map((write) => write.table), [
  'local_connector_operations',
  'local_connector_operation_events',
])
assert.equal(localConnectorWrites[0].row.action, 'push')
assert.equal(localConnectorWrites[0].row.expected_state.originFingerprint, cleanGit.originFingerprint)
assert.equal(localConnectorWrites[0].row.expected_state.syncEnabled, true)
const staleLocalPreview = await previewLocalGitSyncOperation(localConnectorDb, {
  userId: 'owner-user-id',
  connectorId: localConnectorRow.id,
  env: { SUPABASE_SERVICE_ROLE_KEY: operationSecret },
  now: operationNow,
})
localConnectorRow.state_fingerprint = 'c'.repeat(64)
await assert.rejects(() => applyLocalGitSyncOperation(localConnectorDb, {
  userId: 'owner-user-id',
  connectorId: localConnectorRow.id,
  planToken: staleLocalPreview.plan_token,
  confirmation: LOCAL_GIT_SYNC_CONFIRMATION,
  env: { SUPABASE_SERVICE_ROLE_KEY: operationSecret },
  now: new Date('2026-07-15T04:00:30.000Z'),
}), (error) => error.code === 'LOCAL_GIT_STATE_CHANGED')
localConnectorRow.state_fingerprint = 'b'.repeat(64)

function localCompletionDb(expectedState, action = 'push') {
  const writes = []
  return {
    writes,
    from(table) {
      if (table === 'local_connector_operations') {
        let update = null
        const query = {
          select: () => query,
          eq: () => query,
          update: (value) => {
            update = value
            writes.push({ table, row: value })
            return query
          },
          maybeSingle: async () => ({
            data: update ? { operation_id: `op-${'9'.repeat(64)}` } : { action, expected_state: expectedState },
            error: null,
          }),
        }
        return query
      }
      return {
        insert: async (row) => {
          writes.push({ table, row })
          return { data: row, error: null }
        },
      }
    },
  }
}

const completionConnector = { id: localConnectorRow.id, user_id: 'owner-user-id' }
const completionPayload = {
  operationId: `op-${'9'.repeat(64)}`,
  status: 'succeeded',
  result: {
    summary: 'Git 명령 완료',
    beforeHeadSha: cleanGit.headSha,
    afterHeadSha: verifiedGitState.headSha,
    remoteSha: verifiedGitState.upstreamSha,
    verification: verifiedGitState,
  },
}
const verifiedCompletionDb = localCompletionDb(cleanGit)
const verifiedCompletion = await completeLocalGitSyncOperation(verifiedCompletionDb, completionConnector, completionPayload)
assert.equal(verifiedCompletion.status, 'succeeded')
assert.equal(verifiedCompletionDb.writes[0].row.status, 'succeeded')
assert.equal(verifiedCompletionDb.writes[0].row.result.verification.status, 'verified')

const unverifiedCompletionDb = localCompletionDb(cleanGit)
const unverifiedCompletion = await completeLocalGitSyncOperation(unverifiedCompletionDb, completionConnector, {
  ...completionPayload,
  result: { ...completionPayload.result, verification: null },
})
assert.equal(unverifiedCompletion.status, 'failed')
assert.equal(unverifiedCompletionDb.writes[0].row.status, 'failed')
assert.match(unverifiedCompletionDb.writes[0].row.result.summary, /검증에 실패/)

let operationalCanvasCount = 2
let appliedOperation = null
const readResult = (data = []) => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: async () => ({ data, error: null }),
  }
  return builder
}
const operationDb = {
  from: () => readResult([]),
  rpc: async (name, args) => {
    if (name === APPLY_SOURCE_TWIN_OPERATION_RPC) {
      appliedOperation = args
      return {
        data: [{
          result_created: true,
          result_snapshot_id: args.p_snapshot_id,
          result_manifest_id: args.p_manifest_id,
          result_commit_sha: args.p_commit_sha,
          result_captured_at: args.p_captured_at,
          result_reason: args.p_reason,
        }],
        error: null,
      }
    }
    return { data: [{ canvas_count: operationalCanvasCount }], error: null }
  },
}
const operationEnvironment = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_SHA: 'f'.repeat(40),
  VERCEL_PROJECT_PRODUCTION_URL: 'canvas.example.com',
}
const operationPreview = await previewSourceTwinSnapshotOperation(operationDb, {
  actorUserId: 'owner-user-id',
  env: operationEnvironment,
  now: operationNow,
  secret: operationSecret,
})
assert.equal(operationPreview.writes_performed, false)
assert.equal(operationPreview.plan_record_written, false)
assert.equal(operationPreview.plan.contract.definitionId, WORKFLOW_SOURCE_SNAPSHOT_OPERATION_DEFINITION.id)
assert.equal(operationPreview.plan.contract.definitionFingerprint, WORKFLOW_SOURCE_SNAPSHOT_OPERATION_DEFINITION.fingerprint)
assert.equal(operationPreview.plan.contract.initiatorKind, 'ai_agent')
assert.equal(appliedOperation, null, 'preview must not call the write RPC')
assert.deepEqual(operationPreview.plan.writeSet.map((write) => write.maximumRows), [1, 1])
const appliedSnapshot = await applySourceTwinSnapshotOperation(operationDb, {
  actorUserId: 'owner-user-id',
  planToken: operationPreview.plan_token,
  confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  env: operationEnvironment,
  now: new Date('2026-07-15T04:01:00.000Z'),
  secret: operationSecret,
})
assert.equal(appliedSnapshot.writes_performed, true)
assert.equal(appliedSnapshot.audit_recorded, true)
assert.equal(appliedOperation.p_operation_id, operationPreview.plan.id)
assert.equal(appliedOperation.p_snapshot.operationId, operationPreview.plan.id)
assert.equal(appliedOperation.p_actor_user_id, 'owner-user-id')

const stalePreview = await previewSourceTwinSnapshotOperation(operationDb, {
  actorUserId: 'owner-user-id',
  env: operationEnvironment,
  now: operationNow,
  secret: operationSecret,
})
operationalCanvasCount = 3
appliedOperation = null
await assert.rejects(() => applySourceTwinSnapshotOperation(operationDb, {
  actorUserId: 'owner-user-id',
  planToken: stalePreview.plan_token,
  confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  env: operationEnvironment,
  now: new Date('2026-07-15T04:01:00.000Z'),
  secret: operationSecret,
}), (error) => error.code === 'OPERATION_PLAN_STALE')
assert.equal(appliedOperation, null, 'stale plans must fail before the write RPC')

assert.equal(requireSourceTwinOwner('owner', 'owner'), 'owner')
assert.throws(() => requireSourceTwinOwner('viewer', 'owner'), /제품 소유자만/)
assert.throws(() => requireSourceTwinOwner('owner', ''), /운영자 설정/)
assert.deepEqual(sourceTwinDeploymentContext({
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_PROJECT_PRODUCTION_URL: 'https://canvas.example.com/',
  VERCEL_GIT_COMMIT_SHA: 'c'.repeat(40),
}), {
  provider: 'vercel',
  environment: 'production',
  commitSha: 'c'.repeat(40),
  commitRef: '',
  deploymentId: '',
  region: '',
  host: 'canvas.example.com',
})

const body = Buffer.from('{"zen":"source twin"}')
const secret = 'webhook-test-secret'
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
assert.equal(validGitHubSignature(body, signature, secret), true)
assert.equal(validGitHubSignature(body, signature.replace(/.$/, '0'), secret), false)
assert.equal(validGitHubSignature(body, signature, ''), false)

const compact = compactGitHubPush({
  ref: 'refs/heads/main',
  before: 'd'.repeat(40),
  after: 'e'.repeat(40),
  repository: { full_name: 'example/workflow-canvas', private: true },
  commits: [{
    id: 'e'.repeat(40),
    message: 'Update API',
    timestamp: '2026-07-15T01:00:00Z',
    added: ['src/new.js'],
    modified: ['api/example.js'],
    removed: [],
    author: { email: 'not-stored@example.com' },
  }],
}, 'delivery-1234')
assert.deepEqual(compact.changedPaths, ['api/example.js', 'src/new.js'])
assert.doesNotMatch(JSON.stringify(compact), /not-stored@example\.com|"private"/)
assert.doesNotMatch(JSON.stringify(compact), /Update API/)
assert.equal(sourceTwinRepositoryName(manifest), 'example/workflow-canvas')

const noGitRoot = await mkdtemp(path.join(tmpdir(), 'source-twin-no-git-'))
try {
  await mkdir(path.join(noGitRoot, 'src'), { recursive: true })
  await mkdir(path.join(noGitRoot, 'node_modules', 'ignored'), { recursive: true })
  await mkdir(path.join(noGitRoot, 'dist'), { recursive: true })
  await writeFile(path.join(noGitRoot, 'package.json'), '{"name":"no-git"}\n')
  await writeFile(path.join(noGitRoot, 'src', 'app.js'), 'export const app = () => true\n')
  await writeFile(path.join(noGitRoot, 'node_modules', 'ignored', 'secret.js'), 'doNotScan()\n')
  await writeFile(path.join(noGitRoot, 'dist', 'bundle.js'), 'doNotScan()\n')
  const noGitFiles = readSourceTwinWorkingTree(noGitRoot)
  assert.deepEqual([...noGitFiles.keys()], ['package.json', 'src/app.js'])
} finally {
  await rm(noGitRoot, { recursive: true, force: true })
}

const deletedGitRoot = await mkdtemp(path.join(tmpdir(), 'source-twin-deleted-'))
try {
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: deletedGitRoot, stdio: 'ignore' })
  await mkdir(path.join(deletedGitRoot, 'src'), { recursive: true })
  await writeFile(path.join(deletedGitRoot, 'package.json'), '{"name":"deleted-file"}\n')
  await writeFile(path.join(deletedGitRoot, 'src', 'removed.js'), 'export const removed = true\n')
  execFileSync('git', ['add', 'package.json', 'src/removed.js'], { cwd: deletedGitRoot, stdio: 'ignore' })
  await rm(path.join(deletedGitRoot, 'src', 'removed.js'))
  assert.deepEqual(
    [...readSourceTwinWorkingTree(deletedGitRoot).keys()],
    ['package.json'],
    'a tracked file deleted in the working tree must not break source-twin generation before commit',
  )
} finally {
  await rm(deletedGitRoot, { recursive: true, force: true })
}

const unsafeGitRoot = await mkdtemp(path.join(tmpdir(), 'source-twin-symlink-'))
const outsideFile = path.join(unsafeGitRoot, '..', `${path.basename(unsafeGitRoot)}-outside.js`)
try {
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: unsafeGitRoot, stdio: 'ignore' })
  await mkdir(path.join(unsafeGitRoot, 'src'), { recursive: true })
  await writeFile(outsideFile, 'export const privateOutsideFile = true\n')
  await symlink(outsideFile, path.join(unsafeGitRoot, 'src', 'outside.js'))
  assert.throws(
    () => readSourceTwinWorkingTree(unsafeGitRoot),
    /refuses symbolic links/,
    'Git-listed symbolic links must never make the scanner follow files outside the repository',
  )
} finally {
  await rm(outsideFile, { force: true })
  await rm(unsafeGitRoot, { recursive: true, force: true })
}

console.log('Source twin checks passed')
