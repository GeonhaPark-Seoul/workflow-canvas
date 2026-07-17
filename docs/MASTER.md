# Workflow Canvas OS 마스터 문서

> 이 프로젝트의 **모든 기능과 방향성을 담은 단 하나의 기준 문서**다.
> 다른 모든 문서(로드맵, 카탈로그, 부채 장부, 계약서)는 이 문서의 세부를 보충하며,
> 방향이나 용어가 충돌하면 **이 문서가 우선**한다. 충돌을 발견하면 이 문서를 고치는 것이
> 아니라 충돌 자체를 해소하는 변경을 만들고 이 문서의 버전을 올린다.

| 항목 | 값 |
|---|---|
| 문서 버전 | **0.3.2** |
| 최종 수정일 | 2026-07-17 |
| 제품 버전 | 0.1.0-alpha.0 (내부 알파) |
| 관리 규칙 | 이 문서 맨 아래 §13 |

---

## 1. 중심 문장

> **모든 것은 Asset이 되고, Asset은 관계를 맺고, 관계된 Asset은 Work를 수행하며,
> Work의 흐름은 Workflow가 된다. Lens는 근거를 통해 세상을 Asset Graph로 해석하고,
> 엔진은 그것을 운영 가능한 내부 언어로 정제한다. 주장과 사실은 항상 구분된다.**

Workflow Canvas OS는 **세상에서 관리할 가치가 있는 모든 대상을 Asset으로 식별하고,
관계와 상태를 연결하며, 그 Asset들이 수행하는 Work와 Workflow를 이해하고 조작하는
시각적 운영체제**다.

- Asset은 경제적 자산만 뜻하지 않는다. **독립적인 정체성·상태·속성·관계·생명주기를
  가지고 관리할 가치가 있는 모든 객체**다. 사람, AI, 돈, 건물뿐 아니라 코드, 아이디어,
  의도, 전략, 브랜드, 회의 기록도 Asset이 될 수 있다.
- **Node는 Asset이 아니다.** Asset은 관리 대상이고, Node는 특정 Lens를 통해 Asset을
  화면에 표현한 모습이다. 같은 사람이 조직 Lens에서는 직원 노드 하나로, 건강 Lens에서는
  신체·검사·생활 기록과 연결된 존재로 보일 수 있다.
- Asset의 최소 단위는 절대적이지 않다. **"현재 목적과 Lens 안에서 독립적으로 식별하고
  상태를 관리할 가치가 있는 가장 작은 운영 단위"**다. 사람을 세포까지 쪼갤 필요는 없지만,
  의료 Lens에서 검사 결과가 중요하면 별도 Asset으로 만들 수 있다.

---

## 2. 표준 용어집

**이 프로젝트의 모든 코드, 문서, 화면, 대화는 아래 용어를 사용한다.**
과거 용어는 §2.4 매핑표를 따라 점진적으로 교체한다.

### 2.1 Asset 문법 (모델 계층)

| 표준 용어 | 정의 |
|---|---|
| **Asset** (애셋) | 독립적 정체성·상태·속성·관계·생명주기를 가진 관리 대상. 고유 정체성, 종류와 역할, 현재 상태, 속성, 소유자와 담당자, 권한, 생명주기, 다른 Asset과의 관계, 근거와 출처, 변경 이력을 가진다. |
| **Asset 종류** | 고정 목록이 아니라 **조합형**이다. 존재 형태 × 역할 × 도메인 × 상태를 조합한다. 예: 인간 = 생물학적 Asset + Actor, 코드 = 디지털 Asset + 실행 가능 Module, 브랜드 = 개념 Asset + 조직 Asset. |
| **Capability** (능력) | Asset이 노출하는 기능·입출력·상태·트리거·자격증명 참조·조작 진입점. 화면에서는 **파츠(Part)** 로 렌더링된다. |
| **Relation** (관계) | 두 Asset 또는 Capability 사이의 타입이 있는 계약. contains, calls, reads, writes, triggers, depends_on 등. 화면에서는 **연결선(Edge)** 으로 렌더링된다. |
| **Work** | 하나 이상의 Asset이 목적을 위해 상태를 변화시키는 일. |
| **Workflow** | Work, 조건, 이벤트와 Asset의 흐름을 연결한 구조. **Workflow 정의 자체도 버전이 있는 Asset**이다. |
| **Workflow Run** | 실행 중인 Workflow 인스턴스. |
| **Work Item** | Workflow Run 안의 개별 작업. |
| **Event** (사건) | 시각이 있는 실제 발생 기록. heartbeat, fetch, build, deploy, sync, failure 등. 결과는 다른 Asset의 상태 변경과 Evidence로 기록된다. |
| **Lens** (렌즈) | 무엇을 Asset으로 인식하고, 어느 정도로 쪼개며, 어떤 속성과 관계를 보여줄지 정하는 해석 규칙. |
| **Node** (노드) | Lens가 Asset을 캔버스에 표현한 형태. 위치·크기·접힘 등 표현 상태는 사용자 소유이며 Asset 비교에서 제외된다. **모든 노드가 Asset의 표현은 아니다** — Asset 바인딩(실체 근거)이 있는 노드만 Asset의 표현이고, 사용자가 자유롭게 그린 단계·메모·콘텐츠 노드는 캔버스 주석(기록)이다. 주석 노드는 근거가 생기면 Asset으로 승격할 수 있다. |
| **Asset Graph** | Asset, Capability, Relation, 신뢰영역, 게이트웨이, 근거, 정책, 조작을 담는 공통 사실 그래프. 내부 정규형의 이름은 TwinBuild다(§7). |

### 2.2 신뢰·근거 문법 (사실 계층)

| 표준 용어 | 정의 |
|---|---|
| **Evidence** (근거) | 그래프가 어떤 사실을 믿는 이유. 코드 위치, 스키마, API 응답, 서명 기록, 사람의 선언. **실제 비밀값은 절대 포함하지 않는다.** |
| **Observation** (관측) | 시각이 있는 상태 기록. 만료 기준을 가지며 오래되면 stale이 된다. |
| **Reality Level** (현실 수준) | 모든 Asset·Relation·Capability가 갖는 단일 축: `declared`(주장/설계) → `discovered`(발견) → `observed`(관측) → `runtime-verified`(실행 검증, 화면 표시 **LIVE**) / `stale`(오래됨) / `contradicted`(모순) / `unknown`(미확인). 클라이언트·AI·MCP 입력만으로는 절대 `runtime-verified`로 승격할 수 없다. |
| **Trust Zone** (신뢰영역) | 통제 주체와 접근 가정이 다른 보안 영역. 로컬 기기, 인트라넷, 사설/공개 클라우드, 외부 SaaS, 물리 공간 등. 이름이 안전을 뜻하지 않는다. |
| **Gateway** (게이트웨이) | Relation이 신뢰영역 경계를 넘는 유일한 모델링 지점. API 경계, VPN, 웹훅, 로컬 커넥터, 사람의 복사·전달 등. 게이트웨이 없는 교차는 `unknown-gap`으로 표시한다. |
| **Threat / Control** (위협/통제) | 위협은 정상 연결선과 분리된 잠재 침해 경로, 통제는 이를 예방·탐지·제한·복구하는 수단. |
| **Digital Twin** (디지털 트윈) | 검증된 runtime 근거로 실제 시스템과 연결된 Asset Graph. 근거 없는 구조도는 트윈이 아니라 선언이다. |

### 2.3 파이프라인·조작 문법 (동작 계층)

| 표준 용어 | 정의 |
|---|---|
| **시스템 가져오기** (System Onboarding) | 사용자가 자신의 소프트웨어·시스템을 캔버스에 올리는 전체 행위. 사용자 화면 용어. |
| **시스템 지도** (System Map) | 시스템 가져오기의 **결과물**. 하나의 소프트웨어 제품을 실체화한 Asset Graph 캔버스. `Workflow Canvas 시스템 지도`는 자기 자신을 온보딩한 첫 번째 시스템 지도다. |
| **Connector** (커넥터) | 근거를 가져오는 통로. GitHub API, 로컬 에이전트, 공급자 API 등. |
| **Adapter** (어댑터) | 특정 스택에 대해 **Lens(해석 규칙) + Connector(통로)** 를 묶은 배포 단위. 어댑터는 캔버스 JSON을 직접 바꾸거나 조작 계약을 우회할 수 없다. |
| **Twin Build** (트윈 빌드) | 수집한 근거를 공통 Asset Graph로 변환하는 결정적 과정. |
| **Reconciliation** (상태 대조) | 관측된 현실과 현재 캔버스의 차이를 검토 항목으로 만드는 과정. 사용자 배치·메모·검토 결정을 보존한다. |
| **Proposal** (수정안/제안) | 상태 대조가 만든, 승인 전의 변경 제안. 미리보기 시점의 지문에 결합되며 대상이 바뀌면 무효화된다. |
| **Materialization** (지도 실체화) | 승인된 Proposal을 실제 노드·파츠·연결선으로 반영하는 과정. |
| **Operation** (조작) | 계획·승인·실행·검증·감사·복구가 가능한 제한된 작업. 입력 스키마, 대상, 권한, 위험, 부작용, 실행 어댑터, 검증, 시간 제한, 멱등성, 복구 선언을 모두 가져야 실행 가능(`executable`)하다. |
| **Operation Lifecycle** (조작 수명주기) | `계획 생성 → 미리보기 → 승인 → 실행 → 독립 검증 → 감사 → 복구`. 사람의 직접 UI, 결정적 자동화, 미래 AI 모두 이 하나의 계약을 사용하며 우회 경로는 없다. |

### 2.4 표현 문법: 층(Layer)과 오버레이(Overlay)

캔버스는 서로 다른 관점을 한 평면에 섞지 않는다. 축을 둘로 나눈다.

**층은 모든 캔버스의 일반 기능이다.** 어떤 캔버스든 사용자가 층을 만들고,
이름 짓고, 순서를 정하고, 노드를 배정할 수 있다. 자기 지도 전용 기능이 아니다 —
사용자 입장에서 필요한 것을 만든다. 시스템 지도에서는 아래 L1~L4가 기본
프리셋으로 제공되며(보호됨), 그 외 층은 사용자 정의다.

**층(Layer) = 한 캔버스에서 사용자가 정한 하나의 분리 축.** 시스템 지도의
기본 축은 추상화 깊이이고, 표준 4층 (위→아래):

| 층 | 이름 | 담는 것 | 답하는 질문 |
|---|---|---|---|
| L1 | **경험 층** | 기능 Asset, 화면, Actor | 무엇을 할 수 있는가 |
| L2 | **앱 구조 층** | 프론트엔드, API, 서비스, 모듈 | 무엇이 돌아가는가 |
| L3 | **데이터 층** | DB, 테이블, 스토리지, 데이터 종류 | 데이터는 어디에 살고 어떻게 흐르는가 |
| L4 | **인프라 층** | 로컬 저장소, GitHub, Vercel, Supabase 인프라 | 어디에 사는가 |

**오버레이(Overlay) = 모든 층을 가로질러 칠하는 관점:**
보안(신뢰영역 색·게이트웨이·키 참조·unknown-gap), 데이터 흐름(특정 데이터 종류의
경로 하이라이트), 운영(LIVE/stale/오류 상태색), 변경(최근 바뀐 것).

**구현 원칙:**
- 2.5D 먼저: 층 = 저장 뷰 + 층 전환기. 층을 넘는 관계(기능→모듈→테이블)는 접힌
  수직 포털로 표시하고 클릭하면 아래층으로 내려간다. 기존 프리미티브(저장 뷰,
  그룹, LOD)를 재사용한다.
- 층 저장(확정, 배치 A): 사용자의 수동 지정만 노드 `data.presentation.layerOverride`에
  저장하고, Asset 노드의 기본 층은 결정적으로 매번 계산한다(순수 함수 + 회귀 테스트).
  실효 층 = 수동 지정 → 결정적 기본값. `presentation`은 Asset 비교에서 완전 제외.
  비-Asset 주석 노드는 생성 시점에 보고 있던 층을 layerOverride로 기록한다.
  층 지정 변경 권한 = 해당 노드의 이동 권한. 수직 포털은 저장하지 않는 일시적
  표현 요소이며, **포털 개수는 보는 사람의 redaction 이후 그래프 기준으로만
  계산한다** (시야 제한 참여자에게 숨은 Asset 존재 누출 금지).
- 3D는 나중에, 같은 데이터의 렌더러로만: 층을 쌓인 판(건물 단면도)으로 렌더링.
  **3D는 표시 방식이며 데이터 모델이 아니다. Z축의 의미는 추상화 깊이 하나다.**

**기능 판정 3등급.** 모든 기능을 노드로 만들지 않는다:

| 등급 | 판정 기준 | 표현 | 예 |
|---|---|---|---|
| **기능 Asset** | 독립 상태·근거·관계가 필요 (클릭해서 구현 코드·테이블·상태로 내려가야 함) | L1 노드 | 로그인, 공유·초대, Git 동기화 |
| **Capability** | 어떤 Asset이 노출하는 능력 | 소유 Asset의 파츠 | 실시간 동기화, API 엔드포인트 |
| **속성/관측** | 상태 관리가 필요 없는 사실 | Asset의 속성·관측값 (노드 아님) | 모바일 지원, PWA 설치 가능 |

기능 층의 시드는 Source Lens의 제품 영역 × 하위 시스템 분류다. 새로 발명하지 않고
이미 근거가 연결된 분류를 층으로 승격한다.

### 2.5 과거 용어 → 표준 용어 매핑

| 과거 용어 (코드/문서/화면) | 표준 용어 | 비고 |
|---|---|---|
| entity (TwinBuild) | **Asset** | wire 포맷 필드명 `entity`는 TwinBuild v4 전까지 유지, 개념 명칭만 즉시 통일 |
| 시스템 실체, system node | 시스템 Asset (의 Node 표현) | |
| 파츠, systemParts | **Capability** (화면 표현: 파츠) | 화면 라벨 "파츠"는 유지 |
| 관계 메타데이터 (relationType 등) | **Relation** | |
| 노드 배지 `설계`/`LIVE` | Reality Level `declared`/`runtime-verified` | 화면 라벨 유지, 개념 축 통일 |
| 관계 `주장`/`근거 기록`/`서버 검증` | Reality Level `declared`/`evidenced(=discovered)`/`runtime-verified` | 동일 축의 표현 |
| 트윈 어댑터 | **Adapter** (= Lens + Connector) | |
| 검토 (변경 검토) | **Reconciliation 검토** | 화면 라벨 "검토" 유지 |
| 수정안 | **Proposal** | 화면 라벨 "수정안" 유지 |
| 시스템 지도 (자기 지도만 지칭하던 용법) | **시스템 지도** = 온보딩 결과물의 일반 명칭 | `Workflow Canvas 시스템 지도`는 첫 번째 인스턴스일 뿐 |
| 논리 구성요소 (logical component) | 엔진 Asset (Reality Level: declared, LIVE 불가) | |

**규칙:** 새 코드·문서·대화는 표준 용어를 쓴다. 기존 화면 라벨(파츠, 검토, 수정안,
설계, LIVE)은 사용자에게 이미 익숙하므로 유지하되, 그 라벨이 어떤 표준 개념의 표현인지
이 표가 정의한다. wire 포맷 개명은 기능 변경이 필요한 스키마 버전 업그레이드에만 태운다.

---

## 2A. 시스템 가져오기 파이프라인 — 엔진 역할 분담

"어디까지 Asset으로 할지"의 결정은 **Lens의 책임**이고(Source Lens의 Source Profile이
세분화 규칙), "같은 대상인지"의 판정은 **Twin Core의 책임**이다. 온보딩에는 7개 엔진이
모두 참여한다:

| 온보딩 단계 | 담당 엔진 | 하는 일 |
|---|---|---|
| 연결·권한 동의 | Connector Bridge | 페어링, 최소 권한, 나가는 메타데이터 고지 |
| 발견 + Asset 후보·세분화 | Source Lens | 코드·DB·설정·배포를 읽고 무엇이 Asset이 될지 판정 |
| 정규화 + 동일성 | Twin Core | 공통 Asset Graph 정제, 동일 대상 식별, 캔버스 대조 |
| 경계·통로 | Trust Map | 신뢰영역, 게이트웨이, unknown-gap |
| 실체화 | Create Graph | 승인된 것만 층별 노드·연결선·배치로 |
| 첫 관측 | LiveOps | 온보딩 직후 상태 확인 |
| 조작 부착 | Safe Operations | 실행 가능한 파츠·연결선 조작 등록 |

**온보딩 자체가 Workflow다.** 한 번의 시스템 가져오기는 제품 최초의 실제 Workflow
Run으로 구현·시각화한다: 연결→발견→정규화→검토→실체화→관측의 각 단계가 Work Item으로
보이고, 사용자는 단계마다 "내 시스템의 무엇이 읽히고 있는지"를 확인·승인한다.

**보안 시각화의 정직한 범위:** 지도가 보여주는 것은 근거로 아는 통로 + 근거가 없는
구멍(unknown-gap)이다. "구멍이 안 보인다 = 안전하다"가 아니며, 침투 테스트의 대체물이
아니다. DB↔UI 매핑은 컴포넌트/모듈 수준이 목표이고 필드·픽셀 수준은 약속하지 않는다.

---

## 3. 제품 정체성 — 세 층

### ① 지금 파는 것 (첫 출시 범위)

**AI로 만든 소형 웹 앱을 운영하는 비개발자를 위한 관제실.**

- 대상 스택: GitHub + Vercel + Supabase, JavaScript/React 중심 소형 웹 앱
- 첫 고객: 바이브 코더, 1인 창업자, 작은 제품팀, 민감한 고객정보를 다루지 않는
  개인 프로젝트·프로토타입·초기 서비스
- 제공 가치: 코드가 제품에서 무슨 역할인지 근거와 함께 쉬운 말로 설명하고,
  DB·배포·인증·운영 상태를 확인 시각과 함께 보여주고, 승인된 제한 조작을 실행한다.

### ② 그 밑의 엔진 (재사용 가능한 코어)

범용성은 **Asset Kernel(TwinBuild 정규형)과 Lens/Adapter 계약**에 넣는다.
엔진 코어는 GitHub, Vercel, Supabase 같은 고유 명칭을 몰라도 동작해야 하며,
새 시스템 지원 = 어댑터 추가이지 엔진 재작성이 아니다.

### ③ 장기 비전 (약속하지 않되 막지 않는 것)

소프트웨어를 넘어 사업·물류·개인 생활까지 같은 온톨로지로 이해하고 조작하는
시각적 운영체제(Asset Graph OS). 물류·ERP·생활용 Lens를 꽂는 방식으로 확장한다.
**세상 전체를 처음부터 구현하지 않는다.** 실제 제품은 소프트웨어 디지털 트윈부터
깊게 완성한다. 첫 완성 사례는 Workflow Canvas 자체와 AI로 만든 소형 앱이다.

---

## 4. 불변 원칙

모든 단계에서 지켜온, 앞으로도 타협하지 않는 규칙이다.

1. **주장과 사실의 분리.** AI든 사람이든 그럴듯한 구조를 발명할 수 없다. 결정적
   증거가 먼저고, Reality Level 승격은 서버만 할 수 있다. 클라이언트가 LIVE를
   위조할 수 없도록 모든 저장 경계에서 runtime 필드를 제거한다.
2. **읽기 먼저, 조작은 계약을 통해서만.** 모든 실행은 미리보기·명시적 승인·독립
   검증·감사를 거친다. 임의 shell/SQL/URL은 어떤 경로로도 실행되지 않는다.
3. **비밀값은 이름만.** 키·토큰·본문 원문은 manifest, 캔버스, 근거, 응답 어디에도
   값이 들어가지 않는다.
4. **사용자 작업물 보존.** 재스캔·마이그레이션·상태 대조가 사용자의 배치, 메모,
   수동 분류, 검토 결정을 절대 덮어쓰지 않는다.
5. **정직한 한계 표시.** 해결 안 된 보안·개인정보 문제는 숨기지 않고 출시 게이트와
   부채 장부에 코드로 박아둔다. 종단간 암호화 전에는 "운영자도 못 본다"고 주장하지 않는다.
6. **최소 권한과 명시적 경계.** 모든 연결은 최소 권한·데이터 반출 범위를 선언하고,
   신뢰영역을 넘는 통로는 게이트웨이로 명시한다. 게이트웨이 없는 교차는 unknown-gap이다.
7. **교차 Lens 동일성도 근거가 있는 관계다.** 서로 다른 Lens가 만든 Asset이 같은
   대상이라는 판정(`same_as`)은 자동 확정하지 않는다. 근거 + 사람 승인이 필요하며,
   Asset의 병합·분리는 승인 조작이다.
8. **결정적 자동화 우선.** 고정된 timer, filter, routing, API 호출은 AI 없이 처리한다.
   AI는 해석·계획·종합·예외 판단에 가치가 있을 때만, 같은 조작 계약 위에서 사용한다.

---

## 5. 현재 기능 전체 목록

제품 영역 14개 기준. 상태: ✅ 배포됨 · 🔶 알파(배포됨, 다듬는 중) · 🧪 내부용.

### 캔버스 화면·편집 ✅
- 노드(단계/메모/콘텐츠/그룹/시스템) 생성·편집·리사이즈·삭제, 노드 팔레트, 우클릭 메뉴
- 그룹: 드래그로 포함/해제(면적 35% 겹침 판정), 그룹 내 생성, 그룹 강조
- 타입 관계 연결선: 40+ 관계 종류(7계열+custom), 관계 편집기, 라벨·상태점, 대칭 관계 화살촉 제거
- Relation 근거: 출처·작성자 신뢰도·근거 문장·참조, Reality Level 상태점(주황/청록/초록)
- 엣지: marker 결합 화살표, hover halo(Chrome/Safari 동일), 노드 테두리 접합, 파츠 소켓
- 저장 뷰, 단계 종류(stage type) 관리, 테마(라이트 기본)·노드 채우기, LOD, 미니맵
- 선택 노드/열린 파츠에서만 내부 스크롤(휠 라우팅)
- **L1~L4 층**: 시스템 지도 층 전환기, 결정적 기본 층 + layerOverride, 층 넘는
  관계의 수직 포털(일시적, redaction-안전 카운트), 주석 노드 생성 층 기록 (§2.4)

### 캔버스 구조·동기화 ✅
- `updated_at` CAS + 3-way 병합(자동 병합/충돌 팝업), dirty 스냅샷 큐
- Realtime 갱신(views/stageTypes/notes 포함), 비활성 캔버스는 메타데이터만
- 새로고침 복원(탭별 sessionStorage, 삭제·추방·미검증 캔버스 복원 차단)
- Undo/Redo(히스토리 100개, 텍스트 편집 중 브라우저 undo 우선)

### 노트·콘텐츠 ✅
- 노트 분할 창(리사이즈·좌우 배치), 독립 노트(`canvases.notes`) 생성·캔버스 승격
- 노드 "노트에서 열기", 상위/하위 노트 계층 탐색, 콘텐츠 노드(사진/데이터베이스/브라우저)

### 공유·협업 ✅
- 초대 범위: 캔버스/그룹/노드 × 읽기/편집 × 시야 제한, 링크·이메일 초대
- 다중 grant 합성(합집합 시야, 그룹별 편집), 참여자별 시야 제한 토글(소유자)
- 참여자 명단(수락 멤버만), 소유자 권한 관리(편집/읽기, 초대권한, 추방), 친구 시스템
- 서버 강제: 공유 API 게이트웨이(범위 검증, redaction, 무결성 검사), canvas-wide revocation
- PWA 공유 링크 단일 처리(launch_handler, Web Locks)

### 로그인·프로필 ✅
- Supabase Auth, 프로필(닉네임/글리프/색), 저장 상태 피드백, 팀 가시성(같은 캔버스 수락 멤버끼리)
- 계정별 localStorage 격리, 클라우드 하이드레이션 게이트

### 디지털 트윈 엔진 🔶
- **TwinBuild v3** 정규형(Asset·Capability·Relation·신뢰영역·게이트웨이·근거·데이터 종류·정책·관측·사건·통제·위협·logical component), v0→v3 전진 마이그레이션
- **Adapter 계약 v1**(describe/canInspect/inspect/normalize/reconcile), 레지스트리, 설명서 지문 검증
- 상태 대조(Reconciliation) + 검토 패널, Proposal(add_node/add_edge/add_part/replace_part, 지문 결합, 중복·변조·의존성 차단)
- 자기 트윈 캔버스(`Workflow Canvas 시스템 지도`): 소유자 전용 생성·점검 MCP 도구
- 시스템 발견 manifest(`discover:update/check`) — 코드·SQL·설정의 이름·지문만 수집
- 엔진 구성층: Engine Registry v1(7 엔진 + 내부 18 구성요소), Capability Mapper, Maintainer Agent manifest 계약(현재 전원 미배정)
- 골든 픽스처: 주문 서비스(두 번째 어댑터 계약 검증)

### 코드 구조·Git 동기화 🔶
- 소스 트윈: Babel AST/SQL 스캔, 파일·함수·API·DB 참조 구조(본문 미수집)
- 한국어 쉬운 설명 + 개발자 정보 모드, 설명 근거(생성 방식+실제 참조) 전 엔티티 연결
- 14 제품 영역 × 36 하위 시스템 분류, 검색 자동 펼침
- 로컬 커넥터: 범위 제한 토큰(해시 저장), 읽기 전용 기본, 10초 heartbeat, 등록 구분(연결됨/오프라인/연결 전)
- Git 동기화 조작: 코드 파츠 소켓 간 방향성 실행(일반 push / ff-pull만), 계획→웹 승인→로컬 터미널 확인→실행 후 상태 검증
- GitHub push webhook 신호(선택 설정), 통합 스냅샷 생성·비교

### AI·MCP 연결 ✅
- MCP 서버(21 도구): 캔버스 CRUD, create_graph 레이아웃 엔진, 관계·시스템 필드, update_edge(s)
- 토큰: SHA-256 해시 저장, 1회 노출 UI
- MCP는 AI 클라이언트와 엔진을 잇는 Gateway다. 자율 AI 운영 엔진은 아직 없다.

### 데이터 저장·실시간 동기화 ✅
- 로그인 시 요약만 페이지 로드(본문은 활성 캔버스만), 요청 순번으로 늦은 응답 차단
- `get_canvas_summaries` 서버 집계, 공유 분류 페이지 처리

### 이미지·파일 ✅
- 비공개 Supabase Storage(`canvas-images`), scope 재검사 RLS, 5분 signed URL, data-URL 자동 이전

### 보안·개인정보 🔶
- RLS 전면(+WITH CHECK), SECURITY DEFINER 함수 PUBLIC/anon 회수, auth 가드
- CSP/HSTS/nosniff/frame 차단/no-referrer/Permissions Policy, 민감 응답 no-store
- 이중(브라우저+서버) HTML sanitizer, 위험 URL·SVG/MathML 차단
- 서비스 역할 본문 접근 감사(append-only, UPDATE 불가), `WORKFLOW_CANVAS_ACCESS_AUDIT_MODE=required`
- **개인정보 출시 게이트**: `WORKFLOW_CANVAS_PUBLIC_RELEASE=true` 빌드는 운영자 비열람
  저장이 구현되기 전까지 의도적으로 실패(`blocked-pending-operator-blind-storage`)
- 운영 관측 증거 저장소(`system_runtime_observations`, append-only, 서버 전용)

### 배포·운영 🔶
- Vercel 서버리스(공유 API, MCP, system-runtime, source-twin, webhook), GitHub 연동 배포
- 운영 대시보드: 전체 점검 버튼, 노드·연결선 상태색, 관측 카탈로그(6종, 가용성 6단계, 보호 필드 잠금)
- 런타임 확인: Vercel/공유 API/MCP 경로/Auth/RLS/서비스 집계 — 등록 운영자
  (`WORKFLOW_CANVAS_OWNER_USER_ID`) 전용, 15분 stale 강등

### 테스트·품질 ✅
- 로직 테스트 195+개, SQL 보안 계약 테스트, 트윈 계약·TwinBuild·조작 수명주기·소스 트윈 테스트
- governance:check(의존성 13개), SBOM 생성, privacy:check(출시 게이트)

### 프로젝트 기반·공통 규칙 ✅
- 오픈소스 정책(대형 의존성은 사용자 승인 후), 의존성 결정 기록, THIRD_PARTY_NOTICES
- CLAUDE.md 행동 규칙, 부채 장부(docs/TECHNICAL_DEBT.md, 안정 ID + 종료 조건)

---

## 6. 엔진 카탈로그

사용자 표시명은 짧게 유지한다. 내부에서는 Engine/Contract/Resolver/Builder/Pipeline/
Agent Skill/Agent Policy/Hard Guardrail/Connector/Manifest를 구별한다
(원본: `shared/engineRegistry.js`, 색인: `docs/product/ENGINE_AGENT_REGISTRY.md`).

| 엔진 | 역할 | 상태 |
|---|---|---|
| **Twin Core** | 모든 Lens의 결과를 공통 Asset Graph로 정규화하고 동일 대상을 식별, 현재 캔버스와 대조 | 알파 |
| **Create Graph** | Asset과 관계를 검증·배치해 실제 캔버스 노드·연결선으로 생성 | 알파 |
| **Source Lens** | 코드·DB·설정·배포를 분석해 설명하고, 근거에 따라 기능 Asset·Capability·속성의 표현 경계(Feature Boundary Resolver)를 결정. 디지털 소프트웨어 세계 담당 전문 Lens | 알파 0.3 |
| **Trust Map** | 신뢰영역·게이트웨이·확인되지 않은 통로(unknown-gap) 구별 + 보안 오버레이 렌더링 | 알파 0.2 |
| **LiveOps** | 확인 가능한 운영 상태, 관측 시각, stale 표시 | 알파 |
| **Safe Operations** | 계획·승인·실행·검증·감사·복구를 거치는 제한 조작 | 알파 |
| **Connector Bridge** | 로컬 저장소·외부 시스템을 공통 계약으로 연결 | 개발용 알파 |

### 미래 Lens 후보 (미구현 — 착수 조건 §9)

| Lens | 역할 | 착수 조건 |
|---|---|---|
| **Reality Lens** | 현실 세계에 존재하거나 실제 상태를 가진 사람·조직·장소·사물·금융 대상을 **관측 근거(사진, 센서, 문서, API, 사용자 입력)를 통해** Asset Graph로 변환. 엔진이 현실을 임의로 추측하지 않는다 | 운영자 비열람 저장(개인 데이터 전제) |
| **Decision Lens** | 대화·회의·문서를 분석해 아이디어, 제안, 결정, 계획, 전략 버전으로 실체화 | 운영자 비열람 저장 + Source Lens 2스택 검증 |

---

## 7. 계약·스키마 버전 현황

| 계약 | 버전 | 위치 |
|---|---|---|
| TwinBuild (Asset Graph 정규형) | v3 (v0→v1→v2→v3 전진 마이그레이션) | `shared/twinBuild.js` |
| Adapter 계약 | v1 | `shared/twinAdapterContract.js`, `docs/TWIN_ADAPTER_CONTRACT.md` |
| Operation Lifecycle | v1 | `shared/operationLifecycle.js`, `docs/OPERATION_LIFECYCLE_CONTRACT.md` |
| Engine Registry | v1 | `shared/engineRegistry.js` |
| Maintainer Agent Manifest | v1 (전원 미배정) | `docs/product/ENGINE_AGENT_REGISTRY.md` |
| Source Profile 계약 | v1 (+ Feature Model extension v1) | `docs/architecture/SOURCE_PROFILE_CONTRACT.md`, `shared/sourceProfileContract.js`, `shared/sourceFeatureModel.js` |
| 관측 카탈로그 (런타임 스키마) | v3 | `shared/systemObservationCatalog.js`, `shared/systemRuntime.js` |
| Security Overlay Schema | v1 | `shared/securityOverlay.js`, `shared/trustTopology.js`, `shared/workflowTrustTopology.js` |

**버전 규칙:** 제품·각 엔진·스키마는 독립 SemVer. `0.x`는 약속 미고정. 호환되지 않는
변경에는 전진 마이그레이션 + fixture 테스트 필수. `1.0.0`은 공개 약속·지원 범위·
출시 차단 부채가 검증된 뒤에만. **TwinBuild v4에서 wire 필드 `entity`→`asset` 개명과
조합형 Asset 종류(facet)를 함께 도입한다** — 그 전에는 개념 명칭만 통일한다(§2.4).

---

## 8. 보안·개인정보 현황과 출시 게이트

### 지금 사실인 것
- 권한은 서버·RLS에서 검증되고, 알려진 우회면(클라이언트 위조, redaction 우회,
  scope 탈출)은 테스트로 고정돼 있다.
- 서비스 역할의 본문 접근은 append-only 감사에 기록된다.

### 지금 사실이 아닌 것 (주장 금지)
- **운영자 비열람**: 서비스 역할·DB 운영 권한은 캔버스 JSON을 읽을 수 있다.
  종단간 암호화 전에는 "운영자도 못 본다"고 말하지 않는다.
- 감사 로그는 내부 책임 기록이지 외부 검증 가능한 불변 원장이 아니다.
- MCP 커넥터 URL에 비밀 토큰이 들어갈 수 있다(로그·기록 위험 잔존).
- 절대 뚫리지 않는 시스템은 보장할 수 없다.

### 출시 게이트 (공개 출시 전 필수)
1. 운영자 비열람 저장: 클라이언트 암호화, 참여자 키 래핑, 복구 키, 암호문 충돌 처리,
   MCP 키 위임 → 완료 전 `WORKFLOW_CANVAS_PUBLIC_RELEASE` 불가
2. 서명된 데스크톱 로컬 헬퍼: 현재 터미널 명령 방식은 내부 MVP 전용. 공개판은
   OS 폴더 권한, sandbox, Keychain, pairing code, 서명 업데이트 필요
3. 번들·성능 예산: 어댑터 대형 청크(~1.67MB)의 PWA precache 분리, CI 예산 고정
4. 상세: `docs/TECHNICAL_DEBT.md` (안정 ID + 종료 조건으로 관리)

---

## 9. 로드맵

### 다음 제품 순서 (단기, 확정)
1. ~~**층 공식화**~~ ✅ 완료 (배치 A, 커밋 `9e84e2a`) — L1~L4 층 뷰 + 층 전환기,
   결정적 기본 층 유도, layerOverride, redaction-안전 수직 포털.
1-2. **층 일반화 (배치 A2)** — 층을 모든 캔버스의 사용자 기능으로: 층 생성·이름·
   순서·삭제, 시스템 지도의 L1~L4는 보호된 기본 프리셋. 배치 A가 자기 지도
   전용으로 좁게 나간 것의 교정.
2. ~~**기능 층 생성**~~ ✅ 완료 (배치 B, 커밋 `24a36e6`) — Feature Boundary
   Resolver가 제품영역·하위시스템을 근거 기반으로 feature-asset/capability/속성 3등급
   판정, L1 기능 Asset Proposal(영역 8 → 하위 9 → 근거 관계 ≤20개씩). FastAPI
   참조 프로필로 엔진 범용성 검증.
3. ~~**보안 오버레이**~~ ✅ 완료 (배치 C, 커밋 `c974fdb`) — 자기 지도에 신뢰영역
   6·게이트웨이 11 근거 선언 + Proposal 실체화, 층 전환기 옆 토글(기본 꺼짐), 노드
   테두리+배지, 게이트웨이 ◈/unknown-gap ! + 팝업, redaction-안전. 침투 테스트 아님.
4. **Source Profile 분리 완성 + Python/FastAPI 두 번째 실제 스택 검증 + 온보딩
   마법사 v1** — 범용 온보딩의 첫 실전 시험 = 두 번째 스택. 온보딩은 Workflow Run으로
   시각화(§2A). 실패하면 엔진 코어에 숨은 전용 가정이 드러난다(그것도 가치 있는 결과다).
   두 번째 스택의 조작은 `declared/planned`로만 시작한다.
5. **제한 조작 확대 (Engine 1.x)** — 테스트, 상태 확인, 비강제 Git 동기화 중심.
6. **번들 분리와 성능 예산 CI 고정.**

### 조작 자유도 (엔진 버전 전략)
- **Engine 0.x** (현재): 읽기와 상태 대조. 일반 대상 변경 금지
- **Engine 1.x**: 안전한 핵심 조작 — health check, test, 일반 push/ff-pull, 멱등 재시도
- **Engine 2.x**: 되돌릴 수 있는 서비스 조작 — 승인된 배포, 재시작, feature flag, rollback
- **Engine 3.x**: 고위험 데이터·보안 조작 — migration, 권한 변경, credential rotation (다중 승인 + break-glass)
- **Engine 4.x**: 샌드박스 확장 — 사용자 어댑터, 도메인 팩, 마켓플레이스

자유도는 임의 코드 실행이 아니라 **검증 가능한 타입이 있는 조작 능력 추가**로 높인다.

### AI 오케스트레이션 (결정적 기반 안정 후)
실행 방식 모델: 대화형 / 일회성 / 예약형 / 이벤트 반응형 / 상시형 / 사람 수행형.
연결 순서: 일회성 읽기·설명 → 일회성 수정안 → 승인된 일회성 조작 → 예약형 →
이벤트 반응형 → 상시형. 외부 AI는 `external-saas` 신뢰영역이며 전송 데이터가 명시된
게이트웨이 필수. 상시형은 durable queue, lease, heartbeat, kill switch, 감사 없이 금지.
브라우저·서버리스 요청을 24시간 AI 프로세스로 쓰지 않는다.

### Workflow 계층 (미래 확장)
현재 Operation이 Work의 첫 구현체다. 이후 Workflow 정의(버전 Asset) → Workflow Run →
Work Item → Event 추적을 같은 조작 계약 위에 얹는다.
예: `주문 Workflow v3 → 주문 실행 #1842 → 결제 Work → 재고 감소 → 배송 요청 생성`
전체가 추적 가능해야 진짜 운영체제다.

### Lens 확장 (장기)
Reality Lens, Decision Lens → 물류·ERP·사업·개인 생활 Lens.
**착수 조건이 로드맵 순서보다 우선한다**: 개인 데이터를 다루는 Lens는 운영자 비열람
저장 완성 전에 시작하지 않는다.

---

## 10. 약속하지 않는 것 (현재 버전)

- 모든 언어·저장소·클라우드 자동 지원
- 의료·금융·공공·대기업 수준의 보안 보증
- 운영자도 본문을 볼 수 없다는 종단간 암호화 보증 (완성 전까지)
- AI의 완전 자율 운영과 24시간 에이전트
- 사업과 생활 전체의 즉시 자동화
- 3D 화면이 2D보다 의사결정을 개선한다는 보장 (3D는 데이터 모델이 아니라 표시 방식이며,
  Z축은 시간·추상화 깊이·의존 단계 등 사용자가 선택한 하나의 의미만 표현해야 한다)

---

## 11. 문서 지도와 읽기 프로토콜

문서는 4개 등급으로 나뉜다. **AI는 0등급만 항상 읽고, 나머지는 작업이 해당할 때만
그 문서(가능하면 해당 절만)를 읽는다.** 토큰을 아끼는 것이 규칙이다.

| 등급 | 문서 | 읽는 시점 |
|---|---|---|
| **0 필수** | `CLAUDE.md` (행동 규칙), **`docs/MASTER.md` (이 문서)** | 모든 작업 시작 전. MASTER는 §2 용어 + §4 원칙 + 작업 관련 절만 읽어도 된다 |
| **1 계약** | `docs/TWIN_ADAPTER_CONTRACT.md` · `docs/TWIN_BUILD_SCHEMA.md` · `docs/OPERATION_LIFECYCLE_CONTRACT.md` · `docs/architecture/SOURCE_PROFILE_CONTRACT.md` | 해당 계약을 구현·변경할 때만 |
| **2 장부** | `docs/TECHNICAL_DEBT.md` (해당 ID만) · `docs/AUDIT_PLAYBOOK.md` · `docs/product/ENGINE_CHANGELOG.md` · `docs/architecture/DEPENDENCY_DECISIONS.md` + `dependency-registry.json` | 부채 등록/해소, 점검일, 엔진 버전 변경, 의존성 추가 시만 |
| **3 부록** | `docs/product/PRODUCT_CATALOG.md` · `docs/TWIN_ENGINE_ROADMAP.md` · `docs/product/ENGINE_AGENT_REGISTRY.md` · `docs/architecture/OPEN_SOURCE_POLICY.md` | 그 영역의 세부가 필요할 때만. **방향·용어가 이 문서와 충돌하면 이 문서가 이긴다** |

작업 유형별 최소 읽기:

| 작업 | 읽기 |
|---|---|
| 단순 버그픽스, UI 수정 | CLAUDE.md + MASTER §2·§4 (끝) |
| 어댑터/TwinBuild/Lens 작업 | + 1등급 해당 계약 |
| 조작(Operation) 추가·변경 | + OPERATION_LIFECYCLE_CONTRACT.md |
| 보안·공유·인증·커넥터 변경 | + TECHNICAL_DEBT.md 관련 ID |
| 엔진 추가·개명·버전 변경 | + engineRegistry.js, ENGINE_CHANGELOG.md |
| 의존성 추가 | + OPEN_SOURCE_POLICY.md, DEPENDENCY_DECISIONS.md |

---

## 12. 협업 프로세스 (역할 분담)

이 프로젝트는 사람 1명 + AI 2종이 고정된 역할로 일한다:

**현재 편성 (2026-07-17~, Codex는 토큰 한도로 당분간 휴무):**

| 역할 | 담당 | 하는 일 |
|---|---|---|
| **기획·계획** | 사용자 + Claude Code | 방향·용어·우선순위 결정, MASTER.md 관리 |
| **설계·구현·검수·배포** | Claude Code | 설계, 구현, 테스트·빌드·보안 표면 검증, 커밋, GitHub push, Vercel 배포, SQL 실행 안내, MASTER.md 버전 갱신 |
| **최종 확인** | 사용자 | 배포 후 실제 화면·E2E 수동 확인, SQL 실행 |

구현자와 검수자가 같아진 만큼 다음을 강제한다:
- 검증 게이트(테스트·빌드·보안 경계·manifest 정합) 없이 배포하지 않는다.
- 구현 중 택한 지름길·중복·사각지대는 그 자리에서 `TECHNICAL_DEBT.md`의
  QUAL 항목으로 기록한다 (`docs/AUDIT_PLAYBOOK.md` 상시 규칙).
- 사용자가 요청하면 언제든 점검일 절차를 실행한다 (AUDIT_PLAYBOOK §2).

Codex가 복귀하면 이전 편성(기획: 사용자+Claude / 구현: Codex / 검수·배포:
Claude)으로 되돌릴 수 있으며, 그때도 전달 문서 관행(기준 커밋, SHA-256,
검증 결과)은 유지한다.

**시스템 지도 최신성 규칙:** 배치가 시스템 지도 템플릿·모델을 바꾸면 배포 후
기존 지도를 항상 최신 패치 기준 최선의 상태로 갱신한다 — 그대로 두고 추가만
하는 게 아니라 바꿀 것은 바꾼다. 갱신은 검토(Proposal) 경로 또는 사용자 동의된
직접 갱신으로 하되, **사용자의 노드 배치·메모·검토 결정은 항상 보존**한다
(사용자가 배치를 직접 다듬는다는 전제).

---

## 13. 문서 관리 규칙

1. **이 문서가 단일 기준(single source of direction)이다.** 방향·용어·범위가 바뀌면
   반드시 이 문서를 함께 고치고 버전을 올린다.
2. **버전 규칙 (SemVer):**
   - **MAJOR**: 중심 문장, Asset 문법, 불변 원칙의 변경
   - **MINOR**: 기능 추가/제거, 로드맵 순서 변경, 용어 추가, 엔진 추가
   - **PATCH**: 오탈자, 상태 갱신(알파→베타 등), 링크 수정
3. 모든 개정은 아래 변경 이력에 한 줄을 추가한다.
4. AI 세션(Claude Code, Codex)은 작업 시작 전 §11 읽기 프로토콜을 따르고, 용어는
   §2를 따르며, 방향과 어긋나는 요구를 받으면 그 충돌을 사용자에게 먼저 보고한다.
5. 화면 라벨 변경은 §2.5 매핑표 갱신과 함께만 허용한다.

## 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 0.3.0 | 2026-07-17 | 층 문법 교정: 층은 자기 지도 전용이 아니라 **모든 캔버스의 사용자 기능**(생성·이름·순서·삭제), L1~L4는 시스템 지도 기본 프리셋 — 배치 A2로 구현. 역할 편성 변경: Codex 휴무, 구현·검수·배포 모두 Claude Code + 자기검수 보완 장치. 시스템 지도 최신성 규칙(§12). 점검 제도 신설: AUDIT_PLAYBOOK.md + QUAL 품질 장부. |
| 0.3.2 | 2026-07-17 | 배치 C 배포 완료 기록. 보안 오버레이: 자기 지도 신뢰영역 6·게이트웨이 11 근거 선언 + Proposal 실체화, 층 전환기 옆 토글(기본 꺼짐), 노드 테두리+배지·게이트웨이 팝업·unknown-gap 경고, redaction-안전·비밀값 차단. Trust Map 0.2.0-alpha.0 + Security Overlay Projector + Security Overlay Schema v1. 전부 declared(LIVE·침투테스트 아님). |
| 0.3.1 | 2026-07-17 | 배치 B 배포 완료 기록. Source Lens 0.3.0-alpha.0(Feature Boundary Resolver 구성요소 추가), Workflow Canvas Source Profile 0.3.0, FastAPI 참조 0.2.0, Source Profile Contract v1의 Feature Model extension v1. 신규 온톨로지: systemKind `feature`→L1, part kind `capability`, relationType `implemented_by`. 기능 Asset은 declared(LIVE 아님). 계약 버전 현황·엔진 카탈로그 갱신. |
| 0.2.2 | 2026-07-17 | 배치 A 배포 완료 기록: 시스템 지도 L1~L4 층 공식화(층 전환기, 결정적 기본 층, layerOverride, redaction-안전 포털). 로드맵 §9-1 완료 표시, 기능 목록 갱신. |
| 0.2.1 | 2026-07-17 | Node 정의 명확화: Asset 바인딩 있는 노드만 Asset의 표현, 자유 작성 노드는 캔버스 주석(승격 가능). 배치 A 층 저장 설계 확정 기록(layerOverride 수동 지정만 저장, 기본값 결정적 계산, 포털 개수는 redaction 이후 계산). |
| 0.2.0 | 2026-07-16 | 시스템 지도 = 온보딩 결과물로 재정의. 층·오버레이 표현 문법(§2.4, 4층+Z축=추상화 깊이, 2.5D 먼저), 기능 판정 3등급, 온보딩 파이프라인 엔진 역할 분담 + 온보딩=Workflow Run(§2A), 보안 시각화 정직한 범위, 로드맵 단기 순서 개편(§9), 문서 지도 4등급 + 읽기 프로토콜(§11), 협업 프로세스 역할 분담(§12). |
| 0.1.0 | 2026-07-16 | 최초 작성. Asset Graph OS 핵심 정의, 표준 용어집(과거 용어 매핑 포함), 3층 제품 정체성, 불변 원칙 8개, 현재 기능 전체 목록(14 영역), 엔진 카탈로그, 계약 버전 현황, 출시 게이트, 로드맵, 문서 지도. |
