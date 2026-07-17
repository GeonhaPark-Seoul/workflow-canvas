# Source Profile 계약

Source Profile은 Source Lens가 서로 다른 소프트웨어의 코드를 그 제품의 언어로 설명하고 **무엇을 어디까지 지도에 표현할지** 결정하도록 연결하는 버전이 있는 제품별 번역 사전이다. 공통 스캐너가 파일과 구조 근거를 수집하고, 프로필은 저장소 식별 근거, 제품 영역, 서브시스템(`subsystem`), 잘 알려진 파일 역할, 지원 수준과 선택적인 기능 표현 경계를 선언한다.

## 책임 경계

- Source Scanner: 허용된 파일을 찾고 지원되는 parser로 구조 근거를 추출한다.
- Source Profile Registry: 저장소 근거와 일치하는 프로필 하나를 결정적으로 선택한다.
- Source Profile: 제품별 이름, 분류와 파일 역할을 선언한다.
- Feature Boundary Resolver: 프로필의 3등급 판정과 실제 코드·DB 근거를 대조한다.
- Source Twin manifest: 선택된 프로필 ID·버전·근거와 분석 결과를 함께 보존한다.
- Twin Adapter: 코드 외의 DB, 배포, 운영 상태와 조작 능력까지 시스템 트윈으로 변환한다.

Source Profile은 parser, 실행 플러그인, 서버 또는 AI prompt가 아니다. 프로필은 임의 코드를 실행하지 않는 데이터 선언이며 캔버스나 대상 저장소를 직접 바꾸지 않는다.

## 계약 v1

필수 필드는 다음과 같다.

- `contractVersion`, `id`, `version`, `sourceId`
- `match`: package 이름, 필수 파일, 후보 파일 또는 마지막 fallback
- `capabilities`, `languageSupport`
- `areas`, `subsystems`
- `fileRoles`, `areaRules`, `subsystemRules`
- 선택적인 `components`: 종류·설명·버전과 실제 `codeEvidence`를 가진 Component catalog

`featureModel`은 계약 v1의 선택 확장이다. 확장을 사용하면 `schemaVersion: 1`, 영역·하위 시스템의 기본 판정, 명시적 판정, 구현 연결 규칙과 데이터 연결 규칙을 선언한다. 확장이 없는 기존 프로필은 코드 설명만 만들며 기능 Asset 후보를 만들지 않는다.

파일 역할에는 쉬운 설명과 사용자 영향이 모두 있어야 한다. 경로는 저장소 상대 경로만 허용하며 버전은 Semantic Versioning 형식으로 기록한다. 같은 근거에서는 priority, 근거 수와 ID 순서에 따라 항상 같은 프로필이 선택된다.

## 기능 표현 경계 확장 v1

각 제품 영역과 하위 시스템은 다음 셋 중 하나로만 판정한다.

- `feature-asset`: 사용자가 독립 능력으로 인지하고 구현 근거와 관계가 필요한 L1 기능 Asset 후보
- `capability`: 기능 Asset이 노출하는 세부 능력이며 소유 Asset의 파츠 후보
- `attribute`: 별도 상태·관계가 필요하지 않은 내부 사실 또는 관측이며 노드나 파츠로 만들지 않음

판정은 Source Profile의 데이터 선언이다. 공통 Source Lens 코어에는 Workflow Canvas 이름이나 노드 ID를 하드코딩하지 않는다. `implementationRules`는 위에서 아래로 평가해 파일마다 처음 일치한 Twin Adapter 대상 하나를 사용한다. `dataBindings`는 Source Twin의 DB 엔티티 ID를 대상 TwinBuild 엔티티 ID에 연결한다.

`feature-asset`은 해당 영역·하위 시스템의 실제 파일 근거와 구현 대상 근거가 모두 있을 때만 실체화 가능하다. `capability`는 실제 파일 근거와 소유 기능 Asset이 있어야 한다. DB 관계는 Source Twin이 `read` 또는 `write`로 확인한 참조만 `reads`/`writes` 후보가 되며 SQL 선언만 있는 `declares`는 사용하지 않는다.

판정 결과는 자동으로 캔버스를 바꾸지 않는다. Twin Adapter가 기존 Reconciliation 경계에서 미리보기 → 사용자 승인 → 실체화 순서의 Proposal로 바꾼다. Feature Asset은 `declared`이며 코드 근거만으로 LIVE를 암시하지 않는다.

Source Lens의 표현 규칙과 판정 코드도 Source Twin의 분석 대상이다. 따라서 판정기가 바뀌면 Source Lens 버전·근거와 자기 시스템 지도의 변경 검토안에 다시 나타난다. 이 자기반영 구조는 유지하되, 구체적인 세분화 수준은 프로필 버전으로 바꿀 수 있다.

## 코드 Asset 계층 v1

코드 탐색은 `제품 영역 → 서브시스템 → Component → 모듈 → 코드 단위` 계층을 사용한다. 현재 모듈은 파일과 함수이며 둘 다 Asset 후보지만, 캔버스 노드 자동 실체화는 금지하고 `proposal-required`로 기록한다.

Component 소속은 프로필의 명시적 `codeEvidence`와 기존 `implementationRules`의 정확한 경로 일치에서만 만든다. 근거가 없는 파일은 `기타 모듈·리소스`에 남기며 이름이나 폴더 유사성으로 추측하지 않는다. Component 목록과 파일 ID만 manifest에 한 번 저장해 브라우저 payload의 중복을 제한한다.

## 분석 수준

- `parsed`: 검증된 parser가 함수나 선언 구조를 읽었다.
- `structure-only`: 파일 위치와 프로필 역할만 확인했다. 함수·호출 관계는 주장하지 않는다.
- `unsupported`: 현재 버전이 해당 언어를 분석하지 않는다.

현재 Workflow Canvas 프로필은 JavaScript/JSX와 제한된 SQL 선언을 `parsed`로 처리한다. FastAPI 주문 서비스 참조 프로필은 Python 파일을 `structure-only`로 처리한다. 이는 두 번째 제품 의미 계층을 검증하는 fixture이며 Python 분석 완료나 실제 FastAPI 운영 연결을 뜻하지 않는다.

## 버전과 변경 감지

manifest ID와 설명 fingerprint에는 프로필 ID·버전, 설명, 분류와 근거가 포함된다. 코드 본문이 같더라도 프로필 버전이나 설명 계약이 바뀌면 Source Lens는 이를 변경으로 표시한다. 기존 코드 fingerprint와 설명 fingerprint는 따로 보존해 코드 변경과 해석 규칙 변경을 구별한다.

## 새 소프트웨어 추가 순서

1. 저장소를 식별할 결정적이고 비밀이 아닌 근거를 정한다.
2. 공통 영역으로 설명되지 않는 제품 영역과 하위 시스템만 추가한다.
3. 중요한 파일부터 역할과 사용자 영향을 작성한다.
4. 언어별 실제 분석 수준을 선언한다.
5. 대표 fixture와 예상 분류·설명·근거 테스트를 추가한다.
6. 실제 DB·배포·운영·조작이 필요하면 별도 Twin Adapter를 연결한다.

내장 프로필을 추가하는 동안 공통 스캐너의 제품별 조건문을 늘리지 않는다. 현재 정규식 규칙은 저장소 코드와 함께 배포되는 신뢰된 내장 프로필만 대상으로 한다. 향후 사용자가 프로필을 업로드하게 되면 정규식 제한, 서명, 격리와 자원 한도를 별도로 설계해야 한다.

## 현재 범위와 다음 결정

이번 버전은 Workflow Canvas 프로필의 기능 표현 경계와 두 번째 FastAPI 참조 프로필에서 같은 판정기의 재사용까지 포함한다. FastAPI는 여전히 파일 구조 수준이며 실제 Python 함수·import·호출 분석은 표준 library 또는 검증된 parser를 비교하고 사용자 승인을 받은 뒤 도입한다. 그 전까지 Python 결과를 `parsed`나 LIVE로 승격하지 않는다.
