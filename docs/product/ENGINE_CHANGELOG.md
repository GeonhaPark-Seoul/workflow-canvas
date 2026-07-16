# Engine Changelog

각 실제 Engine의 독립 변경 기록이다. 제품 전체 변경 기록과 Schema/Contract 마이그레이션 기록을 대신하지 않는다.

## Twin Core 0.1.0-alpha.0 - 2026-07-16

- Engine registry v1과 논리 구성요소 메타데이터 계약을 추가했다.
- TwinBuild v3에서 제품·기술 버전, 성숙도, 담당 에이전트, 입출력, 코드·테스트 근거를 보존한다.
- TwinBuild v0→v1→v2→v3 전진 마이그레이션을 추가했다.
- Capability Mapper가 registry를 제품·엔진 구성층의 노드와 포함 관계로 변환한다.

## Twin Core 0.2.0-alpha.0 - 2026-07-16

- 기존 시스템 지도 노드에 위치, 크기, 설명과 메모를 보존하면서 TwinBuild 근거만 연결하는 제한 작업을 추가했다.
- 최대 24개의 누락·오래된 바인딩을 한 검토안으로 묶고, 미리보기 이후 노드 정체성이나 기존 바인딩이 바뀌면 적용을 차단한다.
- 논리 구성 여부, 코드 스냅샷 연결 여부와 서버가 확인한 LIVE 상태를 서로 다른 축으로 표시한다.
- `React Flow 캔버스 엔진`을 포함한 오래된 시스템 지도 노드가 단순 설명 도형에 머물지 않고 코드 기반 트윈으로 승격될 수 있다.

## Twin Core 0.3.0-alpha.0 - 2026-07-16

- Twin Reconciler가 Engine Registry의 제품·기술 버전, 성숙도, 입출력, 호환성과 코드·테스트 근거 드리프트를 자동 발견한다.
- `sync_logical_component` 제한 작업이 기존 엔진 계약과 노드 정체성 지문이 모두 일치할 때만 Registry 관리 계약을 동기화한다.
- 사용자 제목, 설명, 위치, 크기, 메모, 파츠, 연결선, 실행 상태와 코드 트윈 바인딩은 엔진 계약 동기화에서 보존한다.
- Source Lens 0.2와 Twin Core 0.3처럼 코드 registry가 앞서고 기존 캔버스가 뒤처진 경우, 별도 지시 없이 검토 가능한 수정안을 생성한다.

## Create Graph 0.1.0-alpha.0 - 2026-07-16

- 기존 `create_graph` 과정을 상위 제품 엔진으로 등록했다.
- Graph Layout, Graph Materializer, Graph Composition Skill과 Graph Write Guardrails를 내부 책임으로 구별했다.
- 실행 코드 이동이나 레이아웃 알고리즘 교체는 하지 않았다.

## Graph Layout 0.1.0-alpha.0 - 2026-07-16

- 현재 자체 방향형·방사형 배치 동작을 첫 기준 버전으로 기록했다.
- ELK/elkjs 또는 Dagre 채택은 결정되지 않았으며 별도 비교와 사용자 승인이 필요하다.

## Source Lens 0.1.0-alpha.0 - 2026-07-16

- 현재 JavaScript AST·SQL 구조 분석, 제품 영역·하위 시스템 분류와 근거 기반 설명을 기준 기능으로 기록했다.
- Workflow Canvas Source Profile 분리와 두 번째 언어 검증은 다음 호환성 작업으로 남아 있다.

## Source Lens 0.2.0-alpha.0 - 2026-07-16

- Source Profile Contract v1과 결정적 registry를 추가하고 Workflow Canvas 전용 역할·분류를 공통 스캐너 밖으로 분리했다.
- 두 번째 FastAPI 주문 서비스 참조 프로필로 제품 영역·하위 시스템·쉬운 설명을 검증했다.
- Python은 파일 구조만 확인하며 함수·호출을 분석하지 않았음을 manifest와 화면에 명시한다.
- 프로필 버전이나 설명만 바뀐 경우도 별도 설명 fingerprint와 상태 변경으로 감지한다.

## Source Scanner 0.1.0-alpha.0 - 2026-07-16

- Babel AST 기반 JavaScript 분석과 제한된 SQL 선언 분석을 첫 엔진 버전으로 기록했다.
- 새 언어는 검증된 Parser 후보를 먼저 평가한 뒤 추가한다.

## Source Scanner 0.2.0-alpha.0 - 2026-07-16

- 제품별 조건 대신 선택된 Source Profile의 언어 지원·분류·파일 역할 계약을 사용한다.
- JavaScript/JSX·SQL 분석과 `structure-only`·`unsupported` 상태를 구별한다.
- 새 parser 의존성은 추가하지 않았다.

## Trust Map 0.1.0-alpha.0 - 2026-07-16

- Trust Topology v1, Gateway 정규화와 `unknown-gap` 판정을 첫 엔진 버전으로 기록했다.
- 완전한 공격 경로 시각화와 공개 보안 증명은 아직 포함하지 않는다.

## LiveOps 0.1.0-alpha.0 - 2026-07-16

- System Runtime v3와 허용 목록 기반 운영 관측을 첫 엔진 버전으로 기록했다.
- 논리 엔진 자체에는 LIVE를 붙이지 않고 실제 운영 자원만 관측한다.

## Safe Operations 0.1.0-alpha.0 - 2026-07-16

- Operation Contract v1과 공통 계획·승인·실행·검증·감사·복구 상태 전이를 첫 엔진 버전으로 기록했다.
- 현재 실제 조작은 비강제 Git 동기화와 시스템 상태 스냅샷 중심으로 제한한다.

## Operation Lifecycle 0.1.0-alpha.0 - 2026-07-16

- UI, 결정적 자동화와 미래 AI가 같은 상태 전이와 승인 경계를 사용하도록 등록했다.
- 지속 실행 Worker와 독립 검증기는 아직 구현하지 않았다.

## Connector Bridge 0.1.0-alpha.0 - 2026-07-16

- Workflow Twin Adapter와 개발용 Local Connector를 첫 구성으로 등록했다.
- 서명된 데스크톱 Helper와 공개 배포 수준의 기기 격리는 아직 출시 차단 부채다.
