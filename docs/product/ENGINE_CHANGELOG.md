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

## Source Lens 0.3.0-alpha.0 - 2026-07-17

- Source Profile Contract v1에 하위 호환 `Feature Model extension v1`을 추가했다.
- Feature Boundary Resolver가 제품 영역과 하위 시스템을 기능 Asset, Capability와 속성으로 결정적으로 판정한다.
- 실제 파일과 구현 연결 근거가 없는 기능 Asset은 실체화 후보에서 제외하고 이유를 진단한다.
- AST·DB 참조에서 확인한 `read`/`write`만 기능의 데이터 관계 후보로 사용하며 선언만 있는 관계는 제외한다.
- Workflow Canvas와 FastAPI 참조 프로필이 같은 판정 코어로 서로 다른 기능 집합을 만든다.
- Source Lens의 판정 코드와 버전 변경도 다시 Source Twin과 자기 시스템 지도 검토안에 반영된다.

## Source Lens 0.4.0-alpha.0 - 2026-07-17

- 코드 탐색 계층을 제품 영역 → 서브시스템 → Component → 모듈 → 코드 단위로 공식화했다.
- Registry의 `codeEvidence`와 Source Profile의 `implementationRules`만 사용해 Component 소속을 만들며 경로를 추측하지 않는다.
- 파일과 함수는 코드 Asset 후보로 식별하지만 캔버스 노드로 자동 실체화하지 않고 `proposal-required` 경계를 기록한다.
- Source Component Mapper를 Source Lens 내부 Component로 등록해 새 분류 코드도 다음 Source Twin 분석 대상에 포함했다.
- 시스템 노트 상세에서 redaction 경계를 지키며 파츠 종류·이름·참조·근거 상태를 읽기 전용으로 표시한다.

## Source Scanner 0.1.0-alpha.0 - 2026-07-16

- Babel AST 기반 JavaScript 분석과 제한된 SQL 선언 분석을 첫 엔진 버전으로 기록했다.
- 새 언어는 검증된 Parser 후보를 먼저 평가한 뒤 추가한다.

## Source Scanner 0.2.0-alpha.0 - 2026-07-16

- 제품별 조건 대신 선택된 Source Profile의 언어 지원·분류·파일 역할 계약을 사용한다.
- JavaScript/JSX·SQL 분석과 `structure-only`·`unsupported` 상태를 구별한다.
- 새 parser 의존성은 추가하지 않았다.

## Workflow Canvas Source Profile 0.2.0 - 2026-07-16

- Work Core와 Intent Engine 코드를 `Work·Intent 엔진` 하위 시스템으로 묶었다.
- Work 계약, Intent 원문·조문 작업공간과 관련 회귀 테스트에 비개발자용 역할 설명을 추가했다.
- 공통 Source Lens 스캐너나 다른 소프트웨어의 Source Profile은 변경하지 않았다.

## Workflow Canvas Source Profile 0.3.0 - 2026-07-17

- 14개 제품 영역과 38개 하위 시스템에 3등급 기능 판정 경계를 선언했다.
- 8개 제품 영역과 사용자가 별도 흐름으로 인식하는 9개 하위 시스템을 기능 Asset으로 판정했다.
- 13개 세부 능력은 소유 기능 Asset의 Capability 파츠로 판정하고 내부 구현 사실은 속성으로 남겼다.
- 구현 모듈과 기존 시스템 지도 DB 엔티티의 제품별 매핑을 프로필에 두어 공통 판정 코어의 재사용성을 유지했다.

## Workflow Canvas Source Profile 0.4.0 - 2026-07-17

- Engine Registry Component와 코드 근거를 제품별 Source Profile 선언으로 연결했다.
- 화면 용어를 `서브시스템`으로 정리하되 기존 wire 필드 `subsystem`은 유지했다.

## FastAPI Reference Source Profile 0.2.0 - 2026-07-17

- 구조 전용 Python 근거에 같은 기능 3등급 판정을 적용해 Workflow Canvas와 다른 기능 Asset·Capability 집합을 생성한다.
- Python 함수·호출 분석이나 실제 Twin Adapter 연결을 완료한 것으로 표시하지 않는다.

## Trust Map 0.2.0-alpha.0 - 2026-07-17

- Workflow Canvas 자기 지도에 근거 기반 신뢰영역 6개와 게이트웨이 11개를 선언했다.
- 기존 Reconciliation 승인 경로로 노드 영역과 연결선 게이트웨이만 동기화하며 사용자 배치·메모·관계 양 끝을 보존한다.
- redaction 이후 그래프만 입력으로 사용하는 보안 오버레이에 신뢰영역 색, 게이트웨이 상세와 unknown-gap 경고를 추가했다.
- 오버레이는 declared 구조만 보여주며 실제 트래픽 관측이나 침투 테스트, 전체 공격 경로 분석을 의미하지 않는다.

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

## Work Core 0.1.0-alpha.0 - 2026-07-16

- 시스템 파츠와 별도로 `Work` 파츠를 추가하고 투입, 처리와 결과를 필수 계약으로 만들었다.
- 하나의 Work에 기록된 Intent를 여러 개 장착하며 선택한 버전을 고정한다.
- 기존 Intent 선택, Work 안에서 새 Intent 작성·v1 기록·즉시 장착, 누락·새 버전 표시와 분리를 추가했다.
- 일반 파츠에 주입된 Work·Intent 데이터는 정규화 과정에서 제거하며, Work 설명의 비밀값 형태는 거부한다.
- 현재 버전은 Work를 실제 실행하거나 효율을 측정하지 않는다.

## Intent Engine 0.2.0-alpha.0 - 2026-07-16

- 회의, AI 대화, 문서와 요약본을 Intent 원문 자료로 보존하고 조문과 나란히 편집하는 작업공간을 추가했다.
- 결정적 문장 분류로 목적, 준수, 금지, 성공 기준 등의 조문 후보와 원문 근거를 만든다.
- 후보는 자동 확정하지 않으며 사용자가 확정한 조문만 명시적 Intent 버전에 포함한다.
- MCP에는 원문 본문을 보내지 않고 원문·조문 개수와 기록된 확정 조문만 제공한다.
- AI 의미 추출, 조문 충돌 해결과 AI 하네스 집행은 아직 구현하지 않았다.

## Connector Bridge 0.1.0-alpha.0 - 2026-07-16

- Workflow Twin Adapter와 개발용 Local Connector를 첫 구성으로 등록했다.
- 서명된 데스크톱 Helper와 공개 배포 수준의 기기 격리는 아직 출시 차단 부채다.
