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
| `get_canvas` | 특정 캔버스의 노드/연결선 데이터 (단계 종류 목록 포함) |
| `create_node` | 노드 추가 (`type`: `stage` 또는 `memo`, 위치·크기 `width`/`height` 지정 가능) |
| `update_node` | 노드 내용/위치/크기 수정 (제공한 필드만) |
| `delete_node` | 노드 삭제 (연결된 연결선도 함께) |
| `create_edge` | 두 노드 간 연결선 추가 |
| `delete_edge` | 연결선 삭제 |
| `create_canvas` | 새 캔버스 생성 |
| `clear_canvas` | 캔버스 전체 초기화 |
| `get_stage_types` | 단계 노드 종류(라벨) 목록 조회 |
| `create_stage_type` | 새 단계 종류 추가 |
| `rename_stage_type` | 단계 종류 이름 변경 |
| `delete_stage_type` | 단계 종류 삭제 (해당 종류를 쓰던 노드는 자동 재분류) |

> 단계 노드의 종류(`stageTypeIdx`가 가리키는 라벨)는 고정 값이 아니라 사용자가
> 자유롭게 이름을 바꾸거나 추가/삭제할 수 있는 목록입니다. `get_stage_types`로 조회하세요.

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

- MCP가 캔버스를 수정해도, **웹앱이 열려 있으면 새로고침해야** 반영됩니다 (앱은 실시간 구독을 하지 않음). 앱이 열린 채로 편집 중이면 앱의 자동저장이 MCP 변경을 덮어쓸 수 있으니, 가급적 앱을 닫은 상태에서 MCP로 작업한 뒤 새로고침하세요.
- 토큰은 본인 캔버스에 대한 전체 접근 권한입니다. 유출 시 `delete from mcp_tokens where token = '...'`로 폐기하세요.
- service_role 키는 서버(Vercel 환경변수)에만 두고 클라이언트에 노출하지 마세요.

## 로컬 개발

```bash
npm install
npm run dev        # 앱 (Vite)
vercel dev         # 앱 + /api/mcp 함수 로컬 실행 (Vercel CLI 필요)
```
