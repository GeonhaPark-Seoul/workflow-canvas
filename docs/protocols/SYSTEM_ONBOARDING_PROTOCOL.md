# 시스템 온보딩 프로토콜

이 문서는 Starting Protocol이 준비한 프로젝트를 실제 시스템 근거와 연결해 구조를 이해하고,
비효율·보안 문제·문서 불일치를 확인하며, 안전한 해결 경로와 System Map을 얻을 때까지의
전체 규약을 정의한다. 제품 방향은 [`MASTER.md`](../MASTER.md), 선행 준비는
[`STARTING_PROTOCOL.md`](./STARTING_PROTOCOL.md)가 우선한다.

| 항목 | 값 |
|---|---|
| 문서 버전 | `0.5.0` |
| Protocol 목표 ID | `system-onboarding.protocol@1.0.0` — 계획 |
| 실행 Workflow 목표 ID | `system-onboarding@1.0.0` — 계획 |
| 선행 입력 | Starting Bundle과 사용자 승인 Project Master |
| 현재 구현 상태 | 개별 기능은 존재하지만 전체 Run·진행 장부·완료 Bundle은 없음 |
| 기본 안전 모드 | 대상 시스템에 대해 읽기 전용 |
| 기준일 | 2026-07-20 |

---

## 1. 한 문장 정의

> **System Onboarding Protocol은 준비된 프로젝트의 허용된 실제 근거를 수집·분석하고,
> 사용자 기획과 현실의 차이를 포함한 공통 System Map과 구조·비효율·보안·문서 부채 진단을
> 만든 뒤, 사람이 검토한 결과와 안전한 해결 경로를 반환하는 버전형 교차-Engine 규약이다.**

비개발자에게는 다음 질문에 답해야 한다.

1. 내 앱은 무엇으로 이루어져 있고 서로 어떻게 연결되는가?
2. 어디가 느리거나 중복되거나 관리하기 어려운가?
3. 어디에 보안 위험 또는 확인되지 않은 구멍이 있는가?
4. Project Master와 실제 코드·설정은 어디서 다르게 말하는가?
5. 무엇부터 어떤 안전한 절차로 고칠 수 있는가?

이 Protocol은 Engine이 아니다. 전체 순서·입출력·승인·실패·완료 조건을 정하고, 실제 상태
변환은 각 Stage의 독립 Engine이 수행한다.

```text
Starting Protocol
└─ Starting Bundle + Project Master
   └─ System Onboarding Protocol
      └─ Workflow Definition
         └─ Workflow Run
            └─ Work Item
```

목표 ID는 아직 설계다. 현재 코드에 통합 실행기나 Run 저장소가 있다고 주장하지 않는다.

## 2. Starting Protocol과의 경계

Starting Protocol은 프로젝트 전체 기획 정본과 상대 개발 AI의 유지 규칙을 준비한다.
System Onboarding은 그 다음에 실제 코드·DB·설정·배포 근거를 읽는다.

| Starting Protocol | System Onboarding Protocol |
|---|---|
| 프로젝트가 무엇을 만들려는지 정리 | 시스템이 실제로 어떻게 구성됐는지 분석 |
| 사용자 소유 Project Master 준비·교정 | Project Master와 코드·설정 근거 비교 |
| 상대 개발 AI Enrollment·강제 수준 확인 | 구조·비효율·보안·문서 부채 Finding 생성 |
| Starting Bundle 생성 | System Map·Onboarding Bundle 생성 |

AI Context Gate는 System Onboarding 내부 Stage가 아니다. Starting Protocol이 직접 호출하고,
필요하면 이후 개발 Workflow가 Handoff Capability를 다시 사용한다.

Project Master는 사용자의 **기획 의도 정본**이며 현재 동작의 증거가 아니다. Source Lens와
다른 Engine이 발견한 사실이 다르면 코드를 기획에 억지로 맞춰 해석하지 않고
`Documentation Debt Finding` 또는 `contradicted`로 기록한다.

## 3. 사용자가 보는 쉬운 전체 흐름

```text
Starting Bundle과 Project Master를 확인한다
  → 무엇을 읽고 어디로 보낼지 본 뒤 연결을 허용한다
  → 허용한 범위에서 코드·설정·DB·배포 근거를 모은다
  → 파일을 읽어 앱의 기능·구조·흐름을 이해한다
  → 서로 다른 근거를 같은 대상과 공통 구조로 맞춘다
  → 데이터 경계·접근 통로·확인되지 않은 구멍을 찾는다
  → 현재 지도, 사용자 기획, 실제 근거의 차이를 검토한다
  → 사용자가 승인한 내용만 System Map으로 만든다
  → 허용된 운영 상태를 한 번 확인한다
  → 가능한 안전한 해결 방법과 후속 작업을 연결한다
  → 근거·문제·미확인 영역·다음 행동이 담긴 보고서를 받는다
```

기본 온보딩은 **읽고 이해하고 제안하는 과정**이다. 코드·DB·Git·배포 설정을 실제로 바꾸는
일은 완료 후 별도 Safe Operations Run에서 미리보기와 승인을 다시 거친다.

## 4. 입력·결과·완료의 의미

### 4.1 시작 입력

- Starting Bundle의 Protocol/Workflow version, Entry Record와 project identity
- 사용자가 승인한 Project Master ref·format·fingerprint
- AI Context Enrollment Manifest와 실제 Enforcement Status
- 사용자가 승인한 온보딩 목적·성공 기준·대상·포함/제외 범위
- 지원 Profile과 분석할 저장소·서비스·환경
- Connector Grant와 Credential 값이 아닌 Credential Reference
- 외부 AI 사용 모드와 정확한 전송 동의
- 선택적 기존 System Map과 이전 분석 Artifact

전체 Project Master는 외부 AI에 자동 전송하지 않는다. 현행 Source Lens G10-0은 corpus에
포함된 README·기획 문서와 실제 소스 근거로 `FunctionalContextPack`을 만들며 외부 AI를
사용하지 않는다. 이후 F1~F7은 이번 분석에 필요한 제한 `Planning Context Pack`을 추가
근거로 받을 수 있도록 계획한다.

### 4.2 최종 결과: System Onboarding Bundle

| 결과 | 사용자에게 주는 답 |
|---|---|
| System Map | 앱의 실제 구조와 관계는 무엇인가 |
| Structure Findings | 끊긴 관계, 고아 요소, 모호한 경계는 어디인가 |
| Efficiency Findings | 중복 호출, 큰 전송, 불필요한 polling, 병목 후보는 어디인가 |
| Security Findings | 신뢰영역, Gateway, 노출, 권한, `unknown-gap`은 어디인가 |
| Documentation Debt Findings | Project Master·기존 문서·코드·설정이 서로 다르게 말하는 곳은 어디인가 |
| Unknowns & Unsupported Coverage | 읽지 못했거나 근거가 부족한 범위는 어디인가 |
| Recommended Safe Actions | 어떤 문제를 어떤 제한 조작으로 검토할 수 있는가 |
| Optional Work Drafts | 사용자가 채택할 수 있는 후속 개선 작업 초안 |
| Starting Provenance | 어떤 Project Master와 Starting Bundle을 기준으로 분석했는가 |
| Onboarding Receipt | 누가, 무엇을, 어떤 버전·권한·근거로 처리했는가 |

보고서 Host는 Engine Artifact를 모아 보여줄 뿐 새로운 사실이나 위험을 발명하지 않는다.

### 4.3 상태 축을 섞지 않는다

| 축 | 예 | 뜻 |
|---|---|---|
| Run 상태 | `awaiting_consent`, `running`, `awaiting_review`, `paused`, `completed`, `failed_recoverable`, `blocked`, `cancelled` | 전체 실행 진행 상태 |
| 완료 결과 | `map_ready`, `map_ready_with_findings`, `map_ready_with_unknowns`, `incomplete` | 사용자가 받은 결과 범위 |
| Reality Level | `declared`, `discovered`, `observed`, `runtime-verified`, `stale`, `contradicted`, `unknown` | 개별 사실의 근거 수준 |
| Finding 상태 | `open`, `accepted_risk`, `planned`, `mitigating`, `resolved`, `reopened` | 발견한 문제의 처리 상태 |

`completed`는 시스템 전체가 안전하거나 열린 문제가 모두 해결됐다는 뜻이 아니다.

## 5. 전체 Stage와 책임

상태 표기: **현행**은 일반 지원 범위에서 코드가 동작함, **부분**은 자기 지도 또는 일부
provider만 동작함, **계획**은 통합 계약·Runner가 아직 없음이다.

| ID | 사용자가 하는 일·보는 것 | Stage 소유자 | AI 개입 | 현재 코드와 상태 | 출력 Artifact |
|---|---|---|---|---|---|
| ONB-00 | Starting Bundle·Project Master·목표·포함/제외 범위 확인 | Workflow/UI Host | 선택: 기존 내용을 쉬운 말로 설명. 새 기획 확정 금지 | 통합 Wizard·Run 없음 — **계획** | Onboarding Request, Run Manifest |
| ONB-01 | 연결 대상·권한·나가는 정보 Preview를 보고 동의 | Connector Bridge | 선택: Manifest 설명 | Local 등록·1회 token·권한 flag — **부분** | Connection Plan, Grant |
| ONB-02 | 허용 범위에서 근거를 읽고 전송 내역 확인 | Connector Bridge | **금지** | local helper manifest·GitHub push webhook — **부분** | Bounded Corpus, Exchange Receipt |
| ONB-03 | 기능·파일·코드 파츠·정적 Flow와 문제 후보 확인 | Source Lens | G10-0은 AI 없음; F1~F7 Functional Community 후보 생성은 계획상 필수이며 코드 근거 검증 전 확정 금지 | 결정적 분석·`FunctionalContextPack` **현행**; Graphify·F1~F7 Resolution **계획** | Source Analysis Bundle, Functional Context Pack, Community Sets, Source Findings |
| ONB-04 | 서로 다른 근거가 같은 대상인지 확인 | Asset Core | 선택: 중복·차이 후보 설명. 동일성 확정 금지 | 자기 지도 Asset 원장 — **부분** | Asset 원장, Identity Decisions |
| ONB-05 | 데이터 경계·Gateway·`unknown-gap`과 보안 Finding 확인 | Trust Map | 선택: 위협 가설 설명 | 자기 지도 선언 근거 Overlay — **부분** | Trust Analysis, Security Findings |
| ONB-06 | 현재 지도·Project Master·실제 근거 차이를 승인·무시·보류 | Asset Core; UI Host는 검토 화면 | 선택: 이유·영향 설명. 결정 대행 금지 | 자기 지도 Adapter·Review Panel — **부분** | Proposal, Review Decision Ledger, Documentation Debt Findings |
| ONB-07 | 승인한 항목만 지도에 반영 | Draw Map | 선택: 승인 범위 안 지도 입력 구성 | Web proposal·MCP 경계 분리 — **부분** | System Map Revision, Materialization Receipt |
| ONB-08 | 첫 운영 확인에 필요한 대상·데이터 교환 재확인 | Connector Bridge | 선택: 교환 결과 설명 | LiveOps 안에 provider I/O 일부 혼재 — **부분** | Runtime Exchange Result |
| ONB-09 | 실제 응답 시각·상태·stale/unknown 확인 | LiveOps | 선택: 검증된 추세 요약. LIVE 판정 금지 | 자기 지도 수동 runtime check — **부분** | Runtime Observation, Runtime Findings |
| ONB-10 | 해결 가능한 문제에 안전 조작 경로가 있는지 확인 | Safe Operations | 선택: 비실행 Request/Plan 초안 | 제한 Operation 중심 — **부분** | Operation Capability Set, Safe Action Recommendations |
| ONB-11 | 채택할 개선안을 작업 초안으로 저장 | Work Core — 선택 Stage | 선택: 입력·과정·결과 초안 | Work 계약만 존재 — **계획** | Optional Work Drafts |
| ONB-12 | 구조·비효율·보안·문서 부채·Unknown과 다음 행동 확인 | Workflow/UI Host | 선택: 근거 기반 설명·`query/path/explain` | 통합 Bundle·Receipt·화면 없음 — **계획** | System Onboarding Bundle, Onboarding Receipt |

직접 상태 변환에 참여하는 기본 Engine은 Connector Bridge, Source Lens, Asset Core, Trust Map,
Draw Map, LiveOps, Safe Operations의 7개다. Work Core는 선택적 후속 초안만 담당한다.
사람 검토와 최종 Projection은 Engine이 아니라 Workflow/UI Host 책임이다.

`Draw Map`은 배치·연결선·그룹만 담당하며 온톨로지·사실 판정과 무관한 순수 가시화
Engine이다. ONB-07에서 승인된 내용을 지도에 투영할 뿐 Asset 동일성, Relation 의미나 사실
여부를 결정하지 않는다.

## 6. Stage별 내부 구성 분류

모든 Stage에 모든 구성 종류를 억지로 만들지 않는다. `(계획)`은 아직 구현되지 않았다는 뜻이다.

| Stage | Contract · Resolver · Builder · Pipeline | Adapter · Connector · Manifest | Agent Skill · Agent Policy | Hard Guardrail |
|---|---|---|---|---|
| ONB-00 | Onboarding Request Contract, Starting Bundle Validator, Run Manifest Builder, Protocol Pipeline — 계획 | 지원 Profile/Provider Manifest; Connector 없음 | Onboarding Explanation Skill/Policy — 계획 | 사용자 승인 Project Master fingerprint와 Starting Bundle 결속 |
| ONB-01 | Connector Exchange Contract/Pipeline, Capability·Grant Resolver, Preview Builder — 계획 | provider Adapter·Connector·Manifest; Local 일부 현행 | Connection Explanation Skill/Policy — 계획 | 비밀값 비노출, 최소 권한, 새 목적지·목적·Data Class 재동의 |
| ONB-02 | Bounded Receive/Send Contract — 계획; local scanner pipeline 현행 | Local Repository Reader·GitHub Webhook Adapter/Connector — 부분 | 없음; AI 금지 | realpath containment, symlink·파일 유형·크기·서명·replay 검사 |
| ONB-03 | Source Analysis Contract/Pipeline/Profile Resolver/Bundle Builder와 Functional Context Contract/Resolver/Pack Builder — 현행; Functional Community 구성 — 계획 | Source Profile Manifest·내장 G10-0 Adapter 현행; 지도 분석 Adapter 계획; 외부 통신은 Bridge | G10-0에는 없음; Functional Community Resolution Skill·Evidence Policy — 계획 | corpus·G10-0 Pack 한도 현행; Structural Community 보존·근거·unknown·G10 미완료 `canvas_ready` 차단 계획 |
| ONB-04 | Asset 원장 Contract, Identity Resolver, Asset Builder — 현행 기반 | `Workflow Twin Adapter` 레거시 코드명으로 자기 지도 현행 | Reconciliation Candidate Skill/Policy — 계획 | 안정 ID·fingerprint·참조 무결성, 모호한 동일성 자동 확정 금지 |
| ONB-05 | Trust Topology Resolver, Security Overlay Builder — 자기 지도 현행 | Trust 입력 Adapter — 부분 | Security Triage Skill/Policy — 계획 | 근거 없는 교차는 `unknown-gap`, 정적 분석을 안전 보증으로 승격 금지 |
| ONB-06 | Reconciliation Contract/Resolver, Proposal·Documentation Debt Builder — 현행 기반/계획 혼합 | Review UI Adapter — 자기 지도 현행 | Difference Explanation Skill/Policy — 계획 | Project Master를 실제 동작 증거로 승격 금지, stale 승인 무효 |
| ONB-07 | 지도 입력 Contract, 구성·배치 Pipeline — 현행 기반 | 배치 Adapter·내부 저장/MCP 경계 | 지도 구성 Skill — 현행 Registry | 승인 Proposal의 정확한 write set·권한·개수 제한 |
| ONB-08 | Connector Exchange Contract/Pipeline — 계획 | Runtime provider Adapter/Connector/Manifest — 부분 | Connection Explanation Skill/Policy — 계획 | allowlist, Grant, timeout, rate/byte limit, 응답 검증 |
| ONB-09 | Observation Contract, Freshness Resolver, Observation Builder — 부분 | Runtime Adapter — 자기 지도 현행 | Trend Explanation Skill/Policy — 계획 | 서버 검증 Observation만 `runtime-verified` |
| ONB-10 | Operation Lifecycle Contract, Capability Resolver, Plan Builder — 현행 기반 | Operation Adapter; 실제 통신은 Bridge | Safe Remediation Draft Skill/Policy — 계획 | 온보딩은 추천까지만; 실행은 별도 승인·검증·복구 Run |
| ONB-11 | Work Contract — 현행; Onboarding-to-Work Builder — 계획 | Connector 없음 | Work Draft Skill/Policy — 계획 | Work 연결이 권한이나 실행을 부여하지 않음 |
| ONB-12 | Bundle Contract, Report Builder, Completion Resolver — 계획 | Report Adapter·선택 Artifact Store Connector — 계획 | Evidence Narrative & Explore Skill/Policy — 계획 | 모든 주장에 Artifact·Evidence ref, unknown·conflict 보존 |

Protocol 수준 구성은 여러 Engine을 대신하는 새 Engine이 아니다. Run 순서·재개·완료와 최종
집계만 맡는다. Agent Policy는 모델 지침이고 실제 차단은 코드·스키마·권한 Guardrail이 맡는다.

## 7. AI 개입 규칙

### AI가 해도 되는 일

- Starting Bundle·Project Master와 결정적 분석 결과를 쉬운 말로 설명
- 문서·이미지 의미, 중복·위협 가설을 후보로 제시
- G10에서 기능군·소속 Source Node 후보를 만들고 실제 코드 근거 검증을 보조
- Finding을 근거별로 묶고 Recommendation 초안 작성
- 실행 권한 없는 Operation Request·Work 초안 작성
- 승인된 Artifact 안에서 `query`, `path`, `explain` 탐색 지원

### AI가 하면 안 되는 일

- Project Master의 사용자 확정 기획을 새로 만들거나 조용히 수정
- Asset·Relation·동일성·Reality Level·LIVE를 사실로 확정
- Connector·provider·endpoint를 임의 선택하거나 Grant·비용·Data Class 확대
- Credential 또는 승인하지 않은 source body·문서 본문 전송
- 사람의 동의, Proposal 승인, 공유·공개 결정 대행
- 코드·DB·Git·외부 설정 직접 실행 또는 자기 결과 자기 검증
- 실패·충돌·unsupported·`unknown-gap` 숨김
- 앱 전체가 안전하거나 문제가 해결됐다고 근거 없이 선언

AI 결과는 candidate·explanation·recommendation으로만 저장하고 provenance와 budget을
기록한다. 필수 Functional Community Resolution이 완료되지 않으면 결정적 Artifact는 보존하되
Run은 `partial` 또는 `blocked`이며 `canvas_ready`로 표시하지 않는다.

## 8. 사람 승인 지점

| Gate | 반드시 사람이 결정하는 것 |
|---|---|
| H0 | Starting Bundle·Project Master 기준점, 온보딩 목적·범위·AI 모드 |
| H1 | Connector pairing, 최소 Grant, 읽을 대상과 보관 기간 |
| H1-AI | provider/model, Data Class, 정확한 Outbound Preview, 비용 한도 |
| H2 | 모호한 동일성, Project Master와 현실의 충돌, 병합·분리, Proposal 결정 |
| H3 | System Map에 반영할 정확한 Proposal fingerprint |
| H4 | 후속 코드·DB·Git·외부 설정 변경의 정확한 Operation Plan |
| H4-local | 필요 시 로컬 기기의 실제 diff·저장소·remote 재승인 |
| H5 | 최종 System Map과 보고서 공유·공개 |

승인된 corpus 안의 결정적 parsing, 같은 Grant 안 bounded inbound, redaction과 거부,
승인 범위의 read-only 관측에는 매번 클릭을 요구하지 않는다.

## 9. Artifact·근거·버전 연결

Run Manifest는 Protocol·Workflow·Stage별 Engine/Contract/Adapter/Connector/Profile/Manifest/
Skill/Policy version, 입력 fingerprint, actor·target·Grant·Data Class, AI provenance·budget,
Stage Event와 Artifact ref를 고정해야 한다.

```text
Starting Bundle + approved Project Master
  → Onboarding Request + Grant
  → Bounded Evidence / Exchange Receipt
  → Source Analysis Bundle
  → Asset 원장 + Trust Analysis
  → Reconciliation Proposal + Documentation Debt + Human Decisions
  → System Map Revision
  → Runtime Observation
  → Findings + Safe Actions + Optional Work Drafts
  → System Onboarding Bundle + Onboarding Receipt
```

각 단계는 입력을 덮어쓰지 않는다. 최종 보고서에는 secret, credential 값, source body,
Project Master 본문, provider raw response를 기본적으로 복제하지 않고 ref와 fingerprint를 쓴다.

## 10. 사용자 화면

목표 화면은 다음 정보를 한 흐름으로 보여 준다. Starting Protocol의 최초 화면 형태와 마찬가지로
구체 UI는 아직 구현되지 않았다.

1. Starting Bundle·Project Master 기준점과 온보딩 범위
2. 연결 대상, 권한, 나가는 데이터, 취소 방법
3. Stage 진행·부분·미지원·재개 상태와 Artifact
4. 기능·모듈·DB·배포·Relation 구조 Preview
5. 구조·비효율·보안·문서 부채 Finding과 Unknown
6. Project Master와 실제 근거가 다른 지점
7. Proposal 승인·무시·보류 검토
8. 승인된 System Map과 Reality·보안·운영 Overlay
9. 안전한 후속 행동과 선택 Work 초안
10. 범위·버전·열린 문제·Receipt·`query/path/explain`

현재는 자기 지도, 현행 코드명 `SourceTwinPanel`·`DigitalTwinReviewPanel`, runtime 버튼과 조작 UI에
기능이 흩어져 있다.

## 11. 현행 코드 지도와 목표 물리 경계

| 영역 | 현재 근거 | 한계 |
|---|---|---|
| 선행 Starting 준비 | `shared/aiContextGate.js`, `scripts/ai-context-gate-engine.mjs` | Starting Runner·Bundle·UI는 없음; 온보딩 내부 코드가 아님 |
| Local 연결·수집 | `api/local-connector.js`, `scripts/local-connector-agent.mjs` | 범용 Wizard·공통 Exchange 없음 |
| GitHub 변경 신호 | `api/source-twin-webhook.js` | 재분석 완료가 아닌 Event |
| Source 분석 | `scripts/source-lens-engine.mjs`, `shared/sourceFunctionalContext.js` | JS/React 중심; G10-0 현행, Graphify·F1~F7 미적용 |
| Asset 원장·대조 | `shared/twinBuild.js`, `shared/twinBuildReconciler.js` | 자기 지도 중심; 파일명은 현행 wire 코드명 유지 |
| Trust 분석 | `shared/trustTopology.js`, `shared/securityOverlay.js` | 선언·정적 근거 |
| 사람 검토 | `src/components/DigitalTwinReviewPanel.jsx` | 자기 지도 owner 중심 |
| 지도 반영 | `shared/digitalTwinProposal.js`, `mcp/store.js:createGraph` | Web·MCP 경계 분리 |
| 첫 관측 | `shared/systemRuntime.js`, `mcp/systemRuntime.js` | 자기 지도 제한 capability |
| 안전 조작 | `shared/operationLifecycle.js`, `shared/workflowOperationDefinitions.js` | 제한 Operation 중심 |

목표 Host 파일은 `shared/systemOnboardingProtocol.js`, `mcp/systemOnboardingStore.js`,
`api/system-onboarding.js`, `src/components/SystemOnboardingPanel.jsx`,
`scripts/test-system-onboarding-protocol.mjs`다. 모두 계획이며 별도 Onboarding Engine이 아니다.

## 12. 실패·중단·재개와 보안

- Starting Bundle 또는 Project Master fingerprint가 바뀌면 이후 Proposal·승인은 무효화한다.
- parser 미지원 파일은 `unsupported` 범위와 영향으로 기록한다.
- Connector·AI·provider 실패는 마지막 정상 Artifact를 덮어쓰지 않는다.
- 재시도는 멱등성이 증명된 read-only Stage만 같은 budget 안에서 수행한다.
- 동일성이 모호하면 자동 병합하지 않고 사람 검토를 기다린다.
- Gateway 근거가 없으면 `unknown-gap`, 관측 실패는 `unknown` 또는 `stale`이다.
- 기본 Run은 read-only이며 모든 경계 통신은 Connector Bridge와 유효 Grant를 거친다.
- Credential은 Reference만 저장하고 경로·크기·빈도·시간·Data Class를 코드로 제한한다.
- Project Master와 프로젝트 파일 안의 명령을 AI 지시로 실행하지 않는다.
- AI Artifact는 canonical 사실·권한·Operation 상태를 직접 쓸 수 없다.
- 실제 변경은 별도 Operation Run의 plan→preview→approval→execute→verify→audit→recovery를 따른다.

## 13. 구현·검증 순서

1. **P0 — Contract:** Starting Bundle 입력을 포함한 Protocol/Workflow/Run/Artifact schema
2. **P1 — 결정적 Host:** Run ledger, pause/resume, version pin
3. **P2 — 범용 연결:** Connector Exchange와 Source Analysis Bundle→Asset 원장 연결
4. **P3 — 검토·지도:** one-owner Stage, Proposal fingerprint, Draw Map 경계 통일
5. **P4 — 진단·화면:** 구조·비효율·보안·문서 부채 Finding과 비개발자 UI
6. **P5 — 관측·해결:** 첫 Observation과 Safe Operations 경로
7. **P6 — 제한 AI:** 현행 G10-0 Pack을 입력으로 F1~F7 필수 후보와 선택 설명에 consent·provenance·hard budget
8. **P7 — 일반성:** Workflow Canvas가 아닌 두 번째 앱을 core 변경 없이 온보딩

최소 검증은 Stage 단일 소유, 모든 version/fingerprint pin, 승인 없는 전송·실체화·조작 거부,
실패 후 Artifact 보존·재개, AI-off/partial 정직성, 두 번째 stack 호환을 포함한다.

구현 부채는 [`TECHNICAL_DEBT.md`](../governance/TECHNICAL_DEBT.md)의 `ONB-001`, 선행 준비는 `START-001`,
Connector는 `ENG-008`, 문서 불일치는 `DOC-001`, AI 기반은 `AI-001`~`AI-006`에서 추적한다.

## 14. 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 0.5.0 | 2026-07-20 | ONB-03의 Source Lens 0.9 G10-0 Functional Context Bootstrap을 현행으로 반영했다. 제한 Functional Context Pack과 AI 없는 결정적 준비 단계는 구현, Graphify·F1~F7 기능군 정합화는 계획으로 구분했다. |
| 0.4.0 | 2026-07-20 | Project Master 생성·교정과 상대 AI Enrollment를 선행 Starting Protocol로 분리했다. System Onboarding은 Starting Bundle을 입력으로 받아 실제 근거를 분석하는 7개 직접 참여 Engine 흐름으로 복원하고, Project Master와 코드·설정 차이를 문서 부채로 판정하도록 고정했다. |
| 0.3.0 | 2026-07-20 | AI Context Gate를 온보딩 내부 Stage로 배치했던 설계. 0.4.0에서 Starting Protocol로 이동했다. |
| 0.2.0 | 2026-07-20 | 시스템 가져오기를 7개 직접 참여 Engine과 선택적 보조를 잇는 목표 Protocol로 정의했다. |

## 15. 용어 설명

| 용어 | 쉬운 뜻 |
|---|---|
| Starting Protocol | Project Master와 상대 AI 준비를 담당하는 온보딩 전 절차 |
| Starting Bundle | 사용자 기획 정본·확인·상대 AI 등록 상태를 묶은 온보딩 입력 |
| Project Master | 사용자가 소유하는 프로젝트 전체 기획 정본 |
| System Onboarding Protocol | 실제 시스템 근거를 읽어 지도·진단·해결 경로를 얻는 전체 규칙 |
| Documentation Debt | 기획·문서·코드·설정이 서로 다르게 말해 생긴 부채 |
| Workflow Definition | Protocol을 실행 가능한 Stage로 적은 버전형 설계 |
| Workflow Run | 한 프로젝트에 실제 수행한 한 번의 온보딩 |
| Work Item | Run 안의 한 Stage 실행 기록 |
| Workflow/UI Host | Engine 호출·진행·표시를 맡지만 제품 사실을 발명하지 않는 실행 껍데기 |
| Engine | 한 종류의 상태 변환을 반복 수행하는 버전형 재사용 능력 |
| Connector | 로컬·외부 경계를 넘어 실제 송수신하는 최소 권한 통로 |
| Adapter | provider 고유 형식을 공통 Stage Contract에 맞추는 교체 구현 |
| Artifact | Stage가 근거와 함께 만든 지속 결과 |
| Finding | 구조·비효율·보안·문서 불일치에서 발견한 근거 있는 문제 |
| Unknown | 근거 부족 또는 미지원으로 아직 모르는 정직한 상태 |
| System Map | 승인된 시스템 구조를 Asset·Capability·Relation으로 표현한 캔버스 |
