# Workflow Canvas OS 제품 카탈로그

- 기준 제품 버전: `0.1.0-alpha.0`
- 출시 단계: 내부 알파
- 기계 가독 원본: [`../../shared/engineRegistry.js`](../../shared/engineRegistry.js)
- 마지막 검토일: 2026-07-20

## 현재 제품 약속

Workflow Canvas OS는 AI로 만든 소형 웹 앱을 운영하는 비개발자 창업자와 바이브 코더를 위한 관제실이다. 지원 범위 안의 앱을 연결하면 코드, 데이터, 인증, 배포와 현재 상태를 근거와 함께 쉬운 말로 설명하고, 사용자가 승인한 제한된 운영 작업을 캔버스와 AI에서 같은 안전 계약으로 수행하게 한다.

초기 지원 기준은 GitHub, Vercel, Supabase와 JavaScript/React 중심의 소형 웹 앱이다. 민감한 고객정보를 다루지 않는 개인 프로젝트, 프로토타입과 초기 서비스가 첫 시장이다.

## 장기 비전과 현재 범위

장기적으로는 소프트웨어, 사업과 생활의 데이터, 관계, 논리, 행동과 권한을 같은 온톨로지 위에서 이해하고 조작하는 시각적 운영체제로 확장한다. 현재 버전은 다음을 약속하지 않는다.

- 모든 언어, 저장소와 클라우드 자동 지원
- 의료, 금융, 공공기관 또는 대기업 수준의 보안 보증
- 운영자도 사용자 본문을 볼 수 없다는 종단간 암호화 보증
- AI의 완전 자율 운영과 24시간 에이전트
- 사업과 생활 전체의 즉시 자동화
- 3D 화면이 2D보다 의사결정을 개선한다는 보장

## 제품 엔진

사용자 화면에서는 독립된 재사용 가치와 버전을 가진 최상위 능력만 `엔진`이라고 부른다.
엔진이 여러 폴더와 실행 경계에 걸쳐 있어도 입력, 출력, 버전, 호환성, 테스트와 책임 범위가
명확하면 하나의 제품 엔진이다. 하위 알고리즘은 Engine이 아니라 Component로 분류한다.

| 표시 이름 | 사용자 가치 | 현재 상태 |
|---|---|---|
| Asset Core | 여러 시스템의 근거를 공통 Asset 원장(Asset Base)으로 정규화하고 현재 지도와 대조 | 알파 0.3 |
| Draw Map | 배치·연결선·그룹만 담당하며 온톨로지·사실 판정과 무관하게 지도를 가시화 | 알파 |
| Source Lens | bounded source corpus를 단 하나의 분석 Workflow로 해석해 영역·서브시스템·Component·모듈·코드 파츠·정적 관계·제한 기능 맥락·기능 경계를 생성 | 알파 0.9 |
| Trust Map | 로컬·클라우드·외부 SaaS의 경계와 확인되지 않은 통로를 구별 | 알파 |
| LiveOps | 확인 가능한 운영 상태, 관측 시각과 stale 상태 표시 | 알파 |
| Safe Operations | 계획·승인·실행·검증·감사·복구를 거치는 제한 조작과 등록 소스 편집 | 알파 0.2 |
| Work Core | 투입·처리·결과 계약과 여러 Intent 버전의 Work 전용 조립 | 알파 0.1 |
| Intent Engine | 원문 근거에서 조문 후보를 만들고 승인된 조문을 버전 자산으로 기록 | 알파 0.2 |
| Connector Bridge | 허용된 로컬·외부 경계의 권한과 데이터 교환을 통제하고 연결 근거를 남김 | 개발용 알파 0.2 |
| AI Context Gate | 상대 개발 AI에게 사용자 소유 단일 Project Master 유지 규칙을 전달하고 정직한 강제 수준·완료 Receipt를 만듦 | 알파 0.1 |

`Draw Map`은 배치·연결선·그룹만 담당하며 온톨로지·사실 판정과 무관한 순수 가시화
Engine이다. Asset 동일성·관계 의미·사실 여부는 다른 책임 경계에서 확정한다.

MCP는 AI 클라이언트와 엔진을 연결하는 Gateway다. 현재 MCP 연결은 존재하지만 자율 AI 운영 엔진은 구현되지 않았다.

Connector Bridge 0.2의 Local·GitHub webhook·외부 AI·Operation 전달은 아직 하나의 공통
Exchange Workflow로 통합되지 않았다. 비개발자용 연결 구조·비효율·보안 진단과 목표 계약은
[`../CONNECTOR_BRIDGE_MASTER.md`](../engines/CONNECTOR_BRIDGE_MASTER.md)에 계획 상태로 구분한다.

시스템 가져오기 전에는 [`Starting Protocol`](../protocols/STARTING_PROTOCOL.md)이 사용자가 소유하는
단일 Project Master와 상대 AI 등록 상태를 준비한다. 최초 가동 시작점과 웹·로컬·IDE 등
최종 앱 형태는 아직 미정이며 AI Context Gate가 이 Protocol의 직접 참여 Engine이다.

그다음 [`System Onboarding Protocol`](../protocols/SYSTEM_ONBOARDING_PROTOCOL.md)이 Starting Bundle을
받아 7개 직접 참여 Engine으로 실제 시스템 근거를 분석한다. 현재는 각 기능이 부분적으로
존재하지만 두 Protocol을 각각 하나의 Run·진행 화면·완료 Bundle로 묶는 실행기는 없다.

## 엔진과 내부 구성요소

제품 화면의 `Asset Core` 같은 이름은 짧게 유지한다. 내부 문서와 manifest에서는 실제 책임을 다음처럼 구별한다.

- Engine: 독립 버전·입출력·호환성·사용자 가치를 가진 **최상위** 재사용 능력
- Contract: 입력·출력·호환성 경계
- Resolver: 동일성, 경계 또는 대상 판정
- Builder: 정규형이나 실제 결과물을 생성
- Pipeline: 여러 검증 단계를 순서대로 실행
- Agent Skill: AI에게 목표와 도구 사용 순서를 제공
- Agent Policy: AI 행동 규칙이며 서버 강제 규칙은 아님
- Hard Guardrail: 서버·DB·스키마로 우회할 수 없게 강제
- Connector: 외부·로컬 경계를 넘어 실제로 통신하는 최소 권한 통로
- Manifest: 제품별 의미, 버전과 매핑 선언

Adapter는 Registry의 독립 종류가 아니라 특정 Stage에서 provider 형식을 공통 Contract로
바꾸는 교체 가능한 구현이다. Connector와 Adapter의 현행 문서 불일치는
[`../TECHNICAL_DEBT.md`](../governance/TECHNICAL_DEBT.md)의 `DOC-001`에서 추적한다.

내부 구성요소를 분류한다고 고객 화면에서 긴 기술명을 강요하지 않는다. 자세한 색인은 [`ENGINE_AGENT_REGISTRY.md`](./ENGINE_AGENT_REGISTRY.md)를 따른다.
여러 Engine을 잇는 Stage와 UI projection은 [`../WORKFLOW_CATALOG.md`](../protocols/WORKFLOW_CATALOG.md)를 따른다.

## 버전 규칙

- 제품과 각 실제 Engine은 독립 Semantic Versioning을 가진다.
- `0.x`는 호환성과 제품 약속이 아직 고정되지 않은 알파·베타 단계다.
- 제품 버전, Engine 버전, Schema/Contract 버전은 서로 다른 의미다.
- Engine 버전 변경은 [`ENGINE_CHANGELOG.md`](./ENGINE_CHANGELOG.md)에 기록한다.
- 호환되지 않는 Contract 또는 Schema 변경에는 전진 마이그레이션과 기존 fixture 테스트가 필요하다.
- `1.0.0`은 공개 약속, 지원 범위, 마이그레이션과 출시 차단 부채가 검증된 뒤에만 부여한다.

## 다음 제품 순서

1. 실제 FastAPI 저장소에서 Python parser 후보와 Source Profile 정확도 검증
2. DB·배포·운영 근거까지 포함하는 두 번째 실제 `Twin Adapter` 구현 — 분해 전까지 유지하는 레거시 코드명
3. 비개발자가 연결 범위와 권한을 이해하는 시스템 가져오기 흐름
4. 테스트, 상태 확인, 비강제 Git 동기화 중심의 제한 조작 확대

새 기반 기능을 만들기 전에는 검증된 오픈소스와 표준을 먼저 비교하되, 대형 라이브러리나 외부 권한 서비스는 효과와 비용을 설명하고 사용자 승인을 받은 뒤 도입한다.
