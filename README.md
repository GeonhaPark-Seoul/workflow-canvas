# Workflow Canvas

노드 기반 워크플로우 다이어그램 도구 (React + Vite + [@xyflow/react](https://reactflow.dev)).
단계/메모 노드를 연결해 흐름을 그리고, 로그인 시 Supabase로 클라우드 동기화됩니다.

라이브: https://workflow-canvas-orpin.vercel.app

---

## MCP 서버

Claude 같은 MCP 클라이언트가 캔버스에 **직접 접근**해서 노드/연결선을 읽고 쓸 수 있는
MCP 서버가 포함되어 있습니다. Vercel 서버리스 함수(`/api/mcp`)로 배포되며,
Supabase 데이터베이스를 기반으로 동작합니다.

- 코드: [`mcp/`](mcp/) (서버 로직) · [`api/mcp.js`](api/mcp.js) (Vercel 진입점)
- 전송 방식: MCP Streamable HTTP (stateless, JSON 응답)
- 인증: Bearer 토큰 → 본인 user_id로 스코프. **로그인한 사용자 본인 캔버스만** 접근 가능.

### 제공 도구

| 도구 | 설명 |
|---|---|
| `get_canvases` | 캔버스 목록 (id, 이름, 노드/연결선 개수) |
| `get_canvas` | 특정 캔버스의 노드/연결선 데이터 (단계 종류·크기·dimmed·연결 방향 포함) |
| **`create_graph`** | **노드+연결선 그래프 전체를 한 번에 생성 (자동 레이아웃 지원) — 대량 작업의 기본 도구** |
| `create_node` | 노드 1개 추가 (2개 이상은 `create_graph` 사용) |
| `update_node` / `update_nodes` | 노드 1개 / 여러 개 수정 (제공한 필드만, `dimmed` 포함) |
| `delete_node` / `delete_nodes` | 노드 1개 / 여러 개 삭제 (연결선도 함께) |
| `create_edge` | 연결선 추가 (중복 연결은 거부) |
| `delete_edge` | 연결선 삭제 |
| `create_canvas` | 새 캔버스 생성 |
| `rename_canvas` | 캔버스 이름 변경 (탭에 반영) |
| `delete_canvas` | 캔버스 삭제 (마지막 1개는 불가) |
| `clear_canvas` | 캔버스 전체 초기화 |
| `get_stage_types` | 단계 노드 종류(라벨) 목록 조회 (캔버스별) |
| `create_stage_type` | 새 단계 종류 추가 (캔버스별) |
| `rename_stage_type` | 단계 종류 이름 변경 (캔버스별) |
| `delete_stage_type` | 단계 종류 삭제 (캔버스별, 해당 종류를 쓰던 노드는 자동 재분류) |

> 단계 노드의 종류(`stageTypeIdx`가 가리키는 라벨)는 고정 값이 아니라 사용자가
> 자유롭게 이름을 바꾸거나 추가/삭제할 수 있는 목록입니다. **캔버스마다 독립적으로
> 관리**되며, 새 캔버스는 항상 기본값(기획·개발·검토·배포·완료)에서 시작합니다.
> `get_stage_types`(canvas_id 필요)로 조회하세요.

> 노드 텍스트(label/description/header/text)는 HTML을 지원합니다 — 볼드, 색상,
> 체크리스트(`<div class="cl-item"><input type="checkbox">…`), 접기(`<details>`),
> 이미지(data URL). 서버가 안전하지 않은 태그(script 등)를 자동 제거합니다
> (정규식 allowlist — 캔버스 공유 기능이 생기면 DOMPurify로 교체할 것).
> 뷰(화면 영역 저장) 도구는 의도적으로 제공하지 않습니다 — 뷰포트는 클라이언트 개념입니다.

### AI로 긴 텍스트 구조화하기

긴 대화·요리법·제품 구조도를 캔버스로 옮기는 것이 이 MCP의 핵심 사용 사례입니다.
Claude에게 예를 들어 이렇게 요청하세요:

> *"아래 김치찌개 레시피를 '요리' 캔버스에 구조화해줘. 준비/조리/마무리 단계로 나누고,
> 재료 손질 같은 세부 항목은 노드 안 체크리스트로, 팁은 메모로 붙여줘. (레시피 전문 …)"*

AI가 `create_graph` 한 번으로 전체 흐름을 그리며, 로그인된 브라우저에는 몇 초 내
자동으로 나타납니다.

---

## 설정

### 1) Supabase 테이블

이미 `supabase-schema.sql`을 실행했다면, MCP용 토큰 테이블만 추가하면 됩니다.
Supabase Dashboard → SQL Editor에서 [`supabase-mcp-schema.sql`](supabase-mcp-schema.sql) 실행:

```sql
create table if not exists mcp_tokens (
  token       text        primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  label       text,
  created_at  timestamptz default now()
);
alter table mcp_tokens enable row level security; -- 정책 없음: service role만 접근
```

기존 DB에 `canvases.stage_types` 컬럼이 없다면 [`supabase-canvas-stage-types.sql`](supabase-canvas-stage-types.sql)도
실행하세요 (단계 종류를 캔버스별로 분리하는 마이그레이션).

**실시간 반영**을 켜려면 [`supabase-realtime.sql`](supabase-realtime.sql)을 실행하세요
(또는 Dashboard → Database → Replication → `supabase_realtime`에 `canvases` 추가).
이걸 실행해야 AI(MCP)가 캔버스를 고칠 때 열려있는 브라우저에 몇 초 내 자동 반영됩니다.

### 2) 토큰 발급

SQL Editor에서:

```sql
-- 내 user_id 확인
select id, email from auth.users;

-- 토큰 생성 (user_id 교체)
insert into mcp_tokens (token, user_id, label)
values (encode(gen_random_bytes(24), 'hex'), '<YOUR-USER-ID>', 'claude');

-- 생성된 토큰 복사
select token from mcp_tokens where user_id = '<YOUR-USER-ID>';
```

### 3) Vercel 환경변수

Vercel 프로젝트 → Settings → Environment Variables에 추가:

| 변수 | 필수 | 설명 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase Dashboard → Settings → API의 service_role 키 (서버에서만 사용, 절대 노출 금지) |
| `SUPABASE_URL` | 선택 | 기본값은 앱의 Supabase 프로젝트 URL |

### 4) 배포

```bash
vercel --prod
```

배포 후 엔드포인트: `https://<your-app>.vercel.app/api/mcp`
(브라우저로 GET 하면 `{"status":"ok"}`가 보이면 정상)

---

## MCP 클라이언트 연결

발급한 토큰을 `<TOKEN>`, 엔드포인트를 `https://<your-app>.vercel.app/api/mcp`로 바꿔 사용하세요.

### Claude Code (CLI)

```bash
claude mcp add --transport http workflow-canvas \
  https://<your-app>.vercel.app/api/mcp \
  --header "Authorization: Bearer <TOKEN>"
```

### Claude Desktop

원격 HTTP MCP는 [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) 브리지로 연결합니다.
`claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "workflow-canvas": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<your-app>.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer <TOKEN>"
      ]
    }
  }
}
```

연결 후 Claude에게 예를 들어 이렇게 요청할 수 있습니다:
*"내 캔버스 목록 보여줘"*, *"'📱 스타트업 앱 출시' 캔버스에 '마케팅' 단계 노드 추가하고 '정식 출시'에 연결해줘."*

---

## 참고

- `supabase-realtime.sql`을 실행했다면 MCP가 캔버스를 수정하는 즉시(몇 초 내) 열려있는 브라우저에 자동 반영됩니다. 단, 텍스트를 **편집하는 도중**에는 반영이 잠시 보류되고, 같은 노드를 사람과 AI가 정확히 동시에 고치면 나중에 저장된 쪽이 이깁니다 — 같은 캔버스를 동시에 집중 편집하는 것은 피하세요. (실행 전이라면 기존처럼 탭 전환/새로고침 시 반영)

- **배포 후 확인 체크리스트**: ① `supabase-realtime.sql` 실행 → ② 앱을 열어 로그인 → ③ Claude 대화에서 `create_graph` 호출 → ④ 열린 브라우저에 몇 초 내 노드가 나타나는지 확인. MCP로 `rename_canvas` 하면 탭 이름도 바뀌어야 합니다.
- 토큰은 본인 캔버스에 대한 전체 접근 권한입니다. 유출 시 `delete from mcp_tokens where token = '...'`로 폐기하세요.
- service_role 키는 서버(Vercel 환경변수)에만 두고 클라이언트에 노출하지 마세요.

## 로컬 개발

```bash
npm install
npm run dev        # 앱 (Vite)
vercel dev         # 앱 + /api/mcp 함수 로컬 실행 (Vercel CLI 필요)
```
