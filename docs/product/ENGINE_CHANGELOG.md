# Engine Changelog

각 실제 Engine의 독립 변경 기록이다. 제품 전체 변경 기록과 Schema/Contract 마이그레이션 기록을 대신하지 않는다.

## Twin Core 0.1.0-alpha.0 - 2026-07-16

- Engine registry v1과 논리 구성요소 메타데이터 계약을 추가했다.
- TwinBuild v3에서 제품·기술 버전, 성숙도, 담당 에이전트, 입출력, 코드·테스트 근거를 보존한다.
- TwinBuild v0→v1→v2→v3 전진 마이그레이션을 추가했다.
- Capability Mapper가 registry를 제품·엔진 구성층의 노드와 포함 관계로 변환한다.

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

## Source Scanner 0.1.0-alpha.0 - 2026-07-16

- Babel AST 기반 JavaScript 분석과 제한된 SQL 선언 분석을 첫 엔진 버전으로 기록했다.
- 새 언어는 검증된 Parser 후보를 먼저 평가한 뒤 추가한다.

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
