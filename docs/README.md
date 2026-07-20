# Workflow Canvas OS 문서 지도

이 문서는 문서의 위치와 역할을 안내한다. 제품 방향·용어·범위의 사람용 정본은
[`MASTER.md`](./MASTER.md)이며, AI는 [`AI_MASTER.md`](./AI_MASTER.md)의 라우팅을 따른다.

## 정본과 실행 규칙

| 구분 | 위치 | 역할 |
|---|---|---|
| 사람용 제품 정본 | [`MASTER.md`](./MASTER.md) | 제품 방향, 표준 용어, 범위와 불변 원칙 |
| AI 작업 라우터 | [`AI_MASTER.md`](./AI_MASTER.md) | 작업별 최소 읽기 경로. 제품 정본이 아님 |
| 현재 Engine 사실 | [`../shared/engineRegistry.js`](../shared/engineRegistry.js) | Engine·Component·기술 버전·근거의 기계 가독 원본 |
| 실제 동작 | 코드와 통과 테스트 | 문서의 현행/계획 표기 검증 |

## 큰 과정: Protocol

Protocol은 단순한 Engine 참여표가 아니라 시스템이 돌아가는 하나의 큰 과정이다. Protocol은
순서, Stage, 입력·출력, 승인, 실패·재개와 완료 조건을 정한다. 각 Stage는 하나 또는 여러
Engine Capability, Contract, Adapter, Skill, Policy, Guardrail, Connector, Host와 사람 검토를
필요에 따라 조합한다.

- [`protocols/STARTING_PROTOCOL.md`](./protocols/STARTING_PROTOCOL.md): Project Master와 상대 AI 준비 후 Starting Bundle을 만드는 온보딩 전 과정
- [`protocols/SYSTEM_ONBOARDING_PROTOCOL.md`](./protocols/SYSTEM_ONBOARDING_PROTOCOL.md): 실제 시스템 근거를 수집·분석·검토해 System Map과 진단을 만드는 과정
- [`protocols/WORKFLOW_CATALOG.md`](./protocols/WORKFLOW_CATALOG.md): Protocol과 Engine 사이의 교차 Workflow·UI Projection 연결 카탈로그

## Engine 상세

- [`engines/AI_CONTEXT_GATE_MASTER.md`](./engines/AI_CONTEXT_GATE_MASTER.md)
- [`engines/SOURCE_LENS_MASTER.md`](./engines/SOURCE_LENS_MASTER.md)
- [`engines/CONNECTOR_BRIDGE_MASTER.md`](./engines/CONNECTOR_BRIDGE_MASTER.md)

각 문서는 해당 Engine의 고유 책임·물리 경계·현행과 계획을 소유한다. Protocol 전체의 순서나
다른 Engine 간 연결은 이 문서들이 아니라 `protocols/`가 소유한다.

## 계약

- [`twin/README.md`](./twin/README.md) — Asset 원장 관련 Protocol·Engine·규약·이력 안내. `twin/`은 호환을 위해 유지하는 레거시 경로
- [`contracts/OPERATION_LIFECYCLE_CONTRACT.md`](./contracts/OPERATION_LIFECYCLE_CONTRACT.md)
- [`contracts/SOURCE_PROFILE_CONTRACT.md`](./contracts/SOURCE_PROFILE_CONTRACT.md)

계약 문서는 방향이나 구현 이력을 반복하지 않고, 호환성·Schema·불변식만 정의한다.

## 제품 기록, 거버넌스, 결정

- [`product/`](./product/): 사람이 읽는 제품 카탈로그, Registry 해설, Engine 변경 이력
- [`governance/`](./governance/): 기술 부채 장부와 감사 플레이북
- [`architecture/decisions/`](./architecture/decisions/): 의존성·오픈소스 도입 결정
- [`architecture/evaluations/`](./architecture/evaluations/): 특정 시점의 평가 자료. 현재 정본이 아님
- [`architecture/FOUNDRY_MODEL.md`](./architecture/FOUNDRY_MODEL.md): 파운드리 비교 근거와 용어 결정 이력. 현재 방향의 정본은 아님

## 이력 보존

- [`archive/legacy-roadmaps/`](./archive/legacy-roadmaps/): 현재 제품 정본이 아닌 장기/과거 로드맵
- [`archive/handoffs/`](./archive/handoffs/): 완료된 작업의 인수인계 기록

이력 문서는 삭제하지 않고 근거로 보존한다. 현재 방향·용어·Engine 버전이 충돌하면
`MASTER.md`, Registry, 코드와 테스트를 우선한다.
