# 엔진·내부 구성요소·Maintainer Agent 레지스트리

사람이 읽는 이 문서와 캔버스의 제품·엔진 구성층은 [`../../shared/engineRegistry.js`](../../shared/engineRegistry.js)를 공통 원본으로 사용한다.

## 표시 규칙

- 캔버스의 상위 노드 이름은 `Twin Core`, `Create Graph`처럼 짧게 표시한다.
- 상위 자동화 가치와 실제 하위 알고리즘은 모두 제품 문맥에서 엔진이라고 부를 수 있다.
- 상세 화면과 코드 탐색의 `종류` 배지에서 Engine, Contract, Resolver, Builder, Pipeline, Agent Skill, Agent Policy, Hard Guardrail, Connector와 Manifest를 구별한다.
- 논리 구성요소 노드는 독립 서버나 실행 프로세스를 뜻하지 않는다.
- 논리 구성요소에는 `LIVE`를 표시하지 않고 `논리 구성`으로 표시한다.
- 코드와 테스트 근거는 실제 상대 경로로 기록하며 소스 본문과 비밀값은 넣지 않는다.

## 상위 엔진 버전

| Registry ID | 표시 이름 | 기술 버전 | 주요 호환성 |
|---|---|---:|---|
| `engine-twin-core` | Twin Core | 0.3.0-alpha.0 | Engine Schema v2, TwinBuild v3, Adapter Contract v1 |
| `engine-create-graph` | Create Graph | 0.1.0-alpha.0 | MCP `create_graph` v1 |
| `engine-source-lens` | Source Lens | 0.4.0-alpha.0 | Source Twin Schema v1, Source Profile Contract v1, Source Asset Hierarchy v1 |
| `engine-trust-map` | Trust Map | 0.2.0-alpha.0 | Trust Topology Schema v1, Security Overlay Schema v1 |
| `engine-liveops` | LiveOps | 0.1.0-alpha.0 | System Runtime Schema v3 |
| `engine-safe-operations` | Safe Operations | 0.1.0-alpha.0 | Operation Contract v1 |
| `engine-work-core` | Work Core | 0.1.0-alpha.0 | Work Schema v1, Intent Schema v1 |
| `engine-intent-core` | Intent Engine | 0.2.0-alpha.0 | Intent Schema v1, Work Schema v1 |
| `engine-connector-bridge` | Connector Bridge | 0.1.0-alpha.0 | Adapter Contract v1, Local Connector Schema v1 |

각 엔진의 입력, 출력, 코드와 테스트 근거는 manifest와 캔버스 노드에 함께 기록한다. 같은 정보를 문서와 코드에 따로 복사해 서로 어긋나게 만들지 않는다.

## Create Graph 내부 예시

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| Graph Layout | Engine | 방향형·방사형 위치와 연결점 계산 |
| Graph Materializer | Builder | 임시 ID를 실제 노드·연결선 레코드로 변환 |
| Graph Composition Skill | Agent Skill | AI에게 자료 구조화와 도구 사용 순서 안내 |
| Graph Write Guardrails | Hard Guardrail | 입력 한도, 권한, 정제, 중복과 저장 충돌 강제 |

이 네 요소를 사용자에게 별도 제품 네 개처럼 판매하지 않는다. 사용자 경험은 `Create Graph` 엔진 하나이며 내부 책임만 분리한다.

## Source Lens 내부 예시

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| Source Scanner | Engine | 지원되는 parser와 파일 구조에서 코드 근거 추출 |
| Source Profile Registry | Manifest | 저장소와 일치하는 버전형 제품 의미 사전 선택 |
| Feature Boundary Resolver | Resolver | 프로필 3등급 규칙과 실제 근거를 대조해 기능 Asset·Capability·속성 판정 |
| Source Component Mapper | Builder | Registry 코드 근거와 프로필 규칙으로 Component와 모듈 소속 생성 |

Workflow Canvas 프로필과 FastAPI 참조 프로필은 Source Lens를 별도 제품으로 복제하지 않는다. 같은 스캐너와 기능 경계 판정 계약에 연결되는 제품별 manifest이며, 실제 DB·배포·운영 조작 연결은 별도 Twin Adapter의 책임이다. Source Lens 자체의 판정 규칙과 구현도 다시 분석 대상에 포함해 자기 시스템 지도에 변경 검토안으로 돌아온다.

## Trust Map 내부 예시

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| Trust Topology Contract | Contract | 신뢰영역·게이트웨이 필드와 비밀값 금지 경계 정규화 |
| Trust Boundary Resolver | Resolver | 같은 영역, 모델링된 경계, gateway mismatch와 unknown-gap 판정 |
| Security Overlay Projector | Builder | redaction 이후 그래프만 사용해 영역색·게이트웨이 상세·경고 생성 |

보안 오버레이는 declared 구조의 시각화다. 실제 트래픽 관측, 침투 테스트나 전체 공격 경로 분석을 완료한 것으로 표시하지 않는다.

## Work Core와 Intent Engine

| 표시 이름 | 내부 종류 | 책임 |
|---|---|---|
| Work Part Contract | Contract | Work의 투입·처리·결과 필수 계약과 일반 파츠 경계 강제 |
| Work Intent Assembly | Resolver | 기록된 Intent 버전의 다중 장착, 고정, 누락·업데이트 판정 |
| Intent Asset Contract | Contract | 원문, 조문, 상태와 명시적 버전 스냅샷 정규화 |
| Intent Clause Extractor | Engine | 원문 근거를 보존한 조문 후보 생성, 자동 확정 금지 |
| Intent Work Resolver | Resolver | Work에 노출할 최소 Intent 선택 정보와 버전 참조 계산 |

Work Core는 현재 실행기가 아니다. Intent Engine 역시 외부 AI가 전략을 이해하거나 Work 수행을 강제하는 하네스가 아니다. 지도에는 이 범위를 입력·출력과 설명에 명시해 논리 구조를 실제 실행 자원으로 오인하지 않게 한다.

## 코드 경계 원칙

엔진을 제품으로 인정하기 위해 관련 코드를 한 번에 한 폴더로 옮기지 않는다. 우선 manifest, 명시적 진입점, 계약 테스트와 호환성 경계를 만든다. 이후 엔진이 독점적으로 소유하는 순수 로직만 점진적으로 모은다.

MCP transport, UI, DB/RLS와 공유 권한처럼 실행 경계에 있어야 하는 코드는 Adapter 또는 Guardrail로 남을 수 있다. 여러 폴더에 존재한다는 사실은 엔진의 제품 정체성을 훼손하지 않는다.

## Maintainer Agent 계약

현재 모든 엔진의 담당 에이전트는 `미배정`이다. 작은 구성요소마다 에이전트를 만들지 않고, 실제 AI 유지보수 단계가 열리면 관련 엔진 묶음 단위 Maintainer Agent부터 검증한다.

계획된 `Core Engine Maintainer` manifest에는 다음이 필수다.

- scope: 담당 엔진과 제외 영역
- allowed tools: 읽기, 테스트, 빌드, patch 제안 등 허용 도구
- required tests: 변경 전후 반드시 통과할 검사
- escalation: 호환성, DB, 권한, 암호화, 새 의존성, 배포 등 사람에게 올릴 조건
- human approval: 코드 적용, 스키마, 의존성, 보안 정책, 커밋·푸시·배포 승인

에이전트 이름만 노드에 쓰는 것은 담당 배정이 아니다. manifest가 검증되고 Engine registry가 해당 ID를 명시해야 배정된 것으로 표시한다.
