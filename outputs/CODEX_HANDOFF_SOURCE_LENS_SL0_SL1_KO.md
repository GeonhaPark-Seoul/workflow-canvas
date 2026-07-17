# Claude Code 전달: Source Lens SL-0 + SL-1

## 적용 기준

- 기준 커밋: `bdaa6f53fc2eee469e6edc03817e89c119c8dbad`
- 기준 문서: `docs/MASTER.md` v0.4.0
- 패치: `outputs/SOURCE_LENS_SL0_SL1.patch`
- 패치 SHA-256: `6622b7de0863f4f5875ab536a5e2b85c9c6891aa7a7ef759fc3324b19ce1dd37`
- Codex는 커밋, push, 배포, 운영 SQL을 수행하지 않았다.
- SQL 변경 없음. 새 외부 의존성 없음.

## 구현 결과

### SL-0: 시스템 노트의 파츠 상세

- 노트 창에서 시스템 노드의 파츠를 읽기 전용으로 표시한다.
- 각 항목은 종류, 이름, 참조, 근거 상태, 공개 수준을 보여준다.
- `redacted` 시스템 노드는 공용 표시 함수에서 파츠를 빈 목록으로 바꾼다. 숨은 파츠 내용과 개수가 노트 화면으로 새지 않는 회귀 테스트를 추가했다.
- 논리 구성요소의 공개 종류 배지와 짧은 설명도 노트와 시스템 노드 상세에 표시한다.

### SL-1: 정식 코드 Asset 계층

- 코드 탐색 계층을 `제품 영역 → 서브시스템 → Component → 모듈 → 코드 단위`로 공식화했다.
- 기존 wire 필드 `subsystem`은 유지하고 화면·문서 표시만 `서브시스템`으로 정리했다.
- 파일과 함수는 코드 Asset 후보로 인정한다. 캔버스 노드 자동 생성은 하지 않으며 manifest에 `materialization: proposal-required`를 기록한다.
- Component 소속은 Engine Registry의 `codeEvidence`와 Source Profile의 기존 `implementationRules`만 사용한다. 이름·폴더 유사성 추측은 하지 않는다.
- Source Profile 계약에 선택적 `components` catalog를 추가했다. Workflow Canvas 전용 Registry 변환은 Workflow Canvas 프로필 안에만 있으며 공통 스캐너에는 제품 하드코딩이 없다.
- Source Lens 내부에 `Source Component Mapper`를 등록했다. 이 새 분류 코드도 다음 Source Twin 분석과 자기 시스템 지도 변경 검토 대상이 된다.
- Component 종류 10개를 공개 설명과 함께 표시한다: Engine, Contract, Resolver, Builder, Pipeline, Agent Skill, Agent Policy, Hard Guardrail, Connector, Manifest. 기존 `workflow`와 `tool` wire 값은 호환용으로 보존한다.
- Source Lens 버전은 `0.4.0-alpha.0`, Workflow Canvas Source Profile은 `0.4.0`으로 올렸다.

## 성능·payload

- Component 설명을 각 파일 엔티티에 복제하지 않고, manifest에 Component 목록과 `moduleIds`만 한 번 저장했다.
- `shared/sourceTwinManifest.js`: 2,654,132 bytes → 2,709,785 bytes, 55,653 bytes 증가(약 2.10%).
- 브라우저의 기존 엔티티 조회 한도와 지연 열기 방식은 유지했다.
- Vite 출력의 기존 대형 chunk 경고는 남아 있으며 이번 변경으로 새 의존성이나 별도 chunk를 추가하지 않았다.

## SL-2 ~ SL-4 설계 방향

### SL-2: 코드 단위와 자연어 번역

- AST 근거에서 선언, 명령, 분기, 반복, 반환을 구분하고 별도로 리소스, 설정, 데이터 참조를 분류한다.
- 모든 단위는 `파일 + AST 노드 종류 + 심볼 + 범위 + 주변 구조 fingerprint`의 안정 anchor를 가진다.
- 자연어는 결정적 템플릿을 먼저 사용하고, AI 설명은 근거가 연결된 선택적 보강으로만 둔다.
- tree-sitter는 다언어·증분 분석 후보지만 이번 배치에서 도입하지 않았다. Babel 유지 비용, bundle/설치 크기, 언어 품질과 라이선스를 별도 비교하고 승인 후 결정한다.

### SL-3: 안전한 왕복 편집

- 첫 범위는 명시적으로 등록된 literal/config 속성만 허용한다. 임의 코드 문자열 치환은 금지한다.
- ENG-006 계약대로 타입, 단위, 범위, 반응형 변형, 소유자, source anchor, 영향 범위를 가진 editable-property schema가 필요하다.
- 실제 쓰기는 읽기 전용 기본 Local Connector와 분리된 새 쓰기 동의, 저장소/remote pin, 격리 branch 또는 worktree, 정확한 diff, formatter·test·build, 사람 승인, rollback을 모두 통과해야 한다.
- LOC-002·005·006·007·008이 공개 출시 차단 조건이므로 현재 터미널 helper를 상용 왕복 편집 경계로 사용하면 안 된다.

### SL-4: 호출·화면 흐름 발견

- import/call graph와 React component tree·props 흐름을 별도 근거층으로 만든다.
- workflow는 초기에는 Component의 Capability/파츠로 표현하고, 독립 상태·책임·사용자 인지가 확인된 경우만 Proposal로 Component Asset 승격을 제안한다.
- 정적 호출과 실제 실행을 구분하며, 실행 기록 없는 관계는 declared/CODE 근거로만 표시한다.

## 사용자 결정이 필요한 후속 UX

모듈 Asset을 캔버스에 올리는 방식은 이번에 임의 구현하지 않았다. 권고안은 코드 상세의 `캔버스에 올리기` 명령이 기존 Reconciliation Proposal을 만들고, 사용자가 미리보기 후 승인하는 방식이다. 자동 대량 실체화는 지도 과밀과 사용자 배치 훼손 위험 때문에 권하지 않는다.

## 검증

- `npm test`: 통과, MCP 묶음 203개 포함
- SQL 보안 검사: 통과
- 보안 경계 검사: 통과
- 성능 경계 검사: 통과
- `npm run discover:check`: 통과
- `npm run source-twin:check`: 통과
- `npm run build`: 통과
- `privacy:check`는 기존 설계대로 `blocked-pending-operator-blind-storage`를 보고하고 전체 테스트는 통과한다.

## 배포 후 확인 목록

1. 시스템 노드의 노트 창에서 파츠 종류·이름·참조·상태가 보이는지 확인한다.
2. 시야 제한 참여자에게 숨은 시스템 노드의 파츠와 개수가 보이지 않는지 확인한다.
3. 로컬 저장소 또는 GitHub 코드 구조에서 영역 → 서브시스템 → Component → 파일 → 함수 순으로 펼쳐지는지 확인한다.
4. Component 배지 hover에서 종류 설명이 보이고, Component를 열면 실제 근거 파일만 나오는지 확인한다.
5. `기타 모듈·리소스`가 근거 없는 항목을 억지 Component에 넣지 않는지 확인한다.
6. 기존 코드·변경·Git 동기화·로컬 커넥터 화면이 그대로 작동하는지 확인한다.
7. 자기 시스템 지도 검토에 Source Lens 0.4와 Source Component Mapper 변경안이 나타나는지 확인한다.

## MASTER.md 갱신 필요 사항

- SL-0과 SL-1 완료 상태 및 Source Lens `0.4.0-alpha.0` 기록.
- 코드 Asset 계층 v1: 제품 영역 → 서브시스템 → Component → 모듈 → 코드 단위.
- 파일·함수는 Asset 후보지만 실체화는 사용자 선택 + Proposal이라는 경계.
- 공개 Component 종류 10개와 `workflow`/`tool` legacy wire 호환성.
- Source Component Mapper의 책임과 Source Lens 자기반영 구조.
- 모듈 실체화 UX 권고안은 사용자 승인 전 미확정으로 기록.
