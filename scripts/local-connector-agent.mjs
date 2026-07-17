#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import {
  buildSourceTwinManifest,
  readSourceRepositoryMetadata,
  readSourceTwinWorkingTree,
} from './source-twin-scanner.mjs'
import { localGitSyncDecision, normalizeLocalSourceManifest } from '../shared/localConnector.js'
import {
  applyRegisteredSourceProperty,
  inspectRegisteredSourceProperty,
} from './source-edit-executor.mjs'

export const LOCAL_CONNECTOR_AGENT_VERSION = '1.3.0'

const MAX_GIT_OUTPUT = 2 * 1024 * 1024
const HEARTBEAT_INTERVAL_MS = 10_000
const FETCH_INTERVAL_MS = 60_000
const SOURCE_EDIT_ACTIONS = new Set(['source_edit', 'source_edit_rollback'])
const SOURCE_EDIT_DERIVED_PATHS = new Set([
  'shared/sourceTwinManifest.js',
  'shared/sourceFeatureManifest.js',
  'shared/sourceCodePartManifest.js',
  'shared/sourceFlowManifest.js',
])

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback
}

function git(root, args, { timeout = 20_000 } = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT,
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function safeServerUrl(value) {
  const parsed = new URL(value)
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new Error('서버 주소는 HTTPS여야 합니다. 로컬 개발에서는 localhost HTTP만 허용됩니다.')
  }
  parsed.pathname = ''
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

function changedPaths(root) {
  const output = git(root, ['status', '--porcelain=v1', '-z'])
  if (!output) return []
  const entries = output.split('\0').filter(Boolean)
  const paths = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const status = entry.slice(0, 2)
    const firstPath = entry.slice(3)
    if (/[RC]/.test(status) && entries[index + 1]) {
      paths.push(entries[index + 1])
      index += 1
    } else if (firstPath) {
      paths.push(firstPath)
    }
  }
  return [...new Set(paths)].slice(0, 120)
}

function sha(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function resolveRepositoryRoot(requestedRoot) {
  const candidate = path.resolve(requestedRoot || process.cwd())
  return realpathSync(git(candidate, ['rev-parse', '--show-toplevel']))
}

function pinnedGitHubOrigin(root, { requireGitHubOrigin = true } = {}) {
  let origin = ''
  try { origin = git(root, ['config', '--get', 'remote.origin.url']) } catch {}
  const githubOrigin = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/i
  if (requireGitHubOrigin && !githubOrigin.test(origin)) {
    throw new Error('현재 Git 동기화는 자격증명이 포함되지 않은 GitHub origin만 허용합니다.')
  }
  return origin
}

export function observeLocalGit(root, {
  fetchRemote = false,
  syncEnabled = false,
  sourceWriteEnabled = false,
  expectedOrigin = '',
  requireGitHubOrigin = syncEnabled || sourceWriteEnabled,
} = {}) {
  const origin = pinnedGitHubOrigin(root, { requireGitHubOrigin })
  if (expectedOrigin && origin !== expectedOrigin) {
    throw new Error('실행 중 Git origin이 변경되어 로컬 커넥터를 중단했습니다.')
  }
  let fetchStatus = 'skipped'
  let fetchMessage = ''
  if (fetchRemote) {
    try {
      git(root, ['fetch', '--prune', 'origin'], { timeout: 30_000 })
      fetchStatus = 'ok'
    } catch (error) {
      fetchStatus = 'failed'
      fetchMessage = String(error?.stderr || error?.message || 'git fetch failed').trim().slice(0, 240)
    }
  }
  const branch = git(root, ['branch', '--show-current'])
  const headSha = git(root, ['rev-parse', 'HEAD'])
  let upstreamRef = ''
  let upstreamSha = ''
  let ahead = 0
  let behind = 0
  try {
    upstreamRef = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
    upstreamSha = git(root, ['rev-parse', '@{upstream}'])
    const counts = git(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).split(/\s+/).map(Number)
    ahead = Number.isInteger(counts[0]) ? counts[0] : 0
    behind = Number.isInteger(counts[1]) ? counts[1] : 0
  } catch {}
  const paths = changedPaths(root)
  return {
    branch,
    headSha,
    upstreamRef,
    upstreamSha,
    originFingerprint: origin ? sha(origin) : '',
    ahead,
    behind,
    dirty: paths.length,
    syncEnabled,
    sourceWriteEnabled,
    changedPaths: paths,
    fetchStatus,
    fetchMessage,
  }
}

export function buildLocalConnectorManifest(root, previous = null) {
  const manifest = buildSourceTwinManifest(readSourceTwinWorkingTree(root), {
    previous,
    repository: readSourceRepositoryMetadata(root),
  })
  const normalized = normalizeLocalSourceManifest({
    ...manifest,
    source: { ...manifest.source, label: path.basename(root) },
  })
  if (!normalized) throw new Error('로컬 코드 구조를 안전한 manifest로 만들지 못했습니다.')
  return normalized
}

class LocalConnectorRequestError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'LocalConnectorRequestError'
    this.status = status
    this.code = code
  }
}

async function request(server, token, body) {
  const response = await fetch(`${server}/api/local-connector`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workflow-Local-Token': token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(35_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new LocalConnectorRequestError(
      response.status,
      String(payload.code ?? ''),
      payload.error || `로컬 커넥터 서버 오류 (${response.status})`,
    )
  }
  return payload
}

export function localConnectorAuthorizationStopped(error) {
  return error != null
    && ([401, 403].includes(error.status) || error.code === 'LOCAL_CONNECTOR_AUTH_REQUIRED')
}

function stateMatches(current, expected) {
  return current.branch === expected.branch
    && current.headSha === expected.headSha
    && current.upstreamRef === expected.upstreamRef
    && current.upstreamSha === expected.upstreamSha
    && current.originFingerprint === expected.originFingerprint
    && current.ahead === expected.ahead
    && current.behind === expected.behind
    && current.syncEnabled === true
    && expected.syncEnabled === true
    && current.dirty === 0
}

export function localGitSyncApprovalPhrase(operationId) {
  return /^op-[a-f0-9]{64}$/i.test(operationId ?? '')
    ? `SYNC ${operationId.slice(-8).toLocaleLowerCase()}`
    : ''
}

async function confirmGitSyncInTerminal({ repositoryRoot, origin, operation, current }) {
  const phrase = localGitSyncApprovalPhrase(operation.operationId)
  if (!phrase || !process.stdin.isTTY || !process.stdout.isTTY) return false
  const action = operation.action === 'push' ? 'GitHub로 push' : 'GitHub에서 로컬로 fast-forward 반영'
  console.log('')
  console.log('[로컬 승인 필요] 웹 승인은 로컬 파일 변경 권한을 대신하지 않습니다.')
  console.log(`저장소: ${repositoryRoot}`)
  console.log(`원격: ${origin}`)
  console.log(`작업: ${action}`)
  console.log(`현재 커밋: ${current.headSha}`)
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await prompt.question(`계속하려면 ${phrase} 입력: `)
    return answer.trim().toLocaleLowerCase() === phrase.toLocaleLowerCase()
  } finally {
    prompt.close()
  }
}

export function executeApprovedGitSync(root, operation, current) {
  if (!stateMatches(current, operation.expectedState ?? {})) {
    throw new Error('승인 이후 Git 상태가 달라져 실행을 중단했습니다.')
  }
  const decision = localGitSyncDecision(current)
  if (decision.action !== operation.action) {
    throw new Error('승인한 동기화 방향과 실행 직전 Git 상태가 일치하지 않습니다.')
  }
  const beforeHeadSha = current.headSha
  if (operation.action === 'push') {
    git(root, ['push', '--porcelain', 'origin', `HEAD:${current.branch}`], { timeout: 120_000 })
  } else if (operation.action === 'pull_ff_only') {
    git(root, ['merge', '--ff-only', current.upstreamRef], { timeout: 120_000 })
  } else {
    throw new Error('허용되지 않은 Git 동기화 작업입니다.')
  }
  const afterHeadSha = git(root, ['rev-parse', 'HEAD'])
  let remoteSha = ''
  try { remoteSha = git(root, ['rev-parse', current.upstreamRef]) } catch {}
  return {
    summary: operation.action === 'push'
      ? '로컬 커밋을 GitHub origin에 일반 push로 반영했습니다.'
      : 'GitHub 커밋을 fast-forward 방식으로 로컬에 반영했습니다.',
    beforeHeadSha,
    afterHeadSha,
    remoteSha,
  }
}

export function verifyApprovedGitSync(root, operation, executionResult, {
  expectedOrigin = '',
  requireGitHubOrigin = true,
} = {}) {
  const observed = observeLocalGit(root, {
    fetchRemote: true,
    syncEnabled: true,
    expectedOrigin,
    requireGitHubOrigin,
  })
  const expected = operation.expectedState ?? {}
  const valid = observed.branch === expected.branch
    && observed.originFingerprint === expected.originFingerprint
    && observed.dirty === 0
    && observed.ahead === 0
    && observed.behind === 0
    && !!observed.headSha
    && observed.headSha === observed.upstreamSha
    && executionResult?.afterHeadSha === observed.headSha
  if (!valid) throw new Error('실행 후 Git 상태가 승인된 동기화 완료 조건과 일치하지 않습니다.')
  return {
    ...executionResult,
    afterHeadSha: observed.headSha,
    remoteSha: observed.upstreamSha,
    verification: {
      status: 'verified',
      branch: observed.branch,
      headSha: observed.headSha,
      upstreamRef: observed.upstreamRef,
      upstreamSha: observed.upstreamSha,
      originFingerprint: observed.originFingerprint,
      ahead: observed.ahead,
      behind: observed.behind,
      dirty: observed.dirty,
    },
  }
}

function sourceEditStateMatches(current, expected) {
  return current.branch === expected.branch
    && current.headSha === expected.headSha
    && current.originFingerprint === expected.originFingerprint
    && current.sourceWriteEnabled === true
    && expected.sourceWriteEnabled === true
    && current.dirty === 0
}

export function localSourceEditApprovalPhrase(operationId, rollback = false) {
  return /^op-[a-f0-9]{64}$/i.test(operationId ?? '')
    ? `${rollback ? 'ROLLBACK' : 'EDIT'} ${operationId.slice(-8).toLocaleLowerCase()}`
    : ''
}

async function confirmSourceEditInTerminal({ repositoryRoot, origin, operation, diff }) {
  const rollback = operation.action === 'source_edit_rollback'
  const phrase = localSourceEditApprovalPhrase(operation.operationId, rollback)
  if (!phrase || !process.stdin.isTTY || !process.stdout.isTTY) return false
  const expected = operation.expectedState ?? {}
  console.log('')
  console.log('[로컬 코드 쓰기 승인 필요] 웹 승인은 Mac 파일 변경 권한을 대신하지 않습니다.')
  console.log(`저장소: ${repositoryRoot}`)
  console.log(`고정 원격: ${origin}`)
  console.log(`작업: ${rollback ? '승인된 편집 커밋 롤백' : '등록된 UI 상수 편집'}`)
  console.log(`속성: ${expected.label || expected.propertyId}`)
  console.log(`값: ${JSON.stringify(expected.beforeValue)} -> ${JSON.stringify(expected.afterValue)}`)
  console.log('검증된 실제 대상 파일 diff:')
  console.log(diff || '(diff 없음)')
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await prompt.question(`계속하려면 ${phrase} 입력: `)
    return answer.trim().toLocaleLowerCase() === phrase.toLocaleLowerCase()
  } finally {
    prompt.close()
  }
}

function command(cwd, executable, args, { timeout = 900_000, maximumOutput = 8 * 1024 * 1024 } = {}) {
  return execFileSync(executable, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: maximumOutput,
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function runSourceEditChecks(worktree) {
  command(worktree, process.execPath, ['scripts/test-source-editable-properties.mjs'], { timeout: 120_000 })
  command(worktree, 'npm', ['run', 'build'], { timeout: 900_000 })
  git(worktree, ['diff', '--check'])
  return { propertyContract: 'passed', build: 'passed', diffCheck: 'passed' }
}

function sourceEditChangedPaths(worktree) {
  return git(worktree, ['diff', '--name-only', 'HEAD'])
    .split('\n')
    .filter(Boolean)
}

function assertBoundedSourceEditDiff(paths, targetPath) {
  if (!paths.includes(targetPath)) throw new Error('등록된 대상 파일 변경을 찾지 못했습니다.')
  const unexpected = paths.filter((item) => item !== targetPath && !SOURCE_EDIT_DERIVED_PATHS.has(item))
  if (unexpected.length) throw new Error(`허용되지 않은 파일 변경을 감지했습니다: ${unexpected.join(', ')}`)
}

export async function executeApprovedSourceOperation(root, operation, current, {
  origin = '',
  confirm = confirmSourceEditInTerminal,
  runChecks = runSourceEditChecks,
  requireGitHubOrigin = true,
} = {}) {
  const expected = operation.expectedState ?? {}
  if (!SOURCE_EDIT_ACTIONS.has(operation.action)) throw new Error('허용되지 않은 Source Lens 코드 작업입니다.')
  if (!sourceEditStateMatches(current, expected)) throw new Error('승인 이후 로컬 코드 또는 Git 상태가 달라졌습니다.')
  const rollback = operation.action === 'source_edit_rollback'
  const suffix = operation.operationId.slice(-12)
  const branch = `workflow-canvas/source-${rollback ? 'rollback' : 'edit'}-${suffix}`
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'workflow-canvas-source-edit-'))
  const worktree = path.join(temporaryRoot, 'worktree')
  let branchCreated = false
  try {
    git(root, ['worktree', 'add', '-b', branch, worktree, current.headSha], { timeout: 120_000 })
    branchCreated = true
    const sourceNodeModules = path.join(root, 'node_modules')
    if (existsSync(sourceNodeModules) && !existsSync(path.join(worktree, 'node_modules'))) {
      symlinkSync(sourceNodeModules, path.join(worktree, 'node_modules'), 'dir')
    }
    let edit
    if (rollback) {
      git(worktree, ['revert', '--no-commit', expected.originalCommitSha], { timeout: 120_000 })
      const observed = inspectRegisteredSourceProperty(worktree, expected.propertyId)
      if (JSON.stringify(observed.currentValue) !== JSON.stringify(expected.afterValue)) {
        throw new Error('롤백 후 등록 속성이 승인된 복구 값과 일치하지 않습니다.')
      }
      edit = {
        propertyId: expected.propertyId,
        label: expected.label,
        path: expected.path,
        beforeValue: expected.beforeValue,
        afterValue: expected.afterValue,
      }
    } else {
      edit = applyRegisteredSourceProperty(worktree, {
        propertyId: expected.propertyId,
        expectedValue: expected.beforeValue,
        nextValue: expected.afterValue,
        anchor: expected.anchor,
      })
    }
    const checks = await runChecks(worktree, operation, edit)
    const changedPaths = sourceEditChangedPaths(worktree)
    assertBoundedSourceEditDiff(changedPaths, edit.path)
    git(worktree, ['diff', '--check', 'HEAD'])
    const diff = git(worktree, ['diff', '--no-ext-diff', '--unified=3', 'HEAD', '--', edit.path])
    if (!diff) throw new Error('승인할 실제 파일 diff가 없습니다.')
    const diffFingerprint = sha(diff)
    const locallyApproved = await confirm({ repositoryRoot: root, origin, operation, current, diff })
    if (!locallyApproved) throw new Error('로컬 터미널 승인이 없어 코드 쓰기를 실행하지 않았습니다.')
    git(worktree, ['add', '--all'])
    const subject = rollback ? `Rollback ${expected.label || expected.propertyId}` : `Adjust ${edit.label}`
    command(worktree, 'git', [
      'commit',
      '-m', subject,
      '-m', `Workflow-Canvas-Operation: ${operation.operationId}\nWorkflow-Canvas-Property: ${expected.propertyId}\nWorkflow-Canvas-Previous-Head: ${current.headSha}`,
    ], { timeout: 120_000 })
    const commitSha = git(worktree, ['rev-parse', 'HEAD'])
    const rootState = observeLocalGit(root, {
      syncEnabled: current.syncEnabled,
      sourceWriteEnabled: true,
      expectedOrigin: origin,
      requireGitHubOrigin,
    })
    if (!sourceEditStateMatches(rootState, expected)) {
      throw new Error('검증 중 원본 브랜치가 달라져 편집 커밋 반영을 중단했습니다.')
    }
    git(root, ['merge', '--ff-only', branch], { timeout: 120_000 })
    const finalProperty = inspectRegisteredSourceProperty(root, expected.propertyId)
    const after = observeLocalGit(root, {
      syncEnabled: current.syncEnabled,
      sourceWriteEnabled: true,
      expectedOrigin: origin,
      requireGitHubOrigin,
    })
    if (
      after.headSha !== commitSha
      || after.dirty !== 0
      || JSON.stringify(finalProperty.currentValue) !== JSON.stringify(expected.afterValue)
    ) throw new Error('원본 브랜치 반영 후 독립 검증에 실패했습니다.')
    return {
      summary: rollback
        ? '승인된 Source Lens 편집을 새 revert 커밋으로 되돌리고 검증했습니다.'
        : '등록된 UI 상수를 provenance 커밋으로 반영하고 검증했습니다.',
      propertyId: expected.propertyId,
      beforeValue: expected.beforeValue,
      afterValue: expected.afterValue,
      previousHeadSha: current.headSha,
      commitSha,
      diffFingerprint,
      verification: {
        status: 'verified',
        propertyId: expected.propertyId,
        path: edit.path,
        branch: current.branch,
        previousHeadSha: current.headSha,
        commitSha,
        originFingerprint: current.originFingerprint,
        beforeValue: expected.beforeValue,
        afterValue: expected.afterValue,
        dirty: after.dirty,
        diffFingerprint,
        checks,
      },
    }
  } finally {
    try { git(root, ['worktree', 'remove', '--force', worktree], { timeout: 120_000 }) } catch {}
    if (branchCreated) {
      try { git(root, ['branch', '-d', branch]) } catch {
        try { git(root, ['branch', '-D', branch]) } catch {}
      }
    }
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

export async function runLocalConnectorAgent({
  server,
  token,
  root,
  once = false,
  allowGitSync = false,
  allowSourceWrite = false,
  confirmGitSync = confirmGitSyncInTerminal,
  confirmSourceEdit = confirmSourceEditInTerminal,
}) {
  const repositoryRoot = resolveRepositoryRoot(root)
  const repositoryOrigin = pinnedGitHubOrigin(repositoryRoot, { requireGitHubOrigin: allowGitSync || allowSourceWrite })
  let previousManifest = null
  let lastFetchAt = 0
  let stopped = false
  const stop = () => { stopped = true }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  console.log(`Workflow Canvas 로컬 커넥터 ${LOCAL_CONNECTOR_AGENT_VERSION}`)
  console.log(`허용한 저장소: ${repositoryRoot}`)
  console.log(allowGitSync || allowSourceWrite
    ? `고정한 GitHub origin: ${repositoryOrigin}`
    : 'Git 원격 접근: 사용 안 함')
  console.log(`권한: 구조 읽기${allowGitSync ? ' + 승인 Git 동기화' : ''}${allowSourceWrite ? ' + 등록 UI 상수 승인 편집' : ''}`)
  if (!allowGitSync && !allowSourceWrite) console.log('쓰기 권한: 사용 안 함')
  console.log('소스 본문과 비밀값은 서버로 보내지 않습니다. 종료: Ctrl+C')

  while (!stopped) {
    try {
      const now = Date.now()
      const shouldFetch = allowGitSync && now - lastFetchAt >= FETCH_INTERVAL_MS
      const gitState = observeLocalGit(repositoryRoot, {
        fetchRemote: shouldFetch,
        syncEnabled: allowGitSync,
        sourceWriteEnabled: allowSourceWrite,
        expectedOrigin: repositoryOrigin,
      })
      if (shouldFetch) lastFetchAt = now
      const manifest = buildLocalConnectorManifest(repositoryRoot, previousManifest)
      previousManifest = manifest
      const heartbeat = await request(server, token, {
        action: 'heartbeat',
        agentVersion: LOCAL_CONNECTOR_AGENT_VERSION,
        repositoryLabel: path.basename(repositoryRoot),
        manifest,
        git: gitState,
      })
      const operationResponse = await request(server, token, { action: 'poll' })
      const operation = operationResponse.operation
      if (operation) {
        let status = 'succeeded'
        let result
        try {
          const sourceOperation = SOURCE_EDIT_ACTIONS.has(operation.action)
          if (sourceOperation && !allowSourceWrite) throw new Error('별도 코드 쓰기 동의가 없어 Source Lens 편집을 실행하지 않습니다.')
          if (!sourceOperation && !allowGitSync) throw new Error('읽기 전용 로컬 커넥터는 Git 동기화를 실행하지 않습니다.')
          const current = observeLocalGit(repositoryRoot, {
            fetchRemote: !sourceOperation,
            syncEnabled: allowGitSync,
            sourceWriteEnabled: allowSourceWrite,
            expectedOrigin: repositoryOrigin,
          })
          const currentManifest = buildLocalConnectorManifest(repositoryRoot, previousManifest)
          previousManifest = currentManifest
          const currentHeartbeat = await request(server, token, {
            action: 'heartbeat',
            agentVersion: LOCAL_CONNECTOR_AGENT_VERSION,
            repositoryLabel: path.basename(repositoryRoot),
            manifest: currentManifest,
            git: current,
          })
          if (currentHeartbeat.stateFingerprint !== operation.stateFingerprint) {
            throw new Error('승인 이후 로컬 코드 또는 GitHub 상태가 달라졌습니다.')
          }
          if (sourceOperation) {
            result = await executeApprovedSourceOperation(repositoryRoot, operation, current, {
              origin: repositoryOrigin,
              confirm: confirmSourceEdit,
            })
          } else {
            const locallyApproved = await confirmGitSync({
              repositoryRoot,
              origin: repositoryOrigin,
              operation,
              current,
            })
            if (!locallyApproved) throw new Error('로컬 터미널 승인이 없어 Git 동기화를 실행하지 않았습니다.')
            const executionState = observeLocalGit(repositoryRoot, {
              fetchRemote: false,
              syncEnabled: true,
              sourceWriteEnabled: allowSourceWrite,
              expectedOrigin: repositoryOrigin,
            })
            const executionResult = executeApprovedGitSync(repositoryRoot, operation, executionState)
            result = verifyApprovedGitSync(repositoryRoot, operation, executionResult, {
              expectedOrigin: repositoryOrigin,
            })
          }
          console.log(`[완료] ${result.summary}`)
        } catch (error) {
          status = 'failed'
          result = { summary: String(error?.message ?? 'Git 동기화 실패').slice(0, 400) }
          console.error(`[중단] ${result.summary}`)
        }
        await request(server, token, { action: 'complete', operationId: operation.operationId, status, result })
      } else if (once) {
        return { repositoryRoot, stateFingerprint: heartbeat.stateFingerprint }
      }
    } catch (error) {
      if (localConnectorAuthorizationStopped(error)) {
        console.error(`[연결 종료] ${String(error?.message ?? error)}`)
        return { repositoryRoot, stopped: true, reason: 'authorization_failed' }
      }
      console.error(`[연결 대기] ${String(error?.message ?? error)}`)
      if (once) throw error
    }
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_INTERVAL_MS))
  }
  return { repositoryRoot, stopped: true }
}

async function main() {
  const token = argument('--token') || process.env.WORKFLOW_CANVAS_LOCAL_CONNECTOR_TOKEN || ''
  if (!/^wclc_[a-f0-9]{64}$/.test(token)) throw new Error('앱에서 발급한 로컬 커넥터 토큰이 필요합니다.')
  const server = safeServerUrl(argument('--server', process.env.WORKFLOW_CANVAS_URL || 'https://workflow-canvas-orpin.vercel.app'))
  const root = argument('--repo', process.cwd())
  await runLocalConnectorAgent({
    server,
    token,
    root,
    once: process.argv.includes('--once'),
    allowGitSync: process.argv.includes('--allow-git-sync'),
    allowSourceWrite: process.argv.includes('--allow-source-write'),
  })
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  main().catch((error) => {
    console.error(`로컬 커넥터를 시작하지 못했습니다: ${error.message}`)
    process.exitCode = 1
  })
}

export function localConnectorStateDigest(manifest, gitState) {
  return sha(JSON.stringify({ manifestId: manifest?.id, git: gitState }))
}
