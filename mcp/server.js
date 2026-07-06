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
// Mutating tools attach a one-sentence top-level hint nudging the AI's next step.
const okh = (v, hint) => ok(hint && typeof v === 'object' ? { ...v, hint } : v)
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
- stage (단계 노드): 작업·항목·개념의 기본 블록. stageTypeIdx로 종류·단계를 분류합니다. 종류 목록은 **캔버스마다 독립적**이며 사용자가 직접 정의할 수 있으니, 캔버스를 바꿀 때마다 get_stage_types로 그 캔버스의 현재 목록을 다시 확인하세요.
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
2. get_canvas → 기존 노드 구조·좌표·단계 종류 파악
3. 필요시 rename_stage_type / create_stage_type / delete_stage_type으로 종류 편집
4. **create_graph 한 번**으로 노드+연결선 전체 생성 (layout 생략 시 자동 배치)
5. update_nodes로 후속 다듬기 (크기·내용·dimmed)

## 대량 작업 (중요)
노드를 2개 이상 만들 때는 create_node를 반복 호출하지 말고 반드시 create_graph 하나로 만드세요.
수정·삭제도 마찬가지: update_nodes / delete_nodes (복수형)가 단건 도구보다 훨씬 빠릅니다.
단건 도구(create_node, update_node, delete_node)는 정말 1개만 다룰 때를 위한 것입니다.

## 긴 텍스트 → 구조화 레시피
긴 대화·요리법·제품 구조 같은 텍스트를 캔버스로 변환할 때:
- 주제·단계·산출물 → stage 노드 (stageTypeIdx로 국면 구분)
- 보조 설명·팁·주의사항 → memo 노드 + 대상 stage로 edge
- 순서·인과·의존 관계 → edges
- 세부 하위 단계는 노드를 늘리지 말고 description 안 체크리스트로 표현
- 전체를 create_graph 한 번에 만들고, layout은 생략(자동 배치)

## 리치 텍스트
label/description/header/text는 HTML을 지원합니다 (렌더링됨). 허용 태그: b, strong, i, em, u, s,
font(color/size), span, div, p, br, ul, ol, li, details, summary, input(checkbox), img(data:image), a(https).
- 체크리스트: <div class="cl-item"><input type="checkbox">&nbsp;항목</div> (이 마크업 그대로 쓸 것)
- 접기/펼치기: <details><summary>제목</summary><div>내용</div></details>
- 강조: <b>, <font color="#ef4444">
서버가 안전하지 않은 태그(script 등)를 자동 제거합니다.

## stageTypeIdx 사용 지침
stageTypeIdx는 stage 노드의 종류를 나타내는 index입니다 (get_stage_types 결과 배열의 순서, 해당 캔버스 기준).
- 흐름/순서가 있는 경우: 프로세스의 진행 단계를 표현 (예: 기획→개발→검토→배포→완료)
- 분류/카테고리로 쓰는 경우: 주제, 중요도, 팀/역할 등 구분
캔버스 주제에 맞게 get_stage_types로 현재 종류를 확인하고, 필요하면 이름을 적극 변경하세요. 새 캔버스는 항상 기본 종류(기획·개발·검토·배포·완료)에서 시작합니다.
범위를 벗어난 인덱스는 에러가 됩니다 (조용히 보정하지 않음).

## 연결선 생성 기준
연결선은 반드시 추가해야 하는 것이 아닙니다. 흐름·인과·계층·관계가 명확할 때만 추가하세요.
sourceHandle/targetHandle은 생략 가능합니다 — 생략하면 두 노드의 실제 좌표를 기준으로 가장 자연스러운 면이 자동으로 선택됩니다. 특정 면을 강제하고 싶을 때만 지정하세요.
같은 방향의 중복 연결(같은 source→target)은 거부됩니다.

## 반영
로그인된 브라우저는 MCP 변경을 몇 초 내 자동으로 반영합니다 (새로고침 불필요).
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
    description:
      '특정 캔버스의 노드/연결선 데이터를 가져옵니다. 각 노드의 position(x,y)과 width/height, ' +
      '단계 종류 목록(stage_types)이 포함되므로, 노드를 추가/이동/크기조절하기 전에 항상 먼저 호출해 ' +
      '기존 배치와 간격을 파악할 것.',
    inputSchema: { canvas_id: z.string().describe('캔버스 ID (get_canvases로 조회)') },
  }, g(async (userId, a) => ok(await store.getCanvas(userId, a.canvas_id))))

  server.registerTool('get_stage_types', {
    description:
      '이 캔버스의 단계 노드 종류(라벨) 목록을 조회합니다.\n\n' +
      '종류 목록은 캔버스마다 독립적이다 (다른 캔버스에서 추가/변경한 종류는 여기 보이지 않음). ' +
      'stageTypeIdx는 사용자가 이름을 바꾸거나 자유롭게 추가/삭제할 수 있는 동적 값이다. ' +
      '고정된 의미(예: "0=기획")를 절대 가정하지 말고, 단계 노드를 만들거나 수정하기 전에는 ' +
      '항상 이 도구로 해당 캔버스의 현재 목록을 먼저 조회할 것.',
    inputSchema: { canvas_id: z.string() },
  }, g(async (userId, a) => ok(await store.getStageTypes(userId, a.canvas_id))))

  server.registerTool('create_stage_type', {
    description: '이 캔버스에 새 단계 종류를 추가합니다 (색상은 자동 배정됨, 다른 캔버스에는 영향 없음). 기존 종류 중 적합한 것이 없을 때 사용.',
    inputSchema: { canvas_id: z.string(), label: z.string().describe('종류 이름') },
  }, g(async (userId, a) => ok(await store.createStageType(userId, a.canvas_id, a.label))))

  server.registerTool('rename_stage_type', {
    description: '이 캔버스의 단계 종류 이름을 변경합니다 (다른 캔버스에는 영향 없음). 대상 stageTypeIdx는 get_stage_types로 확인할 것.',
    inputSchema: {
      canvas_id: z.string(),
      stageTypeIdx: z.number().int().min(0).describe('이름을 바꿀 종류의 인덱스 (get_stage_types 결과 참고)'),
      label: z.string().describe('새 이름'),
    },
  }, g(async (userId, a) => ok(await store.renameStageType(userId, a.canvas_id, a.stageTypeIdx, a.label))))

  server.registerTool('delete_stage_type', {
    description:
      '이 캔버스의 단계 종류를 삭제합니다 (최소 1개는 남아있어야 함, 다른 캔버스에는 영향 없음). ' +
      '이 종류를 쓰던 이 캔버스의 노드는 자동으로 재분류되어(다음 종류로 당겨짐) 깨진 참조가 남지 않는다.',
    inputSchema: { canvas_id: z.string(), stageTypeIdx: z.number().int().min(0).describe('삭제할 종류의 인덱스') },
  }, g(async (userId, a) => ok(await store.deleteStageType(userId, a.canvas_id, a.stageTypeIdx))))

  server.registerTool('create_node', {
    description:
      '캔버스에 새 노드를 추가합니다. type=stage → 단계 노드(label/description/stageTypeIdx), type=memo → 메모 노드(header/text).\n\n' +
      '【단계 노드(stage)란】\n' +
      '어떤 생각의 흐름이나 구조에서 같은 계층에 속하는 것들을 하나의 "종류(stage type)"로 묶어, ' +
      '전체 진행 순서를 단계별로 나누기 위한 노드다. "종류"는 흐름상의 단계 구분(기획→개발→검토→…) ' +
      '또는 주제/역할별 카테고리 구분으로 자유롭게 쓸 수 있다. (파라미터 이름이 colorIdx가 아니라 ' +
      'stageTypeIdx인 이유: 이 값은 "색상 선택"이 아니라 "어느 종류/그룹에 속하는가"를 나타내며, ' +
      '색은 종류에 따라오는 부수 효과일 뿐이다.)\n\n' +
      '【좌표/크기/배치 — 지시 없어도 지킬 것】\n' +
      '- 좌표계: x는 오른쪽(+), y는 아래(+), 단위 px. position은 노드 좌상단 기준. 흐름은 좌→우 또는 위→아래로 일관되게.\n' +
      '- 기본 크기: stage ≈ 220×90, memo ≈ 180×90. 노드 크기는 자동으로 늘어나지 않으므로, ' +
      'description/text가 두 줄을 넘으면 width/height를 직접 키워서(예: 260×140) 내용이 잘리지 않게 할 것.\n' +
      '- 간격: 노드 중심 간 가로 ≥ 320px, 세로 ≥ 200px. 메모는 관련 stage 노드 위/아래 ~250px에 배치.\n' +
      '- 겹침 금지: get_canvas로 기존 노드의 position과 width/height를 확인한 뒤 x/y를 명시해 배치할 것. ' +
      '겹치는 좌표를 지정하면 서버가 가장 가까운 빈 자리로 이동시키고 shifted로 알려줌.\n' +
      '- 흐름·인과·순서가 있는 노드들을 만들었으면, 사용자가 시키지 않아도 create_edge로 바로 연결까지 마칠 것.\n\n' +
      '⚠️ 노드를 2개 이상 만들 계획이면 이 도구를 반복 호출하지 말고 create_graph 하나로 만들 것 (훨씬 빠름).',
    inputSchema: {
      canvas_id: z.string(),
      type: z.enum(['stage', 'memo']),
      label: z.string().optional().describe('단계 노드 제목 (HTML 지원: <b>, 체크리스트 등)'),
      description: z.string().optional().describe('단계 노드 설명 (HTML 지원)'),
      stageTypeIdx: z.number().int().min(0).optional().describe(
        '이 노드가 속할 단계 종류의 인덱스. 종류 목록은 캔버스마다 독립적으로 커스터마이즈되는 동적 값이므로 ' +
        '고정된 의미("0=기획" 등)를 가정하지 말 것. 반드시 이 canvas_id로 get_stage_types를 먼저 ' +
        '조회한 뒤, 그중 의미가 맞는 인덱스를 쓸 것. 적합한 종류가 없으면 create_stage_type으로 ' +
        '새로 만들 것.\n\n' +
        '노드의 내용과 캔버스 전체 맥락을 보고 흐름/순서(예: 기획→개발→검토) 또는 분류/카테고리 ' +
        '(예: 주제별, 역할별) 중 적합한 방식으로 선택할 것. 무조건 0부터 순서대로 쓸 필요 없음.'
      ),
      colorIdx: z.number().int().min(0).optional().describe('deprecated: stageTypeIdx를 사용할 것 (하위 호환용 별칭).'),
      header: z.string().optional().describe('메모 제목 (HTML 지원)'),
      text: z.string().optional().describe('메모 내용 (HTML 지원: 체크리스트, <details> 등)'),
      x: z.number().optional().describe('x 좌표 (좌상단 기준). 겹침 방지를 위해 명시 권장, 생략 시 빈 공간에 자동 배치.'),
      y: z.number().optional().describe('y 좌표 (좌상단 기준). 겹침 방지를 위해 명시 권장, 생략 시 빈 공간에 자동 배치.'),
      width: z.number().optional().describe('노드 너비(px). stage 최소 200, memo 최소 160. 생략 시 기본값.'),
      height: z.number().optional().describe('노드 높이(px). 최소 80. 생략 시 기본값.'),
      dimmed: z.boolean().optional().describe('노드를 흐리게 표시 (완료/비활성 표현용, 데이터는 유지됨).'),
    },
  }, g(async (userId, a) => {
    const r = await store.createNode(userId, a.canvas_id, a)
    return okh(r, r.shifted
      ? '요청 좌표가 기존 노드와 겹쳐 자동 이동되었습니다. 배치 전 get_canvas로 좌표를 확인하면 이동이 발생하지 않습니다.'
      : '브라우저에 몇 초 내 자동 반영됩니다.')
  }))

  server.registerTool('create_graph', {
    description:
      '노드와 연결선으로 이루어진 그래프 전체를 **한 번의 호출**로 생성합니다. ' +
      '노드를 2개 이상 만들 때는 반드시 create_node 반복 대신 이 도구를 사용할 것 (왕복이 수십 배 절약됨).\n\n' +
      '【긴 텍스트 → 구조화 레시피】\n' +
      '긴 대화·요리법·제품 구조·아키텍처를 캔버스로 변환할 때:\n' +
      '- 주제·단계·산출물 = stage 노드 (stageTypeIdx로 국면 구분 — 먼저 get_stage_types 확인)\n' +
      '- 보조 설명·팁·주의 = memo 노드 + 대상 stage로 edge (자동으로 점선이 됨)\n' +
      '- 순서·인과·의존 = edges\n' +
      '- 세부 하위 단계는 노드를 늘리지 말고 description 안 체크리스트로: ' +
      '<div class="cl-item"><input type="checkbox">&nbsp;항목</div> 반복\n' +
      '- 접을 내용은 <details><summary>제목</summary><div>내용</div></details>, 강조는 <b>, <font color>\n\n' +
      '【배치】\n' +
      'layout 생략(권장) 시 자동 배치: 좌→우 위상 정렬(열 320px/행 200px 간격), memo는 연결된 stage의 ' +
      '위·아래, 전체가 기존 노드 아래 빈 영역에 놓임. 이때 노드의 x/y 입력은 무시됨. ' +
      "위치를 전부 직접 지정하려면 layout:'manual' + 모든 노드에 x/y 필수 (겹치면 자동 이동 후 shifted로 보고).\n\n" +
      '노드 참조: 각 노드에 고유한 tmp_id를 부여하고 edges에서 그 tmp_id로 참조. ' +
      '기존 노드 id(get_canvas로 확인)도 edge의 source/target으로 쓸 수 있음. ' +
      '응답의 created_nodes에 tmp_id → 실제 id 매핑이 담김.',
    inputSchema: {
      canvas_id: z.string(),
      nodes: z.array(z.object({
        tmp_id: z.string().describe('이 호출 안에서 고유한 임시 id (edges에서 참조용)'),
        type: z.enum(['stage', 'memo']),
        label: z.string().optional().describe('stage 제목 (HTML 지원)'),
        description: z.string().optional().describe('stage 설명 (HTML 지원: 체크리스트 등)'),
        stageTypeIdx: z.number().int().min(0).optional().describe('단계 종류 인덱스 (get_stage_types로 유효 범위 확인)'),
        header: z.string().optional().describe('memo 제목 (HTML 지원)'),
        text: z.string().optional().describe('memo 내용 (HTML 지원)'),
        x: z.number().optional().describe("layout:'manual'일 때만 사용됨"),
        y: z.number().optional().describe("layout:'manual'일 때만 사용됨"),
        width: z.number().optional().describe('내용이 길면 키울 것 (stage 최소 200)'),
        height: z.number().optional().describe('내용이 길면 키울 것 (최소 80)'),
        dimmed: z.boolean().optional(),
      })).min(1).max(100),
      edges: z.array(z.object({
        source: z.string().describe('tmp_id 또는 기존 노드 id'),
        target: z.string().describe('tmp_id 또는 기존 노드 id'),
        sourceHandle: z.enum(['left', 'right', 'top', 'bottom']).optional().describe('생략 시 자동 계산'),
        targetHandle: z.enum(['left', 'right', 'top', 'bottom']).optional().describe('생략 시 자동 계산'),
      })).max(300).optional(),
      layout: z.enum(['auto', 'manual']).optional().describe("생략 시: 좌표 없는 노드가 있으면 auto. auto=자동 배치(x/y 무시), manual=모든 x/y 필수"),
    },
  }, g(async (userId, a) => {
    const r = await store.createGraph(userId, a.canvas_id, a)
    return okh(r, '생성 완료. 로그인된 브라우저에는 몇 초 내 자동 반영됩니다. 내용이 긴 노드는 update_nodes로 width/height를 키우세요.')
  }))

  server.registerTool('update_node', {
    description:
      '기존 노드 1개의 내용/위치/크기를 수정합니다. 제공한 필드만 변경됩니다. ' +
      '⚠️ 2개 이상 수정할 때는 update_nodes(복수형)를 사용할 것.\n\n' +
      '노드 크기 조절은 이 도구의 width/height로 한다 (px 단위, 별도 resize 도구 없음). ' +
      '내용을 길게 수정했으면 잘리지 않도록 같은 호출에서 height도 함께 키울 것. ' +
      '현재 크기는 get_canvas 응답의 width/height로 확인.',
    inputSchema: {
      canvas_id: z.string(),
      node_id: z.string(),
      label: z.string().optional(),
      description: z.string().optional(),
      stageTypeIdx: z.number().int().min(0).optional().describe('단계 종류 인덱스. 유효 인덱스는 이 canvas_id로 get_stage_types를 호출해 확인할 것 (캔버스마다 목록이 다름).'),
      colorIdx: z.number().int().min(0).optional().describe('deprecated: stageTypeIdx를 사용할 것 (하위 호환용 별칭).'),
      header: z.string().optional(),
      text: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional().describe('노드 너비(px). stage 최소 200, memo 최소 160.'),
      height: z.number().optional().describe('노드 높이(px). 최소 80.'),
      dimmed: z.boolean().optional().describe('노드 흐리게 표시 on/off (완료/비활성 표현용).'),
    },
  }, g(async (userId, a) => okh(await store.updateNode(userId, a.canvas_id, a.node_id, a), '브라우저에 몇 초 내 자동 반영됩니다.')))

  server.registerTool('update_nodes', {
    description:
      '여러 노드를 **한 번에** 수정합니다 (단일 update_node를 반복 호출하지 말 것). ' +
      '각 patch는 update_node와 같은 필드를 받으며, 제공한 필드만 변경됩니다. ' +
      '존재하지 않는 node_id가 하나라도 있으면 전체가 실패합니다.',
    inputSchema: {
      canvas_id: z.string(),
      patches: z.array(z.object({
        node_id: z.string(),
        label: z.string().optional(),
        description: z.string().optional(),
        stageTypeIdx: z.number().int().min(0).optional(),
        header: z.string().optional(),
        text: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        dimmed: z.boolean().optional(),
      })).min(1).max(100),
    },
  }, g(async (userId, a) => okh(await store.updateNodes(userId, a.canvas_id, a.patches), '브라우저에 몇 초 내 자동 반영됩니다.')))

  server.registerTool('delete_node', {
    description: '노드 1개를 삭제합니다. 그 노드에 연결된 연결선도 함께 삭제됩니다. ⚠️ 2개 이상 삭제 시 delete_nodes(복수형) 사용.',
    inputSchema: { canvas_id: z.string(), node_id: z.string() },
  }, g(async (userId, a) => okh(await store.deleteNode(userId, a.canvas_id, a.node_id), '브라우저에 자동 반영됩니다.')))

  server.registerTool('delete_nodes', {
    description:
      '여러 노드를 한 번에 삭제합니다 (연결된 연결선도 함께). ' +
      '찾은 노드는 삭제하고 못 찾은 id는 not_found로 보고합니다 (전부 못 찾을 때만 실패).',
    inputSchema: { canvas_id: z.string(), node_ids: z.array(z.string()).min(1).max(100) },
  }, g(async (userId, a) => okh(await store.deleteNodes(userId, a.canvas_id, a.node_ids), '브라우저에 자동 반영됩니다.')))

  server.registerTool('create_edge', {
    description:
      '두 노드를 연결하는 연결선을 추가합니다. 메모 노드가 포함되면 점선으로 표시됩니다.\n\n' +
      '흐름·인과·계층·관계가 있는 노드들은 사용자가 따로 요청하지 않아도 능동적으로 연결할 것 ' +
      '(예: 프로세스를 그렸으면 단계 순서대로, 메모를 만들었으면 대상 노드에). ' +
      '단, 관계가 불명확한 노드까지 전부 잇지는 말 것.\n\n' +
      'sourceHandle/targetHandle은 생략해도 된다 — 생략 시 두 노드의 실제 좌표를 보고 가장 자연스러운 ' +
      '면이 자동으로 계산된다. "좌→우는 항상 right/left" 식으로 기계적으로 고정하지 말고, 특정 면을 ' +
      '꼭 지정해야 할 특별한 이유가 있을 때만 명시할 것.\n\n' +
      '같은 방향의 중복 연결(같은 source→target)은 거부됩니다. 새 노드들과 함께 여러 연결을 만들 때는 create_graph를 쓸 것.',
    inputSchema: {
      canvas_id: z.string(),
      source: z.string().describe('출발 노드 id'),
      target: z.string().describe('도착 노드 id'),
      sourceHandle: z.enum(['left', 'right', 'top', 'bottom']).optional().describe('생략 시 자동 계산'),
      targetHandle: z.enum(['left', 'right', 'top', 'bottom']).optional().describe('생략 시 자동 계산'),
    },
  }, g(async (userId, a) => ok(await store.createEdge(userId, a.canvas_id, a))))

  server.registerTool('delete_edge', {
    description: '연결선을 삭제합니다.',
    inputSchema: { canvas_id: z.string(), edge_id: z.string() },
  }, g(async (userId, a) => ok(await store.deleteEdge(userId, a.canvas_id, a.edge_id))))

  server.registerTool('create_canvas', {
    description: '새 캔버스를 생성합니다. 새 캔버스는 기본 단계 종류(기획·개발·검토·배포·완료)로 시작합니다.',
    inputSchema: { name: z.string().optional().describe('캔버스 이름 (생략 시 "새 캔버스")') },
  }, g(async (userId, a) => okh(await store.createCanvas(userId, a.name), '이제 create_graph로 내용을 채우세요.')))

  server.registerTool('rename_canvas', {
    description: '캔버스 이름을 변경합니다 (브라우저 탭 이름에도 반영됨).',
    inputSchema: { canvas_id: z.string(), name: z.string().describe('새 이름') },
  }, g(async (userId, a) => okh(await store.renameCanvas(userId, a.canvas_id, a.name), '브라우저 탭에 자동 반영됩니다.')))

  server.registerTool('delete_canvas', {
    description:
      '캔버스를 완전히 삭제합니다. ⚠️ 되돌릴 수 없으므로 사용자가 명확히 요청했을 때만 사용할 것. ' +
      '마지막 남은 캔버스는 삭제할 수 없습니다.',
    inputSchema: { canvas_id: z.string() },
  }, g(async (userId, a) => okh(await store.deleteCanvasRow(userId, a.canvas_id), '브라우저 탭에서 제거됩니다.')))

  server.registerTool('clear_canvas', {
    description: '캔버스의 모든 노드와 연결선을 삭제합니다 (캔버스 자체는 유지). ⚠️ 되돌릴 수 없음.',
    inputSchema: { canvas_id: z.string() },
  }, g(async (userId, a) => { await store.clearCanvas(userId, a.canvas_id); return ok(`초기화됨: ${a.canvas_id}`) }))

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
