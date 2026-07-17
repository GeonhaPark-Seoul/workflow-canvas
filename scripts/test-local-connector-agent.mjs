import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  executeApprovedGitSync,
  executeApprovedSourceOperation,
  localConnectorAuthorizationStopped,
  localGitSyncApprovalPhrase,
  localSourceEditApprovalPhrase,
  observeLocalGit,
  resolveRepositoryRoot,
  verifyApprovedGitSync,
} from './local-connector-agent.mjs'

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function configureRepository(root) {
  git(root, 'config', 'user.name', 'Workflow Canvas Test')
  git(root, 'config', 'user.email', 'workflow-canvas-test@example.invalid')
}

const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'workflow-local-connector-'))
const remoteRoot = path.join(fixtureRoot, 'remote.git')
const localRoot = path.join(fixtureRoot, 'local')
const peerRoot = path.join(fixtureRoot, 'peer')

assert.equal(localGitSyncApprovalPhrase(`op-${'a'.repeat(64)}`), 'SYNC aaaaaaaa')
assert.equal(localGitSyncApprovalPhrase('invalid-operation'), '')
assert.equal(localSourceEditApprovalPhrase(`op-${'b'.repeat(64)}`), 'EDIT bbbbbbbb')
assert.equal(localSourceEditApprovalPhrase(`op-${'c'.repeat(64)}`, true), 'ROLLBACK cccccccc')
assert.equal(localConnectorAuthorizationStopped({ status: 401 }), true)
assert.equal(localConnectorAuthorizationStopped({ code: 'LOCAL_CONNECTOR_AUTH_REQUIRED' }), true)
assert.equal(localConnectorAuthorizationStopped({ status: 500 }), false)

try {
  git(fixtureRoot, 'init', '--bare', remoteRoot)
  git(fixtureRoot, 'init', '--initial-branch=main', localRoot)
  configureRepository(localRoot)
  await writeFile(path.join(localRoot, 'app.js'), 'export const version = 1\n')
  git(localRoot, 'add', 'app.js')
  git(localRoot, 'commit', '-m', 'Initial commit')
  git(localRoot, 'remote', 'add', 'origin', remoteRoot)
  git(localRoot, 'push', '-u', 'origin', 'main')

  assert.equal(await realpath(resolveRepositoryRoot(localRoot)), await realpath(localRoot))
  assert.throws(
    () => observeLocalGit(localRoot, { syncEnabled: true }),
    /GitHub origin/,
    'production connector mode must reject an unapproved Git remote provider',
  )
  const readOnlyState = observeLocalGit(localRoot)
  assert.equal(readOnlyState.syncEnabled, false)
  assert.equal(readOnlyState.fetchStatus, 'skipped')

  await writeFile(path.join(localRoot, 'app.js'), 'export const version = 2\n')
  git(localRoot, 'add', 'app.js')
  git(localRoot, 'commit', '-m', 'Local update')
  const pushState = observeLocalGit(localRoot, {
    fetchRemote: true,
    syncEnabled: true,
    requireGitHubOrigin: false,
  })
  assert.equal(pushState.ahead, 1)
  assert.equal(pushState.behind, 0)
  const pushResult = executeApprovedGitSync(localRoot, {
    action: 'push',
    expectedState: pushState,
  }, pushState)
  assert.equal(pushResult.beforeHeadSha, pushState.headSha)
  assert.equal(git(remoteRoot, 'rev-parse', 'refs/heads/main'), git(localRoot, 'rev-parse', 'HEAD'))
  const verifiedPush = verifyApprovedGitSync(localRoot, {
    action: 'push',
    expectedState: pushState,
  }, pushResult, { requireGitHubOrigin: false })
  assert.equal(verifiedPush.verification.status, 'verified')
  assert.equal(verifiedPush.verification.ahead, 0)
  assert.equal(verifiedPush.verification.behind, 0)

  git(fixtureRoot, 'clone', remoteRoot, peerRoot)
  configureRepository(peerRoot)
  await writeFile(path.join(peerRoot, 'app.js'), 'export const version = 3\n')
  git(peerRoot, 'add', 'app.js')
  git(peerRoot, 'commit', '-m', 'Remote update')
  git(peerRoot, 'push', 'origin', 'main')

  const pullState = observeLocalGit(localRoot, {
    fetchRemote: true,
    syncEnabled: true,
    requireGitHubOrigin: false,
  })
  assert.equal(pullState.ahead, 0)
  assert.equal(pullState.behind, 1)
  const pullResult = executeApprovedGitSync(localRoot, {
    action: 'pull_ff_only',
    expectedState: pullState,
  }, pullState)
  assert.equal(pullResult.afterHeadSha, git(remoteRoot, 'rev-parse', 'refs/heads/main'))
  const verifiedPull = verifyApprovedGitSync(localRoot, {
    action: 'pull_ff_only',
    expectedState: pullState,
  }, pullResult, { requireGitHubOrigin: false })
  assert.equal(verifiedPull.verification.headSha, verifiedPull.verification.upstreamSha)
  assert.equal(await readFile(path.join(localRoot, 'app.js'), 'utf8'), 'export const version = 3\n')
  assert.equal(git(localRoot, 'status', '--porcelain'), '')

  await mkdir(path.join(localRoot, 'shared'), { recursive: true })
  await writeFile(path.join(localRoot, 'shared/uiConstants.js'), [
    'export const SYSTEM_NODE_DEFAULT_WIDTH = 240',
    'export const SYSTEM_NODE_DEFAULT_HEIGHT = 130',
    "export const SYSTEM_MODULE_COLOR = '#0d9488'",
    "export const SOURCE_TWIN_EMPTY_MESSAGE = '일치하는 코드 실체 없음'",
    '',
  ].join('\n'))
  git(localRoot, 'add', 'shared/uiConstants.js')
  git(localRoot, 'commit', '-m', 'Add editable UI constants')
  const sourceEditState = observeLocalGit(localRoot, {
    sourceWriteEnabled: true,
    requireGitHubOrigin: false,
  })
  const origin = git(localRoot, 'config', '--get', 'remote.origin.url')
  const checks = async () => ({ propertyContract: 'passed', build: 'passed', diffCheck: 'passed' })
  const sourceEdit = await executeApprovedSourceOperation(localRoot, {
    operationId: `op-${'b'.repeat(64)}`,
    action: 'source_edit',
    expectedState: {
      branch: sourceEditState.branch,
      headSha: sourceEditState.headSha,
      originFingerprint: sourceEditState.originFingerprint,
      dirty: 0,
      sourceWriteEnabled: true,
      propertyId: 'ui.system-node.default-width',
      label: '시스템 노드 기본 너비',
      path: 'shared/uiConstants.js',
      beforeValue: 240,
      afterValue: 280,
      anchor: { path: 'shared/uiConstants.js', nodeType: 'VariableDeclaration', symbol: 'module', lineStart: 1, lineEnd: 1 },
    },
  }, sourceEditState, {
    origin,
    confirm: async () => true,
    runChecks: checks,
    requireGitHubOrigin: false,
  })
  assert.equal(sourceEdit.verification.status, 'verified')
  assert.match(await readFile(path.join(localRoot, 'shared/uiConstants.js'), 'utf8'), /SYSTEM_NODE_DEFAULT_WIDTH = 280/)
  assert.match(git(localRoot, 'show', '-s', '--format=%B', sourceEdit.commitSha), /Workflow-Canvas-Operation/)

  const rollbackState = observeLocalGit(localRoot, {
    sourceWriteEnabled: true,
    requireGitHubOrigin: false,
  })
  const rollback = await executeApprovedSourceOperation(localRoot, {
    operationId: `op-${'c'.repeat(64)}`,
    action: 'source_edit_rollback',
    expectedState: {
      branch: rollbackState.branch,
      headSha: rollbackState.headSha,
      originFingerprint: rollbackState.originFingerprint,
      dirty: 0,
      sourceWriteEnabled: true,
      originalCommitSha: sourceEdit.commitSha,
      propertyId: 'ui.system-node.default-width',
      label: '시스템 노드 기본 너비',
      path: 'shared/uiConstants.js',
      beforeValue: 280,
      afterValue: 240,
    },
  }, rollbackState, {
    origin,
    confirm: async () => true,
    runChecks: checks,
    requireGitHubOrigin: false,
  })
  assert.equal(rollback.verification.status, 'verified')
  assert.match(await readFile(path.join(localRoot, 'shared/uiConstants.js'), 'utf8'), /SYSTEM_NODE_DEFAULT_WIDTH = 240/)
  assert.equal(git(localRoot, 'status', '--porcelain'), '')

  assert.throws(() => executeApprovedGitSync(localRoot, {
    action: 'push',
    expectedState: { ...pullState, headSha: 'f'.repeat(40) },
  }, observeLocalGit(localRoot, {
    syncEnabled: true,
    requireGitHubOrigin: false,
  })), /승인 이후 Git 상태가 달라져/)
} finally {
  await rm(fixtureRoot, { recursive: true, force: true })
}

console.log('Local connector agent checks passed')
