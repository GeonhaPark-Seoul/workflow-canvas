# Asset 원장 관련 문서 안내서

## 문서 범위

이 폴더는 외부 또는 코드 기반 근거를 **Asset 원장(Asset Base)** 으로 정규화하고,
현재 시스템 지도와 안전하게 대조·검토·관측하는 데 관련된 문서를 모은다.
`docs/twin/`은 기존 링크와 도구 호환성을 위해 유지하는 레거시 경로이며, 새로운 내부
메커니즘 이름을 뜻하지 않는다.

상위 큰 과정은 [`System Onboarding Protocol`](../protocols/SYSTEM_ONBOARDING_PROTOCOL.md)이다.
Protocol의 각 Stage는 Engine 하나만 호출하는 규칙이 아니며, Engine 능력·계약·Adapter·Skill·
Policy·Guardrail·Connector·Host/사람 검토를 조합할 수 있다.

## 문서 책임 지도

| 구분 | 정본 또는 문서 | 맡는 일 |
|---|---|---|
| 제품 방향·용어 | [`MASTER.md`](../MASTER.md) §2B, §6, §7 | Asset 원장의 범위, Engine 경계, 용어와 출시 상태 |
| 큰 과정 | [`System Onboarding Protocol`](../protocols/SYSTEM_ONBOARDING_PROTOCOL.md) | 근거 수집부터 Asset Build, 신뢰 분석, 검토, 지도 반영, 최초 관측까지의 Stage·Gate·산출물 |
| Asset Engine | [`shared/engineRegistry.js`](../../shared/engineRegistry.js) `Asset Core` | 정규화, 동일성, 대조의 현재 구현 가능한 능력과 Component 계약 |
| 제품 표시·변경 이력 | [`Product Catalog`](../product/PRODUCT_CATALOG.md), [`Engine Changelog`](../product/ENGINE_CHANGELOG.md) | 사용자용 Engine 설명과 버전별 변경 기록 |
| 정규형 | [`Asset 원장 v3`](./contracts/TWIN_BUILD_SCHEMA.md) | 공급자 중립 중간 형식·검증·마이그레이션 |
| 호환 계약 | [`Twin Adapter Contract v1`](./contracts/TWIN_ADAPTER_CONTRACT.md) | 레거시 현행 코드명으로 유지되는 시스템별 Adapter의 발견·정규화·대조·조작 경계 |
| 정체성·현실성 | [`Asset 정체성과 관측 상태`](./architecture/TWIN_IDENTITY_AND_OBSERVATION.md) | 논리/설계/실행 실체와 CODE/LIVE 근거 상태를 분리하는 안전 규칙 |
| 교차 Workflow | [`Workflow Catalog`](../protocols/WORKFLOW_CATALOG.md) | Source-to-Map Proposal, State Snapshot 등 재사용 가능한 Engine 조합 |
| 과거 이력 | [`과거 Engine Roadmap`](./archive/TWIN_ENGINE_ROADMAP.md) | 레거시 파일에 남은 과거 단계와 배경. 현재 목표의 정본이 아님 |

제품 방향이 이 문서 또는 과거 로드맵과 충돌하면 항상 `MASTER.md`와 실제 코드·테스트를
우선한다.

## Asset 원장 관련 Engine과 경계

| Engine | 책임 | 하지 않는 일 |
|---|---|---|
| **Asset Core** | Lens/Connector의 근거를 Asset 원장으로 정규화하고, 안정된 식별자를 유지하며 현재 캔버스와 대조해 검토 Proposal을 만든다 | 외부 시스템을 직접 읽거나, 승인 없이 캔버스를 실체화하지 않는다 |
| **Connector Bridge** | 권한·동의가 있는 외부 경계 통신과 provenance/evidence envelope를 맡는다 | Asset 원장·동일성·Proposal을 직접 소유하지 않는다 |
| **Source Lens** | 허용된 소스에서 제품 의미·코드 계층·관계·기능 맥락 근거를 만든다 | 캔버스 저장이나 외부 통신의 공통 경계를 소유하지 않는다 |
| **Trust Map** | 신뢰영역·Gateway·unknown-gap과 보안 Finding을 판정한다 | 일반적인 정규화·캔버스 쓰기를 맡지 않는다 |
| **Draw Map** | 승인된 지도 표현의 배치·연결선·그룹을 가시화한다 | 온톨로지·사실 판정과 무관한 순수 가시화 Engine이며, 발견 결과를 해석하거나 사실로 확정하지 않는다 |
| **LiveOps** | 허용된 공급자 관측의 시각·신선도·LIVE/stale 상태를 판정한다 | CODE 근거를 LIVE로 승격하지 않는다 |
| **Safe Operations** | 안전한 조작 정의·계획·승인·검증·복구 수명주기를 적용한다 | 선언된 조작을 자동 실행 가능으로 만들지 않는다 |

Asset Core의 현재 내부 Component 범위에는 레거시 현행 코드명인 **Twin Adapter
Contract**, 원장 작성, 대조, **Capability Mapper**가 있다. 정확한 버전·입출력·근거는
Engine Registry를 따른다.

## 핵심 규약

1. **근거 우선:** Adapter는 허용된 원본의 근거만 읽고, 실제 비밀값이나 본문을 Asset 원장에 넣지 않는다.
2. **정규화와 가시화 분리:** Asset 원장은 공통 중간 형식이며, Draw Map은 승인된 지도 표현의 배치·연결선·그룹만 가시화한다.
3. **동일성 보호:** 기존 노드를 다른 Source나 Asset으로 자동 교체하지 않으며, `bind_node`는 정체성 지문과 검토 단위를 요구한다.
4. **사용자 소유권 보존:** 위치·크기·메모·직접 추가한 파츠/연결선·기존 검토 결정은 자동 대조가 덮어쓰지 않는다.
5. **현실 수준 분리:** 논리 구성, 설계 실체, 실행 실체와 CODE/LIVE/stale 관측은 별도 축이다. 정식 검증 상태는 `Reality Level runtime-verified`이며 화면에는 `LIVE`로 표시한다. CODE는 실행 확인을 의미하지 않는다.
6. **경계 통과:** 서로 다른 신뢰영역의 관계에는 Gateway가 필요하며, 실행 조작은 별도의 정책·승인·검증·복구 계약을 모두 통과해야 한다.

## 읽는 순서

1. 전체 과정이 필요하면 System Onboarding Protocol을 읽는다.
2. 데이터 구조·검증 규칙을 바꾸면 Asset 원장 v3를 읽는다.
3. 새 시스템 연동이나 Adapter 호환성을 다루면 레거시 현행 코드명인 Twin Adapter Contract를 읽는다.
4. CODE/LIVE 표기, 바인딩 또는 관측을 다루면 Asset 정체성과 관측 상태를 읽는다.
5. 실제 구현 범위는 Engine Registry와 관련 코드·테스트로 재검증한다.

Asset 원장은 시스템 구조에 대한 검증 가능한 스냅샷이다. “디지털 트윈”은 제품을
대외적으로 소개하는 문장에서만 사용하는 서술어이며, 내부 메커니즘·Engine·과정이나
검증 상태의 이름이 아니다.
