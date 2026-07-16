# Workflow Canvas

노드 기반 워크플로우 다이어그램 도구 (React + Vite + [@xyflow/react](https://reactflow.dev)).
단계/메모 노드를 연결해 흐름을 그리고, 로그인 시 Supabase로 클라우드 동기화됩니다.

라이브: https://workflow-canvas-orpin.vercel.app

---

## 디지털 트윈 변경 검토

시스템 지도 캔버스에서는 배포에 포함된 발견 manifest와 캔버스의 선언 모델을 비교해
`실체`, `관계`, `미모델 자원` 변경을 앱 안의 검토 패널로 보여줍니다. 현재 데이터는
코드·SQL·설정에서 **발견된 상태**이며 실제 런타임 작동을 확인한 것으로 표시하지 않습니다.

- 공통 검토 모델: [`shared/digitalTwinReview.js`](shared/digitalTwinReview.js)
- 추가 전용 수정안 모델: [`shared/digitalTwinProposal.js`](shared/digitalTwinProposal.js)
- 첫 소스 어댑터: [`shared/workflowSystemTwinAdapter.js`](shared/workflowSystemTwinAdapter.js)
- 어댑터 레지스트리: [`src/lib/digitalTwinAdapters.js`](src/lib/digitalTwinAdapters.js)
- 검토 UI: [`src/components/DigitalTwinReviewPanel.jsx`](src/components/DigitalTwinReviewPanel.jsx)

검토 결정은 시스템 지도 루트 노드에 저장되므로 기존 캔버스 동기화와 3-way 병합을 그대로
사용합니다. `확인함` 또는 `무시`는 지도나 비교 기준을 자동으로 변경하지 않습니다. 같은
항목의 실제 근거 지문이 다시 바뀌면 이전 결정을 재사용하지 않고 검토 대상으로 다시
나타냅니다. Workflow Canvas 전용 지식은 어댑터에만 두므로 물류·CRM·재무 등 다른 소스도
공통 검토 UI와 상태 모델을 재사용할 수 있습니다.

지도에 없는 발견 자원은 `수정안 보기`로 새 노드와 연결선을 임시 표시할 수 있습니다.
미리보기는 캔버스 저장 상태를 바꾸지 않으며, 소유자가 펼쳐진 수정안에서 `지도에 적용`을
눌러야만 추가됩니다. 이 단계의 수정안 엔진은 기존 노드·연결선의 수정과 삭제 작업을
입력 단계에서 거부합니다. 적용된 노드에는 출처·자원 키·관찰 지문이 남아 같은 자원을
중복 제안하지 않고, 이후 구현 지문이 달라지거나 소스에서 사라지면 다시 검토 신호를 냅니다.

### 소스 코드 디지털 트윈과 통합 상태 이력

제품 소유자는 Workflow Canvas 시스템 지도에서 관련 실체를 선택해 그 실체의 근거를 엽니다.
`로컬 코드 저장소` 노드는 배포 빌드에 포함된 checkout의 코드 구조를, `GitHub 저장소` 노드는
manifest 변경분과 push 신호를, `Vercel` 노드는 배포·운영 상태 이력을 보여줍니다. 전역 코드
레일은 사용하지 않습니다. 빌드 시 Babel AST와 SQL 선언을 결정적으로 분석해 파일, 함수,
import, API 경로, DB 테이블·함수·RLS, 환경변수 **이름**, 테스트, 배포 설정을 자연어 코드
트리로 만듭니다. 기본 설명은 함수 개수 대신 제품에서 맡은 역할과 사용자에게 미치는 영향을
말합니다. 코드 저장소 보기 안에서만 `제품 영역 → 하위 시스템 → 파일 → 함수` 순서로 묶어
디지털 트윈 엔진 같은 기능의 시작과 범위를 먼저 볼 수 있고, 하위 시스템은 기본적으로
접혀 있어 필요한 묶음만 펼칩니다. 이 분류는 실제 프로젝트 폴더나 시스템 지도 노드를
재배치하지 않습니다. `쉬운 설명`은 제품 역할과 사용자 영향을, `개발자 정보`는 함수·import
개수, 줄 번호와 API·DB 참조를 우선 표시합니다. 생성된 설명에는 사용한 결정 규칙과 상대
파일·함수 줄·API·DB·환경변수 이름 근거가 연결되며, 각 항목은 GitHub의 실제 코드 줄로
이동할 수 있습니다. 브라우저가 Mac의
미커밋 작업 폴더를 직접 읽는 것은 아닙니다. 사용자가 별도로 실행한 로컬 커넥터가 허용한
Git 저장소를 분석해 본문이 제거된 구조 manifest와 Git 상태를 아웃바운드 HTTPS로 갱신합니다.
커넥터는 기본 읽기 전용이며, Git 동기화는 시작 시 명시적으로 허용하고 각 작업을 로컬
터미널에서 다시 승인해야 합니다.

GitHub push webhook은 서명과 저장소를 모두 확인한 뒤 commit SHA, branch, 변경 경로만
append-only 이벤트 이력에 기록합니다. 소스 본문, 커밋 메시지, 환경변수 값, 키·토큰 값은
저장하지 않습니다. push는 `배포 전 변경` 신호이고, 해당 SHA를 포함한 새 Vercel 배포가
열려야 AST 코드 트리의 운영 기준이 바뀝니다.

`Vercel` 노드의 상태 이력은 코드 manifest, DB 선언, Vercel 배포 식별자, 집계 운영 지표,
런타임 검증 상태, 개인정보 기능 선언을 한 시점으로 묶어 비교합니다. 새 상태 기록은 먼저
읽기 전용 계획에서 범위·최대 쓰기·제외 정보·만료 시각을 보여주고, 소유자가 승인해야만
스냅샷 1건과 감사 기록 1건을 같은 DB 트랜잭션으로 생성합니다. 계획은 사용자와 현재 상태에
묶이고 만료되며 재실행할 수 없습니다. 이 이력은 내부 운영 기록이며 외부 공증이나 프로젝트
관리자도 위조할 수 없는 투명성 증명은 아닙니다.

- AST 추출기: [`scripts/source-twin-scanner.mjs`](scripts/source-twin-scanner.mjs)
- 공통 모델: [`shared/sourceTwin.js`](shared/sourceTwin.js)
- 소유자 전용 API·webhook: [`api/source-twin.js`](api/source-twin.js) · [`api/source-twin-webhook.js`](api/source-twin-webhook.js)
- 소스 트리 UI: [`src/components/SourceTwinPanel.jsx`](src/components/SourceTwinPanel.jsx)
- 상태 이력 SQL: [`supabase-source-twin-history.sql`](supabase-source-twin-history.sql)
- 로컬 커넥터 에이전트: [`scripts/local-connector-agent.mjs`](scripts/local-connector-agent.mjs)
- 신뢰영역·게이트웨이 공통 계약: [`shared/trustTopology.js`](shared/trustTopology.js)
- 상용화·보안 부채 장부: [`docs/TECHNICAL_DEBT.md`](docs/TECHNICAL_DEBT.md)
- 범용 트윈 엔진 로드맵: [`docs/TWIN_ENGINE_ROADMAP.md`](docs/TWIN_ENGINE_ROADMAP.md)
- 제품·엔진 카탈로그: [`docs/product/PRODUCT_CATALOG.md`](docs/product/PRODUCT_CATALOG.md)
- 엔진 버전 기록: [`docs/product/ENGINE_CHANGELOG.md`](docs/product/ENGINE_CHANGELOG.md)

### 제품·엔진 구성층

Workflow Canvas 시스템 지도에는 서버·DB·저장소 같은 실제 운영 자원과 별도로
`제품·엔진 구성층 (논리)`이 있습니다. `Twin Core`, `Create Graph`, `Source Lens`,
`Trust Map`, `LiveOps`, `Safe Operations`, `Work Core`, `Intent Engine`, `Connector Bridge`와 내부 구성요소를 보여주며,
각 노드에는 제품·기술 버전, 성숙도, 입력·출력, 코드·테스트 근거와 담당 Maintainer
Agent 상태가 표시됩니다. 이 노드들은 중요한 코드 기능을 눈으로 설명하기 위한 논리
구성요소이며 독립 서버나 실행 프로세스가 아니므로 `LIVE` 대신 `논리 구성`으로 표시됩니다.

기계 가독 원본은 [`shared/engineRegistry.js`](shared/engineRegistry.js)이고
[`shared/capabilityMapper.js`](shared/capabilityMapper.js)가 같은 내용을 시스템 지도 노드와
관계로 변환합니다. 기존 시스템 지도에서는 검토 패널의 세 단계 묶음 수정안을 순서대로
승인해 논리 구성층을 추가합니다. 각 단계는 현재 지도를 다시 검사하므로 오래된 수정안을
한 번에 덮어쓰지 않습니다.

### 범용 트윈 엔진 방향

다른 소프트웨어를 캔버스에 연결하는 사용자 작업은 `시스템 가져오기`, 공급자별 발견·조작
모듈은 `트윈 어댑터`, 근거를 공통 그래프로 변환하는 과정은 `트윈 빌드`라고 부릅니다.
노드는 실체, 파츠는 능력과 입출력 포트, 연결선은 계약과 흐름을 나타냅니다. 로컬 기기,
인트라넷, 사설·공개 클라우드, 인터넷, 외부 SaaS는 신뢰 구역으로 구분하며 구역을 넘는
관계는 인증·권한·데이터 종류가 명시된 게이트웨이를 거쳐야 합니다. 상세 모델과 단계별
조작 범위는 [`docs/TWIN_ENGINE_ROADMAP.md`](docs/TWIN_ENGINE_ROADMAP.md)를 기준으로 합니다.
공통 계약은 영역이 다르지만 게이트웨이가 없으면 `unknown-gap`으로 판정하며, 이 상태를
안전하거나 폐쇄된 연결로 추측하지 않습니다.

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
| `get_canvas` | 특정 캔버스의 노드/연결선 데이터 (시스템 실체·관계 의미·근거·단계 종류 포함) |
| **`create_graph`** | **노드+연결선 그래프 전체를 한 번에 생성 (자동 레이아웃 지원) — 대량 작업의 기본 도구** |
| `create_node` | 노드 1개 추가 (2개 이상은 `create_graph` 사용) |
| `update_node` / `update_nodes` | 노드 1개 / 여러 개 수정 (제공한 필드만, `dimmed` 포함) |
| `delete_node` / `delete_nodes` | 노드 1개 / 여러 개 삭제 (연결선도 함께) |
| `create_edge` | 타입과 근거가 있는 연결선 추가 (같은 방향·같은 관계 중복은 거부) |
| `update_edge` / `update_edges` | 관계 종류·라벨·출처·작성자 신뢰도·근거 수정 |
| `delete_edge` | 연결선 삭제 |
| `create_canvas` | 새 캔버스 생성 |
| `create_workflow_system_map` | 제품 소유자 전용 내부 시스템 지도 생성 (환경변수로 허용 사용자 제한) |
| `inspect_workflow_system_map` | 제품 소유자 전용 시스템 지도 읽기 전용 점검 (코드·SQL·설정 비교, 쓰기 없음) |
| `inspect_source_twin` | 제품 소유자 전용 AST 코드 트리·변경·운영 상태 읽기 (소스 본문·비밀값 제외) |
| `list_source_twin_history` | 제품 소유자 전용 통합 상태 스냅샷 목록 (읽기 전용) |
| `compare_source_twin_snapshots` | 두 통합 상태 스냅샷의 코드·DB·배포·운영 차이 비교 (읽기 전용) |
| `preview_source_twin_snapshot` | 첫 실제 조작의 범위·쓰기·제외 정보·만료 시각 미리보기 (쓰기 없음) |
| `apply_source_twin_snapshot` | 소유자가 승인한 미만료 계획을 1회 실행해 스냅샷과 감사 기록을 원자적으로 추가 |
| `preview_workflow_system_map_relation_repair` | 제품 소유자 전용 관계 복구 미리보기 (revision 고정 plan 생성, 쓰기 없음) |
| `repair_workflow_system_map_relations` | 승인된 plan에서 메타데이터가 완전히 없는 관계만 제한적으로 복구 |
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

이미 `supabase-schema.sql`을 실행했다면 Supabase Dashboard → SQL Editor에서
[`supabase-mcp-schema.sql`](supabase-mcp-schema.sql)을 실행하세요. 개인 토큰은
SHA-256 digest만 DB에 저장되며, 기존 raw token 행도 재실행 시 연결을 유지한 채
digest로 변환됩니다.

사진 콘텐츠를 사용하려면 [`supabase-canvas-images.sql`](supabase-canvas-images.sql)도
실행해 private Storage bucket과 참여 범위 RLS를 만드세요.

기존 DB에 `canvases.stage_types` 컬럼이 없다면 [`supabase-canvas-stage-types.sql`](supabase-canvas-stage-types.sql)도
실행하세요 (단계 종류를 캔버스별로 분리하는 마이그레이션).

**실시간 반영**을 켜려면 [`supabase-realtime.sql`](supabase-realtime.sql)을 실행하세요
(또는 Dashboard → Database → Replication → `supabase_realtime`에 `canvases` 추가).
이걸 실행해야 AI(MCP)가 캔버스를 고칠 때 열려있는 브라우저에 몇 초 내 자동 반영됩니다.

구버전 탭이 새 관계 메타데이터를 통째로 지우는 저장을 막으려면
[`supabase-relation-metadata-guard.sql`](supabase-relation-metadata-guard.sql)을 실행하세요.
이 트리거는 같은 연결선이 유지되면서 관계 데이터 묶음만 전부 사라질 때만 저장을 거부합니다.
연결선 삭제, 관계 타입 변경, 근거 편집은 허용됩니다.
관계 복구 도구도 이 트리거가 설치되고 활성화된 것을 확인하기 전에는 적용을 거부합니다.

소스 트윈의 GitHub push 이벤트와 통합 상태 이력을 사용하려면
[`supabase-source-twin-history.sql`](supabase-source-twin-history.sql)을 실행하세요. 두 테이블은
브라우저 역할에 공개되지 않고 service role의 조회·추가만 허용하며, update/delete는 트리거가
거부합니다.

### 2) 토큰 발급

앱에서 로그인한 뒤 프로필 → `MCP 연결` → `새 토큰 만들기`를 사용하세요.
연결 URL은 생성 직후 한 번만 복사할 수 있고, 서버에는 복구 불가능한 digest만 남습니다.

### 3) Vercel 환경변수

Vercel 프로젝트 → Settings → Environment Variables에 추가:

| 변수 | 필수 | 설명 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase Dashboard → Settings → API의 service_role 키 (서버에서만 사용, 절대 노출 금지) |
| `SUPABASE_URL` | 선택 | 기본값은 앱의 Supabase 프로젝트 URL |
| `WORKFLOW_CANVAS_OWNER_USER_ID` | 선택 | 내부 시스템 지도와 소스 트윈 조회·이력을 허용할 제품 소유자의 Supabase Auth 사용자 UUID. 미설정 시 관련 도구는 비활성화됨 |
| `WORKFLOW_CANVAS_GITHUB_WEBHOOK_SECRET` | 선택 | GitHub push 서명 검증용 임의의 긴 비밀값. 미설정 시 배포 manifest 비교만 사용 |
| `WORKFLOW_CANVAS_OPERATION_SIGNING_SECRET` | 선택 | 승인 계획 전용 HMAC 비밀값(32자 이상). 미설정 시 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`를 사용하므로 별도 설정 없이 동작 |

### 4) 배포

```bash
vercel --prod
```

배포 후 엔드포인트: `https://<your-app>.vercel.app/api/mcp`.
Streamable HTTP 규격상 브라우저 GET은 의도적으로 `405`를 반환하고 MCP의 POST 요청만 처리합니다.

GitHub 실시간 변경 신호를 쓰려면 저장소 Settings → Webhooks에서 Payload URL을
`https://<your-app>.vercel.app/api/source-twin-webhook`, Content type을 `application/json`,
Secret을 Vercel의 `WORKFLOW_CANVAS_GITHUB_WEBHOOK_SECRET`과 같게 설정하고 push 이벤트만
선택하세요. 다른 저장소 이름의 이벤트는 서명이 맞아도 거부됩니다.

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

- `supabase-realtime.sql`을 실행했다면 MCP 수정이 열린 브라우저에 자동 반영됩니다. 브라우저·공유 API·MCP 저장은 revision 조건을 사용하고, 서로 다른 필드 변경은 3-way 병합하며 같은 필드 충돌은 사용자 선택 팝업으로 처리합니다.

- **배포 후 확인 체크리스트**: ① `supabase-realtime.sql` 실행 → ② 앱을 열어 로그인 → ③ Claude 대화에서 `create_graph` 호출 → ④ 열린 브라우저에 몇 초 내 노드가 나타나는지 확인. MCP로 `rename_canvas` 하면 탭 이름도 바뀌어야 합니다.
- 토큰은 본인 캔버스에 대한 전체 접근 권한입니다. 유출되면 앱의 MCP 연결 목록에서 해당 토큰을 삭제하세요.
- service_role 키는 서버(Vercel 환경변수)에만 두고 클라이언트에 노출하지 마세요.

### 개인정보 출시 게이트

`supabase-data-access-audit.sql`은 공유 API, MCP, 시스템 런타임이 service role로 캔버스
본문을 읽을 때 소유자·캔버스·목적·시각만 기록하는 append-only 감사 저장소를 만듭니다.
SQL 적용 뒤 Vercel의 `WORKFLOW_CANVAS_ACCESS_AUDIT_MODE=required`를 설정하면 감사 기록에
실패한 서버 경로는 응답도 실패합니다. 사용자는 `get_my_canvas_data_access_audit` RPC로
자신의 캔버스 기록을 조회할 수 있습니다.

이 감사는 애플리케이션 서버 경로만 다룹니다. 현재 JSON 본문은 서버가 읽을 수 있고,
Supabase 프로젝트 관리자가 직접 실행한 SQL을 탐지하거나 막지 못하므로 운영자 차단이나
종단간 암호화로 표현하면 안 됩니다. `WORKFLOW_CANVAS_PUBLIC_RELEASE=true`는 이 상태에서
프로덕션 빌드를 의도적으로 차단합니다. 해당 플래그는 클라이언트 암호화, 참여자 키 래핑,
복구 키, 충돌 처리와 MCP 키 위임이 모두 구현된 뒤에만 활성화합니다.

## 로컬 개발

```bash
npm install
npm run dev        # 앱 (Vite)
vercel dev         # 앱 + /api/mcp 함수 로컬 실행 (Vercel CLI 필요)
```

시스템 지도 점검용 manifest는 코드·SQL·설정에서 자원 이름과 지문만 추출합니다. 환경변수,
API 키, 토큰의 실제 값은 생성 파일에 저장하지 않습니다. 관련 소스를 바꾼 뒤에는 manifest를
갱신해 함께 커밋하고, 테스트에서 최신 상태를 확인하세요.

```bash
npm run discover:update  # 읽기 전용 발견 manifest 갱신
npm run discover:check   # 커밋할 manifest가 현재 소스와 일치하는지 확인
npm run source-twin:update # AST 소스 코드 디지털 트윈 갱신
npm run source-twin:check  # 배포 manifest와 현재 소스 일치 확인
npm test
```

`inspect_workflow_system_map`의 `changed`, `needs_review`, `unmodeled` 결과는 자동 수정 지시가
아니라 사람의 재검토 신호입니다. 이 도구는 캔버스·코드·DB를 수정하지 않으며 응답에
`writes_performed: false`를 명시합니다.

관계 복구는 반드시 `preview_workflow_system_map_relation_repair`로 먼저 확인합니다. 실제 적용
도구는 미리보기의 현재 revision 전용 `plan_id`와 별도 확인 문구가 모두 일치해야 하며,
기존 관계 정보가 일부라도 남은 선이나 양 끝이 달라진 선은 덮어쓰지 않습니다. 실제 적용
전에는 오래 열린 Workflow Canvas 탭을 모두 닫고 최신 배포를 다시 여세요.
