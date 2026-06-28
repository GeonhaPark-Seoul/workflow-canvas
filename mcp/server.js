// MCP server for the Workflow Canvas app.
//
// Exposes the canvas as MCP tools over Streamable HTTP (stateless, JSON
// responses) so an MCP client like Claude can read and write nodes/edges. Auth
// is per-request: the Bearer token resolves to a user id and every tool is
// scoped to that user's own canvases. Deployed as a Vercel function (api/mcp.js).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import * as store from './store.js'

const ok = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
const fail = (msg) => ({ content: [{ type: 'text', text: `❌ ${msg}` }], isError: true })

// Wrap a tool body so the user is resolved/required and errors become tool
// errors (instead of crashing the transport).
const guard = (getUserId, fn) => async (args) => {
  try {
    const userId = getUserId()
    if (!userId) throw new Error('인증 실패: 유효한 토큰이 필요합니다 (Authorization: Bearer <token>).')
    return await fn(userId, args ?? {})
  } catch (e) {
    return fail(e?.message || String(e))
  }
}

export function buildServer(getUserId) {
  const server = new McpServer({ name: 'workflow-canvas', version: '1.0.0' })
  const g = (fn) => guard(getUserId, fn)

  server.registerTool('get_canvases', {
    description: '로그인한 사용자의 캔버스 목록을 가져옵니다 (canvas_id, 이름, 노드/연결선 개수).',
    inputSchema: {},
  }, g(async (userId) => ok(await store.listCanvases(userId))))

  server.registerTool('get_canvas', {
    description: '특정 캔버스의 노드/연결선 데이터를 가져옵니다.',
    inputSchema: { canvas_id: z.string().describe('캔버스 ID (get_canvases로 조회)') },
  }, g(async (userId, a) => ok(await store.getCanvas(userId, a.canvas_id))))

  server.registerTool('create_node', {
    description: '캔버스에 새 노드를 추가합니다. type=stage → 단계 노드(label/description/colorIdx), type=memo → 메모 노드(header/text).',
    inputSchema: {
      canvas_id: z.string(),
      type: z.enum(['stage', 'memo']),
      label: z.string().optional().describe('단계 노드 제목'),
      description: z.string().optional().describe('단계 노드 설명'),
      colorIdx: z.number().int().min(0).max(4).optional().describe('단계 색상: 0 기획·1 개발·2 검토·3 배포·4 완료'),
      header: z.string().optional().describe('메모 제목'),
      text: z.string().optional().describe('메모 내용'),
      x: z.number().optional().describe('x 좌표 (생략 시 자동 배치)'),
      y: z.number().optional().describe('y 좌표 (생략 시 자동 배치)'),
    },
  }, g(async (userId, a) => ok(await store.createNode(userId, a.canvas_id, a))))

  server.registerTool('update_node', {
    description: '기존 노드의 내용/위치를 수정합니다. 제공한 필드만 변경됩니다.',
    inputSchema: {
      canvas_id: z.string(),
      node_id: z.string(),
      label: z.string().optional(),
      description: z.string().optional(),
      colorIdx: z.number().int().min(0).max(4).optional(),
      header: z.string().optional(),
      text: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    },
  }, g(async (userId, a) => ok(await store.updateNode(userId, a.canvas_id, a.node_id, a))))

  server.registerTool('delete_node', {
    description: '노드를 삭제합니다. 그 노드에 연결된 연결선도 함께 삭제됩니다.',
    inputSchema: { canvas_id: z.string(), node_id: z.string() },
  }, g(async (userId, a) => ok(await store.deleteNode(userId, a.canvas_id, a.node_id))))

  server.registerTool('create_edge', {
    description: '두 노드를 연결하는 연결선을 추가합니다. 메모 노드가 포함되면 점선으로 표시됩니다.',
    inputSchema: {
      canvas_id: z.string(),
      source: z.string().describe('출발 노드 id'),
      target: z.string().describe('도착 노드 id'),
      sourceHandle: z.enum(['left', 'right', 'top', 'bottom']).optional(),
      targetHandle: z.enum(['left', 'right', 'top', 'bottom']).optional(),
    },
  }, g(async (userId, a) => ok(await store.createEdge(userId, a.canvas_id, a))))

  server.registerTool('delete_edge', {
    description: '연결선을 삭제합니다.',
    inputSchema: { canvas_id: z.string(), edge_id: z.string() },
  }, g(async (userId, a) => ok(await store.deleteEdge(userId, a.canvas_id, a.edge_id))))

  server.registerTool('create_canvas', {
    description: '새 캔버스를 생성합니다.',
    inputSchema: { name: z.string().optional().describe('캔버스 이름 (생략 시 "새 캔버스")') },
  }, g(async (userId, a) => ok(await store.createCanvas(userId, a.name))))

  server.registerTool('clear_canvas', {
    description: '캔버스의 모든 노드와 연결선을 삭제합니다 (캔버스 자체는 유지).',
    inputSchema: { canvas_id: z.string() },
  }, g(async (userId, a) => { await store.clearCanvas(userId, a.canvas_id); return ok(`초기화됨: ${a.canvas_id}`) }))

  return server
}

function bearer(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'] || ''
  const raw = Array.isArray(h) ? h[0] : h
  const m = /^Bearer\s+(.+)$/i.exec(raw || '')
  return m ? m[1].trim() : null
}

// Vercel serverless entry. Each request builds a fresh stateless server.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, mcp-protocol-version')

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method === 'GET') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ name: 'workflow-canvas MCP', status: 'ok', transport: 'streamable-http' }))
    return
  }
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  let userId = null
  try { userId = await store.resolveUser(bearer(req)) } catch { /* leave unauthenticated; tools will reject */ }

  const server = buildServer(() => userId)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}) })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (e) {
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: String(e?.message || e) }, id: null }))
    }
  }
}
