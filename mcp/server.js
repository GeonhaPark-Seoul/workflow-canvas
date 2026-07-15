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
import {
  SYSTEM_ENVIRONMENT_DEFS,
  SYSTEM_KIND_DEFS,
  SYSTEM_SOURCE_DEFS,
} from '../shared/systemOntology.js'
import {
  RELATION_CONFIDENCE_DEFS,
  RELATION_SOURCE_DEFS,
  RELATION_TYPE_IDS,
} from '../shared/relationOntology.js'
import { WORKFLOW_RELATION_REPAIR_CONFIRMATION } from '../shared/workflowSystemMapRepair.js'
import {
  SOURCE_TWIN_OPERATION_CONFIRMATION,
  SOURCE_TWIN_PERSPECTIVES,
} from '../shared/sourceTwin.js'

const SYSTEM_KIND_IDS = SYSTEM_KIND_DEFS.map(({ id }) => id)
const SYSTEM_ENVIRONMENT_IDS = SYSTEM_ENVIRONMENT_DEFS.map(({ id }) => id)
const SYSTEM_SOURCE_IDS = SYSTEM_SOURCE_DEFS.map(({ id }) => id)
const RELATION_SOURCE_IDS = RELATION_SOURCE_DEFS.map(({ id }) => id)
const RELATION_CONFIDENCE_IDS = RELATION_CONFIDENCE_DEFS.map(({ id }) => id)
const SOURCE_TWIN_PERSPECTIVE_IDS = Object.keys(SOURCE_TWIN_PERSPECTIVES)

// Reused across create/update schemas. These fields describe a declared system
// entity; no MCP input can supply the server-owned proof required for LIVE.
const SYSTEM_NODE_FIELDS = {
  systemKind: z.enum(SYSTEM_KIND_IDS).optional().describe('시스템 종류: 사용자, 프론트엔드, API, DB, 테이블, 인증, 정책, 배포 환경 등.'),
  purpose: z.string().optional().describe('왜 존재하는가. 해결하는 근본 문제와 목적 (HTML 지원).'),
  responsibility: z.string().optional().describe('이 실체가 책임지는 일과 책임지지 않는 경계 (HTML 지원).'),
  constraints: z.string().optional().describe('반드시 지켜야 할 제약·불변 조건·보안 경계 (HTML 지원).'),
  evidence: z.string().optional().describe('이 구조와 판단의 근거가 되는 코드·문서·관측 증거 (HTML 지원).'),
  environment: z.enum(SYSTEM_ENVIRONMENT_IDS).optional().describe('local/development/staging/production 또는 unknown.'),
  sourceKind: z.enum(SYSTEM_SOURCE_IDS).optional().describe('manual/code/connector/runtime 중 이 정보를 발견한 출처.'),
  provider: z.string().optional().describe('Supabase, Vercel처럼 제공자 또는 플랫폼 이름. 비밀값 입력 금지.'),
  externalRef: z.string().optional().describe('public.canvases 같은 자원 식별자. API 키·토큰·비밀번호 값은 절대 입력하지 말 것.'),
}

const EDGE_RELATION_FIELDS = {
  relationType: z.enum(RELATION_TYPE_IDS).optional().describe(
    'source가 target과 맺는 관계. 예: triggers, assigned_to, depends_on, evidences, reads, writes, calls. 생략하면 일반 흐름.'),
  relationLabel: z.string().max(40).optional().describe('relationType=custom일 때만 쓰는 사용자 정의 관계 이름.'),
  showRelationLabel: z.boolean().optional().describe('캔버스 선 중앙에 관계 라벨을 표시할지 여부. 관계를 명시하면 기본 true.'),
  relationSourceKind: z.enum(RELATION_SOURCE_IDS).optional().describe(
    '관계를 판단한 출처: manual/document/code/connector/runtime. 이 값만으로 서버 검증 상태가 되지는 않음.'),
  relationConfidence: z.enum(RELATION_CONFIDENCE_IDS).optional().describe(
    '작성자의 주관적 신뢰도: unknown/low/medium/high. 서버 검증과 별개.'),
  relationEvidence: z.string().max(500).optional().describe('관계를 그렇게 판단한 짧은 근거. 비밀값 입력 금지.'),
  relationEvidenceRef: z.string().max(300).optional().describe(
    '문서·코드 경로·URL·자원 이름. API 키·토큰·비밀번호 입력 금지.'),
}

const ok = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
// Mutating tools attach a one-sentence top-level hint nudging the AI's next step.
const okh = (v, hint) => ok(hint && typeof v === 'object' ? { ...v, hint } : v)
const fail = (msg) => ({ content: [{ type: 'text', text: `❌ ${msg}` }], isError: true })

// Wrap a tool body so the user is resolved/required and errors become tool
// errors (instead of crashing the transport).
const guard = (getUserId, fn) => async (args) => {
  try {
    const userId = getUserId()
    if (!userId) {
      throw new Error(
        '인증 실패: 유효한 토큰이 필요합니다. 커넥터 URL이 ".../api/mcp?token=<토큰>" 형태인지 확인하고, ' +
        '앱의 프로필 → MCP 연결에서 URL을 다시 복사해 커넥터를 재등록하세요. ' +
        '(커넥터의 "연결됨" 표시는 토큰 검증과 무관합니다)')
    }
    return await fn(userId, args ?? {})
  } catch (e) {
    return fail(e?.message || String(e))
  }
}

// Server-level instructions, sent once at session init. Shared concepts
// (concept, coordinate system, node sizes, layout rules) live here so
// per-tool descriptions can stay short.
const SERVER_INSTRUCTIONS = `
Workflow Canvas는 사람과 AI가 함께 쓰는 시각적 캔버스입니다. 계획·조사·프로세스를 노드와 연결선으로 표현하며, 사용자는 브라우저에서 같은 캔버스를 실시간으로 직접 편집할 수 있습니다.

## 작업 절차 (처음 접근하면 반드시 이 순서)
1. 자료 재구성 → 2. 노드 제작 → 3. 레이아웃 엔진을 통한 배치 (create_graph 한 번)

## 1. 자료 재구성
- 자료를 계층 스트림으로 재정리: 상위 주제1,2,3… → 하위 주제1,2,3… → 최하위 주제1,2,3…
- 이 스트림에 주제로 포함되지 않거나 애매한 내용, 비고, 참고 사항은 각 주제 안에서 따로 분류해 둘 것 (→ 2단계에서 memo가 됨)

## 2. 노드 제작
- 같은 계층의 주제는 같은 단계 노드 종류(stage type)를 공유한다. stage type = 계층의 분류 (카테고리 아님)
- 종류 이름 = 그 계층의 상징. 계층을 묶는 공통 개념이 없으면 '1단계/2단계/3단계' 또는 '대분류/중분류/소분류' 같은 universal한 표현
- 구별되는 개별 주제 이름은 단계 노드의 제목(label)에 적는다
- 1단계에서 따로 분류한 내용은 memo 노드에 적는다 (memo = 비고·참조·참고 전용, 계층 구성원 불가, 대상 stage에 점선 꼬리표로 연결)
- 앱·API·서버 함수·DB·테이블·인증·권한·배포 환경처럼 실제 시스템을 모델링할 때는 system 노드를 쓴다
- system 노드는 처음에는 사람이 선언한 '설계'다. 코드·커넥터·실행 기록을 서버가 검증하기 전에는 실제 운영 상태(LIVE)라고 표현하지 않는다
- 1원칙 관점에서 system의 purpose=왜 필요한가, responsibility=무엇을 책임지는가, constraints=절대 어기면 안 되는 것은 무엇인가, evidence=무엇을 근거로 아는가를 기록한다
- externalRef에는 자원 이름·경로만 적고 API 키·토큰·비밀번호 같은 비밀값은 절대 저장하지 않는다
- 순서: get_stage_types 확인 → rename_stage_type/create_stage_type으로 계층 이름 정리 → create_graph 한 번으로 전체 생성

## 3. 레이아웃 엔진
- 상위 계층 노드가 부모(센트럴) 노드, 하위 계층 노드가 새끼(사이드) 노드
- 부모에서 새끼로 뻗어나가는 형태로 배치하고, 연결선은 부모→새끼 방향으로 연결
- 뻗어나가는 방향: 방사(radial)·상(up)·하(down)·좌(left)·우(right) — create_graph의 layout 파라미터
- 최상위 부모에서 최하위 새끼까지 방향을 조합해 뻗어나간다 (방사 = 중심에서 4방향으로 시작해 가지별로 계속 바깥으로)
- 상·하·좌·우로 연장할 때 부모 노드의 한 연결점에서 모든 새끼 노드가 연결된다 (엔진이 자동 고정)
- 노드끼리 적당한 거리를 유지하고, 연결선 위로 노드가 지나가거나 노드 위로 연결선이 지나가지 않도록 엔진이 위치를 조정한다. layout:'manual'로 직접 배치할 때도 이 규칙을 지킬 것
- 방사형 새끼 노드 배치: 3개면 위 1·아래 2(삼각형), 4개면 상하좌우 1개씩, 5개 이상은 4방향 균등 분배.
- 메모는 대상 노드의 비어 있는 연결점 쪽 여유 공간에 자동 배치된다.

## 참고 규칙

### 대량 작업 (중요)
노드를 2개 이상 만들 때는 create_node를 반복 호출하지 말고 반드시 create_graph 하나로 만드세요.
수정·삭제도 마찬가지: update_nodes / delete_nodes (복수형)가 단건 도구보다 훨씬 빠릅니다.

### 좌표계·기본 크기
- position은 노드의 좌상단 기준. x → 오른쪽, y → 아래. 단위 px.
- stage: 기본 약 220×90px (최소 200×80). system: 기본 약 240×130px (최소 200×110). memo: 기본 약 180×90px (최소 160×80).
- 노드 크기는 자동 조절되지 않으므로 description/text가 길면 width/height를 직접 키울 것.

### 겹침 금지·간격
- 노드 중심 간 권장 간격: 가로 ≥ 320px, 세로 ≥ 200px.
- 기존 노드 좌표는 get_canvas로 확인한 뒤 배치할 것. 겹치는 좌표는 서버가 자동 이동 후 shifted로 알림.

### 리치 텍스트
label/description/header/text와 system의 purpose/responsibility/constraints/evidence는 HTML을 지원합니다 (렌더링됨). 허용 태그: b, strong, i, em, u, s, font(color/size), span, div, p, br, ul, ol, li, details, summary, input(checkbox), img(data:image), a(https).
- 체크리스트: <div class="cl-item"><input type="checkbox">&nbsp;항목</div> (이 마크업 그대로 쓸 것)
- 접기/펼치기: <details><summary>제목</summary><div>내용</div></details>
- 강조: <b>, <font color="#ef4444">
서버가 안전하지 않은 태그(script 등)를 자동 제거합니다.

### stageTypeIdx 사용 지침
stageTypeIdx는 stage 노드가 속한 계층을 나타내는 index입니다 (get_stage_types 결과 배열의 순서, 해당 캔버스 기준).
- 종류 목록은 캔버스마다 독립적. 캔버스를 바꿀 때마다 get_stage_types로 다시 확인할 것.
- 주제·팀·중요도 같은 카테고리 구분에는 쓰지 말 것 — 계층(깊이)만 나타낸다.
  - ❌ 잘못: 방안①=종류0, 방안②=종류1, 방안③=종류2 (같은 깊이인데 가지별 색 구분)
  - ✅ 올바름: 중심 주제=종류A, 모든 방안=종류B, 모든 세부 과제=종류C (깊이별 통일)
- 범위를 벗어난 인덱스는 에러가 됩니다 (조용히 보정하지 않음).
- 새 캔버스는 기본 종류(기획·개발·검토·배포·완료)에서 시작합니다.

### 연결선 생성 기준
흐름·인과·계층·관계가 명확할 때만 연결선을 추가하세요.
sourceHandle/targetHandle은 생략 가능 — 생략하면 실제 좌표 기반으로 자동 계산됩니다.
관계는 항상 source가 target에 대해 무엇을 하는지 읽습니다. 예: A --reads→ B = A가 B를 읽음.
- 구조: is_a, part_of, contains, located_at
- 흐름·변화: precedes, triggers, consumes, produces, transforms_into, moves_to, uses
- 책임·협업: owned_by, assigned_to, performs, reviews, approves, reports_to, participates_in
- 조건·의존: depends_on, requires, blocks, enables, constrains
- 정보·판단: references, evidences, supports, contradicts, derived_from, decides
- 디지털 시스템: calls, reads, writes, authenticates, authorizes, deploys_to, syncs_with
목록에 없는 직업 고유 관계만 custom + relationLabel로 표현합니다.
같은 source→target이라도 관계가 다르면 여러 선을 만들 수 있고, 같은 방향·같은 relationType만 중복으로 거부됩니다.
새 노드 여럿과 연결선을 함께 만들 때는 create_graph를 사용하세요.

### 관계의 근거와 검증
- relationSourceKind, relationEvidence, relationEvidenceRef에는 왜 이 관계를 주장하는지 기록합니다.
- relationConfidence는 작성자의 판단일 뿐 서버 검증이 아닙니다. high를 선택해도 verified가 되지 않습니다.
- get_canvas의 relation_reality는 declared(주장), evidenced(근거 기록), verified(서버 검증) 중 하나입니다.
- 현재 MCP 입력으로는 verified를 만들 수 없습니다. 서버가 별도 신뢰 경계에서 evidenceId와 검증 시각을 공급해야만 verified가 됩니다.
- 코드나 문서를 읽고 만든 관계에는 가능한 한 구체적인 파일·설정 경로를 relationEvidenceRef에 남깁니다. 비밀값은 절대 기록하지 않습니다.

### 읽기 전용 시스템 지도 점검
- inspect_workflow_system_map은 코드·SQL·설정에서 자원 이름과 지문만 읽어 시스템 지도와 비교합니다. 환경변수·키·토큰의 실제 값은 수집하거나 반환하지 않습니다.
- changed, needs_review, unmodeled는 오류나 취약점이 확정되었다는 뜻이 아니라 사람이 확인할 지점이라는 뜻입니다.
- 점검 결과를 근거로 지도·코드·DB를 자동 수정하지 마세요. 수정은 영향 범위와 보안 경계를 설명하고 사용자의 별도 승인을 받은 다음 진행합니다.
- 응답의 writes_performed가 false인지 확인하고, 발견 결과와 기준선 신뢰도를 함께 설명하세요.

### 읽기 전용 소스 코드 디지털 트윈
- inspect_source_twin은 빌드 시 AST로 추출한 파일·함수·import·API·DB 접근·환경변수 이름·테스트·배포 구조를 읽습니다.
- 소스 본문과 환경변수·키·토큰의 실제 값은 수집하거나 반환하지 않습니다. 실제 코드는 반환된 경로와 GitHub 링크에서 사용자가 별도로 확인합니다.
- change_set과 GitHub push 이벤트는 변경 신호이며, 배포 성공이나 런타임 동작을 단독으로 증명하지 않습니다.
- list_source_twin_history와 compare_source_twin_snapshots는 코드·DB 선언·배포·운영 상태의 내부 append-only 이력을 읽습니다. 외부 공증이나 운영자도 위조할 수 없는 증명으로 표현하지 마세요.
- inspect_source_twin, list_source_twin_history, compare_source_twin_snapshots는 읽기 전용입니다. 응답의 writes_performed=false를 확인하세요.
- preview_source_twin_snapshot은 서명된 일회성 계획만 만들며 DB에 쓰지 않습니다. write_set, excludes, 만료 시각을 사용자에게 먼저 설명하세요.
- apply_source_twin_snapshot은 사용자가 그 미리보기 결과를 보고 명확히 승인한 경우에만 호출하세요. AI가 승인 문구를 스스로 만들거나 미리보기와 적용을 연속 자동 실행하면 안 됩니다.
- 승인 계획은 사용자·현재 상태·작업 종류에 묶이고 만료되며 한 번만 실행됩니다. 상태가 달라지거나 만료되면 새 미리보기부터 다시 시작하세요.

### 시스템 지도 관계 복구
- preview_workflow_system_map_relation_repair는 읽기 전용입니다. 먼저 실행해 repairable, protected, blockers와 plan_id를 사용자에게 그대로 설명하세요.
- repair_workflow_system_map_relations는 기존 관계 메타데이터가 완전히 사라졌고 연결선 ID·양 끝이 기준과 일치할 때만 복구합니다. 일부라도 메타데이터가 남은 관계는 덮어쓰지 않습니다.
- 실제 복구는 사용자가 미리보기 결과를 본 뒤 명확히 승인한 경우에만 호출하세요. AI가 스스로 승인하거나 재기준화해서는 안 됩니다.
- 적용 전에 사용자가 오래 열린 Workflow Canvas 탭을 모두 닫거나 최신 배포로 다시 열었는지 확인하세요.
- protection_guard.installed가 true가 아니면 복구를 시도하지 마세요. 적용 도구도 DB 보호 트리거가 없으면 거부합니다.
- plan_id는 캔버스 revision과 manifest에 묶여 있습니다. 불일치하면 적용하지 말고 미리보기를 다시 실행하세요.

### 공유 캔버스
- 초대받은 캔버스도 get_canvases 목록에 나타납니다 (shared:true + permission_scope).
- 편집은 초대 구역 안에서만 서버가 허용합니다: canvas=전체 편집(단, 캔버스 삭제/이름 변경/초기화는 소유자만),
  group=해당 그룹 프레임 안 노드만(새 노드는 자동으로 프레임 안에 생성되고 x/y는 프레임 기준 상대 좌표),
  node=그 노드의 내용·크기만 (이동/삭제/연결선 불가).
- 공유 캔버스에서는 먼저 get_canvas 응답의 my_permission(editable_node_ids)을 확인하세요. 구역 밖 수정 시도는 에러가 됩니다.
- 그룹/노드 초대 권한에서는 create_graph와 단계 종류 편집을 쓸 수 없습니다.

### 반영
로그인된 브라우저는 MCP 변경을 몇 초 내 자동으로 반영합니다 (새로고침 불필요).
`.trim()

export function buildServer(getUserId) {
  const server = new McpServer(
    { name: 'workflow-canvas', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  )
  const g = (fn) => guard(getUserId, fn)

  server.registerTool('get_canvases', {
    description: '로그인한 사용자의 캔버스 목록을 가져옵니다 (canvas_id, 이름, 노드/연결선 개수). 초대받은 공유 캔버스도 포함됩니다 (shared:true + permission_scope).',
    inputSchema: {},
  }, g(async (userId) => ok(await store.listCanvases(userId))))

  server.registerTool('get_canvas', {
    description:
      '특정 캔버스의 노드/연결선 데이터를 가져옵니다. 각 노드의 position(x,y)과 width/height, ' +
      '단계 종류 목록(stage_types)이 포함되므로, 노드를 추가/이동/크기조절하기 전에 항상 먼저 호출해 ' +
      '기존 배치와 간격을 파악할 것. 공유 캔버스에서는 my_permission(초대 구역·editable_node_ids)이 ' +
      '포함되니 편집 전에 반드시 확인할 것.',
    inputSchema: { canvas_id: z.string().describe('캔버스 ID (get_canvases로 조회)') },
  }, g(async (userId, a) => ok(await store.getCanvas(userId, a.canvas_id))))

  server.registerTool('get_stage_types', {
    description:
      '이 캔버스의 계층 분류(stage type) 목록을 조회합니다 — 각 종류가 어느 계층(깊이)에 해당하는지 확인하는 용도.\n\n' +
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
      '캔버스에 새 노드를 추가합니다. type=stage → 단계 노드(label/description/stageTypeIdx), ' +
      'type=memo → 메모 노드(header/text), type=system → 시스템 실체(label + 온톨로지 필드).\n\n' +
      '【단계 노드(stage)란】\n' +
      'stage 노드의 stageTypeIdx는 그 노드가 속한 **계층(hierarchy level)**을 나타낸다. ' +
      '흐름형 캔버스에서는 기획→개발→검토처럼 진행 단계가 곧 계층이고, ' +
      '방사형 캔버스에서는 핵심 주제→추진 방안→세부 과제처럼 깊이가 곧 계층이다. ' +
      '주제·역할·중요도 같은 카테고리 구분에는 쓰지 말 것. ' +
      '(파라미터 이름이 colorIdx가 아니라 stageTypeIdx인 이유: 이 값은 "색상 선택"이 아니라 ' +
      '"어느 계층에 속하는가"를 나타내며, 색은 계층에 따라오는 부수 효과일 뿐이다.)\n' +
      'memo 노드는 계층 구조의 구성원이 아니다 — 비고·참조·참고사항 등 보조 설명 전용이며, ' +
      '반드시 대상 stage 옆에 꼬리표처럼 붙이고 점선으로 연결할 것.\n\n' +
      '【시스템 노드(system)란】\n' +
      '앱·API·서버 함수·DB·테이블·인증·정책·배포 환경 같은 시스템 실체를 표현한다. ' +
      '생성 직후 상태는 항상 사람이 선언한 설계이며, MCP 입력만으로 LIVE 디지털 트윈이 될 수 없다. ' +
      'purpose/responsibility/constraints/evidence를 채우면 존재 이유·책임 경계·불변 조건·근거를 함께 검토할 수 있다. ' +
      'externalRef에는 자원 식별자만 기록하고 비밀값은 넣지 말 것.\n\n' +
      '【좌표/크기/배치 — 지시 없어도 지킬 것】\n' +
      '- 좌표계: x는 오른쪽(+), y는 아래(+), 단위 px. position은 노드 좌상단 기준. 흐름은 좌→우 또는 위→아래로 일관되게.\n' +
      '- 기본 크기: stage ≈ 220×90, system ≈ 240×130, memo ≈ 180×90. 노드 크기는 자동으로 늘어나지 않으므로, ' +
      'description/text가 두 줄을 넘으면 width/height를 직접 키워서(예: 260×140) 내용이 잘리지 않게 할 것.\n' +
      '- 간격: 노드 중심 간 가로 ≥ 320px, 세로 ≥ 200px. 메모는 관련 stage 노드 위/아래 ~250px에 배치.\n' +
      '- 겹침 금지: get_canvas로 기존 노드의 position과 width/height를 확인한 뒤 x/y를 명시해 배치할 것. ' +
      '겹치는 좌표를 지정하면 서버가 가장 가까운 빈 자리로 이동시키고 shifted로 알려줌.\n' +
      '- 공유 캔버스(그룹 초대)에서는 새 노드가 자동으로 초대 그룹 프레임 안에 생성되며 x/y는 프레임 기준 상대 좌표다.\n' +
      '- 흐름·인과·순서가 있는 노드들을 만들었으면, 사용자가 시키지 않아도 create_edge로 바로 연결까지 마칠 것.\n\n' +
      '⚠️ 노드를 2개 이상 만들 계획이면 이 도구를 반복 호출하지 말고 create_graph 하나로 만들 것 (훨씬 빠름).',
    inputSchema: {
      canvas_id: z.string(),
      type: z.enum(['stage', 'memo', 'system']),
      label: z.string().optional().describe('단계 또는 시스템 노드 제목 (HTML 지원: <b>, 체크리스트 등)'),
      description: z.string().optional().describe('단계 또는 시스템 노드 설명 (HTML 지원)'),
      stageTypeIdx: z.number().int().min(0).optional().describe(
        '이 노드가 속할 단계 종류의 인덱스. 종류 목록은 캔버스마다 독립적으로 커스터마이즈되는 동적 값이므로 ' +
        '고정된 의미("0=기획" 등)를 가정하지 말 것. 반드시 이 canvas_id로 get_stage_types를 먼저 ' +
        '조회한 뒤, 그중 의미가 맞는 인덱스를 쓸 것. 적합한 종류가 없으면 create_stage_type으로 ' +
        '새로 만들 것.\n\n' +
        '이 노드가 속한 계층(hierarchy level)에 맞는 인덱스를 선택할 것. ' +
        '무조건 0부터 순서대로 쓸 필요 없음 — 캔버스의 계층 구조를 먼저 파악한 뒤 해당 깊이에 맞는 종류를 쓸 것.'
      ),
      colorIdx: z.number().int().min(0).optional().describe('deprecated: stageTypeIdx를 사용할 것 (하위 호환용 별칭).'),
      header: z.string().optional().describe('메모 제목 (HTML 지원)'),
      text: z.string().optional().describe('메모 내용 (HTML 지원: 체크리스트, <details> 등)'),
      ...SYSTEM_NODE_FIELDS,
      x: z.number().optional().describe('x 좌표 (좌상단 기준). 겹침 방지를 위해 명시 권장, 생략 시 빈 공간에 자동 배치.'),
      y: z.number().optional().describe('y 좌표 (좌상단 기준). 겹침 방지를 위해 명시 권장, 생략 시 빈 공간에 자동 배치.'),
      width: z.number().optional().describe('노드 너비(px). stage/system 최소 200, memo 최소 160. 생략 시 기본값.'),
      height: z.number().optional().describe('노드 높이(px). stage/memo 최소 80, system 최소 110. 생략 시 기본값.'),
      dimmed: z.boolean().optional().describe('노드를 흐리게 표시 (완료/비활성 표현용, 데이터는 유지됨).'),
      target_group_id: z.string().optional().describe(
        '공유 캔버스에서 편집 가능한 그룹이 여러 개일 때 새 노드를 넣을 그룹 id. ' +
        'get_canvas의 my_permission.grants에서 group target_id를 확인하세요.'
      ),
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
      '노드를 2개 이상 만들 때는 반드시 create_node 반복 대신 이 도구를 사용할 것 (왕복이 수십 배 절약됨).\n' +
      '공유 캔버스의 그룹/노드 초대 권한에서는 사용할 수 없다 (단건/복수 도구 사용).\n\n' +
      '【긴 텍스트 → 구조화 레시피】\n' +
      '긴 대화·요리법·제품 구조·아키텍처를 캔버스로 변환할 때:\n' +
      '- 주제·단계·산출물 = stage 노드 (stageTypeIdx로 계층(깊이) 구분 — 먼저 get_stage_types 확인)\n' +
      '- 앱·API·DB·인증·정책·배포 환경 = system 노드 (purpose/responsibility/constraints/evidence로 온톨로지와 판단 근거 기록)\n' +
      '- 보조 설명·팁·주의·비고 = memo 노드 + 대상 stage로 edge (memo는 계층이 아니라 주석; 점선 자동)\n' +
      '- 순서·인과·의존 = edges\n' +
      '- 세부 하위 단계는 노드를 늘리지 말고 description 안 체크리스트로: ' +
      '<div class="cl-item"><input type="checkbox">&nbsp;항목</div> 반복\n' +
      '- 접을 내용은 <details><summary>제목</summary><div>내용</div></details>, 강조는 <b>, <font color>\n\n' +
      '【배치】\n' +
      'layout 프리셋: radial=방사형(중심 부모에서 4방향으로 뻗어나감, 각 방향에서 계속 바깥으로 확장, ' +
      '새끼 노드는 부모의 한 연결점에서 나옴, 메모는 꼬리표처럼 수직 방향으로 붙음), ' +
      'right/down/left/up=방향형(부모→새끼 방향으로 뻗어나감, 모든 새끼가 부모의 단일 연결점에서 출발, ' +
      '연결선과 노드가 교차하지 않도록 위치 자동 조정), manual=직접 좌표(모든 노드에 x/y 필수). ' +
      "auto(기본): in-degree-0 구조 노드(stage/system)가 정확히 1개이고 out-degree≥3이고 구조 노드 수≥5이면 radial, 아니면 right.\n\n" +
      '【3단계 절차 요약】\n' +
      '1. 자료 재구성: 계층 스트림 정리 + 비고 분류 → 2. 노드 제작: stage type=계층 이름, label=개별 주제, memo=비고 → 3. 이 도구 한 번으로 생성 (layout 파라미터로 방향 지정)\n\n' +
      '노드 참조: 각 노드에 고유한 tmp_id를 부여하고 edges에서 그 tmp_id로 참조. ' +
      '기존 노드 id(get_canvas로 확인)도 edge의 source/target으로 쓸 수 있음. ' +
      '응답의 created_nodes에 tmp_id → 실제 id 매핑이 담김.',
    inputSchema: {
      canvas_id: z.string(),
      nodes: z.array(z.object({
        tmp_id: z.string().describe('이 호출 안에서 고유한 임시 id (edges에서 참조용)'),
        type: z.enum(['stage', 'memo', 'system']),
        label: z.string().optional().describe('stage 또는 system 제목 (HTML 지원)'),
        description: z.string().optional().describe('stage 또는 system 설명 (HTML 지원: 체크리스트 등)'),
        stageTypeIdx: z.number().int().min(0).optional().describe('단계 종류 인덱스 (get_stage_types로 유효 범위 확인)'),
        header: z.string().optional().describe('memo 제목 (HTML 지원)'),
        text: z.string().optional().describe('memo 내용 (HTML 지원)'),
        ...SYSTEM_NODE_FIELDS,
        x: z.number().optional().describe("layout:'manual'일 때만 사용됨"),
        y: z.number().optional().describe("layout:'manual'일 때만 사용됨"),
        width: z.number().optional().describe('내용이 길면 키울 것 (stage/system 최소 200)'),
        height: z.number().optional().describe('내용이 길면 키울 것 (system 최소 110, 그 외 최소 80)'),
        dimmed: z.boolean().optional(),
      })).min(1).max(100),
      edges: z.array(z.object({
        source: z.string().describe('tmp_id 또는 기존 노드 id'),
        target: z.string().describe('tmp_id 또는 기존 노드 id'),
        ...EDGE_RELATION_FIELDS,
        sourceHandle: z.enum(['left', 'right', 'top', 'bottom']).optional().describe('생략 시 자동 계산'),
        targetHandle: z.enum(['left', 'right', 'top', 'bottom']).optional().describe('생략 시 자동 계산'),
      })).max(300).optional(),
      layout: z.enum(['auto', 'radial', 'right', 'down', 'left', 'up', 'manual']).optional().describe("생략/'auto': 휴리스틱으로 radial 또는 right 자동 선택. radial=4방향 확장형, right/down/left/up=방향 확장형, manual=모든 노드에 x/y 필수"),
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
      ...SYSTEM_NODE_FIELDS,
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional().describe('노드 너비(px). stage/system 최소 200, memo 최소 160.'),
      height: z.number().optional().describe('노드 높이(px). system 최소 110, 그 외 최소 80.'),
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
        ...SYSTEM_NODE_FIELDS,
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
      '두 노드를 의미 있는 관계로 연결합니다. 메모 노드가 포함되면 점선으로 표시됩니다. ' +
      'relationType은 source가 target에 대해 맺는 관계입니다 (예: API --reads→ DB).\n\n' +
      '흐름·인과·계층·관계가 있는 노드들은 사용자가 따로 요청하지 않아도 능동적으로 연결할 것 ' +
      '(예: 프로세스를 그렸으면 단계 순서대로, 메모를 만들었으면 대상 노드에). ' +
      '단, 관계가 불명확한 노드까지 전부 잇지는 말 것.\n\n' +
      'sourceHandle/targetHandle은 생략해도 된다 — 생략 시 두 노드의 실제 좌표를 보고 가장 자연스러운 ' +
      '면이 자동으로 계산된다. "좌→우는 항상 right/left" 식으로 기계적으로 고정하지 말고, 특정 면을 ' +
      '꼭 지정해야 할 특별한 이유가 있을 때만 명시할 것.\n\n' +
      '같은 source→target이라도 reads와 writes처럼 관계가 다르면 각각 만들 수 있습니다. ' +
      '같은 방향·같은 relationType만 중복으로 거부됩니다. 새 노드들과 함께 여러 연결을 만들 때는 create_graph를 쓸 것.',
    inputSchema: {
      canvas_id: z.string(),
      source: z.string().describe('출발 노드 id'),
      target: z.string().describe('도착 노드 id'),
      ...EDGE_RELATION_FIELDS,
      sourceHandle: z.enum(['left', 'right', 'top', 'bottom']).optional().describe('생략 시 자동 계산'),
      targetHandle: z.enum(['left', 'right', 'top', 'bottom']).optional().describe('생략 시 자동 계산'),
    },
  }, g(async (userId, a) => ok(await store.createEdge(userId, a.canvas_id, a))))

  server.registerTool('update_edge', {
    description:
      '기존 연결선 1개의 관계 의미와 라벨 표시 여부를 수정합니다. ' +
      'source/target 자체를 바꾸려면 연결선을 삭제하고 다시 생성하세요. 2개 이상은 update_edges를 사용합니다.',
    inputSchema: {
      canvas_id: z.string(),
      edge_id: z.string(),
      ...EDGE_RELATION_FIELDS,
    },
  }, g(async (userId, a) => okh(
    await store.updateEdge(userId, a.canvas_id, a.edge_id, a),
    '관계 의미가 저장되었고 브라우저에 몇 초 내 반영됩니다.',
  )))

  server.registerTool('update_edges', {
    description:
      '여러 연결선의 관계 의미를 한 번에 수정합니다. 존재하지 않는 edge_id가 하나라도 있으면 전체가 실패합니다.',
    inputSchema: {
      canvas_id: z.string(),
      patches: z.array(z.object({
        edge_id: z.string(),
        ...EDGE_RELATION_FIELDS,
      })).min(1).max(100),
    },
  }, g(async (userId, a) => okh(
    await store.updateEdges(userId, a.canvas_id, a.patches),
    '관계 의미가 저장되었고 브라우저에 몇 초 내 반영됩니다.',
  )))

  server.registerTool('delete_edge', {
    description: '연결선을 삭제합니다.',
    inputSchema: { canvas_id: z.string(), edge_id: z.string() },
  }, g(async (userId, a) => ok(await store.deleteEdge(userId, a.canvas_id, a.edge_id))))

  server.registerTool('create_canvas', {
    description: '새 캔버스를 생성합니다. 새 캔버스는 기본 단계 종류(기획·개발·검토·배포·완료)로 시작합니다.',
    inputSchema: { name: z.string().optional().describe('캔버스 이름 (생략 시 "새 캔버스")') },
  }, g(async (userId, a) => okh(await store.createCanvas(userId, a.name), '이제 create_graph로 내용을 채우세요.')))

  server.registerTool('create_workflow_system_map', {
    description:
      '제품 소유자 전용: 현재 코드·SQL 구조를 바탕으로 Workflow Canvas 자체 시스템 지도를 새 캔버스에 만듭니다. ' +
      '사용자 UI, Vercel/API, Supabase 데이터·보안, 개발·배포 구역과 근거가 기록된 관계를 포함합니다. ' +
      '서버의 WORKFLOW_CANVAS_OWNER_USER_ID와 요청 사용자가 일치할 때만 실행됩니다.',
    inputSchema: {
      name: z.string().max(120).optional().describe('생략 시 "Workflow Canvas 시스템 지도"'),
    },
  }, g(async (userId, a) => okh(
    await store.createWorkflowSystemMap(userId, a.name),
    '새 캔버스가 생성되었습니다. 브라우저에서 구역별 저장 뷰와 관계 근거를 검토하세요.',
  )))

  server.registerTool('inspect_workflow_system_map', {
    description:
      '제품 소유자 전용 읽기 전용 검사: Workflow Canvas 시스템 지도와 배포 시점의 코드·SQL·설정 manifest를 비교해 ' +
      '달라진 근거, 지도에서 누락된 항목, 아직 모델링되지 않은 자원을 보고합니다. 비밀값은 manifest에 저장하거나 반환하지 않으며 ' +
      '캔버스·코드·DB를 전혀 수정하지 않습니다. changed/needs_review는 자동 수정 근거가 아니라 사람의 재검토 신호입니다.',
    inputSchema: {
      canvas_id: z.string().describe('검사할 Workflow Canvas 시스템 지도의 캔버스 ID'),
    },
  }, g(async (userId, a) => ok(await store.inspectWorkflowSystemMap(userId, a.canvas_id))))

  server.registerTool('inspect_source_twin', {
    description:
      '제품 소유자 전용 읽기 전용 조회: 배포에 포함된 AST 소스 manifest에서 파일·함수·import·API·DB 접근·' +
      '환경변수 이름·테스트·배포 구조와 최근 변경 신호를 조회합니다. 소스 본문과 비밀값은 반환하지 않으며 ' +
      '코드·DB·캔버스·배포를 수정하지 않습니다.',
    inputSchema: {
      perspective: z.enum(SOURCE_TWIN_PERSPECTIVE_IDS).optional().describe('전체/기능/코드/DB/보안/배포 관점. 기본 all.'),
      query: z.string().max(120).optional().describe('파일명·함수명·경로·요약 검색어.'),
      limit: z.number().int().min(1).max(500).optional().describe('반환할 entity 최대 개수. 기본 200.'),
    },
  }, g(async (userId, a) => ok(await store.inspectSourceTwin(userId, a))))

  server.registerTool('list_source_twin_history', {
    description:
      '제품 소유자 전용 읽기 전용 조회: 코드·DB 선언·배포·운영 상태를 함께 기록한 내부 append-only 스냅샷 목록을 ' +
      '가져옵니다. 이 이력은 운영 추적용이며 외부 공증이나 운영자도 위조할 수 없는 증명은 아닙니다.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe('최근 스냅샷 개수. 기본 30.'),
    },
  }, g(async (userId, a) => ok(await store.getSourceTwinHistory(userId, a.limit))))

  server.registerTool('compare_source_twin_snapshots', {
    description:
      '제품 소유자 전용 읽기 전용 비교: 두 통합 상태 스냅샷 사이의 코드 entity, DB 선언, 배포, 운영 지표, ' +
      '런타임 검증, 보안 선언 차이를 계산합니다. 어떤 시스템도 수정하지 않습니다.',
    inputSchema: {
      from_snapshot_id: z.string().min(1).max(160).describe('이전 스냅샷 ID'),
      to_snapshot_id: z.string().min(1).max(160).describe('이후 스냅샷 ID'),
    },
  }, g(async (userId, a) => ok(await store.compareSourceTwinHistory(
    userId,
    a.from_snapshot_id,
    a.to_snapshot_id,
  ))))

  server.registerTool('preview_source_twin_snapshot', {
    description:
      '제품 소유자 전용 읽기 전용 계획: 현재 코드·DB 선언·배포·운영·런타임·보안 상태를 내부 스냅샷으로 ' +
      '생성할 범위, 최대 쓰기 행, 제외 정보, 복구 성격, 만료 시각을 보여주고 서명된 일회성 plan_token을 발급합니다. ' +
      '이 단계에서는 DB·코드·캔버스·배포를 수정하지 않습니다.',
    inputSchema: {},
  }, g(async (userId) => ok(await store.previewSourceTwinSnapshot(userId))))

  server.registerTool('apply_source_twin_snapshot', {
    description:
      '제품 소유자 전용 제한적 쓰기: 사용자가 preview_source_twin_snapshot 결과를 직접 검토하고 명확히 승인한 뒤에만 ' +
      '현재 상태와 일치하는 미만료 계획을 한 번 실행합니다. 상태 스냅샷 1건과 조작 감사 기록 1건을 같은 DB 트랜잭션으로 ' +
      '추가하며 앱 코드·운영 DB 구조·배포·캔버스 본문은 변경하지 않습니다.',
    inputSchema: {
      plan_token: z.string().min(1).max(16000).describe('직전 미리보기에서 받은 서명된 일회성 plan_token'),
      confirmation: z.literal(SOURCE_TWIN_OPERATION_CONFIRMATION).describe(
        `사용자가 미리보기 범위를 승인한 경우에만 ${SOURCE_TWIN_OPERATION_CONFIRMATION}`),
    },
  }, g(async (userId, a) => ok(await store.applySourceTwinSnapshot(
    userId,
    a.plan_token,
    a.confirmation,
  ))))

  server.registerTool('preview_workflow_system_map_relation_repair', {
    description:
      '제품 소유자 전용 읽기 전용 미리보기: 시스템 지도의 연결선 ID·양 끝과 관계 메타데이터를 기준 템플릿과 비교해 ' +
      '안전하게 복구 가능한 항목, 보호할 기존 수정, 구조적 차단 항목을 보고하고 revision 고정 plan_id를 만듭니다. ' +
      '캔버스·코드·DB를 수정하지 않습니다.',
    inputSchema: {
      canvas_id: z.string().describe('복구 가능 여부를 미리 볼 Workflow Canvas 시스템 지도 ID'),
    },
  }, g(async (userId, a) => ok(await store.previewWorkflowSystemMapRelationRepair(userId, a.canvas_id))))

  server.registerTool('repair_workflow_system_map_relations', {
    description:
      '제품 소유자 전용 제한적 쓰기: 사용자가 읽기 전용 미리보기를 검토하고 명시적으로 승인한 뒤에만 호출합니다. ' +
      '현재 revision의 plan_id와 연결선 ID·양 끝이 모두 일치하고 관계 메타데이터가 완전히 없는 선만 복구합니다. ' +
      '기존 관계 정보, 노드, 배치, 사용자 추가 항목은 덮어쓰지 않습니다. 오래 열린 앱 탭을 먼저 닫아야 합니다.',
    inputSchema: {
      canvas_id: z.string().describe('복구할 Workflow Canvas 시스템 지도 ID'),
      plan_id: z.string().regex(/^[a-f0-9]{64}$/).describe('직전 읽기 전용 미리보기에서 받은 현재 revision 전용 plan_id'),
      confirmation: z.literal(WORKFLOW_RELATION_REPAIR_CONFIRMATION).describe(
        `사용자가 미리보기 결과를 승인한 경우에만 ${WORKFLOW_RELATION_REPAIR_CONFIRMATION}`),
    },
  }, g(async (userId, a) => ok(await store.repairWorkflowSystemMapRelations(
    userId,
    a.canvas_id,
    a.plan_id,
    a.confirmation,
  ))))

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
    // Streamable HTTP: a GET is the client trying to open a server→client SSE
    // stream. We don't offer one, and the spec requires 405 in that case —
    // answering 200 with plain JSON sends clients into a reconnect loop that
    // blocks all tool calls.
    res.statusCode = 405
    res.setHeader('Allow', 'POST, OPTIONS')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed. POST JSON-RPC to this endpoint (no SSE stream offered).' }))
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
