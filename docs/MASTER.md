# Workflow Canvas OS 마스터 문서

> 이 문서는 **사용자가 소유하고 기획하는 사람용 제품 정본**이다.
> 이 프로젝트의 **모든 기능과 방향성을 담은 단 하나의 기준 문서**이며, AI 작업을 위한
> 빠른 읽기·지휘 진입점은 [`AI_MASTER.md`](./AI_MASTER.md)로 분리한다. AI용 문서는 이 문서의
> 결정을 요약·라우팅할 뿐 새로운 제품 방향을 만들거나 이 문서를 대신하지 않는다.
> 다른 모든 문서(로드맵, 카탈로그, 부채 장부, 계약서)는 이 문서의 세부를 보충하며,
> 방향이나 용어가 충돌하면 **이 문서가 우선**한다. 충돌을 발견하면 이 문서를 고치는 것이
> 아니라 충돌 자체를 해소하는 변경을 만들고 이 문서의 버전을 올린다.

| 항목 | 값 |
|---|---|
| 문서 버전 | **0.15.0** |
| 최종 수정일 | 2026-07-23 |
| 제품 버전 | 0.1.0-alpha.0 (내부 알파) |
| 관리 규칙 | 이 문서 맨 아래 §13 |

---

## 1. 중심 문장

> **모든 것은 Asset이 되고, Asset은 관계를 맺고, 관계된 Asset은 Work를 수행하며,
> Work의 흐름은 Workflow가 된다. Lens는 근거를 통해 세상을 Asset으로 해석하고,
> Asset Build는 그것을 운영 가능한 Asset 원장으로 정제한다. 주장과 사실은 항상 구분된다.**

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
과거 용어는 §2.5 매핑표를 따라 점진적으로 교체한다.

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
| **Asset 원장** (Asset Base) | Asset, Capability, Relation, 신뢰영역, 게이트웨이, 근거, 정책, 조작을 공급자 중립 정규형으로 보존하는 공통 사실 원장. 현행 wire 스키마의 코드 이름은 `TwinBuild` v3이며 사람용 개념 이름은 Asset 원장이다(§7). |
| **코드 Asset 계층** | 소프트웨어 시스템 지도의 표준 계층: **제품 영역 > 서브시스템 > 컴포넌트 > 모듈 > 코드 파츠**. **모듈** = 저장소에 실재하는 코드 단위(파일·함수)의 Asset. **컴포넌트** = 흩어진 모듈을 우리가 정제해 묶은 분류(엔진이 첫 사례) — 저장소 구조가 아니므로 코드에 반영되지 않는다. **서브시스템** = 컴포넌트의 상위 분류(현행 Source manifest의 wire 이름 `Source Twin`에서 '하위 시스템'으로 부르던 38개가 이 계층에 해당). 발견된 workflow(userflow)는 먼저 파츠로 표현하고, 승격 시 컴포넌트 계층의 Asset이 된다. |
| **코드 파츠** | 모듈 Asset 안에서 AST 근거로 분류된 코드 단위: 선언 · 명령 · 가정/분기 · 반복 · 응답/반환, 그리고 리소스 · 설정(config) · 데이터. 각 파츠는 자연어 번역과 (엔진 능력 범위 안에서) 직접 수정 화면을 갖는다. 수정은 근원 코드 저장소에 실제 반영되어야 하며 ENG-006 왕복 편집 계약을 따른다. |

### 2.2 신뢰·근거 문법 (사실 계층)

| 표준 용어 | 정의 |
|---|---|
| **Evidence** (근거) | Asset 원장이 어떤 사실을 믿는 이유. 코드 위치, 스키마, API 응답, 서명 기록, 사람의 선언. **실제 비밀값은 절대 포함하지 않는다.** |
| **Observation** (관측) | 시각이 있는 상태 기록. 만료 기준을 가지며 오래되면 stale이 된다. |
| **Reality Level** (현실 수준) | 모든 Asset·Relation·Capability가 갖는 단일 축: `declared`(주장/설계) → `discovered`(발견) → `observed`(관측) → `runtime-verified`(실행 검증, 화면 표시 **LIVE**) / `stale`(오래됨) / `contradicted`(모순) / `unknown`(미확인). 클라이언트·AI·MCP 입력만으로는 절대 `runtime-verified`로 승격할 수 없다. |
| **Trust Zone** (신뢰영역) | 통제 주체와 접근 가정이 다른 보안 영역. 로컬 기기, 인트라넷, 사설/공개 클라우드, 외부 SaaS, 물리 공간 등. 이름이 안전을 뜻하지 않는다. |
| **Gateway** (게이트웨이) | Relation이 신뢰영역 경계를 넘는 유일한 모델링 지점. API 경계, VPN, 웹훅, 로컬 커넥터, 사람의 복사·전달 등. 게이트웨이 없는 교차는 `unknown-gap`으로 표시한다. |
| **Threat / Control** (위협/통제) | 위협은 정상 연결선과 분리된 잠재 침해 경로, 통제는 이를 예방·탐지·제한·복구하는 수단. |
| **Digital Twin** (디지털 트윈) | 제품 전체가 실제 시스템과 근거로 연결된다는 점을 설명하는 **대외 소개 전용 서술어**. 내부 메커니즘·Engine·과정·상태 이름으로 사용하지 않는다. 개별 Asset·Relation·Capability의 정식 검증 상태는 Reality Level `runtime-verified`이며 화면에는 **LIVE**로 표시한다. |

### 2.3 파이프라인·조작 문법 (동작 계층)

| 표준 용어 | 정의 |
|---|---|
| **스타팅 프로토콜** (Starting Protocol) | 사용자가 프로젝트를 처음 접하게 한 뒤, 사용자 소유 Project Master를 만들고 교정하며 상대 개발 AI의 유지 규칙과 실제 강제 수준을 준비해 System Onboarding에 넘기는 **큰 선행 과정**이다. 각 Stage는 Engine Capability, Skill·Policy·Guardrail, Adapter·Connector, Host와 사람 검토를 필요에 따라 조합한다. Engine이 아니며 최초 가동 시작점과 최종 앱 형태는 아직 미정이다. |
| **Project Master** | 대상 프로젝트의 목적·사용자·목표·범위·기능·흐름·제약·결정·미확인을 담는 사용자가 소유하고 수정하는 단 하나의 전체 기획 정본. 코드의 실제 동작 증거는 아니다. |
| **Starting Bundle** | 승인된 Project Master 기준점, 사용자 확인, Entry Record와 상대 AI Enrollment·강제 수준을 System Onboarding에 넘기는 선행 결과물. |
| **시스템 가져오기** (System Onboarding) | 사용자가 자신의 소프트웨어·시스템을 캔버스에 올리는 전체 행위. 사용자 화면 용어. |
| **시스템 온보딩 프로토콜** (System Onboarding Protocol) | 시스템 가져오기의 전체 순서·Stage 소유권·입출력·승인·실패·재개·완료 조건을 정한 버전형 **큰 과정**이다. 각 Stage는 하나 또는 여러 Engine Capability와 Contract·Adapter·Skill·Policy·Guardrail·Host·사람 검토를 조합할 수 있다. Engine이나 Engine 내부 Pipeline이 아니며, 실행 가능한 Workflow Definition과 실제 Workflow Run을 포함한다. |
| **시스템 지도** (System Map) | 시스템 가져오기의 **결과물**. 하나의 소프트웨어 제품에 관한 Asset 원장을 지도 형태로 표현한 캔버스. `Workflow Canvas 시스템 지도`는 자기 자신을 온보딩한 첫 번째 시스템 지도다. |
| **Engine** (엔진) | 계약에 따라 특정 상태 변환을 반복 수행하는 **버전이 있는 재사용 능력 단위**. Engine은 Component를 소유하고 여러 Workflow의 Stage에서 호출된다. Engine 자체는 Workflow 정의나 Workflow Run이 아니다. |
| **Connector** (커넥터) | 외부 시스템·로컬 기기·다른 프로세스처럼 경계를 넘어 실제로 송수신하는 최소 권한 통로. 대상·Grant·인증·전송·응답 검증·출처를 다루되 제품 의미와 동일성을 판정하지 않는다. |
| **Adapter** (어댑터) | 특정 도구·provider의 입력과 출력을 한 Workflow Stage의 공통 Engine Contract에 맞추는 교체 가능한 구현. 통신이 필요하면 Connector를 호출하며, 그 자체로 권한·제품 의미·조작 승인을 소유하지 않는다. |
| **Asset Build** | 수집한 근거를 공통 Asset 원장으로 변환하는 결정적 과정. |
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
  표현 요소이며, **포털 개수는 보는 사람의 redaction 이후 지도 기준으로만
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
| `entity` (Asset 원장 wire) | **Asset** | **완료(산문 전면 교체).** wire 필드명 `entity`는 현행 스키마 코드 이름 `TwinBuild`의 v4 개편 전까지 유지 |
| 시스템 실체, system node | 시스템 Asset (의 Node 표현) | |
| 파츠, systemParts | **Capability** (화면 표현: 파츠) | 화면 라벨 "파츠"는 유지 |
| 관계 메타데이터 (relationType 등) | **Relation** | |
| 노드 배지 `설계`/`LIVE` | Reality Level `declared`/`runtime-verified` | 화면 라벨 유지, 개념 축 통일 |
| 관계 `주장`/`근거 기록`/`서버 검증` | Reality Level `declared`/`evidenced(=discovered)`/`runtime-verified` | 동일 축의 표현 |
| `Twin Adapter Contract` (레거시 코드·계약명) | **새 이름 없음** | 분해 전까지 현행 코드·Contract 이름만 호환을 위해 유지한다. 신규 설계에서는 같은 프로세스 변환은 Adapter, 경계 통신은 Connector로 책임을 구별하되 이 레거시 계약을 대신할 새 이름을 발명하지 않는다. |
| 검토 (변경 검토) | **Reconciliation 검토** | 화면 라벨 "검토" 유지 |
| 수정안 | **Proposal** | 화면 라벨 "수정안" 유지 |
| 시스템 지도 (자기 지도만 지칭하던 용법) | **시스템 지도** = 온보딩 결과물의 일반 명칭 | `Workflow Canvas 시스템 지도`는 첫 번째 인스턴스일 뿐 |
| 논리 구성요소 (logical component) | 엔진 Asset (Reality Level: declared, LIVE 불가) | |

**규칙:** 새 코드·문서·대화는 표준 용어를 쓴다. 기존 화면 라벨(파츠, 검토, 수정안,
설계, LIVE)은 사용자에게 이미 익숙하므로 유지하되, 그 라벨이 어떤 표준 개념의 표현인지
이 표가 정의한다. wire 포맷 개명은 기능 변경이 필요한 스키마 버전 업그레이드에만 태운다.

---

## 2A. 스타팅 프로토콜 — 온보딩 전 준비

Starting Protocol은 사용자가 자신의 프로젝트를 Workflow Canvas 또는 그 지시를 따르는 AI
환경과 처음 만나게 한 뒤, 프로젝트 전체 기획 정본과 상대 개발 AI의 유지 규칙을 준비해
System Onboarding에 넘기는 선행 규약이다.

```text
첫 접점 — 가동 형태 미정
  → 프로젝트 정체성·대상 AI·범위 확인
  → 사용자 소유 Project Master 제안
  → 사용자가 읽고 교정·확정
  → 상대 AI Project Master 유지 지시·강제 수준 확인
  → Starting Bundle
```

Workflow Canvas가 사용자와 기획을 진행할 때 기준으로 삼는 문서는 논리적으로 하나인
`Project Master`다. 현재 AI Context Gate 코어는 휴대형 기본 투영으로 `PROJECT_MASTER.md`를
제안하지만, 제품이 웹앱·로컬 파일/앱·IDE 연결·다른 형태 중 무엇이 될지는 아직 정하지
않았다. 따라서 최초 가동 시작점, Entry Adapter와 최종 저장 방식도 미정으로 보존한다.

AI Context Gate 0.1은 Starting Protocol이 직접 호출하는 독립 최상위 Engine이다. Project
Master 틀과 제한 Planning Context Pack, 상대 AI 지시, 정직한 강제 수준과 Enrollment/Handoff
Receipt를 만든다. 외부 전달은 Connector Bridge, 실제 파일 쓰기는 Safe Operations 또는
승인된 개발 변경이 맡는다. Protocol이 Engine을 호출하는 것이므로 Engine 중첩이 아니다.

목표 Protocol ID는 `starting.protocol@1.0.0`, Workflow Definition은 `starting@1.0.0`이다.
현재는 AI Context Gate 결정적 코어만 있고 통합 Runner·Entry Adapter·편집 UI·Starting
Bundle은 없다. 상세는 [`STARTING_PROTOCOL.md`](./protocols/STARTING_PROTOCOL.md)를 정본으로 한다.

## 2B. 시스템 온보딩 프로토콜 — 실제 시스템 분석

System Onboarding은 Starting Bundle과 사용자 승인 Project Master를 입력으로 받아 실제
코드·DB·설정·배포 근거를 읽고 System Map과 진단을 만든다. Project Master는 사용자의
기획 의도이지 실제 동작 증거가 아니므로 코드·설정과 다르면 Documentation Debt Finding으로
남긴다.

```text
Starting Bundle·Project Master 확인
  → 연결·동의 → 제한 근거 수집
  → 소스 이해·정적 분석
  → 공통화·동일성 → 신뢰경계 분석
  → 기획·현재 지도·실제 근거 대조와 사람 검토
  → 승인 결과 실체화
  → 운영정보 교환 → 첫 관측
  → 안전한 해결 경로·선택적 Work 초안
  → System Map·Finding·Unknown·Receipt 보고
```

직접 참여 Engine은 Connector Bridge, Source Lens, Asset Core, Trust Map, Draw Map,
LiveOps, Safe Operations의 7개다. Work Core는 선택적 후속 초안을 돕는다. 범용 AI는
Engine이나 우회 실행기가 아니며 사실·동일성·권한·LIVE·승인·해결 완료를 판정할 수 없다.
Source Lens의 필수 Functional Community Resolution이 승인된 의미 Resolver와 실제 코드 근거
검증을 완료하지 못하면 결정적 Artifact는 보존하되 `canvas_ready`로 표시하지 않는다.

목표 Protocol ID는 `system-onboarding.protocol@1.0.0`, Workflow Definition은
`system-onboarding@1.0.0`이다. 현재는 개별 기능만 부분 구현되어 있고 Run·Work Item 장부,
진행 화면, 재개와 최종 Bundle은 없다. 상세는
[`SYSTEM_ONBOARDING_PROTOCOL.md`](./protocols/SYSTEM_ONBOARDING_PROTOCOL.md)를 정본으로 한다.

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

범용성은 **Asset Kernel(Asset 원장 정규형)과 Lens/Adapter 계약**에 넣는다. 현행 wire
스키마와 파일의 코드 이름 `TwinBuild`는 v4 마이그레이션 전까지 유지한다.
엔진 코어는 GitHub, Vercel, Supabase 같은 고유 명칭을 몰라도 동작해야 하며,
새 시스템 지원 = 어댑터 추가이지 엔진 재작성이 아니다.

### ③ 장기 비전 (약속하지 않되 막지 않는 것)

소프트웨어를 넘어 사업·물류·개인 생활까지 같은 온톨로지로 이해하고 조작하는
Asset 원장을 지도에서 이해하고 조작하는 시각적 운영체제. 물류·ERP·생활용 Lens를
꽂는 방식으로 확장한다. **세상 전체를 처음부터 구현하지 않는다.** 대외 소개에서는
첫 완성 범위를 소프트웨어 디지털 트윈이라고 설명할 수 있다. 첫 완성 사례는 Workflow
Canvas 자체와 AI로 만든 소형 앱이다.

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

### Asset 원장·상태 대조 🔶
- **Asset 원장 v3** 정규형(현행 wire 스키마 코드 이름 `TwinBuild`; Asset·Capability·Relation·신뢰영역·게이트웨이·근거·데이터 종류·정책·관측·사건·통제·위협·logical component), v0→v3 전진 마이그레이션
- **Adapter 계약 v1**(describe/canInspect/inspect/normalize/reconcile), 레지스트리, 설명서 지문 검증
- 상태 대조(Reconciliation) + 검토 패널, Proposal(add_node/add_edge/add_part/replace_part, 지문 결합, 중복·변조·의존성 차단)
- 자기 시스템 지도(`Workflow Canvas 시스템 지도`): 소유자 전용 생성·점검 MCP 도구
- 시스템 발견 manifest(`discover:update/check`) — 코드·SQL·설정의 이름·지문만 수집
- 엔진 구성층: Engine Registry v1(10개 상위 Engine + 내부 44개 Component), Capability Mapper, Maintainer Agent manifest 계약(현재 전원 미배정)
- 골든 픽스처: 주문 서비스(두 번째 어댑터 계약 검증)

### 코드 구조·Git 동기화 🔶
- 소스 분석 호환 manifest: 이 manifest의 wire 이름은 `Source Twin`; Babel AST/SQL 스캔, 파일·함수·API·DB 참조 구조(본문 미수집)
- 한국어 쉬운 설명 + 개발자 정보 모드, 설명 근거(생성 방식+실제 참조)를 모든 Asset에 연결
- 14 제품 영역 × 36 하위 시스템 분류, 검색 자동 펼침
- 로컬 커넥터: 범위 제한 토큰(해시 저장), 읽기 전용 기본, 10초 heartbeat, 등록 구분(연결됨/오프라인/연결 전)
- Git 동기화 조작: 코드 파츠 소켓 간 방향성 실행(일반 push / ff-pull만), 계획→웹 승인→로컬 터미널 확인→실행 후 상태 검증
- GitHub push webhook 신호(선택 설정), 통합 스냅샷 생성·비교

### AI·MCP 연결 ✅
- MCP 서버(21 도구): 캔버스 CRUD, Draw Map의 wire 이름은 `create_graph`, 관계·시스템 필드, `update_edge(s)`
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
- Vercel 서버리스(공유 API, MCP, `system-runtime`, `source-twin`, webhook), GitHub 연동 배포
- 운영 대시보드: 전체 점검 버튼, 노드·연결선 상태색, 관측 카탈로그(6종, 가용성 6단계, 보호 필드 잠금)
- 런타임 확인: Vercel/공유 API/MCP 경로/Auth/RLS/서비스 집계 — 등록 운영자
  (`WORKFLOW_CANVAS_OWNER_USER_ID`) 전용, 15분 stale 강등

### 테스트·품질 ✅
- 로직 테스트 195+개, SQL 보안 계약 테스트, 레거시 Adapter 계약·Asset 원장 wire 호환·조작 수명주기·소스 분석 테스트
- governance:check(의존성 13개), SBOM 생성, privacy:check(출시 게이트)

### 프로젝트 기반·공통 규칙 ✅
- 오픈소스 정책(대형 의존성은 사용자 승인 후), 의존성 결정 기록, THIRD_PARTY_NOTICES
- CLAUDE.md 행동 규칙, 부채 장부(docs/governance/TECHNICAL_DEBT.md, 안정 ID + 종료 조건)

---

## 6. 엔진 카탈로그

### 6.0 모든 Engine을 정리할 때의 공통 제품 목표

각 Engine은 비개발자가 자신의 앱을 다음 세 질문으로 이해하고 개선하도록 기여해야 한다.

1. **구조:** 내 앱은 무엇으로 이루어졌고 무엇과 어떻게 연결되는가?
2. **비효율:** 어디에 중복·불필요한 반복·지연·낭비·관리 사각지대가 있는가?
3. **보안과 해결:** 무엇이 왜 위험하고, 지금 차단할 것과 안전한 수정 절차로 넘길 것은
   무엇인가?

모든 Engine 마스터는 이 세 질문 중 자신이 담당하는 부분, 입력과 결과물, 근거, `unknown`,
사용자 화면, 다른 Engine으로 넘기는 해결 경로와 **하지 않는 일**을 함께 기록한다. 한
Engine에는 고유한 상태 변환 하나를 둔다. 이 능력은 여러 제품 Workflow에서 재사용될 수
있으며, 모든 교차 Engine 흐름을 그 Engine 안으로 가져오지 않는다.

Finding과 설명은 해결 완료가 아니다. 코드·DB·Git·외부 설정을 바꾸는 해결은 Safe
Operations의 계획→미리보기→승인→실행→독립 검증→감사→복구를 거친다. 다만 Hard
Guardrail이 미승인 교환을 거부하거나 명시된 긴급 정책에 따라 Grant를 무효화하는 것은 변경
실행이 아니라 해당 Engine 경계의 즉시 안전 통제다.

현재 문서·Registry 사이의 이름·개수·분류 불일치는
[`TECHNICAL_DEBT.md`](./governance/TECHNICAL_DEBT.md)의 `DOC-001`에서 추적하고, 각 Engine 정리 때 실제
계약·코드·테스트와 함께 해소한다.

### 6.1 Engine과 Workflow의 관계

**Engine은 Workflow가 아니다.** Engine은 계약에 따라 특정 상태 변환을 수행하는 버전형
재사용 능력이고, Workflow는 Stage마다 필요한 능력과 통제를 조합한 실행 설계다. 한 번의
실행은 Workflow Run이며 각 Stage의 실행 상태는 Work Item으로 기록한다. 시스템별 차이는
Engine을 복제하는 대신 Adapter와 Profile로 공급한다.

```text
Protocol → Workflow Definition → Stage → Capability·통제 조합
Stage → Engine Capability / Contract / Adapter / Skill / Policy / Guardrail / Host·사람 검토
Engine → Component
Stage → Profile 사용
Workflow Run → Definition 실행 → Artifact 생성
```

상위 제품 Engine은 하나의 사용자 가치와 책임 경계를 가지며 입력·출력·버전·호환성·
코드·테스트 근거를 공개한다. 같은 Engine은 최초 온보딩, 재분석, 상태 대조처럼 서로 다른
Workflow에서 재사용할 수 있다. 특정 시스템을 한 번 가져온 결과나 실행 프로세스 하나를
Engine이라고 부르지 않는다. **Engine은 최상위 책임 경계에만 존재하며 Engine 안에 다른
`kind: engine`을 넣지 않는다.** 더 작은 책임은 Contract, Resolver, Builder, Pipeline 등으로
분류하고, 독립 버전·입출력·사용자 가치가 필요하면 새 최상위 Engine으로 분리한다.

### 6.2 Engine 내부 구성 분류

사용자 표시명은 짧게 유지하되 다음 분류를 구성요소 배지와 상세 화면에 공개한다. 기계
가독 원본은 `shared/engineRegistry.js`, 상세 색인은
`docs/product/ENGINE_AGENT_REGISTRY.md`다.

| 분류 | 책임 | Engine과의 관계 |
|---|---|---|
| **Engine** | 독립 버전·입출력·호환성·사용자 가치를 가진 재사용 능력 | **최상위에만 허용**하며 다른 Engine의 Component가 될 수 없음 |
| **Contract** | 입력·출력·버전·호환성·불변식 검증 | 구성요소가 따라야 할 경계를 정의하며 실행 순서를 소유하지 않음 |
| **Resolver** | 동일성·분류·경계·대상 중 하나를 판정 | 근거와 규칙을 대조해 결정을 만들며 결과물을 직접 저장하지 않음 |
| **Builder** | 검증된 입력으로 정규형 또는 실제 Artifact를 생성 | Resolver·Contract 결과를 구조화된 출력으로 변환 |
| **Pipeline** | 여러 검증·변환 단계를 정해진 순서로 실행 | Workflow보다 낮은 내부 처리 순서이며 독립 Workflow Run을 뜻하지 않음 |
| **Agent Skill** | AI에게 목표, 입력 형식과 도구 사용 순서를 안내 | 편의 지침이며 서버 권한이나 안전 경계를 강제하지 않음 |
| **Agent Policy** | AI가 지켜야 할 행동·승인·중단 규칙 | 모델 행동 규칙이며 위반 불가능한 통제로 주장하지 않음 |
| **Hard Guardrail** | 서버·DB·스키마·실행기에서 한도와 권한을 강제 | Agent Skill·Policy와 달리 우회할 수 없는 실행 경계 |
| **Connector** | 외부 시스템·로컬 환경과 실제로 통신하며 인증·대상·Grant·전송·응답 무결성·출처를 처리 | 최소 권한과 redaction을 지키고 형식 정규화는 Adapter에 넘기며 제품 의미·동일성을 판정하지 않음 |
| **Manifest** | 제품별 의미·지원 수준·버전·매핑을 데이터로 선언 | 임의 코드를 실행하지 않는 버전형 구성·증거 레코드 |

`Adapter`는 현재 Registry의 독립 구성 분류가 아니라, 한 Stage의 특정 도구·제품 형식을
공통 Contract에 맞추는 **교체 가능한 구현 단위**다. 같은 프로세스 안의 알고리즘 교체는
Adapter로 해결하고, CLI·MCP·원격 서비스·외부 AI처럼 경계를 넘는 통신은 Connector가 맡는다.

현재 Registry wire 값은 `agent-skill`, `agent-policy`, `guardrail`처럼 짧게 저장될 수 있지만
화면과 사람용 문서에서는 각각 `Agent Skill`, `Agent Policy`, `Hard Guardrail`로 표시한다.
AI Context Gate가 첫 실제 Agent Policy Component를 등록했다. Registry는 최상위가 아닌
Engine과 Engine이 아닌 최상위 항목을 모두 거부한다.

### 6.3 상위 제품 Engine

| Engine | 재사용 능력 | 기술 버전·상태 |
|---|---|---|
| **Asset Core** | 공급자별 근거를 공통 Asset 원장으로 정규화하고 동일성을 유지하며 현재 캔버스와 대조 | 0.3.0-alpha.0 |
| **Draw Map** | 구조화된 Asset·Relation 요청을 검증하고 배치·연결선·그룹으로 실제 캔버스 지도에 저장. 온톨로지·사실 판정과 무관한 순수 가시화 Engine | 0.1.0-alpha.0 |
| **Source Lens** | 경계가 제한된 소프트웨어 소스를 단 하나의 분석 Workflow로 해석해 제품 의미·코드 계층·정적 관계·기능 맥락·기능 경계를 생성. G10-0 기능 맥락 준비는 현행이고 다음 개선은 Graphify 기반 교체형 지도 분석과 F1~F7 기능군 정합화 | 0.9.0-alpha.0 |
| **Trust Map** | 신뢰영역·게이트웨이·unknown-gap을 판정하고 redaction 이후 보안 오버레이를 생성 | 0.2.0-alpha.0 |
| **LiveOps** | 허용된 공급자 상태를 관측해 시각·신선도·LIVE/stale 수준을 판정 | 0.1.0-alpha.0 |
| **Safe Operations** | 직접 UI·자동화·미래 AI 조작과 등록 소스 편집을 하나의 계획·승인·검증·감사·복구 계약으로 제한 | 0.2.0-alpha.0 |
| **Work Core** | 투입·처리·결과 Work 계약과 버전 고정 Intent 조립을 관리 | 0.1.0-alpha.0 |
| **Intent Engine** | 원문 근거에서 조문 후보를 만들고 사람의 승인 후 버전 Intent Asset으로 고정 | 0.2.0-alpha.0 |
| **Connector Bridge** | 로컬·외부 연결의 권한과 데이터 교환을 통제하고 provider 중립 결과·진단·영수증으로 반환 | 0.2.0-alpha.0 |
| **AI Context Gate** | 상대 개발 AI에게 사용자가 소유하는 단일 Project Master 유지 규칙을 전달하고 정직한 강제 수준·완료 Handoff Receipt를 생성 | 0.1.0-alpha.0 |

### 6.4 Engine별 제품 설명

#### Asset Core

- **목적:** 서로 다른 Lens·Connector의 결과를 공급자 중립 Asset 원장으로 정규화하고,
  이름 변경·재스캔에도 동일한 Asset 정체성을 유지하며 현재 캔버스와 차이를 찾는다.
- **입력 → 출력:** Connector 발견 결과·현재 캔버스·제품/Engine Manifest → Canonical
  Asset 원장(현행 wire 스키마 코드 이름 `TwinBuild`)·검토 Proposal·논리 구성요소 지도.
- **내부 구성:** `Twin Adapter Contract`(레거시 현행 코드·계약명, Contract), Asset
  Builder(Builder), Asset Reconciler(Pipeline), Capability Mapper(Builder).
- **경계:** 소스 의미를 추측하거나 외부 시스템을 직접 읽지 않고, 승인 없이 캔버스를
  실체화하지 않는다.

#### Draw Map

- **목적:** 검증된 노드·관계 명세를 실제 캔버스 좌표와 레코드로 안전하게 만든다.
- **입력 → 출력:** 노드·관계 명세·레이아웃 방향·캔버스 권한 → 저장된 노드/연결선·
  ID 매핑·중복/이동 결과.
- **내부 구성:** 지도 배치(Builder), 지도 실체화(Builder), 지도 구성 Skill(Agent Skill),
  지도 쓰기 Guardrails(Hard Guardrail).
- **경계:** **배치·연결선·그룹만 담당하며 온톨로지·사실 판정과 무관한 순수 가시화
  Engine**이다. 무엇을 Asset으로 볼지, 같은 대상인지, 관계가 사실인지를 결정하지 않으며
  Reconciliation 승인 경계를 우회하지 않는다.

#### AI Context Gate

- **쉬운 목적:** 앱 개발을 맡은 상대 AI에게 “Workflow Canvas의 프로젝트 기획은 사용자가
  소유하는 Project Master를 기준으로 유지하라”는 규칙을 전달하고 단순 프롬프트·전달
  확인·실제 완료 차단을 구별한다.
- **입력 → 출력:** 프로젝트 상태·Project Master 기준 fingerprint·상대 AI 전달 능력·선택된
  기획 사실 → Enrollment Manifest·토큰 제한 프롬프트·`PROJECT_MASTER.md` 휴대형 제안·
  강제 수준·Handoff Receipt.
- **내부 구성:** AI Context Contract(Contract), AI Delivery Resolver(Resolver), Project
  Master Builder(Builder), Project Master Handoff Pipeline(Pipeline), Project Master
  Recording Skill(Agent Skill), Project Master Evidence Policy(Agent Policy), Project
  Master Guardrail(Hard Guardrail), AI Context Enrollment Manifest(Manifest).
- **강제 경계:** 수동 프롬프트는 `advisory`, 신뢰된 Host가 Connector Receipt를 검증하면
  `delivery-verified`, 같은 Host가 제품이 통제하는 완료 Gate와 현재 프롬프트 fingerprint의
  결합을 확인한 경우만 `completion-gated`로 표시한다.
- **토큰 방어:** 전체 Project Master를 자동 전송하지 않고 이번 작업에 필요한 구조화된 기획
  사실만 하드 예산 안의 Planning Context Pack으로 전달해 Workflow Canvas 사용자의 토큰을
  보호한다.
- **Project Master:** Workflow Canvas가 사용자와 기획을 진행할 때 기준으로 삼고, 사용자
  확정과 AI 제안·미확인을 구분한다.
- **경계:** provider·로컬 통신은 Connector Bridge, 코드 분석은 Source Lens, 실제 파일 쓰기와
  commit·rollback은 Safe Operations가 소유한다. Starting Protocol의 직접 참여 Engine이며
  System Onboarding 내부 Stage가 아니다. 상세 단일 Workflow와 현행/계획 경계는
  [`AI_CONTEXT_GATE_MASTER.md`](./engines/AI_CONTEXT_GATE_MASTER.md)를 따른다.

#### Source Lens

- **목적:** bounded source corpus를 제품 영역→서브시스템→Component→모듈→코드 파츠로
  해석하고, 근거가 있는 정적 Relation·Flow·기능 맥락과 기능 표현 경계를 결정적으로 생성한다.
- **입력 → 출력:** bounded corpus·버전형 Source Profile·선택적 이전 분석·선택적 이전
  Functional Context Pack → `Source Analysis Bundle`과 `FunctionalContextPack`
  (현행 wire 이름 `Source Twin`/Feature/Code Part/Flow 호환 Artifact 포함).
- **내부 구성:** Source Analysis Contract(Contract), Source Analysis Pipeline(Pipeline),
  Source Corpus Guardrail(Hard Guardrail), Source Profile Registry(Manifest), Feature
  Boundary Resolver(Resolver), Source Component Mapper·Code Part Translator·Static Flow
  Builder(Builder), Functional Context Contract(Contract)·Resolver(Resolver)·Pack
  Builder(Builder)·Guardrail(Hard Guardrail).
- **현행 G10-0:** README·기획 문서 최신성을 이전 Pack과 실제 소스 fingerprint로 확인하고,
  없거나 오래됐으면 UI 문구·화면 경로·API·DB·테스트·정적 Flow에서 제한 기능 어휘를 만든다.
  외부 AI·Agent Skill·Agent Policy·Connector는 쓰지 않으며 결과는 다음 분석에서 재사용한다.
- **확정된 다음 개선:** Graphify를 하위 Engine이나 하나의 불투명 Connector로 넣지 않고,
  detect·구조/의미 추출·merge·지도 상태·Structural Community·중요/경계/문제 분석·
  `query/path/explain` Capability로 쪼갠 첫 지도 분석 Adapter 제공자로 사용한다.
  Graphify의 Structural Community는 원형 근거로 보존하고, 캔버스용 결과 전에는 Source Lens의
  필수 `Functional Community Resolution` Stage가 같은 기능군을 Community 경계를 넘어
  정합화하고 근거 있는 이름·쉬운 설명·unknown을 만든다.
  후속 제공자는 같은 Contract와 Manifest로 Stage별 교체할 수 있어야 한다. 이 항목은 아직
  실행 코드와 Registry에 연결되지 않은 기획 상태다.
- **경계:** `source-lens.source-analysis@1.1.0` 하나만 소유한다. UI 조회, 캔버스 Proposal,
  Git·파일 쓰기, webhook과 Snapshot은 포함하지 않는다. 외부 AI·CLI·MCP·원격 지도 DB
  통신은 Connector Bridge가 맡으며 Source Lens는 결과를 Adapter로 정규화한다.
  공개 실행 경계와 현행/계획 Stage·Adapter·Connector는
  [`SOURCE_LENS_MASTER.md`](./engines/SOURCE_LENS_MASTER.md)를 따른다.

#### Trust Map

- **목적:** 통제 주체가 다른 신뢰영역과 그 경계를 지나는 Gateway를 모델링하고,
  Gateway가 없는 교차를 `unknown-gap`으로 드러낸다.
- **입력 → 출력:** Asset 신뢰영역·Relation Gateway·데이터 종류 → 경계 분석·
  unknown-gap·redaction 안전 오버레이·위협/통제 연결.
- **내부 구성:** Trust Topology Contract(Contract), Trust Boundary Resolver(Resolver),
  Security Overlay Projector(Builder).
- **경계:** 오버레이를 침투 테스트나 전체 공격 경로 분석으로 주장하지 않고,
  `unknown-gap`이 없다는 이유만으로 안전을 보장하지 않는다.

#### LiveOps

- **목적:** 허용 목록에 있는 외부 자원의 상태를 서버에서 확인하고 관측 시각과 만료를
  포함한 Reality Level을 만든다.
- **입력 → 출력:** 운영 확인 요청·허용된 공급자 응답 → 정제된 Observation·신선도·
  검증 수준.
- **내부 구성:** Runtime Contract(Contract), Runtime Observation Pipeline(Pipeline).
- **경계:** 코드 선언이나 브라우저 입력만으로 LIVE를 만들지 않고, 상시 AI Worker나
  임의 운영 권한을 제공하지 않는다.

#### Safe Operations

- **목적:** 모든 변경을 계획→미리보기→승인→실행→독립 검증→감사→복구의 같은
  수명주기로 제한한다.
- **입력 → 출력:** 조작 의도·권한/위험 정책·현재 상태 → 서명 계획·검증된 결과·감사 Event.
- **내부 구성:** Operation Lifecycle(Pipeline), Operation Definitions(Manifest), Source Edit
  Pipeline(Pipeline).
- **경계:** 임의 shell·URL·무기한 권한을 노출하지 않고, Adapter가 승인·검증 계약을
  우회하지 못하게 한다.

#### Work Core

- **목적:** Work가 투입·처리·결과를 갖도록 정규화하고 승인·기록된 Intent 버전을
  Work에 고정해 실행 전 누락과 변경을 판정한다.
- **입력 → 출력:** Work Part·기록 Intent 버전·편집 권한 → Work 계약·Intent 장착 정보·
  실행 전 검증 오류.
- **내부 구성:** Work Part Contract(Contract), Work Intent Assembly(Resolver).
- **경계:** 현재 Work 실행기나 스케줄러가 아니며 외부 AI가 Work 수행을 강제하는
  하네스도 아니다.

#### Intent Engine

- **목적:** 회의·AI 대화·문서의 원문을 보존하면서 준수·금지·목적·성공 기준 후보를
  만들고 사람의 승인으로 버전 Intent Asset을 확정한다.
- **입력 → 출력:** Intent 요약·원문·사람 승인 → 근거 있는 조문 후보·확정 조문·
  불변 버전 스냅샷.
- **내부 구성:** Intent Asset Contract(Contract), Intent Clause Extractor(Resolver),
  Intent Work Resolver(Resolver).
- **경계:** 결정적 후보 생성을 전략 이해나 AI 자율 집행으로 과장하지 않고 후보를
  자동 확정하지 않는다.

#### Connector Bridge

- **쉬운 목적:** 앱이 로컬 폴더·GitHub·외부 API·AI와 어떻게 연결됐고 무엇이 오가는지
  보여 주며, 사용자가 허용한 범위만 교환하고 결과를 영수증으로 남긴다.
- **현행 0.2:** Local Connector, GitHub webhook, 외부 AI 호출과 로컬 Operation 전달이 서로
  다른 API·agent·함수에 분산되어 있고 공통 Exchange Workflow와 Contract는 아직 없다.
- **목표 입력 → 출력:** 검증된 연결 요청·Provider Manifest·사용자 Grant → 권한·대상·
  데이터를 고정한 교환 → provider 중립 결과·연결 Observation·비효율/보안 Finding·
  Recommendation·Exchange Receipt.
- **목표 고유 Workflow:** `connector-bridge.exchange@1.0.0` 하나. 계약 검증 → provider·
  direction 선택 → Grant/대상 결속 → outbound 미리보기 또는 inbound 수신 preflight → 기존
  Grant 범위 확인·필요 시 재동의 → bounded 교환 → 응답/송신자 검증·정규화 → 진단·
  provenance·영수증의 순서이며 아직 계획 상태다.
- **현행 분류 부채:** 외부 통신이 없는 `Workflow Twin Adapter`(레거시 현행 코드명)는
  목표상 Asset Core를 사용하는 Adapter로 이동하고, 실제 GitHub webhook Connector는 Registry에 등록해야 한다. Contract와
  테스트 없이 현재 Registry만 먼저 바꾸지 않는다.
- **경계:** 제품 의미·Asset 동일성·Operation Plan·성공 판정·UI 렌더링을 소유하지 않는다.
  변경 해결은 Safe Operations로 넘기고, 자신은 경계 교환과 미승인 교환 차단·명시된 긴급
  정책에 따른 Grant 무효화만 수행한다.
- **상세 정본:** 현행 물리 파일, 목표 Stage별 Contract/Resolver/Builder/Pipeline/Agent
  Skill/Agent Policy/Hard Guardrail/Connector/Manifest, Adapter 교체 경계와 용어는
  [`CONNECTOR_BRIDGE_MASTER.md`](./engines/CONNECTOR_BRIDGE_MASTER.md)를 따른다.

### 미래 Lens 후보 (미구현 — 착수 조건 §9)

| Lens | 역할 | 착수 조건 |
|---|---|---|
| **Reality Lens** | 현실 세계에 존재하거나 실제 상태를 가진 사람·조직·장소·사물·금융 대상을 **관측 근거(사진, 센서, 문서, API, 사용자 입력)를 통해** Asset 원장으로 변환. 엔진이 현실을 임의로 추측하지 않는다 | 운영자 비열람 저장(개인 데이터 전제) |
| **Decision Lens** | 대화·회의·문서를 분석해 아이디어, 제안, 결정, 계획, 전략 버전으로 실체화 | 운영자 비열람 저장 + Source Lens 2스택 검증 |

---

## 7. 계약·스키마 버전 현황

| 계약 | 버전 | 위치 |
|---|---|---|
| Asset 원장 정규형 | v3 (v0→v1→v2→v3 전진 마이그레이션) | `shared/twinBuild.js` |
| Adapter 계약 | v1 | `shared/twinAdapterContract.js`, `docs/twin/contracts/TWIN_ADAPTER_CONTRACT.md` |
| Operation Lifecycle | v1 | `shared/operationLifecycle.js`, `docs/contracts/OPERATION_LIFECYCLE_CONTRACT.md` |
| Engine Registry | v1 | `shared/engineRegistry.js` |
| Maintainer Agent Manifest | v1 (전원 미배정) | `docs/product/ENGINE_AGENT_REGISTRY.md` |
| Source Profile 계약 | v1 (+ Feature Model extension v1) | `docs/contracts/SOURCE_PROFILE_CONTRACT.md`, `shared/sourceProfileContract.js`, `shared/sourceFeatureModel.js` |
| 관측 카탈로그 (런타임 스키마) | v3 | `shared/systemObservationCatalog.js`, `shared/systemRuntime.js` |
| Security Overlay Schema | v1 | `shared/securityOverlay.js`, `shared/trustTopology.js`, `shared/workflowTrustTopology.js` |

**버전 규칙:** 제품·각 엔진·스키마는 독립 SemVer. `0.x`는 약속 미고정. 호환되지 않는
변경에는 전진 마이그레이션 + fixture 테스트 필수. `1.0.0`은 공개 약속·지원 범위·
출시 차단 부채가 검증된 뒤에만. Asset 원장의 현행 wire 스키마 코드 이름은
`TwinBuild`다. **wire 필드·파일명·export·저장 바인딩 개명은 `TwinBuild` v4 개편에
태우고, 그때 `entity`→`asset`과 조합형 Asset 종류(facet)를 함께 도입한다.** 그 전에는
표시 이름과 개념 명칭만 통일한다(§2.5, 기술부채 `ENG-009`).

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
4. 상세: `docs/governance/TECHNICAL_DEBT.md` (안정 ID + 종료 조건으로 관리)

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
4. **Source Lens 집중 개발 프로그램 (현재 초점, SL-0~SL-5)** — 정적 구조 인벤토리를
   **프로그램 이해 엔진**으로: 실행 흐름·React 컴포넌트 구조 이해, 기능 경계 자기 발견,
   코드 한 줄까지 정확한 자연어 설명.
   - SL-0: ✅ 노트 뷰 시스템 파츠 읽기 상세 + redaction 누출 차단
   - SL-1: ✅ Source Lens 0.4.0-alpha.0, Source Component Mapper, 코드 Asset 계층 v1,
     컴포넌트·소속 모듈 탐색, 내부 kind 10종 공개 + legacy wire 호환
   - SL-2: ✅ Code Part Translator — 선언/명령/분기/반복/반환 + 리소스·설정·데이터,
     안정 AST 앵커, 결정적 자연어와 근거 링크. 외부 AI 비교는 이 분석 결과를 소비하는
     Connector Bridge Workflow이며 기본 비활성이다.
   - SL-4: ✅ Static Flow Builder — UI 이벤트·API·MCP 진입점, import/call,
     React render·props 흐름. 정적 CODE 근거이며 동적 대상은 unknown, 승격 전 후보는 dimmed.
   - SL-3: ✅ Safe Operations Source Edit Pipeline 내부 MVP — 등록 UI 상수 4종, 별도 로컬 쓰기 동의,
     격리 worktree·AST literal formatter·검사/build·정확 diff 터미널 승인·provenance 커밋·
     새 revert 커밋 롤백. LOC-002/005/006/007/008 완료 전 상용 경계가 아니다.
   - SL-F0: ✅ **G10-0 Functional Context Bootstrap** — README·기획 문서의 최신성을
     소스 fingerprint와 비교하고, 없거나 오래됐으면 UI 문구·화면 경로·API·DB·테스트·
     정적 Flow에서 기능 어휘를 구성해 `FunctionalContextPack` v1로 제한·보존·재사용한다.
   - SL-5: ◻︎ 교체 가능한 지도 분석 Adapter 도입. Graphify를 첫 제공자로 사용하되
     detect→구조/의미 추출→merge→지도 상태→Structural Community→중요/경계/문제
     분석으로 분해한다. 이어서 필수 Functional Community Resolution이 대표 근거 수집→
     split/mixed 판정→AI 기능군 후보→코드 근거 검증→이름·쉬운 설명→unknown 보존을 수행한
     뒤 `query/path/explain`과 Bundle로 넘긴다. Structural Community의 사용자 노출·추가
     가공은 `SL-001` 부채로 두고 원형은 삭제하지 않는다. Adapter Contract·Provider
     Manifest·Agent Skill·Agent Policy·Hard Guardrail·두 번째 fake/대체 Adapter 검증 후에만
     구현 상태로 전환한다.
   - 상시: ✅ Source Lens를 `source-lens.source-analysis@1.1.0` 하나로 정리하고 공개
     진입점·모듈 소유 목록·중첩 Engine 금지 계약을 유지

**Source Lens 0.4.1 구현 결정:**
- 모듈 실체화는 코드 상세의 `캔버스에 올리기`와 코드 브라우저→캔버스 드래그 둘 다
  지원하며, 두 경로 모두 미리보기→사용자 승인 Proposal을 통과한다. 자동 대량
  실체화는 금지하고 한 번에 하나 또는 소수만 허용한다.
- Asset 후보, 근거 미확인, 작동 미확인·실패 노드는 Reality/evidence 상태에 따라
  `dimmed`로 보인다. 근거가 확인된 declared 이상은 정상 표시한다.
- 코드 파츠와 설명은 결정적 분석이 기본이다. 외부 AI 보강은 등록 소유자의 Workflow
  Canvas 자기 시스템 지도·자기 저장소에만 허용하며, AI artifact 배지와 결정적 근거를
  병렬 표시한다. AI는 관계·권한·Reality Level을 만들 수 없다.
- 읽기 위험이 낮은 흐름 발견을 쓰기보다 먼저 개발하므로 순서는 SL-2→SL-4→SL-3이다.

**Source Lens 0.7.0-alpha.0 구현 결과:**
- compact 색인만 브라우저에 두고 코드 파츠·흐름 카탈로그는 서버에서 모듈 단위로 지연
  로드한다. 코드 본문과 비밀값은 브라우저 번들이나 서버 저장소로 보내지 않는다.
- 모듈 실체화는 버튼과 단일 드래그 모두 기존 Reconciliation Proposal을 통과하며,
  자동 대량 실체화 금지는 유지한다.
- 왕복 편집은 `shared/uiConstants.js`의 명시 등록 literal만 다룬다. 웹 승인만으로는
  실행되지 않으며 Mac 터미널에서 실제 diff를 확인해야 한다. 자동 push·배포는 하지 않는다.
- Code Part Translator, Flow Discovery Engine, AI Explanation Pilot, Safe Roundtrip Editor는
  각자의 코드 근거로 Source Lens 자체 코드 트리에 다시 표현된다.
  Local Connector 1.3이 별도 소스 쓰기 동의·격리 검증·터미널 재승인을 집행한다.
- AI 설명 제공자는 비활성 `external-saas` 신뢰영역이며, 코드 본문 없이
  선언된 제한 메타데이터만 게이트웨이를 통과한다. 제공자·모델·비용 승인 전에는 호출하지 않는다.

**Source Lens 0.8.0-alpha.0 경계 정립:**
- Source Lens 고유 기능을 bounded corpus와 Source Profile을 `Source Analysis Bundle`로
  바꾸는 단 하나의 Workflow로 한정했다.
- `scripts/source-lens-engine.mjs`를 Node 전용 공개 실행 경계로 추가하고 build, Local
  Connector와 테스트의 직접 scanner 호출을 이 진입점으로 통일했다.
- 편집·롤백은 Safe Operations, 외부 AI·GitHub webhook·로컬 환경 통신은 Connector Bridge,
  통합 Snapshot은 Asset Core·LiveOps·Safe Operations의 교차 Engine Workflow로 분리했다.
- Source Lens를 포함한 모든 Engine에서 하위 `kind: engine`을 금지하며 내부 알고리즘은
  Contract/Resolver/Builder/Pipeline/Guardrail/Manifest로 분류한다.
- 분리된 현재 Workflow와 UI projection은 [`WORKFLOW_CATALOG.md`](./protocols/WORKFLOW_CATALOG.md)에 둔다.

**Source Lens 0.9.0-alpha.0 기능 맥락 준비 구현:**
- 단일 Workflow를 1.1로 올리고 정적 Flow 다음, 기능 경계 판정 전에
  `G10-0 Functional Context Bootstrap`을 추가했다.
- 루트·`docs/`의 README·기획 Markdown을 제한 corpus로 읽고 이전 Pack과 소스 fingerprint를
  비교해 `baseline/new/changed/current/possibly-stale/missing`을 구분한다.
- 사용할 문서가 없거나 오래됐을 가능성이 있으면 UI 텍스트·화면 경로·API route·DB 선언·
  테스트·정적 Flow를 결정적 fallback 근거로 사용한다.
- 결과는 원문이 아니라 제한 기능 어휘·근거·신뢰도·fingerprint·재사용 상태를 담은
  `FunctionalContextPack` v1이다. Graphify와 G10 F1~F7 정합화는 아직 구현하지 않았다.
5. Python/FastAPI 두 번째 스택 검증 + 온보딩 마법사 v1 (SL 프로그램에 이어)
6. 제한 조작 확대 (Engine 1.x), 번들 분리와 성능 예산 CI 고정.

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

문서는 4개 등급으로 나뉜다. **AI는 환경별 bootstrap과 `AI_MASTER.md`만 항상 읽고,
이 사람용 MASTER와 나머지 문서는 라우팅된 관련 절만 읽는다.** 토큰을 아끼는 것은
기획 정본을 생략하라는 뜻이 아니라 필요한 정본으로 곧장 이동하라는 규칙이다.

| 등급 | 문서 | 읽는 시점 |
|---|---|---|
| **0 AI bootstrap** | 루트 `AGENTS.md` 또는 `CLAUDE.md`, `docs/AI_MASTER.md` | 모든 AI 작업 시작 전. AI_MASTER는 비정본 라우터다 |
| **0 사람용 정본** | **`docs/MASTER.md` (이 문서)** | AI_MASTER가 지정한 §2·§4와 작업 관련 절만. 방향·용어·범위 판단에는 항상 우선 |
| **1 Protocol·Engine·계약** | `docs/protocols/STARTING_PROTOCOL.md` · `docs/protocols/SYSTEM_ONBOARDING_PROTOCOL.md` · `docs/engines/AI_CONTEXT_GATE_MASTER.md` · `docs/engines/SOURCE_LENS_MASTER.md` · `docs/engines/CONNECTOR_BRIDGE_MASTER.md` · `docs/protocols/WORKFLOW_CATALOG.md` · `docs/twin/README.md` · `docs/twin/contracts/TWIN_ADAPTER_CONTRACT.md` · `docs/twin/contracts/TWIN_BUILD_SCHEMA.md` · `docs/contracts/OPERATION_LIFECYCLE_CONTRACT.md` · `docs/contracts/SOURCE_PROFILE_CONTRACT.md` | 해당 Protocol·Engine·Workflow·계약을 기획·구현·변경할 때만 |
| **2 장부·결정** | `docs/governance/TECHNICAL_DEBT.md` (해당 ID만) · `docs/governance/AUDIT_PLAYBOOK.md` · `docs/product/ENGINE_CHANGELOG.md` · `docs/architecture/decisions/DEPENDENCY_DECISIONS.md` + `dependency-registry.json` | 부채 등록/해소, 점검일, 엔진 버전 변경, 의존성 추가 시만 |
| **3 보조·이력** | `docs/product/PRODUCT_CATALOG.md` · `docs/twin/archive/TWIN_ENGINE_ROADMAP.md` · `docs/product/ENGINE_AGENT_REGISTRY.md` · `docs/architecture/FOUNDRY_MODEL.md` · `docs/architecture/decisions/OPEN_SOURCE_POLICY.md` | 그 영역의 세부가 필요할 때만. **방향·용어가 이 문서와 충돌하면 이 문서가 이긴다** |

작업 유형별 최소 읽기:

| 작업 | 읽기 |
|---|---|
| 단순 버그픽스, UI 수정 | AGENTS.md 또는 CLAUDE.md + AI_MASTER.md + MASTER §2·§4 (끝) |
| Starting Protocol·Project Master·AI Context Gate 기획·구현 | + MASTER §2A·§6, STARTING_PROTOCOL.md, AI_CONTEXT_GATE_MASTER.md, WORKFLOW_CATALOG.md, TECHNICAL_DEBT.md `START-001`·`AI-008` |
| Source Lens 기획·구현 | + MASTER §6·§9, SOURCE_LENS_MASTER.md, SOURCE_PROFILE_CONTRACT.md |
| Connector Bridge 기획·구현 | + MASTER §6·§8, CONNECTOR_BRIDGE_MASTER.md, WORKFLOW_CATALOG.md, TECHNICAL_DEBT.md 관련 ID |
| 시스템 온보딩 전체 흐름·진행 UI·Run 구현 | + MASTER §2B, STARTING_PROTOCOL.md의 인계 계약, SYSTEM_ONBOARDING_PROTOCOL.md, WORKFLOW_CATALOG.md, 관련 Engine 계약, TECHNICAL_DEBT.md `ONB-001` |
| 여러 Engine을 잇는 Workflow·UI 조회 경계 | + WORKFLOW_CATALOG.md와 관련 Engine 계약 |
| Adapter/Asset 원장/Lens 작업 | + 1등급 해당 계약. 현행 wire 스키마 코드 이름은 `TwinBuild` |
| 조작(Operation) 추가·변경 | + OPERATION_LIFECYCLE_CONTRACT.md |
| 보안·공유·인증·커넥터 변경 | + TECHNICAL_DEBT.md 관련 ID |
| 엔진 추가·개명·버전 변경 | + engineRegistry.js, ENGINE_CHANGELOG.md |
| 의존성 추가 | + OPEN_SOURCE_POLICY.md, DEPENDENCY_DECISIONS.md |

---

## 12. 협업 프로세스 (역할 분담)

이 프로젝트는 사람 1명 + AI 2종이 고정된 역할로 일한다:

**현재 편성 (2026-07-18~):**

| 역할 | 담당 | 하는 일 |
|---|---|---|
| **기획·계획** | 사용자 + Claude Code | 방향·용어·우선순위 결정, 설계의뢰서 작성 |
| **설계·구현·검수·배포** | Codex | 설계, 구현, 테스트·빌드·보안 표면 검증, 커밋, GitHub push, Vercel 배포, SQL 실행 안내, MASTER.md 버전 갱신 |
| **최종 확인** | 사용자 | 배포 후 실제 화면·E2E 수동 확인, SQL 실행 |

구현자와 검수자가 같아진 만큼 다음을 강제한다:
- 검증 게이트(테스트·빌드·보안 경계·manifest 정합) 없이 배포하지 않는다.
- 구현 중 택한 지름길·중복·사각지대는 그 자리에서 `TECHNICAL_DEBT.md`의
  QUAL 항목으로 기록한다 (`docs/governance/AUDIT_PLAYBOOK.md` 상시 규칙).
- 사용자가 요청하면 언제든 점검일 절차를 실행한다 (AUDIT_PLAYBOOK §2).

전달 문서 관행(기준 커밋, SHA-256, 검증 결과)은 담당 변경과 무관하게 유지한다.

**시스템 지도 최신성 규칙:** 배치가 시스템 지도 템플릿·모델을 바꾸면 배포 후
기존 지도를 항상 최신 패치 기준 최선의 상태로 갱신한다 — 그대로 두고 추가만
하는 게 아니라 바꿀 것은 바꾼다. 갱신은 검토(Proposal) 경로 또는 사용자 동의된
직접 갱신으로 하되, **사용자의 노드 배치·메모·검토 결정은 항상 보존**한다
(사용자가 배치를 직접 다듬는다는 전제).

---

## 13. 문서 관리 규칙

1. **이 문서는 사용자가 소유하는 단일 기획 기준(single source of direction)이다.**
   방향·용어·범위가 바뀌면 반드시 이 문서를 함께 고치고 버전을 올린다. AI가 독자적인
   제품 방향이나 작업 메모를 이 문서에 넣지 않는다.
2. **버전 규칙 (SemVer):**
   - **MAJOR**: 중심 문장, Asset 문법, 불변 원칙의 변경
   - **MINOR**: 기능 추가/제거, 로드맵 순서 변경, 용어 추가, 엔진 추가
   - **PATCH**: 오탈자, 상태 갱신(알파→베타 등), 링크 수정
3. 모든 개정은 아래 변경 이력에 한 줄을 추가한다.
4. `AI_MASTER.md`는 이 문서의 결정을 복제하는 두 번째 기획서가 아니라 읽기 경로·정본·
   검증 조건만 제공하는 파생 라우터다. 제품 결정을 바꾸지 않고, 충돌하면 이 문서가 이긴다.
5. Engine별 마스터는 이 문서의 방향 아래에서 현행 Workflow·경계·구성요소를 자세히
   기록한다. Engine 동작이 바뀌면 해당 Engine 마스터도 같은 변경에서 갱신한다.
6. AI 세션(Claude Code, Codex)은 작업 시작 전 §11 읽기 프로토콜을 따르고, 용어는
   §2를 따르며, 방향과 어긋나는 요구를 받으면 그 충돌을 사용자에게 먼저 보고한다.
7. 화면 라벨 변경은 §2.5 매핑표 갱신과 함께만 허용한다.

## 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 0.15.0 | 2026-07-23 | 작업장 MVP 1차 “기록 먼저”를 구현했다. 기존 시스템 노드를 권한과 분리된 관제 노드 진입점으로 지정하고, 캔버스별 백로그+A~H 보드에서 병렬 목표·작업 트리·대화 가지·산출물·수동 소프트 게이트와 종착 승인을 기록한다. 전용 Supabase RLS/Realtime 저장 계약, 제한 컨텍스트 팩, 에이전트 보고 전용 MCP 도구 5개를 추가했으며, 게이트 승인·단계 이동·완료는 사람 전용으로 유지했다. §3 정체성과 기능 목록의 작업장 개정은 별도 용어 결정 배치로 남겼다. |
| 0.14.0 | 2026-07-20 | 파운드리 정렬에 따라 사람용 개념과 표시 이름을 Asset 원장(Asset Base)·Asset Build·Asset Core·Draw Map·지도로 통일했다. Draw Map을 배치·연결선·그룹만 담당하고 온톨로지·사실 판정과 무관한 순수 가시화 Engine으로 고정했으며, 디지털 트윈은 대외 소개 문장에만 남기고 정식 검증 상태를 Reality Level `runtime-verified`(화면 LIVE)로 재확인했다. wire·파일·저장 필드 개명은 `ENG-009`의 v4 마이그레이션으로 분리했다. |
| 0.13.0 | 2026-07-20 | Source Lens 0.9 / Workflow 1.1에 G10-0 Functional Context Bootstrap을 구현했다. 최신 README·기획 문서를 실제 소스 변경과 대조하고, 문서가 없거나 오래됐으면 UI 문구·화면 경로·API·DB·테스트·정적 Flow에서 기능 어휘를 구성해 제한 `FunctionalContextPack` v1로 보존·재사용한다. Graphify와 F1~F7 Functional Community Resolution은 계획 상태로 유지한다. |
| 0.12.0 | 2026-07-20 | System Onboarding 이전의 Starting Protocol을 신설했다. 최초 가동 시작점과 웹·로컬·IDE 등 최종 앱 형태는 미정으로 보존하고, 사용자가 소유하는 Project Master 생성·교정·상대 AI Enrollment·Starting Bundle 인계를 정의했다. AI Context Gate 0.1을 Starting Protocol의 직접 참여 Engine으로 옮기고 프로젝트 전체 기획 정본, Planning Context Pack과 planning/none Handoff를 적용했다. System Onboarding은 Starting Bundle을 받아 7개 Engine으로 실제 근거를 분석하며 기획과 코드·설정 불일치는 Documentation Debt로 남긴다. |
| 0.11.0 | 2026-07-20 | 상대 개발 AI에게 기능 맥락 기록 규칙을 전달하고 사람이 고칠 `FUNCTIONAL_CONTEXT.md`, 토큰 제한 Context Pack, 정직한 전달·강제 수준과 Handoff Receipt를 만드는 AI Context Gate 0.1을 열 번째 상위 Engine으로 추가했다. 수동 프롬프트는 권고, Connector Receipt는 전달 검증, 제품이 실제 통제하는 완료 Gate만 완료 차단으로 구분하며 provider 통신·소스 분석·실제 쓰기는 각각 Connector Bridge·Source Lens·Safe Operations에 남겼다. |
| 0.10.0 | 2026-07-20 | Source Lens의 Graphify Structural Community를 삭제하지 않는 Provider 원형 Artifact로 고정하고, 같은 기능군을 Structural Community 경계를 넘어 겹침 가능하게 묶는 필수 `Functional Community Resolution` Stage를 캔버스용 결과 이전에 추가했다. AI 기능군 후보는 실제 코드 근거 검증을 통과해야 하며 신뢰도 미달은 unknown으로 남긴다. 구성품별 상세 Workflow는 Source Lens 마스터, Structural Community 노출·후속 가공 결정은 `SL-001` 부채가 소유한다. |
| 0.9.0 | 2026-07-20 | 시스템 가져오기 전체를 새 Engine이 아닌 `System Onboarding Protocol`로 정립했다. Protocol·Workflow Definition·Run을 구분하고, 7개 직접 참여 Engine과 선택적 Intent/Work/AI 보조선, 읽기 전용 기본값, 지도·구조/비효율/보안/문서 부채 Finding·Unknown·안전한 해결 경로·Receipt 결과를 하나의 흐름으로 고정했다. 상세 현재/계획·코드·승인·구성 분류는 전용 정본으로 분리했다. |
| 0.8.0 | 2026-07-20 | 모든 Engine 정리의 공통 제품 목표를 비개발자의 앱 구조 이해·비효율 발견·보안 문제와 안전한 해결 경로로 고정했다. Adapter는 Stage 교체 구현, Connector는 경계 통신으로 표준화했다. Connector Bridge의 현행 분산 Flow와 inbound/outbound·Grant 재동의를 구분한 목표 단일 Exchange Workflow, 고유 책임·구성 분류·사용자 결과물을 별도 마스터에 정리하고 남은 문서 불일치는 부채로 연결했다. |
| 0.7.0 | 2026-07-19 | Source Lens의 당분간 개선 범위를 기존 단일 Source Analysis Workflow 안으로 고정하고, Graphify를 detect부터 query/path/explain까지 분해되는 첫 교체 가능 지도 분석 Adapter 제공자로 채택했다. Adapter와 Connector의 차이, AI Skill·Policy·Hard Guardrail 경계, Provider Manifest와 현행/계획 구분은 `SOURCE_LENS_MASTER.md`를 정본으로 삼는다. |
| 0.6.0 | 2026-07-19 | Engine을 최상위 책임 경계로 확정하고 하위 `kind: engine`을 금지했다. Source Lens 0.8을 단일 Source Analysis Workflow와 Node 전용 공개 진입점으로 한정했으며 편집·Snapshot·webhook·외부 AI·UI/Proposal을 올바른 Engine 또는 Workflow 카탈로그로 분리했다. |
| 0.5.0 | 2026-07-19 | 사람용 MASTER의 사용자 소유권과 AI용 `AI_MASTER.md` 라우팅을 분리했다. Engine을 Workflow가 호출하는 버전형 재사용 능력으로 정립하고 9개 상위 Engine의 목적·입출력·내부 구성·책임 경계를 추가했다. Source Lens의 Graphify 도입 전 현행 Workflow·구성 분류·Adapter·Connector를 별도 `SOURCE_LENS_MASTER.md`에 기록하도록 문서 체계를 확장했다. |
| 0.4.2 | 2026-07-18 | Source Lens 0.7.0-alpha.0. SL-2 Code Part Translator와 소유자 자기 지도 AI 비교 어댑터(기본 비활성), SL-4 정적 Flow Discovery Engine, SL-3 Safe Roundtrip Editor 내부 MVP를 구현. 등록 UI 상수 4종만 Local Connector 1.3의 별도 로컬 쓰기 동의·격리 worktree·AST literal formatter·검사/build·터미널 diff 승인·provenance 커밋·revert 롤백으로 변경. 상용 경계는 LOC 부채 완료 전 차단. 새 Source Lens 구성요소의 자기반영 규칙과 declared 외부 AI 신뢰 경계를 지도에 추가. |
| 0.4.1 | 2026-07-18 | SL-0/1 완료(Source Lens 0.4.0-alpha.0, Source Component Mapper, 코드 Asset 계층 v1, 공개 kind 10종+legacy wire). 모듈 실체화 UX를 버튼+드래그와 공통 Proposal로 확정하고 대량 자동 실체화는 계속 금지. Reality/evidence 기반 dimmed 규칙, 개발 순서 SL-2→SL-4→SL-3, 소유자 자기 지도 한정 AI 설명 파일럿 범위를 확정. Codex가 구현·검수·커밋·push·배포를 담당하는 편성으로 갱신. |
| 0.3.0 | 2026-07-17 | 층 문법 교정: 층은 자기 지도 전용이 아니라 **모든 캔버스의 사용자 기능**(생성·이름·순서·삭제), L1~L4는 시스템 지도 기본 프리셋 — 배치 A2로 구현. 역할 편성 변경: Codex 휴무, 구현·검수·배포 모두 Claude Code + 자기검수 보완 장치. 시스템 지도 최신성 규칙(§12). 점검 제도 신설: AUDIT_PLAYBOOK.md + QUAL 품질 장부. |
| 0.4.0 | 2026-07-18 | Source Lens 집중 프로그램(SL-0~5)으로 로드맵 개편. 코드 Asset 계층 문법 신설: 제품 영역>서브시스템>컴포넌트>모듈>코드 파츠 (컴포넌트=정제 분류로 코드 미반영, 기존 '하위 시스템'=서브시스템 계층). 코드 파츠 문법(선언/명령/분기/반복/반환+리소스·설정·데이터, ENG-006 왕복 편집 계약). 내부 구성 분류 10종 사용자 공개 확정. 외부 도구 적극 활용 방향 승인(건별 기록·승인 유지). |
| 0.3.2 | 2026-07-17 | 배치 C 배포 완료 기록. 보안 오버레이: 자기 지도 신뢰영역 6·게이트웨이 11 근거 선언 + Proposal 실체화, 층 전환기 옆 토글(기본 꺼짐), 노드 테두리+배지·게이트웨이 팝업·unknown-gap 경고, redaction-안전·비밀값 차단. Trust Map 0.2.0-alpha.0 + Security Overlay Projector + Security Overlay Schema v1. 전부 declared(LIVE·침투테스트 아님). |
| 0.3.1 | 2026-07-17 | 배치 B 배포 완료 기록. Source Lens 0.3.0-alpha.0(Feature Boundary Resolver 구성요소 추가), Workflow Canvas Source Profile 0.3.0, FastAPI 참조 0.2.0, Source Profile Contract v1의 Feature Model extension v1. 신규 온톨로지: systemKind `feature`→L1, part kind `capability`, relationType `implemented_by`. 기능 Asset은 declared(LIVE 아님). 계약 버전 현황·엔진 카탈로그 갱신. |
| 0.2.2 | 2026-07-17 | 배치 A 배포 완료 기록: 시스템 지도 L1~L4 층 공식화(층 전환기, 결정적 기본 층, layerOverride, redaction-안전 포털). 로드맵 §9-1 완료 표시, 기능 목록 갱신. |
| 0.2.1 | 2026-07-17 | Node 정의 명확화: Asset 바인딩 있는 노드만 Asset의 표현, 자유 작성 노드는 캔버스 주석(승격 가능). 배치 A 층 저장 설계 확정 기록(layerOverride 수동 지정만 저장, 기본값 결정적 계산, 포털 개수는 redaction 이후 계산). |
| 0.2.0 | 2026-07-16 | 시스템 지도 = 온보딩 결과물로 재정의. 층·오버레이 표현 문법(§2.4, 4층+Z축=추상화 깊이, 2.5D 먼저), 기능 판정 3등급, 온보딩 파이프라인 엔진 역할 분담 + 온보딩=Workflow Run(§2A), 보안 시각화 정직한 범위, 로드맵 단기 순서 개편(§9), 문서 지도 4등급 + 읽기 프로토콜(§11), 협업 프로세스 역할 분담(§12). |
| 0.1.0 | 2026-07-16 | 최초 작성. Asset 원장 기반 OS 핵심 정의, 표준 용어집(과거 용어 매핑 포함), 3층 제품 정체성, 불변 원칙 8개, 현재 기능 전체 목록(14 영역), 엔진 카탈로그, 계약 버전 현황, 출시 게이트, 로드맵, 문서 지도. |
