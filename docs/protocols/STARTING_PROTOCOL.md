# 스타팅 프로토콜

이 문서는 사용자가 자신의 프로젝트를 Workflow Canvas와 처음 만나게 한 뒤, 사람이 소유하는
프로젝트 전체 기획 정본을 만들고 개발 AI가 그 정본을 계속 유지하도록 준비한 다음
System Onboarding에 넘길 때까지의 규약을 정의한다. 제품 방향과 표준 용어는
[`MASTER.md`](../MASTER.md)가 우선한다.

| 항목 | 값 |
|---|---|
| 문서 버전 | `0.2.0` |
| Protocol 목표 ID | `starting.protocol@1.0.0` — 계획 |
| 실행 Workflow 목표 ID | `starting@1.0.0` — 계획 |
| 현재 직접 호출 Engine | AI Context Gate 0.1 — 각 Stage는 필요에 따라 Host·사람 검토·Skill·Policy·Guardrail·Adapter·Connector를 추가 조합 |
| 현재 구현 상태 | AI Context Gate 결정적 코어만 구현; 통합 Runner·진입 Adapter·화면·저장소·Starting Bundle은 없음 |
| 최초 가동 시작점 | **미정** |
| 최종 앱 형태 | **미정 — 웹앱·로컬 파일/앱·IDE/AI 연결·그 밖의 형태를 아직 선택하지 않음** |
| 기준일 | 2026-07-20 |

---

## 1. 비개발자를 위한 쉬운 설명

> **Starting Protocol은 사용자가 프로젝트를 처음 보여 준 뒤, “이 프로젝트는 왜 만들고,
> 누구를 위한 것이며, 무엇을 어디까지 만들 것인가”를 한 문서로 정리하고, 개발 AI도 그
> 문서를 계속 맞춰 나가게 준비하는 온보딩 전 단계다.**

사용자는 여러 AI 대화와 파일을 돌아다니며 기획을 다시 설명할 필요 없이 하나의
`Project Master`를 읽고 직접 고친다. 개발 AI는 기획이 실제로 바뀌었을 때 같은 Project
Master의 관련 부분을 갱신한다.

Starting Protocol이 끝나면 실제 시스템 분석이 시작되는 것이 아니라, 그 분석을 시작할 수
있는 `Starting Bundle`이 준비된다. 다음 단계인 System Onboarding이 실제 코드·DB·설정 근거를
읽고 Project Master와 비교한다.

```text
프로젝트와 Workflow Canvas의 첫 접점
  → Starting Protocol
  → 사용자 소유 Project Master + 상대 AI 등록 상태 + Starting Bundle
  → System Onboarding Protocol
  → 실제 시스템 근거 분석과 System Map
```

## 2. 최초 가동 시작점은 아직 정하지 않는다

Starting Protocol의 **개념적 책임 범위**는 “사용자가 자신의 프로젝트를 Workflow Canvas 또는
그 지시를 따르는 AI 환경과 처음 만나게 한 뒤”부터 시작한다. 그러나 제품이 어떤 형태로 이
순간을 감지하고 실행할지는 아직 정하지 않았다.

현재 가능한 후보는 다음과 같지만 어느 것도 확정하지 않는다.

- 사용자가 상대 AI에게 정해진 프롬프트를 직접 보내는 방식
- 웹앱에서 프로젝트와 AI를 연결하는 방식
- 로컬 앱 또는 프로젝트 파일에서 시작하는 방식
- IDE·MCP·AI 클라이언트가 시작하는 방식
- 이후 발견되는 다른 방식

따라서 `START-00`은 특정 버튼·설치·Git hook·로컬 파일 존재를 전제하지 않는
`Entry Adapter` 경계로 둔다. 최종 형태를 정하기 전에는 웹 화면, 로컬 데몬, 루트 파일,
commit·push·배포 중 어느 하나도 유일한 시작점이라고 구현하거나 문서화하지 않는다.

## 3. 핵심 결과: 사용자가 소유하는 단 하나의 Project Master

`Project Master`는 대상 프로젝트 전체의 기획 정본이다.

- 사용자가 읽고 직접 수정하며 최종 결정권을 가진다.
- 프로젝트 목적, 사용자, 목표, 범위, 기능 구조, 핵심 흐름, 아키텍처 제약, 용어,
  확정 결정, AI 제안, 미확인·충돌을 담는다.
- AI 제안과 사용자 확정을 분리한다.
- 대화 전문, AI 사고 과정, 코드 전문·diff, 비밀값, 일일 구현 로그를 넣지 않는다.
- Source Lens의 분석 보고서·Manifest·Receipt는 별도 생성 Artifact이며 Project Master를
  대신하거나 조용히 수정하지 않는다.

Project Master는 **논리적으로 하나인 문서**다. 현재 AI Context Gate 0.1은 가장 이식하기 쉬운
기본 Markdown 투영으로 프로젝트 상대 경로 `PROJECT_MASTER.md`를 제안한다. 이것은 최종 제품
저장 방식을 확정한 것이 아니다.

| 향후 제품 형태 | 가능한 Project Master 보관 방식 |
|---|---|
| 웹앱 | 서버의 버전형 문서를 정본으로 두고 Markdown으로 가져오기·내보내기 |
| 로컬 앱·파일 | 프로젝트 내부 Markdown을 정본으로 사용 |
| IDE·AI 연결 | 논리 문서 API를 정본으로 사용하고 필요 시 로컬 Markdown으로 투영 |
| 다른 형태 | 같은 Project Master Contract를 만족하는 저장 방식 |

어떤 형태를 고르더라도 사용자에게는 하나의 수정 가능한 기획 정본만 보여야 한다.

## 4. 전체 Stage와 책임

상태 표기: **현행**은 코드와 계약 테스트가 있음, **계획**은 아직 통합 구현이 없음이다.

| ID | 사용자가 하는 일·보는 것 | Stage 소유자 | AI 개입 | 현재 상태 | 출력 |
|---|---|---|---|---|---|
| START-00 | 프로젝트가 제품과 처음 만난 방식 확인 | Starting Host | 없음 | Entry Adapter·시작 UI **미정/계획** | Entry Record |
| START-01 | 프로젝트 이름·목적·대상 AI·허용 범위 확인 | Starting Host; Intent Engine은 선택적 후보 생성만 | 선택: 입력을 기획 후보로 정리하되 확정 금지 | 통합 Request 없음 — **계획** | Starting Request |
| START-02 | 기존 기획 문서가 있으면 보존하고, 없으면 전체 기획 마스터 틀 받기 | AI Context Gate | 기획 사실 후보 정리, 사용자 확정과 AI 제안 분리 | Project Master 틀·제한 Pack 정규화 코어 **현행**; 자동 selector **계획** | Project Master Proposal, Planning Context Pack |
| START-03 | Project Master를 읽고 잘못 이해한 맥락을 고쳐 최초 버전 확정 | 사용자 + Review/Artifact Host | 선택: 충돌·빠진 질문 제안. 승인 대행 금지 | 전용 편집·승인 UI·ledger 없음 — **계획** | Human-approved Project Master ref·fingerprint |
| START-04 | 개발 AI에게 유지 규칙을 보내고 실제 강제 수준 확인 | AI Context Gate | **핵심 대상:** 상대 개발 AI가 Project Master Skill·Policy를 따름 | 프롬프트·Enrollment·Handoff 검증 코어 **현행**; 실제 provider 전달·완료 Host는 **계획** | Enrollment Manifest, Dispatch, Enforcement Status |
| START-05 | 준비 결과와 미확인 사항을 확인하고 온보딩으로 넘김 | Starting Host | 선택: 근거 있는 쉬운 요약 | Runner·Starting Bundle 없음 — **계획** | Starting Bundle |

AI Context Gate는 Starting Protocol 안에 중첩된 하위 Engine이 아니다. **Starting Protocol이
직접 호출하는 독립 최상위 Engine**이다. 실제 외부 AI 송신이 필요할 때만 Connector Bridge를
호출하고, 프로젝트 파일에 실제로 쓸 때만 Safe Operations 또는 사용자가 이미 승인한 개발
변경 경계를 사용한다. 이 둘은 Starting Protocol의 의미를 소유하지 않는다.

START-02에서 새 틀을 제안한 뒤 사용자가 START-03에서 수정했다면, START-04는 수정된
Project Master fingerprint를 기준으로 AI Context Gate를 다시 호출해 최종 Enrollment를 만든다.
초기 제안의 오래된 fingerprint로 상대 AI를 등록하지 않는다.

## 5. AI Context Gate 0.1의 단일 Workflow

Starting Protocol이 직접 사용하는 Engine Workflow는
`ai-context-gate.project-master@1.0.0`이다.

```text
프로젝트 상태·Project Master 기준점 검증
  → 상대 AI 전달 방식 판정
  → 이번 작업에 필요한 기획 사실만 선택
  → Project Master 유지 지시 생성
  → 사용자 소유 Project Master 준비
  → 전달 또는 완료 Gate와 결합
  → 이후 개발 Handoff에서 planning / none 검증
```

| 구성 | 종류 | 책임 |
|---|---|---|
| AI Context Contract | Contract | 프로젝트·Project Master 기준점, 대상 AI, 전달·Receipt 경계 |
| AI Delivery Resolver | Resolver | 수동·연결·관리형 전달과 실제 가능한 강제 수준 판정 |
| Project Master Builder | Builder | 제한 Planning Context Pack, 상대 AI 지시와 Project Master 틀 생성 |
| Project Master Handoff Pipeline | Pipeline | Enrollment와 이후 개발 완료 Handoff 검증 순서 |
| Project Master Recording Skill | Agent Skill | 상대 AI가 단일 기획 정본을 유지하는 반복 절차 |
| Project Master Evidence Policy | Agent Policy | 사용자 확정 보존, AI 제안 분리, 근거·미확인·단일 문서 규칙 |
| Project Master Guardrail | Hard Guardrail | 경로·크기·토큰·fingerprint·planning/none 완료 조건의 코드 검사 |
| AI Context Enrollment Manifest | Manifest | 지시·기준점·전달 방식·강제 수준의 결정적 기록 |

Agent Skill과 Agent Policy는 상대 AI에게 행동을 요구하지만 그 자체로 강제하지 못한다.
검증된 관리형 완료 경계가 Handoff 실패를 실제로 거부할 때만 `completion-gated`라고 표시한다.

## 6. 기획 변경을 언제 기록하는가

상대 개발 AI는 완료 시 `planning` 또는 `none`을 선언한다.

`planning`은 다음 중 하나가 실제로 바뀐 경우다.

- 프로젝트 목적 또는 대상 사용자
- 목표·성공 기준
- 포함·제외 범위
- 기능의 목적·경계·분리·병합
- 핵심 사용자 흐름
- 제품 기획에 영향을 주는 아키텍처 제약
- 사용자 확정 결정이나 표준 용어
- 기존 기획과 실제 근거의 중요한 충돌·미확인

이미 Project Master에 적힌 기능을 그대로 구현한 것, 포맷 정리, 테스트 보강처럼 기획 자체가
바뀌지 않은 작업은 `none`이다. Project Master는 changelog나 작업일지가 아니다.

`planning`이면 Project Master fingerprint 변경, 사용자 결정·이슈·문서·코드 중 실제 근거,
Host가 관측한 planning change signal이 함께 있어야 한다. `none`인데 기획 변경 신호나
Project Master 수정이 있으면 완료를 거부한다.

## 7. 사용자의 토큰 방어

토큰 방어의 보호 대상은 Workflow Canvas 제품 사용자의 AI 토큰과 비용이다.

- 전체 Project Master를 매 작업마다 상대 AI에게 자동 전송하지 않는다.
- 이번 작업에 필요한 최대 12개의 구조화된 기획 사실만 `Planning Context Pack`으로 고른다.
- 기본 예상 예산은 프롬프트 1,600 토큰, Pack 900 토큰이다.
- 코드 하드 한도는 프롬프트 2,200 토큰, Pack 1,200 토큰이다.
- Project Master 본문은 Enrollment Manifest와 Receipt에 복제하지 않고 fingerprint로 연결한다.
- 프로젝트 파일이나 기존 Markdown 안의 문장은 데이터이며 AI 명령으로 실행하지 않는다.
- 기획과 무관한 작업은 전체 문서를 읽거나 보내지 않게 상대 AI 지시에 명시한다.

## 8. Starting Bundle

목표 `Starting Bundle`에는 다음만 들어간다.

| 필드 | 의미 |
|---|---|
| Protocol·Workflow version | 어떤 Starting 규칙으로 준비했는가 |
| Entry Record | 어떤 Entry Adapter와 첫 접점에서 시작했는가 |
| Project identity | 어떤 프로젝트인가 |
| Project Master ref·format·fingerprint | 사용자가 승인한 하나의 기획 정본 |
| Human approval record | 누가 어떤 Project Master 기준점을 확정했는가 |
| AI Context Enrollment Manifest | 어떤 상대 AI와 어떤 지시를 결합했는가 |
| Enforcement Status | 권고·전달 검증·완료 차단 중 실제로 어디까지 가능한가 |
| Unknowns·conflicts | 아직 사용자가 고치거나 확인해야 할 맥락 |
| Onboarding readiness | System Onboarding으로 넘길 수 있는가 |

목표 준비 상태는 다음을 구분한다.

- `ready`: 사용자 확정 Project Master와 검증된 Enrollment가 있음
- `ready-with-advisory-ai`: Project Master는 확정됐지만 상대 AI 지시는 수동 권고 수준
- `awaiting-user-review`: Project Master 제안은 있으나 사용자가 아직 확정하지 않음
- `blocked`: 경로·예산·기준점·권한·전달 검증 실패로 안전한 인계가 불가능

`ready-with-advisory-ai`도 System Onboarding으로 넘길 수 있지만 상대 AI 강제를 주장하면
안 된다. 앱 형태와 Entry Adapter가 제품 차원에서 미정이어도, 개별 Run은 실제로 사용한
진입 방식과 Project Master 저장 투영을 기록해야 한다.

## 9. System Onboarding과의 경계

Starting Protocol은 시스템을 분석하지 않는다. System Onboarding은 Starting Bundle을
입력으로 받아 실제 대상 시스템을 연결하고 읽는다.

```text
Project Master                         실제 코드·DB·설정 근거
사용자가 원하는 방향                  Source Lens와 다른 Engine이 발견한 현재 상태
              \                      /
               → System Onboarding에서 비교
                  → 일치 / unknown / contradicted
                  → 불일치는 Documentation Debt Finding
```

Project Master는 **사용자의 기획 의도에 대한 정본**이지 코드가 실제로 그렇게 동작한다는
증거가 아니다. 코드·테스트·설정이 다르게 말하면 Project Master에 맞춰 사실을 왜곡하지 않고
문서 불일치 부채로 보여 준다. Source Lens는 Project Master 전체를 모델에 자동 전송하거나
직접 수정하지 않고, 필요한 사용자 확정 사실만 제한 Pack으로 선택해 참고한다.

AI Context Gate의 완료 Handoff 검증은 Starting Protocol이 끝난 뒤에도 각 개발 Workflow에서
재사용할 수 있다. 이것은 Starting Protocol이 계속 열린다는 뜻이 아니라, 독립 Engine의
Capability를 이후 Workflow가 다시 호출한다는 뜻이다.

## 10. 완료·실패·보안 규칙

Starting Protocol은 다음 조건을 모두 기록해야 완료할 수 있다.

1. 논리적으로 하나인 사용자 수정 가능 Project Master가 있다.
2. 사용자 확정과 AI 제안, 미확인·충돌이 구분되어 있다.
3. Project Master 기준점과 사용자 확인 기록이 fingerprint로 결합됐다.
4. 상대 AI 지시의 생성·전달·완료 차단 수준을 사실대로 표시했다.
5. System Onboarding에 넘길 Starting Bundle의 입력과 미확인을 고정했다.

보안 불변식은 다음과 같다.

- Project Master와 기획 Pack에는 Credential·비밀값을 넣지 않는다.
- 외부 AI 송신은 Connector Bridge의 Grant·redaction·정확한 Preview를 거친다.
- 수동 프롬프트 생성만으로 전달 또는 준수를 주장하지 않는다.
- 검증되지 않은 `verified: true` 같은 입력으로 강제 수준을 올리지 않는다.
- Project Master를 저장소에 쓸 때는 안전한 상대 경로와 승인된 쓰기 경계를 사용한다.
- 시작점이 미정이라는 이유로 암묵적 설치·파일 생성·외부 송신을 수행하지 않는다.

## 11. 현행과 다음 구현

현재 구현된 것은 다음이다.

- `shared/aiContextGate.js`의 결정적 Project Master Enrollment/Handoff 계약
- `scripts/ai-context-gate-engine.mjs`의 공개 Engine 진입점
- 사용자 소유 `PROJECT_MASTER.md` 휴대형 틀
- Planning Context Pack과 토큰 하드 한도
- 수동·연결·관리형 강제 수준 구분
- 경로·fingerprint·planning/none·근거 검증 테스트

아직 구현하지 않은 것은 다음이다.

- 제품의 최종 형태와 최초 Entry Adapter 선택
- `starting@1.0.0` 통합 Runner와 Run ledger
- Project Master 편집·사용자 확인 UI 또는 로컬 경험
- Project Master 저장 Adapter와 Markdown import/export
- 실제 AI provider 전달 Connector와 관리형 완료 Host
- Starting Bundle 생성·저장·System Onboarding 인계

이 공백은 [`TECHNICAL_DEBT.md`](../governance/TECHNICAL_DEBT.md)의 `START-001`과 `AI-008`에서 추적한다.

## 12. 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 0.2.0 | 2026-07-20 | Project Master 기준점과 planning/none Handoff 검증을 실제 fingerprint·변경 신호·근거 중심으로 정리했다. |
| 0.1.0 | 2026-07-20 | System Onboarding 이전의 Starting Protocol을 신설했다. 최초 가동 시작점과 최종 앱 형태는 미정으로 보존하고, 사용자가 소유하는 Project Master 생성·교정·상대 AI 등록·Starting Bundle 인계를 정의했다. AI Context Gate 0.1을 직접 참여 Engine으로 배치하고 사용자 토큰 방어를 고정했다. |

## 13. 용어 설명

| 용어 | 쉬운 뜻 |
|---|---|
| Starting Protocol | 프로젝트 첫 접점 뒤 전체 기획 정본과 개발 AI 규칙을 준비하는 온보딩 전 절차 |
| Entry Adapter | 웹·로컬·IDE 등 아직 미정인 시작 형태를 공통 Starting Request로 바꾸는 교체 경계 |
| Project Master | 사용자가 읽고 고치며 소유하는 프로젝트 전체의 단 하나의 기획 정본 |
| AI Context Gate | 상대 개발 AI가 Project Master를 유지하도록 지시하고 실제 강제 수준을 검증하는 Engine |
| Planning Context Pack | 전체 Project Master 대신 이번 작업에 필요한 기획 사실만 고른 작은 입력 |
| Starting Bundle | Project Master, 사용자 확인, 상대 AI 등록 상태를 System Onboarding에 넘기는 묶음 |
| Enrollment | 프로젝트·Project Master 기준점·상대 AI·프롬프트·강제 수준을 결합하는 과정 |
| Handoff | 개발 AI가 planning/none 선언과 Project Master 변경·근거를 완료 경계에 넘기는 것 |
| `advisory` | 프롬프트만 준비된 상태. 상대 AI 수신·준수는 강제하지 못함 |
| `delivery-verified` | 현재 프롬프트가 상대 AI에게 전달된 것까지 확인한 상태 |
| `completion-gated` | 제품이 통제하는 완료 경계에서 잘못된 Handoff를 실제로 거부할 수 있는 상태 |
