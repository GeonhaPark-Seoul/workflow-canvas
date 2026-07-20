# Workflow Canvas OS Workflow 카탈로그

이 문서는 둘 이상의 Engine을 연결하거나 Engine 결과를 사용자에게 전달하는 현재 Workflow와
읽기 Projection을 관리한다. Engine의 고유 알고리즘을 다시 정의하지 않는다.

- 문서 버전: `0.8.0`
- 최종 수정일: 2026-07-20

## 1. 연결 원칙

```text
Workflow Definition → Stage → 한 Engine Capability
Stage → 필요한 Adapter / Profile
Connector → 외부·로컬 경계
Workflow Run → Artifact 또는 승인된 상태 변경
```

- 한 Stage의 소유 Engine은 하나다.
- 여러 Engine을 잇는 것은 Engine 중첩이 아니라 Workflow 조합이다.
- [`Starting Protocol`](./STARTING_PROTOCOL.md)은 미정인 첫 접점에서 사용자 소유 Project
  Master와 상대 AI 등록 상태를 준비해 System Onboarding에 넘기는 선행 규약이다. 특정 웹·
  로컬·IDE 진입점을 아직 전제하지 않는다.
- 전체 시스템 가져오기를 통제하는 [`System Onboarding Protocol`](./SYSTEM_ONBOARDING_PROTOCOL.md)은
  Engine이나 Engine 내부 Pipeline이 아니다. Protocol의 목표 실행 구현인
  `system-onboarding@1.0.0`이 독립 Workflow와 Engine Capability를 Stage로 조합한다.
- `kind: engine`은 최상위 Registry 항목에만 허용된다.
- UI 조회는 상태를 바꾸지 않으면 Workflow가 아니라 Artifact projection으로 분류한다.
- Source Lens의 고유 Workflow는 [`SOURCE_LENS_MASTER.md`](../engines/SOURCE_LENS_MASTER.md)의
  `source-lens.source-analysis@1.1.0` 하나다.
- Connector Bridge의 목표 고유 Workflow는
  [`CONNECTOR_BRIDGE_MASTER.md`](../engines/CONNECTOR_BRIDGE_MASTER.md)의
  `connector-bridge.exchange@1.0.0` 하나다. 아직 계획 상태이며, 현행 분산 Flow는 아래
  §5·§6·§7·§9의 실제 순서를 그대로 기록한다.
- AI Context Gate의 고유 Workflow는
  [`AI_CONTEXT_GATE_MASTER.md`](../engines/AI_CONTEXT_GATE_MASTER.md)의
  `ai-context-gate.project-master@1.0.0` 하나다. 결정적 계약 코어는 구현됐지만 실제
  provider 전달과 관리형 완료 Host 연결은 아직 계획이다.
- 현행 §6의 공동 소유 Stage와 Registry 분류 불일치는
  [`TECHNICAL_DEBT.md`](../governance/TECHNICAL_DEBT.md)의 `ENG-008`에서 추적한다. 문서만 고쳐 구현이
  분리된 것처럼 표시하지 않는다.
- `Source Twin API`, `SourceTwinPanel`, `Workflow Twin Adapter`,
  `source-twin.snapshot.*`은 배포 호환을 위해 유지하는 레거시 현행 API·코드·wire 이름이다.
  새 내부 메커니즘을 뜻하지 않으며, 관련 제품 개념은 Asset 원장으로 설명한다.

## 2. Project Master Enrollment Workflow

이 Workflow는 상대 개발 AI에게 사용자가 소유하는 단 하나의 Project Master 유지 규칙을
준비하고 정직한 강제 수준을 만든다. 전체 Project Master는 AI에게 자동 전송하지 않는다.

| # | Stage | 소유 Engine | 입력 → 출력 | Adapter | Connector |
|---:|---|---|---|---|---|
| 1 | 프로젝트·기준점 검증 | AI Context Gate | 프로젝트 상태·Project Master fingerprint → 검증된 기준점 | 없음 | 없음 |
| 2 | 전달 방식 판정 | AI Context Gate | 수동·연결·관리형 설정 → 전달 계획·가능 강제 수준 | AI Delivery Resolver | 없음 |
| 3 | 제한 기획 선택 | AI Context Gate | 필요한 기획 사실 → 토큰 제한 Planning Context Pack | Pack selector — 계획 | 없음 |
| 4 | 기록 지시 생성 | AI Context Gate | 기준점·Planning Context Pack → 상대 AI용 프롬프트 | Prompt adapter | 없음 |
| 5 | Project Master 준비 | AI Context Gate | 기존 호환 문서 또는 없음 → 보존 판정·새 문서 제안 | Markdown projection adapter — 계획 | 없음 |
| 6 | 전달 요청·Gate 결합 | AI Context Gate | 프롬프트 fingerprint·전달 설정 → Exchange Request 또는 Completion Gate 결합 | Provider capability adapter — 계획 | 실제 전달은 Connector Bridge |
| 7 | 완료 Handoff 검증 | AI Context Gate | AI planning/none 선언·Host 관측 → Receipt 또는 차단 사유 | Completion host adapter — 계획 | 없음 |

현재 Stage 1~7의 결정적 계약, 프롬프트·문서 틀 생성과 Handoff 검증 코어는 구현됐다.
Stage 6의 실제 외부 송신은 AI Context Gate가 하지 않는다.

```text
AI Context Gate가 ConnectorExchangeRequest 생성
  → Connector Bridge가 동의·redaction·provider 송신·Receipt 생성
  → AI Context Gate가 정확한 prompt fingerprint와 Receipt를 다시 결합
```

수동 프롬프트는 `advisory`, 신뢰된 Host가 검증한 전달 Receipt는 `delivery-verified`, 같은
Host가 제품이 실제 통제하는 완료 경계와 현재 지시의 결합을 검증한 경우만
`completion-gated`다. 실제
`PROJECT_MASTER.md` 기본 투영의 생성·수정은 상대 AI가 승인된 개발 변경 안에서 수행하거나
Safe Operations를 사용한다. 파일명은 휴대형 기본값이며 최종 앱 형태·저장 방식은 미정이다.

## 3. Source Analysis Artifact 조회 — UI Projection

이 흐름은 새 Artifact를 만들거나 상태를 바꾸지 않으므로 Workflow Definition이 아니다.

| 단계 | 소유층 | 입력 → 출력 | Adapter | Connector |
|---|---|---|---|---|
| 시스템 Asset 선택 | Web UI | System Asset → Source context | 없음 | 없음 |
| Source Lens 화면 열기 | Web UI | context → `SourceTwinPanel` | Source Analysis read model | `Source Twin API` |
| 영역→서브시스템→Component→모듈 탐색 | Web UI | compact manifest → 계층형 목록 | Source Analysis read model | `Source Twin API` |
| 코드 파츠·Flow 지연 조회 | Web UI/API | module ID → server-only catalog 일부 | Source Analysis read model | `Source Twin API` |
| 근거 열기 | Web UI | repository URL·commit·range → GitHub code URL | GitHub URL adapter | 브라우저 외부 링크 |

사용자는 **Workflow Canvas 시스템 지도에서 시스템 Asset을 선택한 뒤 열리는 Source Lens
패널**에서 조회한다. 전역 코드 편집기나 독립 Graphify HTML이 현재 기본 화면은 아니다.

## 4. Source-to-Map Proposal Workflow

| # | Stage | 소유 Engine | 입력 → 출력 | Adapter | Connector |
|---:|---|---|---|---|---|
| 1 | 후보 선택 | UI host | Source Analysis Artifact → 선택 module/feature | Source Analysis read model | `Source Twin API` |
| 2 | Asset 원장 정규화 | Asset Core | 근거·fingerprint → 정규 Asset 원장 확장 | `Workflow Twin Adapter` | 없음 |
| 3 | 현재 지도 대조 | Asset Core | Asset 원장·현재 canvas → review proposal | `Workflow Twin Adapter` | 내부 저장 API |
| 4 | 사람 검토 | UI host | review proposal → 승인·무시·보류 | Reconciliation UI adapter | 내부 저장 API |
| 5 | 지도 가시화 | Draw Map | 승인된 가시화 operation → 배치·연결선·그룹 | `Workflow Twin Adapter` | MCP/내부 저장 경계 |

Source Lens는 안정 ID·근거까지만 제공한다. 동일성 유지, Proposal과 실제 캔버스 저장은
Source Lens의 책임이 아니다.

## 5. Local Source Refresh Workflow

| # | Stage | 소유 Engine | 입력 → 출력 | Adapter | Connector |
|---:|---|---|---|---|---|
| 1 | Connector 등록·grant | Connector Bridge | 사용자 승인 → 폐기 가능한 local token | Local Connector adapter | Local Connector API |
| 2 | repo root·origin 고정 | Connector Bridge | 선택 경로 → realpath·Git metadata | Local Repository Reader | Local Connector |
| 3 | 단일 분석 호출 | Source Lens | bounded corpus·Profile·이전 결과 → Source Analysis Manifest | Workflow Canvas Source Profile | Connector가 corpus만 공급 |
| 4 | 본문 제거·heartbeat | Connector Bridge | 분석 manifest·Git state → compact state | Local Connector adapter | outbound HTTPS |
| 5 | 저장·화면 갱신 | Connector Bridge/UI | heartbeat → 연결 상태·변경 표시 | Source Analysis read model | Local Connector API·Supabase |

Build checkout 분석과 Local refresh는 Source Lens Workflow 두 개가 아니다. corpus 제공 경로만
다르고 Stage 3에서 같은 공개 진입점을 호출한다.

## 6. Safe Source Edit / Rollback Workflow

| # | Stage | 소유 Engine | 입력 → 출력 | Adapter | Connector |
|---:|---|---|---|---|---|
| 1 | 편집 대상 판정 | Safe Operations | Source Lens anchor·등록 Manifest → 허용 property | Editable Property Manifest | 없음 |
| 2 | 계획·미리보기 | Safe Operations | 현재/다음 값·connector state → 만료된 서명 plan | Operation Definition | `Source Twin API` |
| 3 | 웹 승인·queue | Safe Operations | plan·정확 confirmation → queued operation | 없음 | Supabase operation queue |
| 4 | 로컬 claim·재검사 | Connector Bridge | operation·repo state → 실행 허용/거부 | Local Connector adapter | Local Connector |
| 5 | 격리 편집·검사 | Safe Operations | 등록 literal·anchor → bounded diff·검사 결과 | Source Edit executor | Local Connector·격리 worktree |
| 6 | 터미널 재승인 | Safe Operations | 실제 diff·승인 문구 → 승인/거절 | Terminal approval adapter | Local Connector terminal |
| 7 | commit·감사 | Connector Bridge + Safe Operations | 승인 diff → provenance commit·audit result | Local Git adapter | Local Connector |
| 8 | rollback | Safe Operations + Connector Bridge | 완료 operation → 새 revert commit | Local Git adapter | Local Connector |

자동 push·배포와 임의 코드 편집은 포함하지 않는다. Source Lens는 편집을 실행하지 않고
안정 anchor와 분석 fingerprint만 제공한다.

## 7. GitHub Change Observation Workflow

| # | Stage | 소유 Engine | 입력 → 출력 | Adapter | Connector |
|---:|---|---|---|---|---|
| 1 | webhook 수신·크기 제한 | Connector Bridge | raw request → bounded payload | GitHub webhook adapter | GitHub webhook |
| 2 | 서명·event·repo 검증 | Connector Bridge | HMAC·delivery·repository → 허용 push/거부 | GitHub webhook adapter | GitHub webhook |
| 3 | compact Event 생성 | Connector Bridge | commit·branch·changed path → 본문 없는 Event | GitHub event adapter | 없음 |
| 4 | append-only 저장 | Connector Bridge | compact Event → push history | 없음 | Supabase service boundary |

이 Event는 배포나 재분석 완료가 아니라 “변경 신호”다.

## 8. Integrated System State Snapshot Workflow

| # | Stage | 소유 Engine | 입력 → 출력 | Adapter | Connector |
|---:|---|---|---|---|---|
| 1 | 현재 상태 수집 | Asset Core/Workflow host | Source Analysis·DB·deployment·operation·runtime → state sections | 공급자별 state adapter | `Source Twin API`·Supabase |
| 2 | 운영 관측 판정 | LiveOps | 허용 provider 응답 → verified/stale observation | Runtime adapter | 허용 provider connector |
| 3 | 상태 합성·fingerprint | Asset Core | section 상태 → 호환 snapshot payload | System State Snapshot builder | 없음 |
| 4 | 미리보기·승인 | Safe Operations | payload·actor → plan·confirmation | Snapshot Operation Definition | `Source Twin API`/MCP |
| 5 | 원자 저장·감사 | Safe Operations | 승인 plan → snapshot 1건·audit 1건 | DB RPC adapter | Supabase |
| 6 | 두 시점 비교 | Asset Core | from/to snapshot → section·Asset·metric diff | System State Snapshot builder | `Source Twin API` |

호환 wire 이름은 `source-twin.snapshot.*`이지만 구현 코어는
`shared/systemStateSnapshot.js`로 분리되어 Source Lens 분석 Engine에 속하지 않는다.

## 9. External AI Explanation Workflow

| # | Stage | 소유 Engine | 입력 → 출력 | Adapter | Connector |
|---:|---|---|---|---|---|
| 1 | 소유자·rate limit 검사 | Connector Bridge/API guard | 요청·actor → 허용/거부 | Source Analysis read model | `Source Twin API` |
| 2 | bounded metadata 준비 | Connector Bridge | code part kind·symbol·path/range·결정적 요약 → redacted envelope | Provider-neutral AI adapter | 없음 |
| 3 | 제공자 호출 | Connector Bridge | 승인 config·envelope → provider response | Provider-neutral AI adapter | 승인된 외부 AI provider |
| 4 | 보강 표시 | Web UI | provider response → AI 배지·모델·보강 문장 | Explanation UI adapter | `Source Twin API` |

기본 비활성이다. AI는 Relation, 권한, Reality Level, 편집 속성 또는 캔버스 Proposal을 만들
수 없다. 여러 Lens에서 범용 재사용할 만큼 커질 때만 별도 Explanation Engine을 검토한다.

## 10. Source Lens 지도 분석 Adapter — 계획

Graphify는 별도 하위 Engine이나 독립 온보딩 Workflow로 넣지 않는다. Source Lens의 단 하나인
`source-lens.source-analysis` 안에서 교체 가능한 지도 분석 Adapter의 첫 제공자로 쓴다.
현행 1.1 Workflow에는 Graphify보다 먼저, 최신 README·기획 문서와 실제 UI 문구·화면 경로·
API·DB·테스트·정적 Flow 근거로 `FunctionalContextPack`을 만드는 `G10-0 Functional
Context Bootstrap`이 구현되어 있다. 이 Pack은 이후 F1~F7이 사용할 기능 어휘 준비물이며
Functional Community Resolution 자체를 구현한 것은 아니다.
세부 Flow는 detect, 구조·의미 추출, merge, 지도 상태, Community/cohesion, 중요 노드·
bridge·orphan·문제 분석으로 분리한다. Graphify의 Structural Community는 원형 Artifact로
보존하고, Source Lens의 필수 `Functional Community Resolution` Stage가 같은 기능군을
Community 경계를 넘어 정합화한 뒤 `query/path/explain`과 캔버스 소비 결과로 넘긴다.
[`SOURCE_LENS_MASTER.md`](../engines/SOURCE_LENS_MASTER.md) §4를 정본으로 한다.

| 경계 | 소유 위치 |
|---|---|
| Graphify library 결과를 Source Lens 표준 지도 Artifact로 정규화 | Source Lens Adapter |
| Stage별 제공자·버전·Capability 선택 | Source Lens Resolver + Provider Manifest |
| Structural Community 원형 membership·cohesion·provenance 보존 | Source Lens 지도 Artifact Contract + Hard Guardrail |
| Functional Community 후보·검증·이름·쉬운 설명 | Source Lens Contract + Resolver + Builder + Pipeline + Agent Skill + Agent Policy + Hard Guardrail |
| Structural Community의 사용자 노출·후속 가공 결정 | `TECHNICAL_DEBT.md`의 `SL-001` |
| CLI·MCP·원격 지도 DB·외부 AI 통신 | Connector Bridge |
| 레거시 현행 파일명 `graph.json`·보고서·HTML 파일 보존 | Artifact host |
| 지도 결과를 사용자 화면으로 표시 | Web UI projection |

현재 Source Lens 0.9 실행 코드는 Graphify를 호출하지 않는다. 구현 전까지 `graphify-out/`은
개발 탐색 보조 산출물이고 제품 정본이 아니다. Adapter Contract와 정규 지도 schema가
구현된 뒤에도 Graphify 고유 파일은 provider attachment이며, 안정 ID·Profile·Feature·Reality
판정은 Source Lens와 각 소유 Engine의 공통 Contract를 따른다. Functional Community Stage가
완료되지 않은 결과는 캔버스 준비 완료로 표시하지 않는다.

## 11. Connector Bridge Exchange Workflow — 계획

Connector Bridge 0.2는 Local·GitHub webhook·외부 AI·Operation 전달을 각각 실행하지만 아래
공통 Workflow와 Connector Exchange Contract는 아직 구현하지 않았다. 목표는 호출 Engine이
provider 이름이 아니라 Capability를 요청하고, Bridge가 같은 안전 경계로 한 번의 교환을
완료하는 것이다. 호출 Engine이 목적·Capability·대상·direction으로 Exchange Request 후보를
만드는 일은 이 Workflow의 입력 전제조건이지 Connector Bridge Stage가 아니다.

| # | Stage | 소유 Engine | 구성 분류 | 입력 → 출력 | Adapter | Connector |
|---:|---|---|---|---|---|---|
| 1 | 요청·Manifest 계약 검증 | Connector Bridge | Contract + Hard Guardrail | Exchange Request·Provider Manifest → typed request/거부 | 없음 | 없음 |
| 2 | Capability·Provider·direction 선택 | Connector Bridge | Resolver + Manifest | Capability·mode → provider·direction | 없음 | 없음 |
| 3 | 대상·Grant·Credential Reference 결속 | Connector Bridge | Resolver + Hard Guardrail | actor·device·target·scope·expiry → bound exchange | 없음 | 없음 |
| 4 | direction별 preflight·최소화 | Connector Bridge | Builder + Hard Guardrail | outbound payload → redacted preview / inbound headers → bounded receive plan | outbound request Adapter / inbound 없음 | 없음 |
| 5 | Grant 범위·동의·endpoint authorization | Connector Bridge | Contract + Hard Guardrail | preview/receive plan·Grant → 허용·재동의 대기·거부 | 없음 | 없음 |
| 6 | 경계 교환·수신 | Connector Bridge | Connector | 승인 envelope/receive plan → raw provider result | 없음 | Local/GitHub/API/AI/MCP/remote |
| 7 | 응답·송신자·서명·replay·크기 검증 | Connector Bridge | Contract + Hard Guardrail | raw result·request identity → verified result/거부 | 없음 | 없음 |
| 8 | Provider 중립 결과 정규화 | Connector Bridge | Builder + Adapter | verified result → Exchange Result | provider response/event Adapter | 없음 |
| 9 | 연결 상태·비효율·보안 Finding | Connector Bridge | Resolver + Builder + 선택 Agent Skill/Agent Policy | result·metrics·이전 관측 → Finding·Recommendation | 없음 | 없음 |
| 10 | provenance·Receipt·Bundle 반환 | Connector Bridge | Pipeline + Builder | 결과·정책·Manifest 버전·시간·비용 → Connector Exchange Bundle | 없음 | 선택 Artifact Store Connector |

표는 Stage의 주 책임만 적는다. Connector Exchange Pipeline은 Stage 1~10의 순서·조건 분기·
timeout·실패 상태를 전체적으로 조정한다.

```text
outbound/local/operation-dispatch:
  preview → 기존 Grant 범위 확인 → 필요 시 사용자 재동의 → 송신 → 응답 검증

inbound webhook:
  endpoint·크기 preflight → 등록 Grant 확인 → bounded 수신 → HMAC·sender·replay 검증
```

Inbound는 등록 endpoint·Capability·sender·Data Class Grant로 사전 승인하고 매 event마다
사용자 클릭을 요구하지 않는다. Outbound는 목적지·목적·Data Class·필드가 기존 Grant와
달라지면 `consent_required`로 멈추고, Web UI가 정확한 Preview로 받은 명시적 선택에 따라 새
Grant가 발급된 뒤에만 재개한다.

Local refresh, webhook, 외부 AI와 승인된 Operation 전달은 각각 이 Capability를 호출하는 제품
Workflow다. Bridge는 코드 의미·Asset 동일성·LIVE·Operation Plan과 성공을 판정하지 않는다.
변경이 필요한 Recommendation은 Safe Operations에 넘기며, 미승인 교환 차단과 Grant 폐기만
자신의 Hard Guardrail에서 즉시 수행한다. Grant 폐기는 사용자 요청이나 사전에 명시된 긴급
정책을 근거로 해야 한다. Stage별 현행 파일, 입력·결과 Artifact, 사용자 화면,
Provider Manifest와 전체 구성 분류는
[`CONNECTOR_BRIDGE_MASTER.md`](../engines/CONNECTOR_BRIDGE_MASTER.md)를 따른다.

## 12. Starting Protocol 조합 — 목표

온보딩 전 준비 규약은 [`STARTING_PROTOCOL.md`](./STARTING_PROTOCOL.md)가 정본이다. 목표
Workflow Definition `starting@1.0.0`은 최초 Entry Adapter를 특정하지 않고 다음 Capability를
조합한다. 현재 통합 Runner와 Starting Bundle 저장소는 없다.

| Protocol Stage | 호출하는 Workflow·Capability | 소유자 | 현재 상태 |
|---|---|---|---|
| START-00 첫 접점 기록 | Entry Record 생성 | Starting Host + Entry Adapter | 시작점·Adapter 미정/계획 |
| START-01 프로젝트 확인 | Starting Request 생성 | Starting Host; Intent 후보는 선택 | 계획 |
| START-02 Project Master 준비 | `ai-context-gate.project-master@1.0.0`의 문서·Pack 준비 | AI Context Gate | 결정적 코어 현행 |
| START-03 사용자 교정·확정 | Project Master Review·fingerprint 승인 | 사용자 + Review/Artifact Host | UI·ledger 계획 |
| START-04 상대 AI 등록 | 같은 AI Context Gate Workflow를 확정 기준점으로 재호출 | AI Context Gate | 프롬프트·Manifest 현행; provider 전달·완료 Host 계획 |
| START-05 온보딩 인계 | Starting Bundle 생성 | Starting Host | 계획 |

실제 외부 AI 송신이 있을 때만 Connector Bridge, 프로젝트 파일에 실제 쓰기가 있을 때만
Safe Operations 또는 승인된 개발 변경을 사용한다. 두 Engine은 Starting 의미를 소유하지
않는다. `PROJECT_MASTER.md`는 현행 휴대형 Markdown 기본 투영일 뿐 최종 앱 형태·저장 방식은
아직 정하지 않았다.

## 13. System Onboarding Protocol 조합 — 목표

시스템 가져오기의 전체 규약은
[`SYSTEM_ONBOARDING_PROTOCOL.md`](./SYSTEM_ONBOARDING_PROTOCOL.md)가 정본이다. 이 카탈로그는
목표 Workflow Definition `system-onboarding@1.0.0`이 어떤 기존 Workflow·Capability를
조합하는지만 기록한다. Starting Bundle을 입력으로 받으며 현재 통합 Runner가 없다.

| Protocol Stage | 호출하는 Workflow·Capability | 소유자 | 현재 상태 |
|---|---|---|---|
| ONB-00 Starting 입력·범위 확인 | Starting Bundle 검증·Onboarding Request·Run Manifest | Workflow/UI Host | 계획 |
| ONB-01 연결·동의 | 목표 `connector-bridge.exchange@1.0.0`의 Grant·Preview | Connector Bridge | 부분 |
| ONB-02 근거 교환 | 목표 Connector Exchange와 현행 Local/GitHub Flow | Connector Bridge | 부분 |
| ONB-03 소스 분석 | `source-lens.source-analysis@1.1.0` | Source Lens | 결정적 분석·G10-0 현행; Graphify Adapter·F1~F7 Functional Community Resolution 계획 |
| ONB-04 정규화·동일성 | Asset 원장·Identity Capability | Asset Core | 자기 지도 중심 부분 |
| ONB-05 신뢰경계 | Trust topology·Security overlay Capability | Trust Map | 자기 지도 중심 부분 |
| ONB-06 상태·기획 대조 | Reconciliation·Documentation Debt Proposal | Asset Core (UI Host는 입력·표시) | 자기 지도 중심 부분; Project Master 대조 계획 |
| ONB-07 지도 가시화 | 승인 Proposal→배치·연결선·그룹 | Draw Map | Web/MCP 경계가 나뉜 부분 구현 |
| ONB-08 운영정보 교환 | 목표 Connector Exchange runtime capability | Connector Bridge | LiveOps 내부 일부 혼재 |
| ONB-09 첫 관측 | Runtime Observation Capability | LiveOps | 자기 지도 수동 관측 중심 부분 |
| ONB-10 안전 해결 경로 | Operation capability discovery·plan draft | Safe Operations | 제한 capability만 부분 |
| ONB-11 후속 작업 초안 | Onboarding Finding→Work draft | Work Core — 선택 | 계획 |
| ONB-12 완료 보고 | Artifact 집계·Receipt·Projection | Workflow/UI Host | 계획 |

Protocol의 기본 Run은 대상 시스템을 바꾸지 않는다. ONB-10은 지원되는 해결 경로를
연결할 뿐이며 실제 변경은 이 Run이 끝난 뒤 별도의 Operation Lifecycle Workflow Run으로
실행한다. Work Core는 선택 보조이고 현재 온보딩 오케스트레이터가 아니다. 범용 AI 자체는
Stage 소유자가 아니다. AI Context Gate는 선행 Starting Protocol에 있으며 온보딩 Stage를
소유하지 않는다.

## 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 0.8.0 | 2026-07-20 | Source Lens Workflow 1.1의 G10-0 Functional Context Bootstrap을 현행 Stage로 추가하고, Graphify·F1~F7 기능 커뮤니티 정합화는 계획 상태로 분리했다. |
| 0.7.0 | 2026-07-20 | 미정인 첫 접점에서 사용자 소유 Project Master·상대 AI Enrollment·Starting Bundle을 준비하는 Starting Protocol 조합을 추가했다. AI Context Gate Workflow를 Project Master 중심으로 바꾸고 System Onboarding에서는 제거했으며, 온보딩이 Starting Bundle을 받아 ONB-00~12로 실제 근거를 분석하도록 정리했다. |
| 0.6.0 | 2026-07-20 | AI Context Gate의 단일 Context Enrollment Workflow를 추가하고, 수동 프롬프트·Connector 전달 Receipt·관리형 완료 Gate의 강제 수준을 분리했다. 시스템 온보딩에서 연결 동의 다음의 첫 의미 준비 Stage로 배치하고 이후 Stage를 ONB-13까지 재번호화했다. |
| 0.5.0 | 2026-07-20 | Graphify Structural Community를 보존하는 Provider 원형과 Source Lens가 같은 기능군을 만드는 필수 Functional Community Resolution Stage를 분리했다. 기능군 정합화의 Contract·Resolver·Builder·Pipeline·Agent Skill·Agent Policy·Hard Guardrail 책임과 미완료 시 캔버스 준비 차단, Structural Community 후속 결정 부채 `SL-001`을 연결했다. |
| 0.4.0 | 2026-07-20 | 시스템 가져오기 전체를 교차-Engine `System Onboarding Protocol`로 연결하고 목표 실행 Definition `system-onboarding@1.0.0`의 Stage 조합, 현재 부분 구현, 읽기 전용·별도 Operation Run 경계를 기록했다. |
| 0.3.0 | 2026-07-20 | Connector Bridge 0.2의 분산 현행 Flow와 계획 상태인 단일 Exchange Workflow를 분리해 기록했다. Capability·Provider·direction·Grant·재동의·bounded 교환·송신자/응답 검증·정규화·Finding·Receipt Stage와 Safe Operations 해결 경계를 추가했다. |
| 0.2.0 | 2026-07-19 | Graphify를 별도 Explorer Engine으로 두던 방향을 바꿔, Source Lens 단일 Workflow 안의 교체 가능한 지도 분석 Adapter 첫 제공자로 확정했다. 외부 프로세스·AI·지도 DB 통신과 Artifact/UI 보존 경계는 Source Lens 밖에 유지했다. |
| 0.1.0 | 2026-07-19 | 기존 Source Lens A~G에서 UI projection과 교차 Engine Workflow를 분리해 소유 Engine·Adapter·Connector별로 기록했다. |
