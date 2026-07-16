# Source Profile 계약

Source Profile은 Source Lens가 서로 다른 소프트웨어의 코드를 그 제품의 언어로 설명하도록 연결하는 **버전이 있는 제품별 번역 사전**이다. 공통 스캐너가 파일과 구조 근거를 수집하고, 프로필은 저장소 식별 근거, 제품 영역, 하위 시스템, 잘 알려진 파일 역할과 지원 수준을 선언한다.

## 책임 경계

- Source Scanner: 허용된 파일을 찾고 지원되는 parser로 구조 근거를 추출한다.
- Source Profile Registry: 저장소 근거와 일치하는 프로필 하나를 결정적으로 선택한다.
- Source Profile: 제품별 이름, 분류와 파일 역할을 선언한다.
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

파일 역할에는 쉬운 설명과 사용자 영향이 모두 있어야 한다. 경로는 저장소 상대 경로만 허용하며 버전은 Semantic Versioning 형식으로 기록한다. 같은 근거에서는 priority, 근거 수와 ID 순서에 따라 항상 같은 프로필이 선택된다.

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

이번 버전은 Workflow Canvas 프로필 분리와 두 번째 FastAPI 참조 프로필의 파일 수준 검증까지 포함한다. 다음 단계의 실제 Python 함수·import·호출 분석은 표준 library 또는 검증된 parser를 비교하고 사용자 승인을 받은 뒤 도입한다. 그 전까지 Python 결과를 `parsed`나 LIVE로 승격하지 않는다.
