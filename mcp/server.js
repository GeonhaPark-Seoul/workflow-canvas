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

// Server-level instructions, sent once at session init. Shared concepts
// (concept, coordinate system, node sizes, layout rules) live here so
// per-tool descriptions can stay short.
const SERVER_INSTRUCTIONS = `
Workflow Canvas는 사람과 AI가 함께 쓰는 시각적 워크플로우 캔버스입니다.
계획·조사·프로세스를 노드와 연결선으로 표현하며, 사용자는 브라우저에서 같은 캔버스를 직접 편집할 수 있습니다.

## 노드 종류
- stage (단계 노드): 작업·항목·개념의 기본 블록. colorIdx로 종류·단계를 분류합니다. 사용자가 직접 정의할 수 있으며 get_stage_types로 현재 목록을 확인하세요.
- memo (메모 노드): 보조 정보·팁·주의사항을 담는 노드. 연결선이 점선으로 표시됩니다.

## 좌표계와 노드 크기
- position은 노드의 좌상단 기준. x → 오른쪽, y → 아래.
- 노드 크기는 자동 조절되지 않습니다.
  - stage: 기본 약 200×80px, 설명이 길면 높이 100–150px
  - memo: 기본 약 160×80px
- 배치 시 이 크기를 반드시 고려해 겹침이 생기지 않도록 하세요.

## 배치 규칙
- 노드 중심 간 권장 간격: 가로 ≥ 320px, 세로 ≥ 200px.
- 흐름은 좌→우 또는 위→아래로 일관되게 배치하세요.
- 관련 메모는 대상 stage 노드 근처(아래 또는 옆 ~250px 오프셋)에 배치하세요.
- 겹침 금지: 기존 노드 좌표를 get_canvas로 확인한 뒤 배치하세요.
- x, y를 항상 명시적으로 지정하는 것을 권장합니다 (생략 시 자동 배치되지만 검토 후 조정이 필요할 수 있습니다).

## 권장 작업 순서
1. get_canvases → 캔버스 목록 확인
2. get_canvas → 기존 노드 구조·좌표 파악
3. get_stage_types → 현재 종류 확인, 필요시 rename_stage_type / add_stage_type으로 편집
4. create_node → x, y를 명시해 노드 추가
5. create_edge → 필요한 관계만 연결 (모든 노드를 연결할 필요 없음)

## colorIdx 사용 지침
colorIdx는 stage 노드의 종류를 나타내는 index입니다 (get_stage_types 결과 배열의 순서).
- 흐름/순서가 있는 경우: 프로세스의 진행 단계를 표현 (예: 기획→개발→검토→배포→완료)
- 분류/카테고리로 쓰는 경우: 주제, 중요도, 팀/역할 등 구분
캔버스 주제에 맞게 get_stage_types로 현재 종류를 확인하고, 필요하면 이름을 적극 변경하세요.

## 연결선 생성 기준
연결선은 반드시 추가해야 하는 것이 아닙니다. 흐름·인과·계층·관계가 명확할 때만 추가하세요.
연결 면은 노드 위치에 따라 자동으로 결정됩니다.
`.trim()

export function buildServer(getUserId) {
  const server = new McpServer(
    { name: 'workflow-canvas', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  )
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
    description: '캔버스에 새 노드를 추가합니다. type=stage → 단계 노드, type=memo → 메모 노드.',
    inputSchema: {
      canvas_id: z.string(),
      type: z.enum(['stage', 'memo']),
      label: z.string().optional().describe('단계 노드 제목'),
      description: z.string().optional().describe('단계 노드 설명'),
      colorIdx: z.number().int().min(0).optional().describe(
        'stage 종류 index. get_stage_types로 목록 확인 후 선택. 흐름 단계(기획→…→완료) 또는 카테고리 구분용으로 사용.'
      ),
      header: z.string().optional().describe('메모 제목'),
      text: z.string().optional().describe('메모 내용'),
      x: z.number().optional().describe('x 좌표 (좌상단 기준). 겹침 방지를 위해 명시 권장, 생략 시 빈 공간에 자동 배치.'),
      y: z.number().optional().describe('y 좌표 (좌상단 기준). 겹침 방지를 위해 명시 권장, 생략 시 빈 공간에 자동 배치.'),
    },
  }, g(async (userId, a) => ok(await store.createNode(userId, a.canvas_id, a))))

  server.registerTool('update_node', {
    description: '기존 노드의 내용/위치를 수정합니다. 제공한 필드만 변경됩니다.',
    inputSchema: {
      canvas_id: z.string(),
      node_id: z.string(),
      label: z.string().optional(),
      description: z.string().optional(),
      colorIdx: z.number().int().min(0).optional(),
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
    description:
      '두 노드를 연결하는 연결선을 추가합니다. 메모 노드가 포함되면 점선으로 표시됩니다. 연결 방향(어느 면에서 나가는지)은 노드 위치에 따라 자동 결정되므로 신경 쓰지 않아도 됩니다.\n\n연결선은 흐름·인과·계층·관계가 명확할 때만 추가할 것.',
    inputSchema: {
      canvas_id: z.string(),
      source: z.string().describe('출발 노드 id'),
      target: z.string().describe('도착 노드 id'),
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

  server.registerTool('get_stage_types', {
    description: 'stage 노드 종류 목록을 가져옵니다. 각 항목의 배열 index가 colorIdx로 사용됩니다.',
    inputSchema: {},
  }, g(async (userId) => {
    const list = await store.getStageTypes(userId)
    return ok(list.map((t, i) => ({ colorIdx: i, label: t.label, color: t.border })))
  }))

  server.registerTool('rename_stage_type', {
    description:
      'stage 종류의 이름을 변경합니다. 종류 이름은 노드 분류의 핵심이므로 캔버스 주제에 맞게 적극적으로 편집할 것 ' +
      '(예: "기획"→"조사", "개발"→"견적"). 변경 전 get_stage_types로 현재 목록을 확인.',
    inputSchema: {
      index: z.number().int().min(0).describe('변경할 종류의 index (get_stage_types 결과 기준)'),
      label: z.string().describe('새 이름'),
    },
  }, g(async (userId, a) => {
    const updated = await store.renameStageType(userId, a.index, a.label)
    return ok(updated.map((t, i) => ({ colorIdx: i, label: t.label, color: t.border })))
  }))

  server.registerTool('add_stage_type', {
    description: '새 stage 종류를 추가합니다 (색상 자동 배정). 기존 종류로 부족할 때 사용.',
    inputSchema: {
      label: z.string().describe('새 종류 이름'),
    },
  }, g(async (userId, a) => {
    const updated = await store.addStageType(userId, a.label)
    return ok(updated.map((t, i) => ({ colorIdx: i, label: t.label, color: t.border })))
  }))

  return server
}

function bearer(req) {
  try {
    const url = new URL(req.url, 'http://localhost')
    const q = url.searchParams.get('token')
    if (q) return q.trim()
  } catch {}
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
