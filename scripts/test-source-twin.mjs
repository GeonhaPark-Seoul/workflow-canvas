import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildSourceTwinManifest,
  readSourceTwinWorkingTree,
  serializeSourceTwinManifest,
  parseGeneratedSourceTwin,
} from './source-twin-scanner.mjs'
import {
  compareSourceTwinSnapshots,
  createSourceTwinSnapshot,
  sourceTwinCodeUrl,
  sourceTwinEntities,
} from '../shared/sourceTwin.js'
import {
  requireSourceTwinOwner,
  sourceTwinDeploymentContext,
} from '../mcp/sourceTwinStore.js'
import {
  compactGitHubPush,
  sourceTwinRepositoryName,
  validGitHubSignature,
} from '../api/source-twin-webhook.js'

const repository = {
  repositoryUrl: 'https://github.com/example/workflow-canvas',
  defaultBranch: 'main',
}

const fixtureEntries = [
  ['package.json', JSON.stringify({ scripts: { build: 'vite build', test: 'node scripts/test-sample.mjs' } }, null, 2)],
  ['api/example.js', `
import { helper } from '../src/helper.js'
export async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'literal-secret-must-not-appear'
  await db.from('canvases').select('id')
  await db.from('source_events').insert({ id: serviceKey.length })
  await db.rpc('get_operational_state')
  return helper(req, res)
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

assert.equal(manifest.id, reversed.id, 'file iteration order must not affect the manifest')
assert.deepEqual(manifest.entities, reversed.entities, 'entities must be deterministic')
assert.deepEqual(manifest.relations, reversed.relations, 'relations must be deterministic')
assert.equal(manifest.summary.parseFailures, 0)
assert.ok(manifest.entities.some((entity) => entity.id === 'function:api/example.js:handler'))
assert.ok(manifest.entities.some((entity) => entity.id === 'api:/api/example'))
assert.ok(manifest.entities.some((entity) => entity.id === 'db-table:source_events'))
assert.ok(manifest.entities.some((entity) => entity.id === 'db-function:get_operational_state'))
assert.ok(manifest.entities.some((entity) => entity.id === 'env:SUPABASE_SERVICE_ROLE_KEY'))
assert.ok(manifest.entities.some((entity) => entity.kind === 'rls-policy'))
assert.ok(manifest.relations.some((relation) => relation.type === 'imports'))
assert.ok(manifest.relations.some((relation) => relation.type === 'calls-api'))
assert.ok(manifest.relations.some((relation) => relation.type === 'accesses' && relation.operations.includes('write')))
assert.equal(manifest.source.contentIncluded, false)
assert.equal(manifest.source.credentialValuesIncluded, false)
assert.doesNotMatch(JSON.stringify(manifest), /literal-secret-must-not-appear/)

const generated = serializeSourceTwinManifest(manifest)
assert.deepEqual(parseGeneratedSourceTwin(generated), manifest, 'generated manifest must round-trip')

const changedFiles = new Map(fixtureEntries)
changedFiles.set('src/helper.js', `${changedFiles.get('src/helper.js')}\nexport const secondHelper = () => 2\n`)
const changedManifest = buildSourceTwinManifest(changedFiles, { previous: manifest, repository })
assert.equal(changedManifest.changeSet.initialBaseline, false)
assert.ok(changedManifest.changeSet.changedPaths.includes('src/helper.js'))
assert.ok(changedManifest.changeSet.added.includes('function:src/helper.js:secondHelper'))

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

console.log('Source twin checks passed')
