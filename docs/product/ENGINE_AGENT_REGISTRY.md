# 엔진·내부 구성요소·Maintainer Agent 레지스트리

사람이 읽는 이 문서와 캔버스의 제품·엔진 구성층은 [`../../shared/engineRegistry.js`](../../shared/engineRegistry.js)를 공통 원본으로 사용한다.

## 표시 규칙

- 캔버스의 상위 노드 이름은 `Asset Core`, `Draw Map`처럼 짧게 표시한다.
- Engine은 최상위 버전형 책임 경계에만 사용한다. 하위 알고리즘을 Engine이라고 부르지 않는다.
- 상세 화면과 코드 탐색의 `종류` 배지에서 Engine, Contract, Resolver, Builder, Pipeline, Agent Skill, Agent Policy, Hard Guardrail, Connector와 Manifest를 구별한다.
- 논리 구성요소 노드는 독립 서버나 실행 프로세스를 뜻하지 않는다.
- 논리 구성요소에는 `LIVE`를 표시하지 않고 `논리 구성`으로 표시한다.
- 코드와 테스트 근거는 실제 상대 경로로 기록하며 소스 본문과 비밀값은 넣지 않는다.

## 상위 엔진 버전

| Registry ID | 표시 이름 | 기술 버전 | 주요 호환성 |
|---|---|---:|---|
| `engine-twin-core` | Asset Core | 0.3.0-alpha.0 | Engine Schema v2, TwinBuild v3, Adapter Contract v1 |
| `engine-create-graph` | Draw Map | 0.1.0-alpha.0 | MCP `create_graph` v1 |
| `engine-source-lens` | Source Lens | 0.9.0-alpha.0 | Source Analysis Workflow v1.1, Source Analysis Contract v2, Functional Context Pack v1, Source Twin Schema v1, Source Profile Contract v1, Source Asset Hierarchy v1, Code Part Schema v1, Source Flow Schema v1 |
| `engine-trust-map` | Trust Map | 0.2.0-alpha.0 | Trust Topology Schema v1, Security Overlay Schema v1 |
| `engine-liveops` | LiveOps | 0.1.0-alpha.0 | System Runtime Schema v3 |
| `engine-safe-operations` | Safe Operations | 0.2.0-alpha.0 | Operation Contract v1, Editable Property Schema v1 |
| `engine-work-core` | Work Core | 0.1.0-alpha.0 | Work Schema v1, Intent Schema v1 |
| `engine-intent-core` | Intent Engine | 0.2.0-alpha.0 | Intent Schema v1, Work Schema v1 |
| `engine-connector-bridge` | Connector Bridge | 0.2.0-alpha.0 | Adapter Contract v1, Local Connector Schema v1, Provider-neutral AI adapter |
| `engine-ai-context-gate` | AI Context Gate | 0.1.0-alpha.0 | Project Master Enrollment Workflow v1, AI Context Gate Contract v1 |

현재 Registry에는 상위 Engine 10개와 내부 Component 44개가 있다. 각 엔진의 입력, 출력,
코드와 테스트 근거는 manifest와 캔버스 노드에 함께 기록한다. 같은 정보를 문서와 코드에
따로 복사해 서로 어긋나게 만들지 않는다.

표시명과 배포된 wire·코드명은 분리한다. 위 표의 `TwinBuild v3`, `Source Twin Schema v1`,
`create_graph`는 현행 wire·스키마 이름이고, Registry ID도 호환성을 위해 그대로 둔다.

## Draw Map 내부 예시

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| 지도 배치 | Builder | 방향형·방사형 위치와 연결점 계산 |
| 지도 Materializer | Builder | 임시 ID를 실제 노드·연결선 레코드로 변환 |
| 지도 구성 Skill | Agent Skill | AI에게 자료 구조화와 도구 사용 순서 안내 |
| 지도 쓰기 Guardrails | Hard Guardrail | 입력 한도, 권한, 정제, 중복과 저장 충돌 강제 |

이 네 요소를 사용자에게 별도 제품 네 개처럼 판매하지 않는다. 사용자 경험은 `Draw Map`
Engine 하나이며 내부 책임만 분리한다. Draw Map은 **배치·연결선·그룹만 담당하며
온톨로지·사실 판정과 무관한 순수 가시화 엔진**이다.

## Source Lens 내부 예시

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| Source Analysis Contract | Contract | 단일 Workflow의 입력·선택 출력·소유 경계 고정 |
| Source Analysis Pipeline | Pipeline | 지원되는 parser와 파일 구조에서 코드 근거 추출·병합 |
| Source Corpus Guardrail | Hard Guardrail | 경로·symlink·일반 파일·크기 한도 강제 |
| Source Profile Registry | Manifest | 저장소와 일치하는 버전형 제품 의미 사전 선택 |
| Feature Boundary Resolver | Resolver | 프로필 3등급 규칙과 실제 근거를 대조해 기능 Asset·Capability·속성 판정 |
| Source Component Mapper | Builder | Registry 코드 근거와 프로필 규칙으로 Component와 모듈 소속 생성 |
| Code Part Translator | Builder | AST 근거를 코드 파츠로 분류하고 결정적 설명·안정 anchor 생성 |
| Static Flow Builder | Builder | UI/API/MCP 진입점과 import/call/render/props의 정적 CODE 흐름 추적 |
| Functional Context Contract | Contract | G10-0 제한 Pack의 schema·근거·fingerprint·한도 계약 검사 |
| Functional Context Resolver | Resolver | 문서 최신성을 소스 변경과 대조하고 소스 근거 fallback 판정 |
| Functional Context Pack Builder | Builder | 문서·UI·경로·API·DB·테스트·Flow에서 안정 기능 어휘 Pack 생성 |
| Functional Context Guardrail | Hard Guardrail | 문서·문자·어휘·근거 한도와 오래된 문서·민감 문구 사용 차단 |

Source Lens는 `source-lens.source-analysis@1.1.0` 하나만 소유한다. Workflow Canvas 프로필과
FastAPI 참조 프로필은 같은 Workflow에 연결되는 제품별 Manifest다. 편집, Snapshot, 외부 AI,
UI와 지도 Proposal은 [`../WORKFLOW_CATALOG.md`](../protocols/WORKFLOW_CATALOG.md)의 별도 소유 경계를 따른다.
G10-0은 결정적 코드만 사용하며 Agent Skill·Agent Policy·Connector를 사용하지 않는다.
Graphify와 F1~F7 Functional Community Resolution은 아직 Registry에 구현된 것으로 등록하지
않는다.

## AI Context Gate 내부

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| AI Context Contract | Contract | 프로젝트 상태·Project Master 기준점·상대 AI·전달·Receipt 계약 |
| AI Delivery Resolver | Resolver | 수동·연결·관리형 전달과 신뢰된 Host 근거에 따른 정직한 강제 수준 판정 |
| Project Master Builder | Builder | 제한 Planning Context Pack, 상대 AI 프롬프트와 단일 기획 정본 틀 생성 |
| Project Master Handoff Pipeline | Pipeline | Enrollment와 planning/none 개발 완료 Handoff 검증 순서 |
| Project Master Recording Skill | Agent Skill | 프로젝트 목적·범위·기능·흐름·결정을 하나의 기획 정본에 유지하는 절차 |
| Project Master Evidence Policy | Agent Policy | 사용자 확정 보존, AI 제안 분리, 미확인·근거 기록 |
| Project Master Guardrail | Hard Guardrail | 상대 경로·입력·토큰·fingerprint·planning/none 완료 조건 강제 |
| AI Context Enrollment Manifest | Manifest | 지시·기준점·전달 방식·강제 수준의 결정적 기록 |

AI Context Gate는 `ai-context-gate.project-master@1.0.0` 하나만 소유한다. Starting
Protocol이 직접 호출하며 System Onboarding 내부 Component가 아니다. 외부 AI
provider로 실제 송신하는 Connector는 Connector Bridge, 파일 생성·수정은 Safe Operations
또는 승인된 개발 변경이 소유한다. 따라서 이 Engine 아래에 Connector Component를 등록하지
않는다. 상세 현행·계획 경계는
[`../AI_CONTEXT_GATE_MASTER.md`](../engines/AI_CONTEXT_GATE_MASTER.md)를 따른다.

## Safe Operations와 Connector Bridge 내부 예시 — 현행 Registry

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| Operation Lifecycle | Pipeline | 계획·승인·실행·검증·감사·복구 상태 전이 |
| Operation Definitions | Manifest | Git·Snapshot·소스 편집 조작 계약 선언 |
| Source Edit Pipeline | Pipeline | 등록 literal 편집·검증·복구 제한 |
| Workflow Twin Adapter | Connector | 제품별 발견 결과를 Asset 원장으로 변환 |
| Local Connector | Connector | 허용 로컬 repo·Git 실행 경계 |
| External AI Explanation Connector | Connector | 기본 비활성 외부 AI 보강 설명 전송·출처 표시 |

이 표는 현재 Registry를 그대로 반영하며 목표 소유 분류를 뜻하지 않는다. 외부 통신이 없는
`Workflow Twin Adapter`의 Connector 분류, 구현된 GitHub webhook Connector 누락과 Local
Connector 안의 Safe Operations 책임 혼재는 [`../TECHNICAL_DEBT.md`](../governance/TECHNICAL_DEBT.md)의
`ENG-008`에서 추적한다. 목표 단일 Exchange Workflow와 구성 분류는
[`../CONNECTOR_BRIDGE_MASTER.md`](../engines/CONNECTOR_BRIDGE_MASTER.md)에 계획 상태로 기록하며,
Contract·코드·테스트·Engine changelog 없이 이 표나 Registry만 먼저 재분류하지 않는다.
`Workflow Twin Adapter`는 분해 전까지 새 이름을 만들지 않고 유지하는 레거시 코드명이다.

## Trust Map 내부 예시

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| Trust Topology Contract | Contract | 신뢰영역·게이트웨이 필드와 비밀값 금지 경계 정규화 |
| Trust Boundary Resolver | Resolver | 같은 영역, 모델링된 경계, gateway mismatch와 unknown-gap 판정 |
| Security Overlay Projector | Builder | redaction 이후 지도만 사용해 영역색·게이트웨이 상세·경고 생성 |

보안 오버레이는 declared 구조의 시각화다. 실제 트래픽 관측, 침투 테스트나 전체 공격 경로 분석을 완료한 것으로 표시하지 않는다.

## Work Core와 Intent Engine

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| Work Part Contract | Contract | Work의 투입·처리·결과 필수 계약과 일반 파츠 경계 강제 |
| Work Intent Assembly | Resolver | 기록된 Intent 버전의 다중 장착, 고정, 누락·업데이트 판정 |
| Intent Asset Contract | Contract | 원문, 조문, 상태와 명시적 버전 스냅샷 정규화 |
| Intent Clause Extractor | Resolver | 원문 근거를 보존한 조문 후보 생성, 자동 확정 금지 |
| Intent Work Resolver | Resolver | Work에 노출할 최소 Intent 선택 정보와 버전 참조 계산 |

Work Core는 현재 실행기가 아니다. Intent Engine 역시 외부 AI가 전략을 이해하거나 Work 수행을 강제하는 하네스가 아니다. 지도에는 이 범위를 입력·출력과 설명에 명시해 논리 구조를 실제 실행 자원으로 오인하지 않게 한다.

## 코드 경계 원칙

엔진을 제품으로 인정하기 위해 관련 코드를 한 번에 한 폴더로 옮기지 않는다. 우선 manifest, 명시적 진입점, 계약 테스트와 호환성 경계를 만든다. 이후 엔진이 독점적으로 소유하는 순수 로직만 점진적으로 모은다.

MCP·로컬 helper·provider transport처럼 실제 경계를 넘는 코드는 Connector, 같은 프로세스의
provider 형식 변환과 UI read model은 Adapter, DB/RLS·권한 강제는 Hard Guardrail 또는 명시된
저장 Connector로 남을 수 있다. 여러 폴더에 존재한다는 사실은 엔진의 제품 정체성을
훼손하지 않는다.

## Maintainer Agent 계약

현재 모든 엔진의 담당 에이전트는 `미배정`이다. 작은 구성요소마다 에이전트를 만들지 않고, 실제 AI 유지보수 단계가 열리면 관련 엔진 묶음 단위 Maintainer Agent부터 검증한다.

계획된 `Core Engine Maintainer` manifest에는 다음이 필수다.

- scope: 담당 엔진과 제외 영역
- allowed tools: 읽기, 테스트, 빌드, patch 제안 등 허용 도구
- required tests: 변경 전후 반드시 통과할 검사
- escalation: 호환성, DB, 권한, 암호화, 새 의존성, 배포 등 사람에게 올릴 조건
- human approval: 코드 적용, 스키마, 의존성, 보안 정책, 커밋·푸시·배포 승인

에이전트 이름만 노드에 쓰는 것은 담당 배정이 아니다. manifest가 검증되고 Engine registry가 해당 ID를 명시해야 배정된 것으로 표시한다.
