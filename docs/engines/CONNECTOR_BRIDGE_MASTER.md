# Connector Bridge 마스터 문서

> 이 문서는 사용자가 기획하는 Connector Bridge의 사람용 Engine 상세 정본이다.
> 제품 전체 방향과 표준 용어는 [`MASTER.md`](../MASTER.md)가 우선하며, 다른 Engine을
> 연결하는 제품 Workflow는 [`WORKFLOW_CATALOG.md`](../protocols/WORKFLOW_CATALOG.md)에서 관리한다.

| 항목 | 현재 기준 |
|---|---|
| 문서 버전 | 0.1.0 |
| 현행 Engine | Connector Bridge 0.2.0-alpha.0 |
| 현행 공통 Workflow | **없음** — Local·GitHub webhook·외부 AI·로컬 조작 흐름이 분산됨 |
| 목표 Workflow | `connector-bridge.exchange@1.0.0` — 계획, 미구현 |
| 현행 실행 경계 | Local Connector API/Agent, GitHub webhook API, 외부 AI provider 호출 |
| 목표 공개 실행 파일 | Connector Bridge 단일 공개 진입점 — 계획, 파일명 미확정 |
| 다음 계약 | Connector Exchange Contract v1 — 계획, 미구현 |

이 문서는 `현행`과 `계획`을 구분한다. `현행`은 현재 코드와 테스트가 실제로 지원하는
기능이고, `계획`은 사용자가 확정한 다음 구조이지만 아직 Engine Registry나 실행 계약이
지원한다고 주장하지 않는다. 실제 구현 전까지 Engine 0.2.0-alpha.0을 유지한다.

`Workflow Twin Adapter`, `Twin Adapter Contract`, `twin` 문자열이 포함된 파일·API·Component 이름은
배포 호환을 위해 유지하는 레거시 현행 코드·wire 이름이다. 새 내부 메커니즘을 뜻하지
않으며, 관련 제품 개념은 Asset 원장으로 설명한다.

## 1. 확정 정의와 공통 제품 목표

Connector Bridge를 쉽게 설명하면 다음과 같다.

> **앱과 로컬 기기·GitHub·외부 API·AI 사이에 무엇이 연결되어 있고 어떤 자료가 오가는지
> 보여 주며, 사용자가 허용한 범위만 교환하고 그 결과를 영수증으로 남기는 연결 관제 Engine이다.**

Connector Bridge의 고유한 상태 변환은 다음 한 문장으로 고정한다.

```text
검증된 연결 요청 + Provider Manifest + 사용자 Grant
  → 권한과 대상을 고정해 최소한의 데이터를 교환
  → Provider 중립 결과 + 연결 근거·진단·교환 영수증
```

모든 Engine을 정리할 때의 공통 제품 목표는 비개발자가 자신의 앱을 다음 세 질문으로
이해하고 개선할 수 있게 하는 것이다.

1. **구조:** 내 앱이 무엇과 연결되어 있고 데이터가 어느 방향으로 흐르는가?
2. **비효율:** 어디서 불필요한 반복·중복·지연·큰 전송·오래된 연결이 생기는가?
3. **보안과 해결:** 어떤 권한·데이터·경계가 위험하며, 무엇을 차단하거나 어떤 안전한
   수정 절차로 넘겨야 하는가?

Connector Bridge는 이 중 **연결 구조와 경계의 관측·진단·차단·안전한 해결 경로 연결**을
맡는다. 소스의 제품 의미는 Source Lens, 동일성은 Asset Core, 신뢰영역 전체 분석은 Trust Map,
수정 계획·승인·실행·복구는 Safe Operations가 맡는다. Connector Bridge가 단독으로 앱 전체의
성능이나 보안을 진단했다고 주장하거나 자신이 전달한 변경을 `해결됨`으로 확정하면 안 된다.

## 2. 현행 구현과 목표 상태

| 능력 | 현행 Connector Bridge 0.2 | 목표 |
|---|---|---|
| Engine 경계 | Local Connector·레거시 `Workflow Twin Adapter`·외부 AI Connector를 한 Registry 부모 아래 등록 | 외부·로컬 경계를 넘는 **교환**만 소유 |
| 공통 Workflow | 없음. API·agent·webhook·AI 함수마다 다른 흐름 | `connector-bridge.exchange@1.0.0` 하나의 공통 Exchange Pipeline |
| 공개 진입점 | 여러 API와 실행 파일에 분산 | 모든 호출 Engine이 사용하는 단일 공개 진입점 |
| Contract | Local schema, 레거시 `Twin Adapter Contract`, Operation Contract와 provider별 규칙에 분산 | Connector Exchange Contract v1 |
| Provider·direction 선택 | Local·GitHub·AI handler마다 코드 분기 | Capability/direction Resolver + Provider Manifest |
| Grant | local token·실행 flag·owner check 등 기능별 구현 | 대상·기기·Capability·Data Class·만료가 고정된 공통 Grant |
| 데이터 최소화 | Local manifest 정규화, webhook compact event, AI metadata envelope가 각각 존재 | 공통 Outbound Preview·Redaction·Data Class Guardrail |
| 근거·감사 | heartbeat, push event, operation event, AI 출처가 각각 저장 | 공통 Exchange Receipt와 provenance |
| 연결 상태 | Local online/last-seen·Git 상태, webhook 설정 여부 등 부분 표시 | Connection Inventory·Health·freshness·오류·지연 통합 |
| 비효율 분석 | Git ahead/behind/dirty와 일부 오류만 표시 | 반복 polling·중복 연결·전체 refresh·큰 payload·재시도·지연 Finding |
| 보안 분석 | 기능별 차단 규칙은 있으나 통합 Finding 없음 | 권한·대상·서명·replay·egress·secret·helper 상태 Finding |
| 사용자 화면 | Source Lens 패널 안에 Local·webhook·AI 상태가 흩어짐 | 연결 구조·전송 미리보기·문제함·활동 기록 Projection |
| AI | Source 설명 prompt와 provider 통신이 한 모듈에 섞임 | 호출 Engine이 의미·prompt를, Bridge가 동의·전송·출처를 소유 |
| Graphify | 미연결 | CLI·MCP·원격 지도 DB·외부 AI를 쓸 때만 Bridge transport 사용 |

현재 구현에는 강한 개별 안전장치가 있지만 하나의 Connector Bridge Contract와 Artifact로
모이지 않는다. 따라서 현재 상태를 완성된 범용 연결 엔진이나 앱 전체 보안 진단기로
표현하지 않는다.

## 3. 물리적 파일 경계

### 3.1 현행 실행 근거

현재 Connector Bridge에는 단일 공개 실행 파일이 없다. 다음 파일에 실행 책임이 분산돼 있다.

| 파일 | 현재 실제 책임 | 경계 판단 |
|---|---|---|
| `api/local-connector.js` | 브라우저 사용자와 Local Agent 요청을 인증하고 등록·해제·heartbeat·poll·완료를 라우팅 | Bridge API 경계 |
| `mcp/localConnectorStore.js` | token hash, heartbeat, operation queue·result 저장과 일부 Plan 생성 | Bridge 저장 경계와 Safe Operations 책임이 혼재 |
| `scripts/local-connector-agent.mjs` | repo 고정·Source Lens 호출·heartbeat·Git/소스 편집 실행·터미널 승인 | Local transport와 Safe Operations Executor가 물리적으로 혼재 |
| `shared/localConnector.js` | Local manifest/Git 상태 정규화와 Git sync 방향 판정 | Adapter와 Safe Operations Resolver 책임이 혼재 |
| `api/source-twin-webhook.js` | GitHub raw body·HMAC·event·repository 검증 후 compact push event 저장 | GitHub inbound Connector |
| `shared/sourceAiExplanation.js` | 제한 metadata envelope·설명 prompt·provider별 HTTP·응답 변환 | Bridge transport와 Source Lens Agent Skill이 혼재 |
| `mcp/sourceTwinStore.js` | push event·상태 Snapshot 등 Source 관련 DB 작업 | 여러 Engine Workflow의 Artifact/DB 경계 |
| `supabase-local-connectors.sql` | Local Connector·operation 저장과 DB 보안 경계 | Bridge/Safe Operations persistence |

관련 코드를 당장 폴더 단위로 이동하지 않는다. 먼저 공통 Contract·진입점·소유 테스트를 만든
뒤, 한 파일 안의 함수라도 책임별로 분리한다.

### 3.2 Connector Bridge 밖으로 확정하는 책임

| 현재 또는 관련 영역 | 올바른 소유자 | 이유 |
|---|---|---|
| `shared/workflowSystemTwinAdapter.js`·descriptor·Asset 원장 변환 | Asset Core를 사용하는 Source-to-Map Adapter | 외부 통신 없이 제품 형식을 Asset 원장·Proposal로 변환 |
| Source corpus 해석·기능·코드 파츠·Flow | Source Lens | 연결 이후 자료의 제품 의미 판정 |
| Asset 동일성·정규 Asset 원장·Reconciliation | Asset Core | Provider 결과의 정규형과 동일성 소유 |
| Git sync 방향·Source Edit 대상·Plan·승인·검증·복구 | Safe Operations | 변경 의미와 실행 수명주기 소유 |
| runtime freshness·LIVE/stale | LiveOps | 외부 응답을 운영 관측으로 판정 |
| Trust Zone·Gateway·unknown-gap | Trust Map | 연결 근거를 보안 구조로 해석 |
| 화면·카드·문제함·활동 기록 렌더링 | Web UI projection | Engine Artifact를 읽어 표시 |
| 설명 prompt·도메인 어휘·근거 연결 | 호출 Lens의 Agent Skill/Policy | Bridge는 문장 의미를 만들지 않고 전송만 담당 |

현재 Registry의 `Workflow Twin Adapter: kind=connector`와 GitHub webhook Connector 누락 등
소유 경계 문제는 [`TECHNICAL_DEBT.md`](../governance/TECHNICAL_DEBT.md)의 `ENG-008`, 문서 간 현재 사실
불일치는 `DOC-001`에서 추적한다. 실제 Registry는 목표 Contract·테스트가 구현될 때 함께
교정한다.

## 4. 현행 분산 Flow

아래 흐름은 현재 코드가 실제 지원한다. 이들을 곧바로 하나의 공통 Workflow가 구현됐다고
해석하지 않는다.

### 4.1 Local Source Refresh

```text
사용자 Connector 등록·token 발급
→ Local Agent가 repo root·Git origin 고정
→ Source Lens 공개 진입점으로 bounded corpus 분석
→ 본문이 제거된 manifest + Git 상태 heartbeat 전송
→ 서버 정규화·크기 제한·fingerprint·last-seen 저장
→ Source Lens 패널에서 online·변경 상태 조회
```

### 4.2 승인된 Local Operation 전달

```text
Safe Operations가 대상·위험·write set·검증·복구 Plan 생성
→ 사용자 웹 승인
→ Local Agent가 작업 claim·현재 repo 상태 재검사
→ 승인된 Git sync 또는 등록 Source Edit 실행
→ 터미널 재승인·postcondition 검사
→ Bridge가 결과 evidence를 서버로 전달
→ Safe Operations가 성공·실패·rollback 가능성을 판정
```

현행 파일에는 일부 Plan·실행·검증 로직이 Local Connector 아래 있지만, 목표 소유권은
Safe Operations다. Bridge는 서명된 Plan과 실행 Evidence를 전달하며 Operation의 의미나
승인 조건을 새로 만들지 않는다.

### 4.3 GitHub Change Observation

```text
GitHub raw webhook
→ 1 MiB 상한
→ HMAC SHA-256 서명 확인
→ ping/push event·delivery ID 검사
→ 등록 repository와 일치 확인
→ commit SHA·branch·changed path 중심 compact Event
→ 중복 여부를 확인해 append-only history 저장
```

이 Event는 변경 신호이며 재분석·배포·보안 해결 완료 증거가 아니다.

### 4.4 External AI Explanation

```text
소유자·기능 활성화·provider 설정 검사
→ 코드 본문 없는 AST metadata envelope 생성
→ provider별 HTTPS 호출·timeout
→ 응답 문장과 provider/model·전송 필드 출처 반환
→ Source Lens UI에서 결정적 설명 옆에 AI 배지로 표시
```

현재 prompt와 provider transport가 같은 파일에 있으나, 목표에서는 설명 의미·prompt는
Source Lens Agent Skill, outbound 동의·HTTP·response provenance는 Connector Bridge가 맡는다.

## 5. 목표 단일 Workflow

Connector Bridge가 소유할 공통 Workflow는 `connector-bridge.exchange@1.0.0` 하나다.
Local refresh, webhook, 외부 AI, 승인된 Operation 전달은 서로 다른 Engine이 이 공통
Capability를 호출하는 제품 Workflow이지 Connector Bridge 안의 별도 Engine이 아니다.
호출 Engine이 목적·Capability·대상·direction으로 Exchange Request 후보를 만드는 일은
Bridge Workflow의 **입력 전제조건**이며 Connector Bridge Stage가 아니다.

### 5.1 입력

```text
Connector Exchange Request
+ Connector Provider Manifest
+ User/Device Grant
+ Credential Reference
+ direction: inbound / outbound / local / operation-dispatch
+ Data Class·전송 Budget
+ 선택적 이전 Connection Observation
+ 변경 요청이면 Safe Operations가 서명한 Operation Plan
```

실제 credential 값, 임의 shell, 검증되지 않은 URL, 무제한 본문은 입력 계약에 포함하지 않는다.

### 5.2 Stage

| # | Stage | 구성 분류 | 입력 → 출력 | Adapter | Connector | AI | 상태 |
|---:|---|---|---|---|---|---|---|
| 1 | 요청·Manifest 계약 검증 | Contract + Hard Guardrail | 요청·provider 선언 → typed request 또는 거부 | 없음 | 없음 | 없음 | 계획 |
| 2 | Capability·Provider·direction 선택 | Resolver + Manifest | Capability ID·실행 모드 → provider·direction | 없음 | 없음 | 없음 | 계획 |
| 3 | 대상·Grant·Credential Reference 결속 | Resolver + Hard Guardrail | actor·device·target·scope·expiry → bound exchange | 없음 | 없음 | 없음 | 부분 현행 |
| 4 | direction별 preflight·최소화 | Builder + Hard Guardrail | outbound payload → redacted preview / inbound headers → bounded receive plan | outbound request Adapter / inbound 없음 | 없음 | AI 최종판정 금지 | 부분 현행 |
| 5 | Grant 범위·동의·endpoint authorization | Contract + Hard Guardrail | preview/receive plan·Grant → 허용·재동의 대기·거부 | 없음 | 없음 | 없음 | 부분 현행 |
| 6 | 경계 교환·수신 | Connector | 승인 envelope/receive plan → raw provider result | 없음 | Local/GitHub/API/AI/MCP/remote | provider가 AI일 수 있음 | 분산 현행 |
| 7 | 응답·송신자·서명·replay·크기 검증 | Contract + Hard Guardrail | raw result·request identity → verified result/거부 | 없음 | 없음 | 없음 | 부분 현행 |
| 8 | Provider 중립 결과 정규화 | Builder + Adapter | verified result → Exchange Result | provider response/event Adapter | 없음 | 없음 | 부분 현행 |
| 9 | 상태·비효율·보안 Finding 구성 | Resolver + Builder + 선택 Agent Skill/Agent Policy | result·metrics·이전 observation → finding·recommendation | 없음 | 없음 | 설명만 선택 | 계획 |
| 10 | provenance·Receipt·Bundle 반환 | Pipeline + Builder | 결과·정책·Manifest 버전·시간·비용 → Exchange Bundle | 없음 | 선택 Artifact Store Connector | 없음 | 계획 |

`구성 분류`는 해당 Stage의 주 책임을 표시한다. Connector Exchange Pipeline은 Stage 1~10의
순서·조건 분기·timeout·실패 상태를 모두 조정하므로 모든 행에 반복 표기하지 않는다.

### 5.3 direction별 순서

하나의 Contract와 Artifact를 쓰되 보안 순서는 direction에 따라 달라진다.

```text
outbound / local / operation-dispatch
  요청·Manifest 검증 → 대상·Grant 결속 → 최소 envelope·Outbound Preview
  → 기존 Grant 범위 확인 → 범위가 달라졌으면 사용자 재동의, 아니면 계속
  → 송신 → 응답 target·status·size·서명 검증 → 정규화·Finding·Receipt

inbound webhook
  요청·Manifest·등록 endpoint·Content-Length preflight
  → revoked/expired Grant와 허용 event 확인 → 상한 안에서 body 수신
  → HMAC/송신자·repository·delivery replay 검증
  → compact event 정규화 → Finding·Receipt
```

Inbound webhook마다 사용자를 다시 클릭시키지는 않는다. 대신 사용자가 미리 등록한 endpoint,
Capability, sender와 Data Class Grant를 벗어나거나 Grant가 만료·폐기되면 body를 처리하지 않는다.
Outbound는 목적지·목적·Data Class·필드가 기존 Grant와 다를 때 반드시 새 미리보기와 명시적
재동의를 요구한다. Stage 5는 동의를 추측하지 않고 `consent_required`로 Run을 멈춘다. Web UI가
정확한 Preview를 표시해 받은 명시적 선택으로 새 Grant가 발급된 뒤에만 같은 Run을 재개한다.

### 5.4 출력

```text
Connector Exchange Bundle
  - Connection Inventory delta
  - Connector-neutral Exchange Result
  - Connection Observation
  - Connection Finding[]
  - non-executable Recommendation[]
  - Outbound Preview/Receipt
  - provenance·policy·provider·version·timing·cost
  - 실패·unknown·partial diagnostics
```

Provider 응답 자체가 Source Lens 분석, Asset 원장, LIVE, 보안 해결 또는 Operation 성공을 의미하지
않는다. 호출 Engine이 자신의 Contract로 다시 판정해야 한다.

## 6. 교체 가능한 Connector와 Manifest

Engine Stage는 `github`, `openai`, `local-agent` 같은 제품명을 직접 분기하지 않고 Capability와
direction을 요청한다. Capability Resolver가 Provider Manifest와 Grant를 검사해 Connector를
선택한다.

### 6.1 Capability 예시

| Capability | 첫 구현 | 현재 상태 | 의미 소유자 |
|---|---|---|---|
| `bridge.local.repository.read` | Local Repository Connector | 현행 | Source Lens가 corpus 해석 |
| `bridge.local.heartbeat.publish` | Local Agent Connector | 현행 | LiveOps/UI가 freshness 표시 |
| `bridge.local.operation.dispatch` | Local Agent Connector | 현행 | Safe Operations가 Plan·성공 판정 |
| `bridge.github.push.receive` | GitHub Webhook Connector | 현행, Registry 누락 | Source/Workflow host가 change signal 소비 |
| `bridge.external-ai.exchange` | External AI Provider Connector | 기본 비활성 현행 | 호출 Lens가 prompt·의미·근거 소유 |
| `bridge.graph-analysis.remote` | CLI/MCP/remote 지도 provider | 계획 | Source Lens 지도 분석 Adapter가 결과 정규화 |
| `bridge.runtime.observe` | provider runtime Connector | 계획 | LiveOps가 Reality·freshness 판정 |

같은 Local Agent 프로세스가 여러 Capability를 제공할 수 있지만, 읽기·Git 전송·Source Edit
전달 권한은 Manifest와 Grant에서 각각 독립적으로 선언한다. 프로세스 하나라는 이유로 권한을
묶지 않는다.

### 6.2 Provider Manifest

계획된 `Connector Provider Manifest`는 최소 다음을 선언한다.

```text
provider ID·version
Connector Exchange Contract version
Capability ID 목록과 direction: inbound / outbound / local / operation-dispatch
실행 모드: in-process / local-process / webhook / remote-api / mcp
허용 scheme·host·endpoint template·redirect 정책
인증 방식과 Credential Reference 종류
필요 permission scope·사용자/device grant
입력·출력 Data Class와 source body 포함 여부
대상 Trust Zone·region·retention 선언
payload·빈도·timeout·retry·비용 한도
side effect·idempotency·replay·verification 방식
health check·revocation·minimum helper version
license·provenance 메타데이터
```

Manifest에는 credential 값, 사용자 원문, 임의 실행 코드가 들어가지 않는다.

### 6.3 Grant

Grant는 다음을 고정하는 폐기 가능한 권한 기록이다.

- 사용자와 필요 시 device/helper identity
- 연결 대상·repository·environment·endpoint
- 허용 Capability와 읽기·쓰기·실행 범위
- 외부로 보낼 수 있는 Data Class
- 생성·만료·마지막 사용·폐기 시각
- 별도 동의가 필요한 source body·AI·쓰기 여부
- emergency revocation과 재시도 차단 상태

기본값은 읽기 전용·metadata 최소·짧은 만료다. 새 Capability·대상·목적·Data Class가
추가되면 기존 동의를 확대 해석하지 않고 Outbound Preview와 함께 다시 동의받는다.

## 7. Engine 내부 구성 분류

`kind: engine`은 최상위 Connector Bridge 하나에만 허용한다. 실제 구현·테스트 전까지 계획
구성요소를 Registry에 등록하지 않는다.

| 분류 | 현행 | 목표 | 사용 위치 |
|---|---|---|---|
| **Engine** | Connector Bridge 0.2 | Connector Bridge 유지 | 전체 Exchange 능력 |
| **Contract** | Local/API/provider 규칙에 분산. 레거시 `Twin Adapter Contract`와 Operation Contract는 다른 Engine 소유 계약을 소비 | Connector Exchange Contract | Stage 1·5·7 |
| **Resolver** | 정식 Bridge Resolver 없음 | Capability Provider/direction Resolver, Target & Grant Resolver, Connection Finding Resolver | Stage 2·3·9 |
| **Builder** | local manifest normalizer, webhook compact event, AI envelope/response 변환 | Transport Envelope, Exchange Result, Receipt Builder | Stage 4·8·10 |
| **Pipeline** | local loop·webhook handler·AI 함수별 분산 | direction 분기를 포함한 Connector Exchange Pipeline | Stage 1~10 |
| **Agent Skill** | 없음. AI prompt가 transport 코드에 포함 | Connection Triage Skill은 Finding 설명에만 선택 사용 | Stage 9의 쉬운 설명 |
| **Agent Policy** | prompt 내부 무추측 문구뿐 | Connection Evidence Honesty Policy | AI 설명·추천 |
| **Hard Guardrail** | token/HMAC/HTTPS/repo/size/state/redaction 규칙이 분산 | Grant, Consent, Egress, Endpoint, Replay, Budget Guardrails | Stage 1·3·4·5·7 |
| **Connector** | Local Connector, External AI Connector; GitHub webhook 구현은 Registry 누락 | Local/GitHub/API/AI/remote provider transports | Stage 6 |
| **Manifest** | AI provider candidates. 레거시 wire 이름인 `Twin` descriptor는 다른 Engine 계약 소비/Registry 오분류 | Provider Manifest, Connector Capability Manifest | Stage 1~2 |
| **Adapter** | local manifest·GitHub event·AI envelope 변환. 레거시 `Workflow Twin Adapter`는 Registry 오분류 | provider request·response/event 형식을 공통 Contract로 바꾸는 교체 구현 | Stage 4·8 |

### Adapter와 Connector의 경계

- **Connector**는 프로세스·기기·네트워크·신뢰영역 경계를 넘어 실제로 송수신한다.
- **Adapter**는 받은 형식을 같은 프로세스의 공통 Contract로 변환하는 교체 구현이다.
- 레거시 현행 코드명인 `Workflow Twin Adapter`는 외부 통신을 하지 않으므로 Connector가 아니라 Asset Core를
  사용하는 제품 Adapter다.
- AI prompt와 설명 의미는 Source Lens Agent Skill이고, provider HTTP 호출은 Connector다.
- Git sync·Source Edit의 변경 의미·Plan·검증은 Safe Operations이고, Local Agent transport는
  Connector다.

## 8. 사용자 결과물과 화면

### 8.1 Artifact

| 결과물 | 사용자가 알 수 있는 것 | 현행 상태 |
|---|---|---|
| **Connection Inventory** | 무엇과 연결됐고 방향·권한·상태가 무엇인지 | Local 중심 부분 현행 |
| **Outbound Preview** | 무엇이 어디로 왜 나가는지 | 외부 AI metadata 설명만 부분 현행 |
| **Connection Observation** | last-seen·heartbeat·latency·error·freshness | Local 중심 부분 현행 |
| **Exchange Envelope** | provider 차이를 제거한 제한 결과 | 공통형 미구현 |
| **Connection Finding** | 연결 경계의 비효율·보안·신뢰성 문제 | 통합형 미구현 |
| **Recommendation** | 사람이 선택할 수 있는 실행 불가능 개선안 | 미구현 |
| **Exchange Receipt** | 누가 언제 어떤 범위로 무엇을 교환했는지 | 기능별 event로 부분 현행 |
| **Execution Evidence Envelope** | 승인된 조작의 전달·결과 근거 | Local operation에서 부분 현행 |

원문, credential 값, 전체 diff, 불필요한 provider raw response는 기본 Artifact에 저장하지 않는다.

### 8.2 비개발자용 Projection

현재는 `SourceTwinPanel` 안에서 Local 연결, Git 상태, webhook 설정, 외부 AI 비교를 각각 본다.
목표 Projection은 다음 내용을 한 연결 화면에서 제공한다. 화면 구현은 Web UI 소유이며 아직
계획 상태다.

1. **연결 구조:** `내 앱 ↔ 로컬 폴더/GitHub/Vercel/Supabase/외부 AI`의 방향과 권한.
2. **무엇이 나가나요?:** 목적지·필드·Data Class·목적·보관/지역 선언·동의 상태.
3. **상태와 효율:** 지연·오류·재시도·큰 전송·반복 전체 refresh·중복/미사용 연결.
4. **보안 문제함:** 심각도·쉬운 설명·근거·관측 시각·자동 차단 여부·담당 Engine.
5. **활동 기록:** 연결·동의·폐기·교환·작업 전달·결과 수신의 시간순 Receipt.
6. **안전하게 고치기:** 직접 변경하지 않고 Safe Operations 미리보기로 이동.

### 8.3 문제에서 해결까지

```text
Connection Observation
→ 결정적 Connection Finding
→ 실행 권한 없는 Recommendation
→ 사용자가 해결 방법 선택
   ↳ 위험한 교환 즉시 차단·Grant 폐기
   ↳ Safe Operations Plan 생성
   ↳ 외부 Provider 설정 화면 안내
→ 실행·독립 검증
→ 새 Observation이 확인된 뒤에만 resolved
```

Bridge Hard Guardrail은 미승인 교환을 즉시 차단한다. Grant 폐기는 사용자의 해제 요청이나
사전에 명시된 긴급 정책을 근거로 하고 감사 기록을 남긴다. 코드·Git·DB·Provider 설정을
바꾸는 해결은 Safe Operations 또는 외부 Provider의 명시적 사용자 조작을 거친다.

## 9. 비효율·보안 Finding

Finding은 관측 근거와 결정적 규칙으로 만든다. 근거가 부족하면 `unknown`으로 남긴다.

| 영역 | Finding 예시 | Connector Bridge의 조치 |
|---|---|---|
| 구조 | 대상 repository·remote·environment 불일치, 연결 방향 미선언 | 교환 차단·재결속 권고 |
| 비효율 | 중복 polling, 반복 전체 refresh, 큰 payload, 과도한 retry, 높은 latency, 미사용 Connector | 측정값·영향·감축 권고 제공 |
| 권한 | 사용하지 않는 쓰기 권한, 만료·폐기 상태 불일치, scope 확대 | 최소 권한 재동의 또는 즉시 폐기 |
| 데이터 | 미선언 Data Class, source body·절대 경로·credential 전송 시도 | Hard Guardrail 차단·Outbound Preview 표시 |
| 무결성 | 서명·fingerprint·버전 불일치, stale plan, duplicate/replay | 요청 거부·diagnostic·audit |
| 연결 상태 | heartbeat 단절, timeout, 반복 실패, 오래된 helper | offline/stale 표시·재연결 권고 |
| 공급망 | 서명되지 않은 helper, minimum version 미달, sandbox 부재 | 실행 불가 또는 위험 배지 |
| 외부 AI | provider/model/retention/region 미표시, 미동의 Data Class | 외부 전송 차단 |

이 목록은 연결 경계 진단이지 침투 테스트, 전체 공격 경로 분석, 앱 전체 성능 프로파일링이
아니다. 그런 결과는 관련 전문 Engine·도구의 근거를 별도로 요구한다.

## 10. AI 사용 위치와 정책

Connector Bridge의 인증·권한·endpoint 선택·redaction·서명·replay·비용 제한은 AI 없이
결정적으로 수행한다.

### AI를 사용할 수 있는 곳

- 이미 생성된 Finding을 비개발자용 쉬운 문장으로 설명
- 같은 근거를 가진 중복 Finding 묶기
- 연결 상태 변화 추세 요약
- 실행 권한이 없는 Recommendation 초안 작성

### AI가 해서는 안 되는 일

- Connector·provider·model을 사용자 몰래 선택
- Grant·permission scope·Data Class·비용 한도 확대
- 실제 없는 Connection·Observation·LIVE 상태 창작
- credential·source body·전체 provider response 임의 열람
- 연결 해제·쓰기·코드·DB·Provider 설정 변경 실행
- `unknown`, `partial`, `conflict`를 숨기거나 문제를 `안전함`·`해결됨`으로 확정

계획된 `Connection Evidence Honesty Policy`는 AI 결과에 사용 provider/model, 입력 Data Class,
정책 버전, 사용자 동의, provenance, retention/region 선언과 AI 생성 배지를 요구한다.

## 11. Hard Guardrail

| Guardrail | 현행 근거 | 목표 |
|---|---|---|
| 허용 endpoint | Local command는 HTTPS 또는 localhost HTTP, AI provider URL은 코드 고정 | Manifest allowlist와 redirect 차단 통합 |
| 인증·폐기 | Local token hash 저장·revocation, owner check | 공통 Grant·device binding·즉시 retry fencing |
| 입력 크기 | Local manifest 2.5 MB, webhook 1 MiB 등 개별 상한 | Capability별 payload·빈도·시간·비용 Budget |
| 대상 고정 | repo root·GitHub origin·branch·HEAD fingerprint, webhook repository | target/environment/device identity 공통 결속 |
| 읽기/쓰기 분리 | Local Agent `--allow-git-sync`, `--allow-source-write` 별도 | Capability별 독립 Grant와 짧은 만료 |
| Operation | 서명 Plan·state fingerprint·terminal 재승인·postcondition | Bridge는 검증된 Safe Operations Plan만 전달 |
| 서명·replay | webhook HMAC·delivery ID, operation ID 상태 검사 | inbound/outbound 공통 nonce·idempotency·replay 정책 |
| 데이터 최소화 | compact webhook, 본문 없는 AI metadata, Local manifest 정규화 | Data Class Contract·exact Outbound Preview·중앙 redaction |
| 비밀값 | reference 중심, AI envelope credential 미포함 | 모든 schema에서 credential value 강제 거부 |
| 감사 | push/local operation event와 provenance 일부 | 원문 없는 공통 append-only Exchange Receipt |
| helper 안전 | 현재 미완료 | 서명 배포·OS sandbox·minimum version·device credential |

열린 상용 보안 조건은 `LOC-005`~`LOC-008`, `AI-002`, `OPS-005` 등 기술 부채가 정본이다.
이 항목이 닫히기 전에는 모든 Connector가 운영 환경에서 안전하다고 표현하지 않는다.

## 12. 다른 Engine과의 계약

| Engine/소유층 | Connector Bridge가 받는 것 | Connector Bridge가 돌려주는 것 | Bridge가 하지 않는 것 |
|---|---|---|---|
| Source Lens | corpus 요청·Data Class·선택 provider | bounded corpus 또는 provider-neutral result | 코드 의미·Feature·Community 판정 |
| Asset Core | 정규화 입력 요청 | evidence envelope·provider provenance | Asset 동일성·Asset 원장·Proposal 생성 |
| Trust Map | connection/gateway evidence | endpoint·direction·Trust Zone crossing 근거 | 안전성 보증·attack path 확정 |
| LiveOps | runtime observation request | timestamped raw/normalized provider response | LIVE·freshness 최종 판정 |
| Safe Operations | 서명·만료 Operation Plan | dispatch·execution evidence envelope | Plan·승인·성공·rollback 의미 판정 |
| Draw Map | 없음 또는 승인된 가시화 요청 | transport result | 온톨로지·사실 판정 또는 배치·연결선·그룹 밖의 변경 |
| Web UI/Artifact host | read request | redacted Bundle/read model | 사용자 화면 렌더링·정본 의미 변경 |

Draw Map은 배치·연결선·그룹만 다루며 온톨로지·사실 판정과 무관한 순수 가시화 Engine이다.

Graphify를 Source Lens와 같은 프로세스의 library로 쓰면 Connector Bridge가 필요 없다.
Graphify CLI·MCP·원격 서비스·지도 DB·외부 AI를 사용해 경계를 넘을 때만 Bridge Capability를
호출하고, Source Lens 지도 분석 Adapter가 응답을 정규 지도 Contract로 정규화한다.

## 13. 구현 순서와 버전 규칙

| 단계 | 작업 | 완료 조건 |
|---|---|---|
| **CB-0** | 현행 Flow·소유 경계·문서 부채 기록 | 이 문서와 `ENG-008`·`DOC-001`, 상위 문서 링크 |
| **CB-1** | Connector Exchange Contract·Request/Result/Receipt schema | pure contract test와 invalid input fixture |
| **CB-2** | Provider/Grant Manifest·Capability/direction Resolver·중앙 Guardrail | fake provider 두 개 교체와 scope 변경 재동의 테스트 |
| **CB-3** | Local read/heartbeat·GitHub webhook을 공통 Pipeline에 연결 | inbound/outbound 순서·현행 호환 fixture·replay·revocation 테스트 |
| **CB-4** | 외부 AI prompt와 transport 분리 | Source Lens Skill과 Bridge egress contract 독립 테스트 |
| **CB-5** | Local operation transport와 Safe Operations 소유 분리 | Bridge가 서명 Plan 없이는 실행 불가 |
| **CB-6** | Connection Finding·Receipt·비개발자 Projection | 근거·시각·영향·담당 해결 경로 표시 |
| **CB-7** | Registry reclassification·공개 진입점·버전 상승 | 레거시 `Workflow Twin Adapter` 이동, GitHub Connector 등록, evidence 정합성 |

CB-0은 문서 설계다. CB-1~CB-7이 구현되기 전에는 목표 구성요소나 Artifact를 Registry에
등록하지 않는다. 공통 Workflow·Contract·두 제공자 교체·보안 경계 테스트가 완성되는 변경에서
Connector Bridge 0.3.0-alpha.0과 Workflow 1.0.0 후보를 검토한다.

필수 검증은 다음을 포함한다.

- 잘못된 provider/version/capability/endpoint/data class 거부
- revoked·expired·wrong-device·over-scoped Grant 차단
- outbound 목적지·목적·Data Class·필드 변경 시 새 미리보기와 재동의 대기
- inbound는 body 상한을 먼저 강제하고 서명·sender·event·repository·replay 검증 완료 전에 정규화하지 않음
- credential value·임의 URL·redirect·oversize·timeout·replay 차단
- webhook HMAC·repository·delivery idempotency 회귀
- Local repo·origin·HEAD·state fingerprint 불일치 차단
- Safe Operations 서명 Plan 없는 변경 전달 차단
- 같은 Contract의 fake/두 번째 Connector 교체 검증
- Connector가 Asset 원장·Feature·Reality·Operation success를 직접 만들지 않는 경계 테스트
- Receipt에 원문·credential·전체 diff가 포함되지 않는 검사

## 14. 쉬운 용어 설명

이 문서의 마지막 절은 Connector Bridge를 기획·구현할 때 사용하는 용어 설명이다.

| 용어 | 쉬운 설명 |
|---|---|
| **Connector Bridge** | 앱과 외부·로컬 시스템 사이의 연결을 허용된 범위로 통제하고 교환 근거를 남기는 Engine이다. |
| **Connector** | 로컬 프로세스·GitHub·외부 API처럼 경계를 넘어 실제로 자료를 주고받는 통로다. |
| **Adapter** | 특정 provider 형식을 Engine의 공통 입력·출력 형식으로 바꾸는 교체 가능한 변환기다. |
| **Connection** | 특정 사용자·기기·대상 사이에 제한된 권한으로 열린 통신 채널이다. |
| **Exchange** | Connection을 통해 한 번 자료를 받거나 보내는 실행이다. |
| **Capability** | Connector가 실제로 지원한다고 Manifest에 선언한 읽기·전송·수신·전달 기능이다. |
| **Provider** | GitHub·AI API·Local Agent처럼 Connector가 통신하는 시스템 또는 구현 제공자다. |
| **Provider Manifest** | 지원 기능·endpoint·권한·데이터 종류·한도·버전을 실행 코드 없이 선언한 문서다. |
| **Grant** | 사용자가 어느 대상에 어떤 기능과 데이터 범위를 언제까지 허용했는지 기록한 폐기 가능한 권한이다. |
| **Credential Reference** | 비밀값 자체가 아니라 안전한 저장소의 비밀값을 가리키는 참조다. |
| **Data Class** | metadata·source body·경로·운영 로그처럼 교환하는 자료를 위험과 용도별로 나눈 종류다. |
| **Outbound Preview** | 외부로 보내기 전에 목적지·필드·목적·데이터 종류를 사용자에게 보여 주는 미리보기다. |
| **Redaction** | 교환 전에 credential·원문·개인정보처럼 보내면 안 되는 값을 제거하거나 차단하는 과정이다. |
| **Envelope** | provider별 형식 차이를 가린 제한된 공통 요청 또는 결과 포장이다. |
| **Observation** | Connector가 특정 시각에 직접 확인한 연결 상태 사실이다. |
| **Finding** | Observation을 결정적 규칙으로 평가해 찾은 연결 경계의 문제다. |
| **Recommendation** | 실행 권한 없이 사람이 선택할 수 있도록 제시하는 개선 방법이다. |
| **Exchange Receipt** | 누가·언제·어디와·어떤 범위를 교환했고 결과가 어땠는지 남긴 영수증이다. |
| **Provenance** | 교환 결과가 어느 요청·provider·정책·버전·시각에서 나왔는지 추적하는 출처 기록이다. |
| **Revocation** | Connection과 Grant를 즉시 무효화해 이후 교환과 재시도를 막는 것이다. |
| **Replay** | 같은 webhook·요청·작업을 다시 보내 중복 처리시키려는 상황이다. |
| **Hard Guardrail** | AI나 Connector 판단과 무관하게 권한·endpoint·크기·시간·데이터 경계를 코드로 강제하는 안전장치다. |
| **Safe Operations Plan** | 실제 변경 전에 대상·위험·승인·검증·복구를 고정하고 서명·만료시키는 실행 계획이다. |
| **Independent Verification** | 변경을 실행한 주체와 다른 검증 경계가 결과를 다시 확인하는 것이다. |
