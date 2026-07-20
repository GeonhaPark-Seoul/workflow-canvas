# AI Context Gate 마스터 문서

> 이 문서는 사용자가 기획하는 AI Context Gate의 사람용 Engine 상세 정본이다.
> 제품 전체 방향은 [`MASTER.md`](../MASTER.md), 이 Engine을 처음 호출하는 선행 흐름은
> [`STARTING_PROTOCOL.md`](../protocols/STARTING_PROTOCOL.md)가 우선한다.

| 항목 | 현재 기준 |
|---|---|
| 문서 버전 | 0.3.0 |
| 현행 Engine | AI Context Gate 0.1.0-alpha.0 |
| 현행 Workflow | `ai-context-gate.project-master@1.0.0` |
| 공개 실행 파일 | [`../scripts/ai-context-gate-engine.mjs`](../../scripts/ai-context-gate-engine.mjs) |
| 순수 계약 구현 | [`../shared/aiContextGate.js`](../../shared/aiContextGate.js) |
| 테스트 | [`../scripts/test-ai-context-gate.mjs`](../../scripts/test-ai-context-gate.mjs) |
| Protocol 역할 | Starting Protocol의 직접 참여 Engine |

## 1. 비개발자를 위한 쉬운 설명

> **AI Context Gate는 개발을 맡은 상대 AI에게 “우리 프로그램의 프로젝트 기획은 사용자가
> 소유하는 Project Master를 기준으로 유지하라”라고 지시하고, AI가 실제로 그 규칙을 지키지 않으면 어디까지
> 완료를 막을 수 있는지 검증하는 Engine이다.**

사용자가 읽고 고치는 문서는 기능군만 적는 작은 보조 파일이 아니라 프로젝트 전체의
`Project Master`다. 여기에는 프로젝트 목적·사용자·목표·범위·기능 구조·핵심 흐름·제약·
용어·결정·미확인이 들어간다.

AI Context Gate는 다음 결과를 만든다.

1. 사용자가 소유하는 하나의 Project Master 틀 또는 기존 문서 호환 판정
2. 상대 개발 AI에게 보낼 Project Master 유지 프롬프트
3. 전체 문서 대신 이번 작업에 필요한 사실만 고른 Planning Context Pack
4. 프롬프트 생성·전달 확인·실제 완료 차단을 구분한 Enforcement Status
5. 기준점에 결합된 Enrollment Manifest와 이후 개발 완료 Handoff Receipt

Workflow Canvas가 사용자와 함께 기획을 진행할 때 읽고 고치는 기준 문서는 Project Master다.

## 2. 고유 책임과 하지 않는 일

AI Context Gate의 고유 상태 변환은 다음 하나다.

```text
프로젝트 상태 기준점
+ 상대 AI 전달 방식
+ 선택된 기획 사실
+ 선택적 기존 Project Master
  → Project Master 호환 판정 또는 휴대형 틀
  → 상대 AI용 단일 기획 정본 유지 지시
  → 전달·강제 수준
  → 기준점에 결합된 Enrollment Manifest
  → 이후 planning / none 완료 Handoff 검증과 Receipt
```

다음 책임은 이 Engine 안에 넣지 않는다.

| 하지 않는 일 | 소유자 |
|---|---|
| Starting Protocol의 첫 접점·사람 검토·최종 인계 순서 | Starting Protocol과 Host |
| 저장소·AI provider·로컬 앱과 실제 통신 | Connector Bridge |
| 코드·DB·설정의 실제 의미와 현재 구조 분석 | Source Lens |
| 프로젝트 파일에 실제 쓰기·commit·rollback | Safe Operations 또는 승인된 개발 변경 |
| 사용자를 대신해 기획 제안 확정 | 어떤 Engine도 할 수 없음 |
| Project Master를 코드의 실제 동작 증거로 취급 | 금지 |
| 프롬프트 생성만으로 상대 AI 준수·강제 주장 | 금지 |

Engine은 여러 파일에 구현될 수 있지만 다른 Engine을 내부 Component로 소유하지 않는다.
외부 전달이 필요할 때 Connector Bridge를 호출하는 것은 Workflow 연결이지 Engine 중첩이 아니다.

## 3. 단 하나의 Workflow

AI Context Gate가 소유하는 Workflow는
`ai-context-gate.project-master@1.0.0` 하나다.

```text
프로젝트 상태·Project Master 기준점 검사
  → 상대 AI 전달 방식 판정
  → 필요한 기획 사실만 선택
  → Project Master 유지 지시 생성
  → 사용자 소유 Project Master 준비
  → 전달 또는 완료 Gate에 결합
  → 개발 완료 Handoff 검증·Receipt 발급
```

| # | Stage | 해야 하는 일 | 구성 분류 | 현행 상태 |
|---:|---|---|---|---|
| 1 | 기준점 검증 | 프로젝트 ID, project-state/Project Master fingerprint, 안전한 상대 경로와 입력 크기 검사 | AI Context Contract + Project Master Guardrail | 구현 |
| 2 | 전달 방식 판정 | 수동 프롬프트, 연결된 AI, 제품 통제 개발 실행 구분 | AI Delivery Resolver + Manifest | 구현 |
| 3 | 제한 기획 입력 | Host가 이번 작업용으로 고른 확정·제안·미확인 기획 사실을 정규화하고 예산 검사 | Project Master Builder + Project Master Guardrail | 정규화·예산은 구현; 자동 selector는 계획 |
| 4 | 지시 생성 | planning/none 선언, Project Master 갱신, 사용자 확정 보존을 프롬프트로 생성 | Project Master Builder + Recording Skill + Evidence Policy | 구현 |
| 5 | 문서 준비 | 기존 호환 문서를 보존하거나 사람이 고칠 새 Project Master 틀 제안 | Project Master Builder + Evidence Policy | 구현 |
| 6 | 전달·Gate 결합 | Connector 전달 요청 또는 제품이 통제하는 완료 경계와 정확한 prompt fingerprint 결합 | Handoff Pipeline + Delivery Resolver + Guardrail | 계약 구현; 실제 provider·완료 Host 계획 |
| 7 | Handoff 검증 | planning/none 선언, Host 변경 신호, 실제 근거, Project Master 변경과 기준점 대조 | Handoff Pipeline + Guardrail + Enrollment Manifest | 구현 |

### 3.1 내부 구성요소

| Registry Component | 종류 | 책임 |
|---|---|---|
| AI Context Contract | Contract | 프로젝트·Project Master 기준점, 대상 AI, 전달·Receipt 계약 |
| AI Delivery Resolver | Resolver | 전달 방식과 실제 근거에 맞는 강제 수준 판정 |
| Project Master Builder | Builder | Planning Context Pack, 상대 AI 프롬프트, Project Master 틀 생성 |
| Project Master Handoff Pipeline | Pipeline | Enrollment부터 개발 완료 Receipt까지 순서 조정 |
| Project Master Recording Skill | Agent Skill | 상대 AI가 하나의 기획 정본을 유지하는 반복 절차 |
| Project Master Evidence Policy | Agent Policy | 사용자 확정 보존, AI 제안 분리, 근거·미확인 기록 규칙 |
| Project Master Guardrail | Hard Guardrail | 경로·크기·토큰·fingerprint·planning/none 조건 코드 강제 |
| AI Context Enrollment Manifest | Manifest | 어떤 지시와 기준점이 어떤 강제 수준에 묶였는지 기록 |

Skill과 Policy는 상대 AI에게 지시하는 행동 규칙이다. 실제 차단은 Workflow Canvas가 통제하는
Host·Connector·파일 경계에서 Guardrail이 검증될 때만 생긴다.

## 4. Project Master 계약

Project Master는 다음 내용을 담는 프로젝트 전체 기획 정본이다.

1. 프로젝트 한 문장
2. 해결할 문제와 사용자
3. 목표와 성공 기준
4. 포함·제외 범위
5. 기능 구조
6. 핵심 사용자 흐름
7. 기획에 영향을 주는 아키텍처와 제약
8. 표준 용어
9. 사용자 확정 결정
10. 확인 대기 중인 AI 제안
11. 미확인·충돌

사용자가 최종 소유자다. AI는 사용자 확정 절을 조용히 덮어쓰지 않고 제안을 별도 절에
둔다. 대화 전문, 사고 과정, 코드 전문·diff, Credential, 일일 구현 로그는 Project Master에
넣지 않는다.

현재 코어는 휴대 가능한 Markdown 기본 투영으로 `PROJECT_MASTER.md`와
`<!-- workflow-canvas:project-master@1 -->` marker를 제안한다. 이것은 최종 앱 형태나 저장
방식을 확정한 것이 아니다. 웹 정본+Markdown export, 로컬 파일 정본, IDE 문서 API 모두 같은
논리 Contract를 구현할 수 있다.

Source Lens 보고서·Structural/Functional Community·분석 Manifest는 생성 시점의 근거
Artifact다. 그것을 사용자가 Project Master에서 교정할 수는 있지만 보고서를 곧바로 사용자
확정 기획으로 승격하거나 Project Master를 자동 덮어쓰지 않는다.

## 5. 상대 AI에게 전달하고 강제하는 방법

| 방식 | 확인 가능한 것 | 표시 수준 |
|---|---|---|
| 수동 프롬프트 | 프롬프트가 만들어졌음 | `advisory` |
| 연결된 AI | 신뢰된 Host가 현재 prompt fingerprint의 Connector Receipt를 검증 | `delivery-verified` |
| 관리형 개발 완료 | 제품이 통제하는 완료 경계가 Handoff 실패를 실제 거부 | `completion-gated` |

요청 본문의 `verified: true`, 상대 AI의 자기 선언, 전달되지 않은 프롬프트는 강제 증거가
아니다. 신뢰된 Host 검증기가 현재 fingerprint와 전달 Receipt 또는 완료 Gate의 결합을
확인한 경우에만 수준을 올린다.

주 강제 시점은 Git push 하나가 아니라 **개발 AI가 작업 완료를 선언하는 순간**이다.

```text
개발 AI가 완료 요청
  → planning / none 선언
  → Host가 프로젝트 상태·Project Master 기준점과 실제 변경 신호 확인
  → planning이면 Project Master 변경 + 실제 근거 요구
  → 검증 성공: 완료와 Receipt 허용
  → 검증 실패: 완료 거부
```

pre-commit, pull request required check, 배포 전 검사는 선택적 추가 방어선이다. 어느 Git
Event 하나도 모든 개발 방식을 포괄하지 못하므로 유일한 강제 시점으로 삼지 않는다.

## 6. planning과 none

`planning`은 프로젝트 목적·사용자·목표·성공 기준·범위·기능 경계·핵심 흐름·아키텍처
제약·확정 결정·용어·중요 미확인이 바뀐 경우다. 이미 문서화된 기능의 단순 구현이나
기획에 영향을 주지 않는 리팩터링·테스트 보강은 `none`이다.

`planning` Handoff에는 다음이 필요하다.

- Project Master fingerprint 변경
- Host가 관측한 planning change signal
- 사용자 결정·이슈·문서·코드 중 실제 evidence ref
- 상대 AI의 근거가 Host가 관측한 근거 범위 안에 있음

`none`인데 Project Master가 바뀌거나 planning signal이 있으면 거부한다. Project Master는
작업일지나 changelog가 아니므로 모든 코드 변경을 기록하지 않는다.

## 7. 사용자의 토큰 방어

토큰 방어는 Workflow Canvas 제품 사용자의 AI 토큰과 비용을 보호한다.

- 전체 Project Master를 매 작업마다 자동 전송하지 않는다.
- 이번 작업에 필요한 구조화된 기획 사실만 Planning Context Pack으로 고른다.
- 현행 기본 예산은 프롬프트 1,600, Pack 900 예상 토큰이다.
- 코드 하드 한도는 프롬프트 2,200, Pack 1,200 예상 토큰이다.
- Pack은 최대 12개 기획 사실만 담는다.
- Manifest와 Receipt에는 문서 본문 대신 fingerprint와 예산을 남긴다.
- 기획과 무관한 작업은 전체 Project Master를 읽거나 보내지 않게 프롬프트에 명시한다.

이 예상치는 provider 청구량이 아니다. 실제 provider 사용량·비용은 Connector Receipt가
별도로 기록해야 한다.

## 8. 새 프로젝트와 이미 개발된 프로젝트

### 처음부터 함께 개발하는 프로젝트

1. Starting Protocol이 Project Master 틀을 준비한다.
2. 사용자가 프로젝트 목적·범위·기능과 첫 결정을 확인한다.
3. AI Context Gate가 확정 fingerprint에 상대 AI 지시를 결합한다.
4. 기획이 실제로 바뀔 때 상대 AI가 같은 Project Master를 갱신한다.
5. 이후 System Onboarding과 Source Lens는 필요한 확정 사실만 제한 Pack으로 참고한다.

### 이미 개발된 프로젝트

1. 기존 전체 기획 문서가 있으면 삭제하지 않고 호환·migration 필요 여부를 표시한다.
2. 문서가 없으면 Project Master 틀을 제안한다.
3. 기존 문서와 사용자의 설명으로 초기 기획 후보를 만든다.
4. System Onboarding 후 Source Lens의 실제 근거와 Project Master를 비교한다.
5. 사용자는 Project Master에서 잘못 이해한 맥락을 수정한다.
6. 기획과 실제 시스템의 불일치는 Documentation Debt Finding으로 남긴다.

Starting Protocol 안에서 소스를 분석하는 것은 아니다. 초기 Project Master가 불완전해도
미확인을 보존한 채 인계할 수 있고, System Onboarding 결과를 본 사용자가 다시 교정한다.

## 9. 다른 Protocol·Engine과의 연결

```text
Entry Adapter 미정
  → Starting Protocol Host
  → AI Context Gate: Project Master 제안·상대 AI Enrollment
  → 사용자 검토·확정
  → Starting Bundle
  → System Onboarding
     → Connector Bridge: 허용된 실제 근거 교환
     → Source Lens: 소스 분석과 기능 Community
     → Project Master와 실제 근거 차이: Documentation Debt
```

- AI Context Gate가 실제 외부 AI에 송신하지 않는다. Connector Bridge가 담당한다.
- AI Context Gate가 소스를 분석하거나 Project Master의 진위를 코드 대신 판정하지 않는다.
- Source Lens는 Project Master 전체를 자동 전송·수정하지 않는다.
- 저장소에 실제 파일을 쓰는 경계는 Safe Operations 또는 승인된 개발 변경이다.
- Protocol이 끝난 뒤 다른 개발 Workflow도 AI Context Gate의 Handoff Capability를 재사용할
  수 있다.

## 10. 현행 코드와 남은 구현

### 현재 구현

- 결정적인 Enrollment Manifest와 Handoff Receipt
- Project Master 휴대형 Markdown 틀
- Planning Context Pack과 프롬프트 토큰 하드 한도
- 수동·연결·관리형 강제 수준과 신뢰된 Host 검증
- 안전한 상대 경로, 크기, project-state/Project Master fingerprint 검사
- `planning`인데 Project Master·근거·변경 신호가 없는 완료 거부
- `none`인데 Project Master 또는 planning signal이 바뀐 완료 거부
- 사용자 확정을 조용히 덮어쓰지 않도록 하는 상대 AI 지시

### 아직 구현하지 않은 것

- 최종 앱 형태와 Starting Protocol 최초 Entry Adapter
- Claude·Codex·IDE·MCP 등의 실제 provider 전달 Adapter
- Connector Bridge의 실제 `ConnectorExchangeRequest` 실행
- 관리형 개발 완료 API·버튼·required check 연결
- Project Master parser와 작업별 Planning Context Pack selector
- 사용자용 Project Master 교정·승인·버전 UI
- Safe Operations를 통한 선택적 파일 생성·수정
- Starting Bundle과 System Onboarding 인계

## 11. 검증

```bash
node scripts/test-ai-context-gate.mjs
node scripts/test-engine-registry.mjs
```

테스트는 결정성, 경로·크기·토큰 한도, 전달 Receipt, 완료 Gate, Project Master
정책, planning/none, 실제 근거, stale 기준점과 Receipt fingerprint를 검사한다.

## 12. 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 0.3.0 | 2026-07-20 | Handoff 검증을 Project Master fingerprint, planning signal과 실제 근거 중심으로 정리했다. |
| 0.2.0 | 2026-07-20 | 사람이 수정하는 결과를 기능 맥락 보조 파일에서 프로젝트 전체의 Project Master로 재정의했다. AI Context Gate를 System Onboarding 내부가 아니라 Starting Protocol의 직접 참여 Engine으로 옮기고, Planning Context Pack, planning/none Handoff와 미정인 앱 형태·진입점 경계를 반영했다. |
| 0.1.0 | 2026-07-20 | 기능 맥락 문서와 상대 AI Enrollment/Handoff의 최초 Engine 경계를 기록했다. |

## 13. 쉬운 용어 설명

| 용어 | 쉬운 뜻 |
|---|---|
| AI Context Gate | 상대 개발 AI가 사용자의 Project Master를 유지하도록 지시하고 강제 수준을 검증하는 Engine |
| Project Master | 사용자가 읽고 수정하며 소유하는 프로젝트 전체의 단 하나의 기획 정본 |
| Planning Context Pack | 전체 문서 대신 이번 작업에 필요한 기획 사실만 고른 작은 입력 |
| Enrollment | Project Master 기준점·상대 AI·프롬프트·전달/강제 상태를 처음 결합하는 과정 |
| Handoff | 개발 AI가 planning/none 선언과 문서 변경·근거를 완료 경계에 넘기는 것 |
| `planning` | 프로젝트 목적·범위·기능 경계·핵심 흐름·결정 등 기획 자체가 바뀜 |
| `none` | 구현은 바뀌었어도 Project Master에 적을 기획 변경은 없음 |
| `advisory` | 프롬프트만 준비됐고 상대 AI 준수는 강제하지 못함 |
| `delivery-verified` | 현재 프롬프트 전달까지 신뢰된 Host가 확인 |
| `completion-gated` | 잘못된 Handoff를 제품이 통제하는 완료 경계에서 실제 거부 |
| Agent Skill | 상대 AI가 따라야 할 반복 작업 절차 |
| Agent Policy | 상대 AI 행동 규칙. 그 자체는 코드 강제가 아님 |
| Hard Guardrail | Workflow Canvas가 통제하는 경계에서 코드로 우회를 막는 검사 |
