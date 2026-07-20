import { createHmac, timingSafeEqual } from 'node:crypto'
import { admin } from '../mcp/shareAccess.js'
import { recordSourceTwinPushEvent, SourceTwinError } from '../mcp/sourceTwinStore.js'
import { SOURCE_TWIN_MANIFEST } from '../shared/sourceTwinManifest.js'

export const config = { api: { bodyParser: false } }

const MAX_BODY_BYTES = 1024 * 1024

function send(res, status, body = null) {
  if (body === null) return res.status(status).end()
  return res.status(status).json(body)
}

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new SourceTwinError(413, 'WEBHOOK_TOO_LARGE', 'GitHub webhook 본문이 너무 큽니다.')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export function validGitHubSignature(body, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(signature ?? '')) return false
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`)
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function safeSha(value) {
  return /^[a-f0-9]{40,64}$/i.test(value ?? '') ? value : ''
}

export function sourceTwinRepositoryName(manifest = SOURCE_TWIN_MANIFEST) {
  try {
    const url = new URL(manifest?.source?.repositoryUrl ?? '')
    if (url.hostname.toLocaleLowerCase() !== 'github.com') return ''
    return url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').toLocaleLowerCase()
  } catch {
    return ''
  }
}

export function compactGitHubPush(payload, deliveryId) {
  const commits = (Array.isArray(payload?.commits) ? payload.commits : []).slice(0, 100).map((commit) => ({
    id: safeSha(commit?.id),
    timestamp: Number.isFinite(Date.parse(commit?.timestamp)) ? new Date(commit.timestamp).toISOString() : null,
    added: (commit?.added ?? []).filter((item) => typeof item === 'string').slice(0, 500),
    modified: (commit?.modified ?? []).filter((item) => typeof item === 'string').slice(0, 500),
    removed: (commit?.removed ?? []).filter((item) => typeof item === 'string').slice(0, 500),
  }))
  const changedPaths = [...new Set(commits.flatMap((commit) => [...commit.added, ...commit.modified, ...commit.removed]))]
    .filter((item) => item.length <= 500)
    .sort()
    .slice(0, 1_000)
  return {
    deliveryId,
    ref: String(payload?.ref ?? '').slice(0, 300),
    beforeSha: safeSha(payload?.before),
    afterSha: safeSha(payload?.after),
    repository: String(payload?.repository?.full_name ?? '').slice(0, 240),
    changedPaths,
    commits,
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 요청만 허용됩니다.', code: 'METHOD_NOT_ALLOWED' })
  try {
    const body = await rawBody(req)
    if (!validGitHubSignature(body, req.headers['x-hub-signature-256'], process.env.WORKFLOW_CANVAS_GITHUB_WEBHOOK_SECRET)) {
      return send(res, 401, { error: 'GitHub webhook 서명이 올바르지 않습니다.', code: 'INVALID_SIGNATURE' })
    }
    const eventType = String(req.headers['x-github-event'] ?? '')
    if (eventType === 'ping') return send(res, 204)
    if (eventType !== 'push') return send(res, 202, { accepted: false, ignored: true, eventType })
    const deliveryId = String(req.headers['x-github-delivery'] ?? '')
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(deliveryId)) return send(res, 400, { error: 'GitHub delivery ID가 필요합니다.', code: 'DELIVERY_ID_REQUIRED' })
    let payload
    try { payload = JSON.parse(body.toString('utf8')) } catch { return send(res, 400, { error: 'GitHub webhook JSON이 올바르지 않습니다.', code: 'INVALID_JSON' }) }
    const event = compactGitHubPush(payload, deliveryId)
    const expectedRepository = sourceTwinRepositoryName()
    if (!expectedRepository) {
      throw new SourceTwinError(503, 'SOURCE_REPOSITORY_UNAVAILABLE', '소스 분석 대상 GitHub 저장소 설정을 확인할 수 없습니다.')
    }
    if (event.repository.toLocaleLowerCase() !== expectedRepository) {
      return send(res, 403, { error: '소스 분석 대상 GitHub 저장소의 이벤트가 아닙니다.', code: 'REPOSITORY_MISMATCH' })
    }
    const result = await recordSourceTwinPushEvent(admin(), event)
    return send(res, result.duplicate ? 200 : 202, { accepted: true, ...result })
  } catch (error) {
    if (error instanceof SourceTwinError) return send(res, error.status, { error: error.message, code: error.code })
    console.error('[source-twin-webhook] request failed:', error)
    return send(res, 500, { error: 'GitHub 변경 이벤트를 처리하지 못했습니다.', code: 'INTERNAL_ERROR' })
  }
}
