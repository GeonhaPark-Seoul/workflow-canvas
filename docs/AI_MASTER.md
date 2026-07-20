# Workflow Canvas OS AI 작업 지휘 마스터

이 문서는 Claude Code, Codex와 그 밖의 개발 AI가 **최소한의 문서만 읽고 정확한 정본으로
이동하도록 지휘하는 라우터**다. 제품 기획 정본이 아니며 새로운 제품 방향, 완료 상태,
Engine 버전 또는 보안 주장을 이 문서에서 만들지 않는다.

## 1. 정본과 우선순위

- **제품 방향·용어·범위:** 사람이 소유하는 [`MASTER.md`](./MASTER.md)
- **계약 불변식:** 작업 대상의 Contract·Schema 문서와 구현. MASTER와 충돌하면 조용히
  선택하지 말고 충돌을 보고한다.
- **현재 Engine 구성·기술 버전:** `shared/engineRegistry.js`
- **실제 현재 동작:** 코드와 통과하는 테스트. 문서의 예정·완료 표기와 다르면 보고한다.
- **부채·출시 차단 조건:** `TECHNICAL_DEBT.md`의 해당 ID
- **Graphify:** 탐색 보조. `INFERRED` 관계나 stale graph를 사실로 사용하지 않는다.
- **이 문서·`AGENTS.md`·`CLAUDE.md`:** AI 실행 지침일 뿐 제품 정본이 아니다.

현재 역할 분담은 복제하지 않고 [`MASTER.md`의 협업 프로세스](MASTER.md#12-협업-프로세스-역할-분담)를
따른다. 편성이 바뀌면 MASTER만 먼저 갱신하고 이 문서는 링크를 유지한다.

## 2. 작업 시작 순서

1. 루트 `AGENTS.md` 또는 `CLAUDE.md`의 환경별 행동 규칙을 읽는다.
2. 이 문서를 읽고 작업 유형을 분류한다.
3. `MASTER.md`에서 §2 표준 용어, §4 불변 원칙과 **작업 관련 절만** 읽는다.
4. 아래 라우팅 표에 지정된 Contract·장부·Registry·코드만 추가로 읽는다.
5. 구조 탐색은 기존 `graphify-out/graph.json`을 먼저 질의하되, 관련 실제 파일과 현재
   commit을 확인한 뒤 판단한다.
6. dirty worktree를 확인하고 사용자 변경을 보존한다.
7. 요청 범위 안에서 구현하고 위험에 비례해 검증한다.

전체 `docs/`를 선독하지 않는다. 토큰을 아끼는 것은 생략 허가가 아니라 필요한 정본으로
곧장 이동하라는 규칙이다.

## 3. 작업별 최소 읽기

| 작업 | 추가로 읽을 정본 |
|---|---|
| 단순 UI·버그 수정 | `MASTER.md` §2·§4와 해당 코드·테스트 |
| Engine 추가·개명·책임·버전 변경 | `MASTER.md` §6, `docs/product/ENGINE_AGENT_REGISTRY.md`, `shared/engineRegistry.js`, `docs/product/ENGINE_CHANGELOG.md` |
| Starting Protocol·Project Master·최초 Entry·Starting Bundle | `MASTER.md` §2A·§4, [`STARTING_PROTOCOL.md`](./protocols/STARTING_PROTOCOL.md), [`AI_CONTEXT_GATE_MASTER.md`](./engines/AI_CONTEXT_GATE_MASTER.md), [`WORKFLOW_CATALOG.md`](./protocols/WORKFLOW_CATALOG.md), `TECHNICAL_DEBT.md`의 `START-001`·`AI-008`, 관련 코드·테스트 |
| 시스템 온보딩 전체 흐름·Stage·진행 UI·Run·완료 Bundle | `MASTER.md` §2B·§4, [`STARTING_PROTOCOL.md`](./protocols/STARTING_PROTOCOL.md)의 인계 계약, [`SYSTEM_ONBOARDING_PROTOCOL.md`](./protocols/SYSTEM_ONBOARDING_PROTOCOL.md), [`WORKFLOW_CATALOG.md`](./protocols/WORKFLOW_CATALOG.md), 관련 Engine 계약, `TECHNICAL_DEBT.md`의 `ONB-001`·`ENG-008`·`DOC-001` |
| AI Context Gate·상대 개발 AI Project Master 기록·완료 Gate | `MASTER.md` §2A·§6, [`STARTING_PROTOCOL.md`](./protocols/STARTING_PROTOCOL.md), [`AI_CONTEXT_GATE_MASTER.md`](./engines/AI_CONTEXT_GATE_MASTER.md), [`WORKFLOW_CATALOG.md`](./protocols/WORKFLOW_CATALOG.md), `TECHNICAL_DEBT.md`의 `AI-001`·`AI-002`·`AI-006`·`AI-008`·`START-001`, 관련 코드·테스트 |
| Source Lens 기획·구현 | `MASTER.md` §6·§9, [`SOURCE_LENS_MASTER.md`](./engines/SOURCE_LENS_MASTER.md), `docs/contracts/SOURCE_PROFILE_CONTRACT.md`, `governance/TECHNICAL_DEBT.md`의 `SL-001`·`SL-002`, 관련 코드·테스트 |
| Connector Bridge 기획·구현 | `MASTER.md` §6·§8, [`CONNECTOR_BRIDGE_MASTER.md`](./engines/CONNECTOR_BRIDGE_MASTER.md), [`WORKFLOW_CATALOG.md`](./protocols/WORKFLOW_CATALOG.md), `TECHNICAL_DEBT.md`의 `ENG-008`·`DOC-001` 및 관련 LOC/AI/OPS ID, Connector 코드·경계 테스트 |
| 여러 Engine을 연결하는 Workflow·Source UI/편집/Snapshot/외부 AI | `MASTER.md` §6, [`WORKFLOW_CATALOG.md`](./protocols/WORKFLOW_CATALOG.md), 관련 Engine 계약·코드·테스트 |
| Adapter·Asset 원장·Reconciliation | `docs/twin/README.md`, `docs/twin/contracts/TWIN_ADAPTER_CONTRACT.md`, `docs/twin/contracts/TWIN_BUILD_SCHEMA.md`, 해당 Adapter 코드·fixture. 현행 wire 스키마 코드 이름은 `TwinBuild` |
| Connector·외부 연동·로컬 에이전트 | `MASTER.md` §2.3·§8, `docs/governance/TECHNICAL_DEBT.md` 관련 ID, Connector 코드·경계 테스트 |
| Operation 추가·변경 | `docs/contracts/OPERATION_LIFECYCLE_CONTRACT.md`, Operation definition·검증 테스트 |
| 보안·인증·공유·개인정보 | `MASTER.md` §4·§8, `docs/governance/TECHNICAL_DEBT.md` 관련 ID, 보안 테스트 |
| 의존성·외부 도구 도입 | `docs/architecture/decisions/OPEN_SOURCE_POLICY.md`, `docs/architecture/decisions/DEPENDENCY_DECISIONS.md`, dependency registry |
| 배포·SQL·운영 상태 | `MASTER.md` §8·§12, 관련 migration·runbook·운영 근거 |
| 문서만 변경 | 대상 문서의 상위 정본과 실제 코드/Registry가 설명을 지지하는지 확인 |

## 4. 공통 용어 압축본

아래 문장은 탐색용 요약이다. 정확한 정의는 `MASTER.md` §2가 우선한다.

- **Starting Protocol:** 최초 가동 형태를 아직 정하지 않은 채 사용자 소유 Project Master,
  상대 AI Enrollment와 Starting Bundle을 준비하는 온보딩 전 큰 과정. Stage마다 Engine Capability,
  Skill·Policy·Guardrail, Adapter·Connector, Host와 사람 검토를 필요에 따라 조합한다.
- **Project Master:** 사용자가 읽고 수정하며 소유하는 프로젝트 전체의 단 하나의 기획 정본.
  실제 코드 동작의 증거는 아니며 Workflow Canvas가 사용자와 기획을 진행할 때 기준으로 삼는다.
- **System Onboarding Protocol:** Starting Bundle 이후 실제 근거를 분석하는 전체 순서·Stage
  소유권·승인·실패·재개·완료 조건의 버전형 큰 과정. 각 Stage는 여러 Engine Capability와
  Contract·Adapter·Skill·Policy·Guardrail·Host·사람 검토를 조합할 수 있다.
- **Engine:** 여러 Workflow가 호출하는 최상위 버전형 재사용 능력. Workflow나 Run 자체가
  아니며 다른 Engine의 하위 Component가 될 수 없다.
- **Workflow Definition:** Stage·조건·승인·입출력을 연결한 버전형 실행 설계.
- **Workflow Run:** 특정 Definition과 Engine·Adapter·Profile 버전을 고정한 실제 실행.
- **Component:** Engine 내부 책임 단위. 독립 서버나 LIVE 자원을 뜻하지 않는다.
- **Adapter:** 특정 도구·시스템의 입력과 출력을 공통 Engine Contract에 맞추는 교체 가능한
  Stage 구현. 외부 통신 경계는 Connector가 별도로 맡는다.
- **Connector:** 외부 또는 로컬 환경과 통신하는 최소 권한 경계.
- **Profile:** 제품 의미·분류·지원 수준을 선언하는 비실행 데이터.
- **Artifact:** Run이 만든 지속 결과. 생성 근거가 있어야 하며 그 자체로 LIVE를 증명하지 않는다.

관계는 `Protocol → Workflow Definition → Stage → Capability·통제 조합`,
`Engine → Component`, `Stage → Adapter/Profile`, `Workflow Run → Artifact`로 읽는다.

## 5. Graphify 사용 규칙

- 현재 `graphify-out/`은 AI의 저장소 탐색 보조다. Source Lens 제품 통합은
  [`SOURCE_LENS_MASTER.md`](./engines/SOURCE_LENS_MASTER.md)의 계획 상태·Adapter Contract·세부 Flow를
  따르며, 둘을 같은 구현 상태로 혼동하지 않는다.
- 기존 graph가 있으면 질문·경로 탐색을 먼저 수행한다.
- `built_at_commit`을 현재 HEAD와 비교하고 stale이면 탐색 결과를 최신 코드로 재검증한다.
- `EXTRACTED`도 실제 파일을 가리키는 탐색 근거일 뿐 제품 방향의 정본은 아니다.
- `INFERRED`·`AMBIGUOUS` 관계를 사실처럼 문서화하지 않는다.
- Graphify 재빌드나 새 의존성 채택은 사용자 요청·승인 및 오픈소스 결정 절차를 따른다.

## 6. 변경과 검증

- 사람용 제품 결정이 바뀌면 `MASTER.md`를 먼저 또는 같은 변경에서 갱신한다.
- 이 문서는 제품 설명을 복제하지 않고 경로와 읽기 조건만 갱신한다.
- Engine 변경은 Registry, 버전, 호환성, 코드·테스트 근거와 changelog를 함께 대조한다.
- Starting Protocol 또는 AI Context Gate 변경은 `STARTING_PROTOCOL.md`와
  `AI_CONTEXT_GATE_MASTER.md`에서 미정인 Entry·저장 형태를 선결정하지 않았는지, 단일
  Project Master 사용자 소유권, 프롬프트 전달·전달 검증·실제 완료 차단, 사용자의 토큰 방어와
  Connector Bridge·Source Lens·Safe Operations 경계를 함께 검증한다.
- Source Lens 변경은 `SOURCE_LENS_MASTER.md`의 단일 Workflow·물리 경계를 갱신한다.
- Connector Bridge 변경은 `CONNECTOR_BRIDGE_MASTER.md`에서 현행과 계획을 구분하고, 제품
  의미·동일성·조작 수명주기와 경계 교환 책임을 다시 섞지 않는다.
- 시스템 온보딩 변경은 `STARTING_PROTOCOL.md`의 Starting Bundle 인계와
  `SYSTEM_ONBOARDING_PROTOCOL.md`에서 각 Stage의 단일 소유자, AI/사람 경계, Artifact, 현재
  코드와 계획 상태를 함께 갱신한다. AI Context Gate를 온보딩 내부 Stage로 되돌리거나
  Protocol을 Engine Registry에 등록하지 않는다.
- 교차 Engine 흐름 또는 Source UI·편집·Snapshot·외부 AI 변경은 `WORKFLOW_CATALOG.md`를 갱신한다.
- 새 외부 전송, 권한, 쓰기, LIVE 주장은 보안·부채·계약 검증 없이는 추가하지 않는다.
- 관련 테스트와 build를 실행하고, 실행하지 못한 검증은 완료처럼 표현하지 않는다.
- 요청받지 않은 commit·push·배포·프로덕션 쓰기는 현재 `MASTER.md` §12와 사용자 지시를
  확인한 뒤에만 수행한다.

## 7. 충돌 처리

문서와 코드가 다르면 다음을 명시한다.

1. 충돌한 파일과 개념
2. 현재 코드가 실제로 하는 일
3. MASTER가 요구하는 방향
4. 이번 요청에서 수정할 범위와 남길 후속 결정

충돌을 숨기기 위해 문서를 코드에 맞추거나 코드를 문서에 맞추지 않는다. 사용자가 기획
변경을 요청한 경우에만 사람용 MASTER의 방향을 바꾸고 문서 버전과 변경 이력을 갱신한다.
