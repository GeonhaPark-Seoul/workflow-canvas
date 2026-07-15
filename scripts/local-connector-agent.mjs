#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  buildSourceTwinManifest,
  readSourceRepositoryMetadata,
  readSourceTwinWorkingTree,
} from './source-twin-scanner.mjs'
import { localGitSyncDecision, normalizeLocalSourceManifest } from '../shared/localConnector.js'

export const LOCAL_CONNECTOR_AGENT_VERSION = '1.0.0'

const MAX_GIT_OUTPUT = 2 * 1024 * 1024
const HEARTBEAT_INTERVAL_MS = 10_000
const FETCH_INTERVAL_MS = 60_000

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
  return git(candidate, ['rev-parse', '--show-toplevel'])
}

export function observeLocalGit(root, { fetchRemote = false } = {}) {
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
    ahead,
    behind,
    dirty: paths.length,
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
  if (!response.ok) throw new Error(payload.error || `로컬 커넥터 서버 오류 (${response.status})`)
  return payload
}

function stateMatches(current, expected) {
  return current.branch === expected.branch
    && current.headSha === expected.headSha
    && current.upstreamRef === expected.upstreamRef
    && current.upstreamSha === expected.upstreamSha
    && current.ahead === expected.ahead
    && current.behind === expected.behind
    && current.dirty === 0
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

export async function runLocalConnectorAgent({ server, token, root, once = false }) {
  const repositoryRoot = resolveRepositoryRoot(root)
  let previousManifest = null
  let lastFetchAt = 0
  let stopped = false
  const stop = () => { stopped = true }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  console.log(`Workflow Canvas 로컬 커넥터 ${LOCAL_CONNECTOR_AGENT_VERSION}`)
  console.log(`허용한 저장소: ${repositoryRoot}`)
  console.log('소스 본문과 비밀값은 서버로 보내지 않습니다. 종료: Ctrl+C')

  while (!stopped) {
    try {
      const now = Date.now()
      const shouldFetch = now - lastFetchAt >= FETCH_INTERVAL_MS
      const gitState = observeLocalGit(repositoryRoot, { fetchRemote: shouldFetch })
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
          const current = observeLocalGit(repositoryRoot, { fetchRemote: true })
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
          result = executeApprovedGitSync(repositoryRoot, operation, current)
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
  await runLocalConnectorAgent({ server, token, root, once: process.argv.includes('--once') })
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
