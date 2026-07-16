# 엔진·내부 구성요소·Maintainer Agent 레지스트리

사람이 읽는 이 문서와 캔버스의 제품·엔진 구성층은 [`../../shared/engineRegistry.js`](../../shared/engineRegistry.js)를 공통 원본으로 사용한다.

## 표시 규칙

- 캔버스의 상위 노드 이름은 `Twin Core`, `Create Graph`처럼 짧게 표시한다.
- 상위 자동화 가치와 실제 하위 알고리즘은 모두 제품 문맥에서 엔진이라고 부를 수 있다.
- 내부 `종류` 필드에서만 Engine, Contract, Resolver, Builder, Pipeline, Agent Skill, Guardrail, Connector와 Manifest를 구별한다.
- 논리 구성요소 노드는 독립 서버나 실행 프로세스를 뜻하지 않는다.
- 논리 구성요소에는 `LIVE`를 표시하지 않고 `논리 구성`으로 표시한다.
- 코드와 테스트 근거는 실제 상대 경로로 기록하며 소스 본문과 비밀값은 넣지 않는다.

## 상위 엔진 버전

| Registry ID | 표시 이름 | 기술 버전 | 주요 호환성 |
|---|---|---:|---|
| `engine-twin-core` | Twin Core | 0.3.0-alpha.0 | Engine Schema v2, TwinBuild v3, Adapter Contract v1 |
| `engine-create-graph` | Create Graph | 0.1.0-alpha.0 | MCP `create_graph` v1 |
| `engine-source-lens` | Source Lens | 0.2.0-alpha.0 | Source Twin Schema v1, Source Profile Contract v1 |
| `engine-trust-map` | Trust Map | 0.1.0-alpha.0 | Trust Topology Schema v1 |
| `engine-liveops` | LiveOps | 0.1.0-alpha.0 | System Runtime Schema v3 |
| `engine-safe-operations` | Safe Operations | 0.1.0-alpha.0 | Operation Contract v1 |
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

Workflow Canvas 프로필과 FastAPI 참조 프로필은 Source Lens를 별도 제품으로 복제하지 않는다. 같은 스캐너 계약에 연결되는 제품별 manifest이며, 실제 DB·배포·운영 조작 연결은 별도 Twin Adapter의 책임이다.

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
