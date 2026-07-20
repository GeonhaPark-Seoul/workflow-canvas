# Source Lens 마스터 문서

> 이 문서는 사용자가 기획하는 Source Lens의 사람용 Engine 상세 정본이다.
> 제품 전체 방향과 표준 용어는 [`MASTER.md`](../MASTER.md)가 우선하며, 다른 Engine을
> 연결하는 제품 Workflow는 [`WORKFLOW_CATALOG.md`](../protocols/WORKFLOW_CATALOG.md)에서 관리한다.

| 항목 | 현재 기준 |
|---|---|
| 문서 버전 | 0.7.0 |
| 현행 Engine | Source Lens 0.9.0-alpha.0 |
| 현행 Workflow | `source-lens.source-analysis@1.1.0` |
| Source Profile | Workflow Canvas 0.9.0, FastAPI Reference 0.2.0 |
| 공개 실행 파일 | [`../scripts/source-lens-engine.mjs`](../../scripts/source-lens-engine.mjs) |
| Graphify 상태 | **도입 방향 확정·실행 미연결** — 첫 지도 분석 Adapter 제공자로 채택 |
| 현행 추가 계약 | `FunctionalContextPack` v1 — G10-0 구현 |
| 다음 계약 | Source 지도 분석 Adapter Contract v1 + Functional Community Contract v1 + 제한 Planning Context Pack 연계 — 계획, 미구현 |

이 문서는 `현행`과 `계획`을 구분한다. `현행`은 코드와 테스트가 있는 기능이고, `계획`은
사용자가 확정한 다음 설계이지만 아직 Engine Registry나 실행 계약이 지원한다고 주장하지
않는다. 현행 G10-0 구현은 Engine 0.9와 Workflow 1.1이며 Graphify와 F1~F7은 아직 계획이다.

`Source Twin`과 `twin` 문자열이 포함된 파일·API 이름은 배포 호환을 위해 유지하는 레거시
현행 코드·wire 이름이다. `GraphIntegrityReport`, `CanonicalSourceGraph`, `GraphFinding`,
`graph.json`, `graph.html`처럼 `Graph` 문자열이 포함된 표기는 기존 schema·type·ID·파일 이름이며
backtick 안에서만 유지한다. 이 문서의 제품 개념과 산문은 Asset 원장과 지도로 설명한다.

## 1. 확정 정의와 당분간의 범위

Source Lens를 쉽게 설명하면 다음과 같다.

> **허용된 프로젝트 파일을 읽고, 무엇이 어디에 있으며 서로 어떻게 연결되는지 정리한 뒤,
> 이전 분석과 달라진 점까지 알려 주는 Engine이다.**

당분간은 아래 하나의 Workflow 안에서 분석 정확도·범위·탐색성을 개선한다. 사용자 방향에
따른 범용 재구조화·언어/프레임워크 변환이나 실제 소스 파일 수정은 이번 범위에 넣지 않는다.

```text
분석할 프로젝트 파일
+ 이 프로젝트를 해석하는 설명서
+ 이전 분석 결과가 있다면 함께 입력
+ Starting Bundle의 Project Master에서 고른 사용자 확정 기획 사실이 있다면 제한된 Pack으로 입력
  → 읽어도 되는 파일인지 확인
  → 어떤 종류의 프로젝트인지 파악
  → 파일 종류와 코드 구조 확인
  → 함수·화면·API·DB·설정 근거 찾기
  → 찾은 내용을 기능과 구성요소별로 묶기
  → 서로 어떻게 연결되고 흘러가는지 찾기
  → 최신 문서와 실제 소스 근거에서 기능 어휘 준비
  → 구조상 가까운 묶음과 같은 기능을 수행하는 묶음을 구분
  → 여러 구조 묶음에 흩어진 같은 기능군을 하나의 Functional Community로 정합화
  → 무엇이 주요 기능이고 내부 세부사항인지 구분
  → 이전 분석과 비교해 추가·변경·삭제 찾기
  → 정리된 프로젝트 분석 결과 만들기
```

Graphify는 이 흐름과 별개의 하위 Engine으로 들어가지 않는다. Source Lens 안의 파일 탐색,
근거 추출, 지도 병합, Community와 중요·경계·문제 분석을 수행하는 **첫 Adapter 제공자**로
들어간다. Graphify라는 제품명 하나로 단계를 뭉치지 않고 §4의 세부 능력으로 분해한다.
Graphify가 연결 밀도로 만든 `Structural Community`는 버리거나 덮어쓰지 않는다. Source
Lens는 그 결과를 입력 근거로 사용해 같은 제품 기능에 기여하는 파일·심볼·관계를
`Functional Community`로 정합화하며, 이 과정은 캔버스용 분석 결과를 내보내기 전의 필수
Stage다.

## 2. 현행 구현과 다음 목표

| 능력 | 현행 Source Lens 0.9 | Graphify 도입 목표 |
|---|---|---|
| 파일 읽기 | 허용된 checkout·로컬 저장소의 제한된 파일 | 같은 Corpus Contract를 사용하고 파일 유형·민감정보 진단 보강 |
| 파일 분류·파싱 | JavaScript/JSX AST, 제한 SQL, 일부 구조 전용 파일 | Graphify 구조 추출 Adapter를 추가하되 결과를 공통 Evidence 계약으로 정규화 |
| 의미 추출 | Source Profile과 결정적 규칙 중심 | 문서·이미지 등은 선택적 AI 의미 추출 후보를 별도 provenance로 추가 |
| 관계·Flow | import/call/render/props 중심 정적 CODE 근거 | 하나의 근거 지도로 병합하고 무결성·누락을 검사 |
| 구조 분석 | 영역·서브시스템·Component·모듈·코드 파츠 | Structural Community·cohesion·중요 노드·bridge·orphan·surprising connection 분석 추가 |
| 기능 맥락 준비 | README·기획 문서 최신성을 이전 분석과 비교하고, 없거나 오래됐으면 UI 문구·화면 경로·API·DB·테스트·정적 Flow에서 제한 기능 어휘 Pack 생성 | G10 F1~F7의 입력 어휘·근거로 사용 |
| 기능군 정합화 | `FunctionalContextPack` 준비까지 구현; F1~F7은 미구현 | Structural Community를 보존하면서 여러 Community에 흩어진 같은 기능을 겹침 가능한 Functional Community로 정합화 |
| 기능 경계 | Profile 규칙과 구현·DB 근거로 판정 | Functional Community를 강한 보조 근거로 사용하되 AI 후보만으로 Feature Asset을 확정하지 않음 |
| 결과 | 레거시 `Source Twin`/Feature/Code Part/Flow 호환 Artifact | 정규 Source 지도·지도 Finding·지도 Diagnostics·탐색 인덱스 추가 |
| 탐색 | UI의 검색·계층 탐색·모듈별 지연 조회 | 공통 계약 위의 `query/path/explain` 제공자 교체 가능 구조 |

Graphify 결과는 기존 결정적 Source Lens 근거를 덮어쓰지 않는다. Structural Community는
Provider 원형 분석 결과로 보존하고, Functional Community는 Source Lens가 코드 근거를
검증해 만드는 별도 Canonical Artifact다. Functional Community와 그 라벨도 Product
Area·Component 소유권·Feature Asset·Reality Level을 AI 단독으로 확정하는 권한은 갖지 않는다.

## 3. 물리적 파일 경계

### 유일한 공개 진입점

[`scripts/source-lens-engine.mjs`](../../scripts/source-lens-engine.mjs)가 현행 Source Lens의
**실행 가능한 공개 경계**다. Build Generator, Local Connector와 Source Lens 테스트는 모두
이 파일의 `runSourceLensWorkflow()` 또는 `runSourceLensRepositoryWorkflow()`를 호출한다.
내부 스캐너를 직접 import하지 않는지는 계약 테스트가 검사한다.

현재 공개 진입점은 아직 Graphify Adapter를 호출하지 않는다. 구현할 때는 Graphify를 직접
여러 곳에서 import하지 않고, 이 진입점이 §5의 Adapter Contract와 Capability Resolver를 통해
Stage 구현을 선택해야 한다.

### 현행 소유 구현

| 파일 | Source Lens 안의 책임 |
|---|---|
| `scripts/source-lens-engine.mjs` | 공개 Contract와 단일 Workflow 조율 |
| `scripts/source-twin-scanner.mjs` | bounded corpus 검사, parser 실행, 결정적 근거 추출·병합 |
| `scripts/source-twin-semantics.mjs` | 공통 소스 의미 설명 규칙 |
| `scripts/source-profiles/*.mjs` | 등록 Profile 선택과 제품별 Manifest |
| `shared/sourceProfileContract.js` | Profile Contract 검증 |
| `shared/sourceAssetHierarchy.js` | Component·모듈 계층 구성 |
| `shared/sourceCodeParts.js` | 코드 파츠 정규화·결정적 설명·안정 anchor |
| `shared/sourceFlows.js` | 정적 Relation·Flow 읽기 모델 |
| `shared/sourceFunctionalContext.js` | 문서 최신성 판정, 소스 근거 fallback, 제한 기능 어휘·근거 Pack 구성 |
| `shared/sourceFeatureModel.js` | 기능 Asset·Capability·속성 경계 판정 |

### Source Lens 밖의 책임

| 파일·영역 | 소유자 | 이유 |
|---|---|---|
| `scripts/generate-source-twin.mjs`, 생성 Manifest 파일 | Build/Artifact host | Engine을 호출하고 결과를 파일로 보존 |
| `src/components/SourceTwinPanel.jsx`, `src/lib/sourceTwinApi.js` | Web UI/API client | Artifact를 사용자 화면으로 투영 |
| `shared/sourceModuleProposal.js`, `shared/workflowSourceFeatureBuild.js` | Asset Core/Draw Map 연결 Workflow | 분석 결과를 지도 Proposal로 변환 |
| `shared/sourceEditableProperties.js`, `shared/workflowSourceEditableProperties.js`, `shared/workflowSourceEditCodePartAdapter.js`, `scripts/source-edit-executor.mjs` | Safe Operations | 편집 대상·검증·복구 계약 |
| `scripts/local-connector-agent.mjs` | Connector Bridge | 로컬 파일·Git 읽기와 승인된 실행 경계 |
| `shared/systemStateSnapshot.js`, `mcp/sourceTwinStore.js` | Safe Operations 중심 통합 상태 Workflow | 여러 Engine의 상태 합성·승인·저장·비교 |
| `shared/sourceAiExplanation.js` | Connector Bridge | 외부 AI 제공자 통신 |
| `api/source-twin-webhook.js` | Connector Bridge | GitHub Event 수신·검증 |
| `shared/aiContextGate.js`, `PROJECT_MASTER.md` 기본 투영 | AI Context Gate | 상대 개발 AI의 단일 기획 정본 유지·사용자 교정·토큰 제한 Planning Context Pack·Handoff |

Graphify가 로컬 라이브러리로 실행되면 Source Lens Adapter다. 별도 CLI·MCP·원격 서비스나
외부 AI와 통신하면 그 프로세스·네트워크 경계는 Connector Bridge가 소유한다. Adapter가
Connector의 인증·권한·redaction을 대신하거나 우회할 수 없다.

Starting Protocol이 준비한 전체 Project Master는 Source Lens corpus 정본이나 자동 모델
입력이 아니다. 계획된 Functional Community Resolution은 사용자 확정 항목 중 이번 분석에
필요한 구조화된 기획 사실만 fingerprint와 함께 `Planning Context Pack`으로 받아야 한다.
Source Lens는 그 Pack을 **기획 의도 근거 하나**로 사용하되 파일을 직접 쓰거나 사용자 의미를
조용히 갱신하지 않는다. Project Master와 실제 코드가 다르면 분석 결과를 기획에 맞춰
왜곡하지 않고 System Onboarding의 Documentation Debt Finding으로 넘긴다.

## 4. 단일 Workflow와 Graphify 지도 분석 세부 Flow

Source Lens가 소유하는 Workflow는 계속 하나다. Graphify 도입은 Workflow를 하나 더 만드는
것이 아니라 `source-lens.source-analysis` 내부 Stage 구현을 확장하는 변경이다.

### 4.1 현행 Workflow 1.1

| # | Stage | 구성 분류 | 입력 → 출력 | Adapter | Connector | 상태 |
|---:|---|---|---|---|---|---|
| 0 | Corpus 제공 | Engine 밖 호출 경계 | checkout 또는 허용 local repo → corpus 후보 | Build Checkout Reader / Local Repository Reader | local 입력은 Local Connector | 현행 |
| 1 | 입력 경계 검증 | Contract + Hard Guardrail | 경로·파일 크기 → bounded corpus 또는 거부 | Corpus Reader | 없음 | 부분 현행 |
| 2 | Profile 선택 | Resolver + Manifest | 프로젝트 식별 근거 → 선택 Profile | 제품별 Source Profile | 없음 | 현행 |
| 3 | 파일 분류·구문 분석 | Pipeline + Builder | 파일·지원 수준 → parsed/structure-only/unsupported/failed | Babel/SQL parser | 없음 | 현행 |
| 4 | 근거 추출 | Pipeline + Builder | AST·SQL·파일 구조 → 함수·API·DB·설정·보안 근거 | 현행 Source Extractor | 없음 | 현행 |
| 5 | 제품 의미·계층·코드 파츠 | Resolver + Builder + Manifest | 근거·Profile → 계층·설명·코드 파츠 | Source Profile mapping | 없음 | 현행 |
| 6 | 정적 관계·Flow | Builder | import/call/render/props → Relation·Flow·unknown | Static Flow Adapter | 없음 | 현행 |
| 7 | **G10-0 Functional Context Bootstrap** | Contract + Resolver + Builder + Pipeline + Hard Guardrail | MD·README·기획 문서·UI·화면 경로·API·DB·테스트·Flow·이전 Pack → `FunctionalContextPack` | 내장 Functional Context Adapter | 없음 | **현행** |
| 8 | 기능 경계 | Resolver | Profile 규칙·구현 근거 → Feature/Capability/속성 | Feature Model | 없음 | 현행 |
| 9 | 안정 병합·Bundle | Pipeline + Builder | 현재·이전 분석 → ID·fingerprint·change set·Bundle | Artifact serializer | 없음 | 현행 |

현재 repository reader는 상대 경로·symlink·일반 파일·파일별/전체 크기를 검사하지만,
`runSourceLensWorkflow({ files })`에 이미 만들어진 `Map`을 직접 넣는 경로는 같은 검증을 다시
강제하지 않는다. 지도 Adapter를 붙이기 전에 모든 공개 입력이 하나의 Corpus Contract와
Hard Guardrail을 통과하도록 SL-G0에서 먼저 보완한다.

### 4.2 지도 분석 Adapter와 Source Lens 정합화 목표 Flow

아래 G1~G15 Stage는 **도입 설계가 확정됐지만 아직 미구현**이다. G10-0은 §4.1과 §4.3에
별도로 구현되어 있다. Graphify 이름 하나를 호출하는 대신
각 행이 독립 Capability가 되고, Capability Resolver가 Manifest와 Contract 호환성을 검사해
구현 Adapter를 선택한다. G1~G9와 G11~G15는 지도 분석 제공자가 구현할 수 있고, G10은
Provider 결과를 Source Lens의 제품 기능 관점으로 정합화하는 필수 Stage다.

| # | 세부 Stage | Source Lens 구성 분류 | 첫 제공 Adapter | AI 사용 | 표준 출력 |
|---:|---|---|---|---|---|
| G1 | Corpus inventory·파일 종류 탐지 | Resolver + Hard Guardrail | Graphify Detect Adapter | 없음 | `CorpusInventory` |
| G2 | 변경 파일·cache 대상 결정 | Resolver + Pipeline + Manifest | Graphify Incremental Adapter | 없음 | `SourceFingerprintManifest` |
| G3 | 코드 구조 추출 | Builder | Graphify Structural Extraction Adapter | 없음 | `StructuralEvidenceBatch` |
| G4 | 문서·이미지·미디어 정규화 | Builder + Adapter | Graphify Content Normalization Adapter | 이미지·음성은 조건부 | `NormalizedSourceUnit[]` |
| G5 | 문서·이미지 의미 후보 추출 | Builder + Agent Skill + Agent Policy | Graphify Semantic Extraction Adapter | 조건부 | `SemanticCandidateBatch` |
| G6 | 구조·의미 결과 병합·중복 제거 | Builder | Graphify Evidence Merge Adapter | 없음 | `EvidenceGraph` |
| G7 | ID·edge endpoint·provenance 무결성 검사 | Contract + Hard Guardrail | Graphify 지도 상태 Adapter | 없음 | `GraphIntegrityReport` |
| G8 | Community 탐지·cohesion 계산 | Resolver + Builder | Graphify Community Adapter | 없음 | `CommunityAssignment[]` |
| G9 | 중요 노드·bridge·orphan·surprise 분석 | Resolver + Builder | Graphify 지도 Insight Adapter | 없음 | `GraphFinding[]` |
| G10 | **Functional Community Resolution** — 기능 커뮤니티 정합화·이름·쉬운 설명 | Contract + Resolver + Builder + Pipeline + Agent Skill + Agent Policy + Hard Guardrail | Source Lens Functional Community Candidate Adapter | 기능군 후보 생성에 사용 | `FunctionalCommunitySet` |
| G11 | 정규 Source 지도 조립 | Builder | Graphify 지도 Build Adapter | 없음 | `CanonicalSourceGraph` |
| G12 | `query` 주변 탐색 | Resolver | Graphify Query Adapter | 어휘 확장만 선택 | `ExplorationResult` |
| G13 | `path` 최단 경로 탐색 | Resolver | Graphify Path Adapter | 없음 | `PathResult` |
| G14 | `explain` 근거 기반 설명 | Resolver + Builder + Agent Skill | Graphify Explain Adapter | 문장 생성만 선택 | `ExplanationArtifact` |
| G15 | 지도/report/index 파생물 생성 | Pipeline + Builder + Run Manifest | Graphify Artifact Adapter | 새 AI 없음 | 지도 Artifact attachments |

G1~G11은 기존 Stage 3~8 사이에서 근거와 분석을 보강한다. G10은 Graphify Adapter 내부
단계가 아니라 완성된 Structural Community와 schema type `EvidenceGraph`를 받는 Source Lens Stage다.
Structural Community 원형은 삭제·병합·재라벨링으로 덮어쓰지 않고 별도 Artifact로 보존한다.
G12~G14는 분석이 끝난 같은
schema type `CanonicalSourceGraph`를 읽는 탐색 기능이며 새로운 Engine이나 쓰기 Workflow가 아니다.
`update`와 `cluster-only`도 새 Workflow가 아니라 동일 Definition의 cache/resume 실행 방식이다.
`watch`와 commit hook은 Source Lens Stage가 아니라 Connector가 새 실행을 촉발하는 trigger다.

### 4.3 G10-0 Functional Context Bootstrap — 현행

G10-0은 Graphify가 없어도 먼저 실행할 수 있는 기능 맥락 준비 Stage다. 완성된
Functional Community를 만드는 단계가 아니라, 처음 만난 애플리케이션에서도 F1~F7이 사용할
기능 어휘와 근거를 너무 큰 원문 없이 준비한다.

```text
사용 가능한 MD·README·기획 문서의 최신성 확인
  → 없거나 오래됐으면 화면 경로·UI 문구·API·DB·테스트·정적 Flow에서 기능 어휘 추론
  → FunctionalContextPack 생성
  → 이후 F1~F7 기능 커뮤니티 정합화에서 소비
  → 검증된 기능 맥락을 다음 분석에 재사용
```

| 순서 | 해야 할 일 | 구성 분류 | 현재 구현 |
|---:|---|---|---|
| B1 | README·기획 Markdown의 fingerprint를 이전 Pack과 비교하고 현재 소스가 바뀌었는지 확인 | **Resolver + Hard Guardrail** — Functional Context Resolver/Guardrail | 최초 실행은 `baseline`, 이후 `new`·`changed`·`current`·`possibly-stale`·`missing` 판정 |
| B2 | 사용할 문서가 없거나 코드만 바뀌어 문서가 오래됐을 가능성이 있으면 실제 소스 근거로 전환 | **Resolver + Builder** | UI 텍스트·화면 경로·API route·DB 선언·테스트 파일·정적 Flow에서 후보 수집 |
| B3 | 문서 후보와 소스 후보를 대조해 근거·신뢰도·안정 ID를 붙인 제한 Pack 생성 | **Contract + Builder + Hard Guardrail** | `FunctionalContextPack` v1, 최대 문서·문자·어휘·근거 수와 민감값 패턴 제한 |
| B4 | Pack을 Functional Community 정합화 입력으로 넘김 | **Source Analysis Pipeline** | Pack 출력까지 구현; F1~F7 소비는 계획 |
| B5 | 다음 분석에서 이전 Pack의 문서·소스 fingerprint와 항목별 근거 fingerprint 재사용 | **Resolver + Builder** | 동일 근거 재사용과 무효화 수치 기록 |

이 Stage에는 **Agent Skill, Agent Policy, 외부 AI, Connector가 사용되지 않는다.** 현재 구현은
결정적 코드만 사용한다. Source Profile Registry는 프로젝트별 기능 분류 능력을 선언하는
Manifest이고, 생성 Host는 Pack을
`shared/sourceFunctionalContextManifest.js`에 보존할 수 있다. 그 파일은 실행 코드가 아니라
다음 분석이 재사용할 수 있는 생성 Artifact다.

문서 원문은 Pack에 복사하지 않고 경로·fingerprint·추출 개수와 제한된 기능 어휘만 남긴다.
현행 하드 한도는 문서 16개, 문서 원문 처리 200,000자, 문서별 16개 어휘, 최종 64개 어휘,
어휘별 6개 근거다. 이후 AI가 Pack을 소비하더라도 관련 없는 문서 원문으로 사용자의 토큰을
낭비하지 않게 하는 경계다.
`AGENTS.md`, `CLAUDE.md`, `AI_MASTER.md` 같은 AI 지휘 문서는 기능 어휘 입력으로 사용하지
않는다. 지휘 문서는 제품 기능 설명이 아니므로 기능 분석 근거와 구분한다.

최초 실행의 `baseline` 문서는 과거 코드와 함께 갱신됐는지 증명할 이전 Pack이 없으므로
“완전히 최신임이 증명됨”을 뜻하지 않는다. 다음 실행부터 코드 근거만 바뀌고 문서가
그대로면 `possibly-stale`로 표시해 그 실행의 기능 어휘에서 제외한다. 문서에서 나온 용어가
현재 소스 후보와 맞으면 `source-evidence`, 맞는 근거를 아직 찾지 못하면
`document-evidence`로 구분한다.

### 4.4 G10 Functional Community Resolution 내부 Workflow

G10은 `Source Analysis Bundle`을 캔버스 소비자에게 완료 상태로 넘기기 전에 반드시 실행한다.
Graphify 또는 다른 지도 분석 Adapter가 만든 Structural Community는 기능군 후보를 찾는
입력일 뿐 최종 기능 묶음이 아니다. 하나의 Source Node는 여러 Functional Community에 속할
수 있으며, 구조적 Community 경계를 가로지르는 소속도 허용한다.

| 순서 | 해야 할 일 | 주 구성 분류 | 입력 → 출력 |
|---:|---|---|---|
| F1 | Community별 대표 파일·심볼·경로·관계를 모은다 | **Builder** — Community Evidence Pack Builder | Structural Community·`EvidenceGraph`·`GraphFinding` → `CommunityEvidencePack[]` |
| F2 | 한 기능이 여러 Structural Community에 나뉘었는지 찾는다 | **Resolver** — Functional Split Resolver | Evidence Pack 간 공통 기능 근거 → split candidate |
| F3 | 한 Structural Community에 서로 다른 기능이 섞였는지 찾는다 | **Resolver** — Mixed Community Resolver | Community 내부 근거 분포 → mixed candidate |
| F4 | AI가 기능군과 소속 Source Node 후보를 만든다 | **Agent Skill + Agent Policy + Adapter** | split/mixed candidate·허용된 Evidence Pack → `FunctionalCommunityCandidate[]` |
| F5 | 실제 코드 근거로 각 기능군과 소속을 검증한다 | **Contract + Resolver + Hard Guardrail** | 후보·source location·Relation·Profile → validated/rejected membership |
| F6 | 기능군 이름과 쉬운 설명을 확정한다 | **Builder + Agent Skill** — Functional Community Builder | 검증된 membership·근거 → 이름·설명·evidence refs |
| F7 | 신뢰도가 낮거나 충돌한 후보는 억지로 묶지 않고 `unknown`으로 남긴다 | **Resolver + Agent Policy + Hard Guardrail** | 미달·충돌 후보 → `UnresolvedFunctionalCommunity[]` |

`Functional Community Resolution Pipeline`이 F1~F7의 순서, 재시도, AI 실패와 완료 상태를
관리한다. `Functional Community Contract`는 출력 schema와 membership 불변식을 검사하고,
`Functional Community Run Manifest`는 Source 지도·Profile fingerprint, Contract·Resolver·
Builder·Skill·Policy·Adapter version, AI provider/model, 입력 Evidence ref와 budget을 고정한다.
외부 AI를 사용하면 전송·동의·redaction·Receipt는 Connector Bridge가 맡고, Source Lens는
Provider 응답을 후보 형식으로 정규화한다.

Project Master의 사용자 확정 기능·범위 사실이 있더라도 전체 문서를 G10 AI에 보내지 않는다.
이번 후보 판정에 필요한 제한 Planning Context Pack만 추가 근거로 사용하며, 실제 코드 근거가
없는 기획 문장만으로 Functional Community membership을 확정하지 않는다.

AI 또는 승인된 대체 의미 Resolver가 실행되지 않았거나 F5 검증을 통과하지 못하면 G10은
`partial_functional_community` 또는 `functional_community_blocked`로 끝난다. 진단용 Source
Artifact는 보존할 수 있지만 캔버스용 `canvas_ready` 결과로 표시해서는 안 된다.

### 4.5 기존 Stage와 지도 분석 Stage의 결합

```text
Corpus 제공
  → 계약·입력 경계 검증
  → Profile + 지도 Provider 선택
  → 파일 분류·구문 분석
  → 제품 의미·계층·코드 파츠 구성
  → 정적 관계·Flow 구성
  → G10-0 functional context bootstrap (현행, 결정적 Pack)
      ↳ G1 inventory
      ↳ G2 incremental/cache
      ↳ G3 structural extraction
      ↳ G4 content normalization
      ↳ G5 semantic candidates (조건부 AI)
      ↳ G6 evidence merge
      ↳ G7 지도 상태
      ↳ G8 structural community/cohesion
      ↳ G9 important/boundary/problem findings
      ↳ G10 functional community resolution (필수, AI 후보 + 코드 근거 검증)
      ↳ G11 정규 지도
  → 기능 경계 판정
  → 안정 ID·fingerprint 병합
  → Source Analysis Bundle
      ↳ G12 query / G13 path / G14 explain
```

## 5. 교체 가능한 지도 분석 Adapter 계약

Graphify는 Source Lens Contract의 첫 구현체이지 정규 Schema 자체가 아니다. 이후 더
정확하거나 빠른 구현체가 나오면 전체 또는 일부 Capability만 교체할 수 있어야 한다.

### 5.1 계약 원칙

1. Stage는 `graphify`라는 제품명을 직접 분기하지 않고 Capability ID만 요청한다.
2. `지도 Capability Resolver`가 Provider Manifest의 계약 버전·입력 종류·실행 모드·한도를
   검사한 뒤 Stage별 Adapter를 선택한다.
3. 한 지도 분석 제공자가 G1~G9와 G11~G15를 모두 구현할 필요는 없다. 예를 들어 구조
   추출은 내장 AST, Structural Community는 Graphify, query는 이후 다른 제공자를 조합할 수
   있다. G10 Functional Community Resolution은 Provider를 교체해도 유지되는 Source Lens
   필수 Stage다.
4. 모든 출력은 Graphify 고유 JSON을 그대로 정본으로 쓰지 않고 Source Lens의 표준 schema type
   `EvidenceGraph`, `StructuralCommunitySet`, `FunctionalCommunitySet`,
   `CanonicalSourceGraph`, `GraphFinding`으로 정규화한다.
5. Provider node ID는 Source Lens의 안정 Asset ID를 대신하지 않는다. 파일·심볼·source range와
   fingerprint를 통해 대응 관계를 기록한다.
6. 제공자 교체 후에도 같은 Canonical Contract와 provenance를 만족해야 하며, 결과 차이는
   Provider Run Manifest와 change set에 남긴다.
7. 제공자가 없거나 일부 지도 분석 Stage가 실패하면 기존 Source Lens 분석과 마지막
   정상 Artifact를 보존하고 `provider_unavailable` 또는 `partial_graph_analysis` 진단을
   남긴다. G10이 완료되지 않으면 결과를 `canvas_ready`로 승격하지 않는다.

### 5.2 Provider Manifest

계획된 지도 분석 Provider Manifest의 기존 schema 이름은
`Source Graph Analysis Provider Manifest`다. 이 schema 이름은 호환을 위해 유지하며,
Manifest는 최소 다음을 선언한다.

```text
provider ID·version
Adapter Contract version
제공 Capability ID 목록
지원 파일·콘텐츠 종류
실행 모드: local-library / local-process / remote
결정적 Stage와 AI 사용 Stage
입출력 Artifact schema version
파일·node·edge·시간·메모리·token 한도
cache·incremental 지원 수준
필요 Connector와 외부 반출 데이터 종류
라이선스·provenance 메타데이터
```

첫 Manifest는 Graphify를 선언한다. 후속 구현체는 같은 Manifest와 Contract를 만족하면
`graphify` 이름을 Source Lens 코드 곳곳에서 찾아 바꾸지 않고 Resolver 설정으로 교체한다.

### 5.3 Adapter와 Connector 선택 기준

- 같은 프로세스 안에서 Source Lens 표준 입력·출력으로 바꾸는 알고리즘은 **Adapter**다.
- CLI, MCP, 원격 지도 DB, 외부 AI처럼 프로세스·네트워크 경계를 넘으면 **Connector**다.
- 외부 통신이 없는 Graphify library 사용은 Adapter만 필요하다.
- Graphify CLI/MCP/remote provider를 사용하면 Connector Bridge가 통신·권한·redaction을 맡고,
  Source Lens Adapter가 응답을 Canonical Contract로 정규화한다.
- Adapter는 현재 Engine Registry의 독립 `kind`가 아니라 Stage가 선택하는 교체 구현 단위다.
  실제 제품 Component로 등록할 것은 Contract, Resolver, Builder, Pipeline, Skill, Policy,
  Guardrail과 Manifest다.

## 6. Engine 내부 구성 분류와 사용 위치

`kind: engine`은 최상위 Engine에만 허용된다. Graphify를 Source Lens 아래의 Engine으로
등록하지 않는다. 계획 항목은 구현·테스트 전까지 Registry에 등록하지 않는다.

| 분류 | 현행 Source Lens | 지도 분석·Functional Community 계획 | 사용 Stage |
|---|---|---|---|
| **Engine** | Source Lens | 추가 Engine 없음 | 전체 |
| **Contract** | Source Analysis Contract, **Functional Context Contract** | Source 지도 분석 Adapter Contract, 지도 Artifact Contract, **Functional Community Contract** | 현행 Workflow·G10-0 Pack, 계획 G1~G15 입출력·G10 membership 불변식 |
| **Resolver** | Feature Boundary Resolver, **Functional Context Resolver** | 지도 Capability·Corpus Inventory·Structural Community/Insight Resolver, **Functional Split·Mixed Community·Confidence Resolver** | G10-0 문서 최신성·fallback, Provider 선택, G1, G8~G10, G12~G14 |
| **Builder** | Source Component Mapper, Code Part Translator, Static Flow Builder, **Functional Context Pack Builder** | Structural/Semantic Evidence Builder, 근거 지도 Merger, **Community Evidence Pack Builder, Functional Community Builder**, 지도 Finding/Artifact Builder | G10-0 Pack, G3~G6, G8~G11, G14~G15 |
| **Pipeline** | Source Analysis Pipeline — G10-0 포함 | 지도 분석 phase + **Functional Community Resolution Pipeline** | 현행 Stage 순서, 계획 G1~G15 순서·cache/resume, G10 F1~F7 |
| **Agent Skill** | 없음 | Graphify Semantic Extraction Skill, **Functional Community Resolution Skill**, 지도 Explain Skill | G5, G10, G14 |
| **Agent Policy** | 없음 | Source Evidence Honesty Policy, **Functional Community Evidence Policy** | AI가 관여하는 G5·G10·G14 |
| **Hard Guardrail** | Source Corpus Guardrail, **Functional Context Guardrail** | Provider Output·지도 Integrity·Resource Budget Guardrail, **Functional Community Integrity Guardrail** | corpus·G10-0 한도, G1, G5~G7, G10, G15 |
| **Connector** | 없음 | Engine 내부 없음; 외부 AI·CLI·remote 실행 시 Connector Bridge 사용 | G4·G5·G10·G15의 외부 경계 |
| **Manifest** | Source Profile Registry; `FunctionalContextPack`은 생성 Host가 보존하는 Artifact | 지도 분석 Provider/Run Manifest, **Functional Community Run Manifest** | Profile 선택·G10-0 재사용, Provider 선택·G10 재현성·비용 기록 |
| **Adapter** | Babel/SQL parser, Profile mapping, 내장 Functional Context Adapter | Graphify 제공 Adapter + provider-neutral Functional Community Candidate Adapter | 현행 parse·G10-0, 계획 각 Stage 교체 구현·G10 AI 후보 정규화 |

`Agent Skill`과 `Agent Policy`는 같은 것이 아니다. Skill은 AI에게 작업 순서를 알려 주고,
Policy는 AI가 하지 말아야 할 행동과 근거 표시 규칙을 정한다. 둘 다 코드로 강제되는
Hard Guardrail을 대신하지 못한다.

## 7. AI 사용 위치와 정책

### 7.1 AI를 쓰는 곳과 쓰지 않는 곳

| Stage | AI 사용 | 이유 |
|---|---|---|
| 파일 탐지·종류 분류·크기 제한 | 사용하지 않음 | 재현 가능한 규칙과 코드로 처리 |
| 코드 AST 구조 추출 | 사용하지 않음 | parser가 직접 확인한 문법 근거 유지 |
| **G10-0 Functional Context Bootstrap** | **사용하지 않음** | 문서 fingerprint와 실제 UI·API·DB·테스트·Flow 근거를 결정적으로 제한·대조 |
| 문서·이미지 의미 후보 추출 | 조건부 사용 | 문법 parser만으로 얻기 어려운 개념·관계 후보 생성 |
| 지도 병합·dedupe·ID·무결성 | 사용하지 않음 | 정본 ID와 endpoint를 결정적으로 검증 |
| Structural Community·cohesion·중심성·경로 | 사용하지 않음 | 지도 알고리즘으로 계산하고 Provider 원형을 보존 |
| Functional Community 후보·이름·쉬운 설명 | **G10 완료에 필요** | 여러 Structural Community에 흩어진 같은 기능과 섞인 기능 후보를 의미 근거로 정합화 |
| `query` 어휘 확장·`explain` 문장 | 선택 사용 | 실제 지도 vocabulary와 evidence 안에서만 설명 보조 |
| Profile·Feature·Reality·권한 판정 | AI가 최종 판정하지 않음 | 제품 규칙·근거·다른 Engine의 권한 경계 보존 |

AI 제공자 호출이 필요하면 Connector Bridge를 통과한다. AI에 전달하는 내용, 모델·prompt·비용,
결과 provenance를 Run Manifest에 기록하고 AI 결과에는 명확한 배지를 붙인다.

### 7.2 Source Evidence Honesty Policy와 Functional Community Evidence Policy

상위 `Source Evidence Honesty Policy`는 모든 AI Stage에 적용하고, G10에는 더 좁은
`Functional Community Evidence Policy`를 함께 적용한다.

- 존재하지 않는 Node·Edge·경로를 만들지 않는다.
- `EXTRACTED`, `INFERRED`, `AMBIGUOUS`, `UNKNOWN`을 구분한다.
- 모든 AI 문장·관계 후보에 source location 또는 evidence reference를 붙인다.
- Structural Community를 삭제하거나 소속을 재작성하지 않는다.
- Functional Community는 여러 Structural Community를 가로지를 수 있고 한 Source Node가
  여러 기능군에 속할 수 있음을 허용한다.
- Functional Community membership마다 실제 파일·심볼·경로·Relation 근거를 붙인다.
- AI 후보만으로 제품의 공식 Component·Feature Asset·소유 경계를 확정하지 않는다.
- 정적 코드 관계를 실제 런타임 작동이나 `LIVE`로 표현하지 않는다.
- 비밀값·credential·허용되지 않은 본문을 외부 제공자에 보내지 않는다.
- 근거가 부족하면 채우지 않고 unknown과 누락 이유를 남긴다.
- AI 결과가 결정적 Source Profile·Feature·권한 판정을 조용히 덮어쓰지 못하게 한다.

### 7.3 코드로 강제할 Hard Guardrail

- corpus 상대 경로, symlink, 파일별·전체 크기와 민감 파일 제외
- Provider Contract와 Artifact schema 버전 호환성
- Node ID 중복, dangling/missing edge endpoint, self-loop와 방향 손실 검사
- source location·provenance 없는 EXTRACTED 주장 거부
- node·edge·파일·실행 시간·메모리·token 예산
- 작은 실패 결과가 마지막 정상 지도를 조용히 덮어쓰지 못하는 shrink guard
- Provider timeout·부분 실패·fallback 상태의 명시적 진단
- Structural Community ID·membership·cohesion·Provider provenance를 수정하지 않는 보존 경계
- Functional Community가 참조하는 Source Node 존재, membership evidence, 지도/Profile
  fingerprint와 Contract version 검사
- 근거·confidence가 기준 미달이면 membership 확정 대신 `unknown` 강제
- AI가 Canonical Node·Edge, Structural Community, Feature·Reality·권한 필드를 쓰지 못하는
  허용 필드 schema
- G10 미완료·차단 결과가 `canvas_ready`로 표시되지 못하는 완료 상태 경계
- Source Lens에서 파일·Git·DB·캔버스 상태를 직접 변경하지 못하는 no-mutation 경계

## 8. 입력·출력과 Artifact

### 8.1 현행 입력

- 경계가 제한된 `Map<relativePath, sourceText>` corpus
- 버전이 있는 Source Profile Registry
- 선택적 이전 Source Analysis Manifest
- 선택적 이전 `FunctionalContextPack` v1
- 저장소 URL·기본 branch 같은 비본문 메타데이터
- 선택 출력: Feature Model, Code Part Catalog, Flow Catalog

corpus의 루트 Markdown과 `docs/` Markdown 중 기능 분석에 사용할 수 있는 문서는 G10-0의
최신성·어휘 후보 입력이다. 계획된 지도 분석·Functional Community 경로에서는 Starting
Bundle이 선택한 제한 Planning Context Pack도 추가 입력으로 받을 수 있다. 현행 Source Lens
0.9 공개 입력은 AI Context Gate의 Planning Context Pack을 직접 받지는 않는다.

### 8.2 현행 Source Analysis Bundle

| 논리 Artifact | 현재 호환 파일 | 의미 |
|---|---|---|
| Source Analysis Manifest | `shared/sourceTwinManifest.js` | 파일·함수·API·DB·환경·보안 근거와 계층·change set |
| **Functional Context Pack** | `shared/sourceFunctionalContextManifest.js` | 문서 최신성, 제한 기능 어휘, 실제 근거, 신뢰도·재사용 fingerprint |
| Feature Model | `shared/sourceFeatureManifest.js` | 기능 Asset·Capability·속성 판정과 근거 |
| Code Part Catalog | `shared/sourceCodePartManifest.js` | 서버 전용 compact 코드 파츠와 안정 anchor |
| Static Flow Catalog | `shared/sourceFlowManifest.js` | 서버 전용 정적 Relation·Flow·unknown 진단 |

### 8.3 지도 분석 도입 후 계획 Artifact

| Artifact | 정본 여부 | 의미 |
|---|---|---|
| `CanonicalSourceGraph` | Source Lens 정본 | 기존 schema type 이름이며 Provider 중립 Node·Edge·hyperedge·provenance를 담음 |
| `StructuralCommunitySet` | 보존 필수 Provider 분석 Artifact | Graphify 등 제공자가 연결 밀도로 만든 원래 membership·cohesion·provenance. 삭제하거나 Functional Community로 덮어쓰지 않음 |
| `CommunityEvidencePack` | G10 입력 Artifact | Community별 대표 파일·심볼·경로·Relation과 split/mixed 판정 근거 |
| `FunctionalCommunitySet` | Source Lens Canonical Artifact | 같은 제품 기능에 기여하는 겹침 가능한 Source Node 묶음, 검증 근거·이름·쉬운 설명·unknown |
| `GraphFindings` | Source Lens 분석 Artifact | 기존 schema type 이름이며 Structural Community·cohesion·중요 노드·bridge·orphan·split/mixed 문제 후보를 담음 |
| `GraphDiagnostics` | Source Lens 품질 Artifact | 기존 schema type 이름이며 지원 범위·무결성·unknown·부분 실패·비용·한도를 담음 |
| `ExplorationIndex` | Source Lens 읽기 Artifact | provider 중립 `query/path/explain`에 필요한 색인 |
| `ProviderRunManifest` | 재현성 기록 | 실제 Adapter·버전·capability·AI·비용·cache·실행 결과 |
| `graph.json` | Graphify provider attachment | 호환을 위해 유지하는 레거시 현행 파일명. Graphify 원형 데이터이며 정규 ID의 유일한 정본이 아님 |
| `GRAPH_REPORT.md` | Graphify provider attachment | 사람이 읽는 분석 보고서 |
| `graph.html` | UI/Artifact host attachment | 호환을 위해 유지하는 레거시 현행 파일명. 독립 시각화 파일이며 제품 기본 화면이나 저장 권한 경계가 아님 |

Structural Community는 분석 재현성과 Functional Community 근거를 위해 반드시 보존한다.
다만 사용자에게 직접 보여 줄지, 내부 품질 진단·재분석·비교에만 사용할지, Functional
Community와 어떤 전환·중첩 UI를 제공할지는 아직 확정하지 않고
[`TECHNICAL_DEBT.md`](../governance/TECHNICAL_DEBT.md)의 `SL-001`에서 추적한다. 이 부채가 닫히기 전에는
Structural Community를 기본 사용자 기능군으로 표시하지 않는다.

`wiki`, SVG, GraphML, Cypher, Neo4j/FalkorDB push와 MCP serve는 필수 Source Lens 출력이 아니다.
파일 내보내기는 Artifact host, 외부 DB push와 MCP serve는 Connector Bridge가 소유한다.

## 9. 분리된 소비·실행 기능

| 기능 | Source Lens 책임 | 실제 소유 위치 |
|---|---|---|
| 분석 결과 화면 조회 | 읽기 Artifact와 탐색 계약 제공 | Web UI/API client |
| 캔버스 Proposal·지도 가시화 | 안정 ID·근거 제공 | Asset Core(동일성·Proposal) → Draw Map(배치·연결선·그룹만 가시화) |
| Local 갱신 | 같은 Source Analysis Workflow 실행 | Connector Bridge가 corpus 공급 |
| 파일 편집·rollback | 안정 anchor·분석 fingerprint 제공 | Safe Operations + Connector Bridge |
| GitHub webhook·Snapshot | Source Analysis 상태를 한 section으로 제공 | Connector Bridge + LiveOps + Safe Operations |
| 외부 AI 통신 | 입력·출력 계약과 redaction 요구 제공 | Connector Bridge |
| Project Master 기록·사용자 교정 | 제한 Planning Context Pack을 선택적 기획 근거로만 소비 | Starting Protocol + AI Context Gate |
| Graphify HTML 열기 | optional attachment만 제공 | UI/Artifact host |
| 지도 DB push·MCP serve | 정규 Artifact 제공 | Connector Bridge |

## 10. 구현 순서와 성능 원칙

| 순서 | 계획 | 완료 조건 |
|---:|---|---|
| SL-F0 | **G10-0 Functional Context Bootstrap** | **완료** — 문서 최신성·소스 fallback·제한 Pack·이전 Pack 재사용 계약 테스트 |
| SL-G0 | Adapter Contract·Provider Manifest·정규 지도 schema | Graphify 이름 없이 contract fixture 검증 |
| SL-G1 | G1~G7 detect/extract/merge/health Adapter | 현재 Source Lens 근거와 provenance 보존, fallback 테스트 |
| SL-G2 | G8~G9 Structural Community·지도 Findings | 원형 membership·cohesion·provenance 보존, split/mixed fixture |
| SL-G3 | **G10 Functional Community Resolution** | 여러 Community에 흩어진 같은 기능과 섞인 기능 fixture, membership 근거, 겹침, unknown, `canvas_ready` 차단 검증 |
| SL-G4 | G11~G15 정규 지도·query/path/explain·Artifact와 G5/G14 선택 AI | provider 교체, evidence/redaction, browser bundle·payload 예산 |
| SL-G5 | 두 번째 제공자 또는 fake Adapter 검증 | Graphify 없이 같은 Contract로 전체/부분 Capability 교체 |

성능 때문에 Source Lens Workflow를 둘로 나누지 않는다. corpus·Profile·Adapter version과 파일
fingerprint로 G1~G7 결과를 cache하고, Structural Community나 기능 근거가 바뀌면 G8 이후와
G10을 재실행한다. 큰 catalog와
Graphify 런타임은 서버/Node 경계에 두고 브라우저에는 선택한 module·community의 작은 결과만
지연 전송한다. Provider timeout이나 자원 예산 초과 시 기존 Source Lens 결과를 보존한다.

## 11. 검증과 변경 규칙

현행 최소 검증은 다음이다.

```bash
node scripts/test-source-lens-engine.mjs
node scripts/test-source-functional-context.mjs
node scripts/test-source-profiles.mjs
node scripts/test-source-feature-model.mjs
node scripts/test-source-code-parts.mjs
node scripts/test-source-twin.mjs
node scripts/test-engine-registry.mjs
npm run source-twin:check
```

지도 분석과 Functional Community 구현이 시작되면 최소한 다음 계약 테스트를 추가한다.

- Graphify 이름 없이 fake Adapter와 G10 Source Lens Stage로 G1~G15를 실행할 수 있는지
- 일부 Capability만 다른 Adapter로 교체할 수 있는지
- Provider가 없거나 timeout이어도 마지막 정상 Artifact가 보존되고 결과가 `canvas_ready`로
  잘못 표시되지 않는지
- EXTRACTED/INFERRED/AMBIGUOUS/UNKNOWN과 provenance가 손실되지 않는지
- dangling edge·schema mismatch·비밀값·자원 예산 초과가 Hard Guardrail에서 거부되는지
- Structural Community의 ID·membership·cohesion·provenance가 G10 전후로 동일하게 보존되는지
- 하나의 기능이 여러 Structural Community에 흩어진 fixture가 하나의 Functional Community로
  연결되고, 한 Source Node의 다중 기능군 소속이 보존되는지
- 서로 다른 기능이 섞인 Structural Community가 분리 후보로 발견되는지
- 근거 없는 membership과 낮은 confidence가 확정되지 않고 `unknown`으로 남는지
- Functional Community와 AI 라벨이 Profile·Feature·Reality·권한 판정을 덮어쓰지 않는지
- Graphify server/runtime이 browser bundle에 들어가지 않는지

실제 Adapter Contract와 Stage가 코드에 들어가는 변경에서만 Source Lens Engine·Workflow·Bundle
버전을 올리고, `scripts/source-lens-engine.mjs`, `shared/engineRegistry.js`, Source Profile,
생성 Artifact, 테스트와 Engine changelog를 함께 갱신한다.

## 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| 0.7.0 | 2026-07-20 | Source Lens 0.9 / Workflow 1.1에 G10-0 Functional Context Bootstrap을 구현했다. 최신 README·기획 문서를 실제 소스 fingerprint와 비교하고, 없거나 오래됐으면 UI 문구·화면 경로·API·DB·테스트·정적 Flow에서 기능 어휘를 구성해 제한 `FunctionalContextPack` v1로 보존·재사용한다. 이 단계는 결정적 코드만 사용하며 Graphify와 G10 F1~F7은 계속 계획 상태다. |
| 0.6.0 | 2026-07-20 | 기능 맥락 보조 파일을 사용자 소유 Project Master로 확장한 Starting Protocol 결정에 맞췄다. Source Lens는 전체 Project Master를 읽기 정본·자동 모델 입력·수정 대상으로 삼지 않고 선택된 Planning Context Pack만 기획 의도 근거로 소비하며, 실제 코드와의 불일치는 Documentation Debt로 넘긴다. |
| 0.5.0 | 2026-07-20 | AI Context Gate의 사람이 수정하는 기능 맥락 문서와 Source Lens 경계를 분리했다. Source Lens는 전체 Markdown을 유지·전송·수정하지 않고, 계획된 Functional Community Resolution에서 이번 분석에 필요한 사용자 확정 사실만 제한 Functional Context Pack으로 선택 소비한다. |
| 0.4.0 | 2026-07-20 | Graphify의 Structural Community를 보존하는 원형 분석 Artifact로 분리하고, 같은 제품 기능에 기여하는 Source Node를 Structural Community 경계를 넘어 겹침 가능하게 묶는 필수 `G10 Functional Community Resolution` Stage를 추가했다. F1~F7을 Contract·Resolver·Builder·Pipeline·Agent Skill·Agent Policy·Hard Guardrail·Adapter·Manifest·Connector로 구분하고, 근거 미달은 unknown으로 남기며 G10 미완료 결과의 `canvas_ready` 승격을 금지했다. Structural Community의 사용자 노출·후속 가공은 `SL-001` 부채로 분리했다. |
| 0.3.0 | 2026-07-19 | Graphify를 Source Lens의 첫 교체 가능 지도 분석 Adapter 제공자로 확정했다. detect부터 query/path/explain까지 세부 Flow를 분해하고 Contract·Resolver·Builder·Pipeline·Agent Skill·Agent Policy·Hard Guardrail·Connector·Manifest 사용 위치, Provider Manifest, AI/정직성 정책, 계획 Artifact와 구현 순서를 기록했다. 현행 0.8과 미구현 계획은 분리했다. |
| 0.2.0 | 2026-07-19 | Source Lens를 단일 Source Analysis Workflow로 한정하고 공개 실행 파일·소유/제외 경계를 추가했다. B~G를 UI 또는 교차 Engine Workflow로 분리하고 중첩 Engine 금지 원칙을 반영했다. |
| 0.1.0 | 2026-07-19 | Graphify 적용 전 Source Lens 0.7.0-alpha.0의 기존 A~G 흐름과 구성 경계를 최초 기록했다. |

## 12. 쉬운 용어 설명

### 12.1 Engine과 구성품

| 용어 | 쉬운 설명 |
|---|---|
| **Engine** | 입력과 출력을 가진 최상위 기능 단위다. Source Lens 안에 다른 Engine을 넣지 않는다. |
| **Workflow** | 하나의 결과를 만들기 위해 Stage를 순서대로 연결한 전체 실행 설계다. |
| **Stage** | Workflow 안에서 입력 하나를 받아 다음 결과로 넘기는 처리 단계다. |
| **Contract** | 입력·출력·버전과 반드시 지켜야 할 규칙을 검사하는 약속이다. |
| **Resolver** | 여러 후보 중 무엇을 사용할지 근거와 규칙으로 판정하는 판단기다. |
| **Builder** | 검증된 입력으로 지도·카탈로그·보고서 같은 구조화된 결과를 만드는 생성기다. |
| **Pipeline** | 한 Engine 안의 여러 검증·분석·변환 단계를 정해진 순서로 실행하는 내부 처리 흐름이다. |
| **Agent Skill** | AI에게 어떤 자료를 보고 어떤 도구와 순서로 일할지 알려 주는 작업 안내서다. |
| **Agent Policy** | AI가 무엇을 만들면 안 되고 언제 unknown으로 남겨야 하는지 정한 행동 규칙이다. |
| **Hard Guardrail** | AI의 판단과 관계없이 코드·서버·스키마가 권한과 한도를 강제로 막는 안전장치다. |
| **Connector** | 로컬 저장소·CLI·MCP·외부 API처럼 경계 밖 대상과 인증·권한을 지키며 통신하는 통로다. |
| **Adapter** | 특정 도구의 입력·출력을 Source Lens 공통 Contract에 맞추는 교체 가능한 Stage 구현이다. 현재 Registry의 독립 `kind`는 아니다. |
| **Manifest** | 제공 기능·지원 범위·버전·한도를 실행 코드 없이 선언한 데이터 문서다. |
| **Profile** | 이 프로젝트의 파일과 기능을 어떤 제품 의미로 해석할지 적어 둔 버전형 설명서다. |

### 12.2 Connector와 Adapter의 차이

- **Connector는 “어디와 어떻게 통신하는가”**를 담당한다.
- **Adapter는 “가져온 결과를 Source Lens 계약에 어떻게 맞추는가”**를 담당한다.
- Graphify를 같은 프로세스의 library로 쓰면 Adapter만 필요하다.
- Graphify CLI·MCP·원격 서비스·외부 AI를 쓰면 Connector Bridge와 Adapter가 함께 필요하다.

### 12.3 Source Lens·Graphify 용어

| 용어 | 쉬운 설명 |
|---|---|
| **Bounded Source Corpus** | 한 번의 분석에서 읽도록 허용된 프로젝트 파일 묶음이다. |
| **Source Profile** | 프로젝트를 제품 영역·기능·구성요소로 해석하는 설명서다. |
| **AST** | 코드를 선언·호출·조건·반복 같은 문법 단위의 나무 구조로 바꾼 결과다. |
| **Structural extraction** | AST나 파일 구조에서 직접 확인할 수 있는 대상과 관계를 꺼내는 과정이다. |
| **Semantic extraction** | 문법만으로 드러나지 않는 문서·이미지의 의미와 관계 후보를 찾는 과정이다. |
| **Evidence** | 파일·심볼·줄 범위처럼 분석 결과를 확인할 수 있는 실제 근거다. |
| **Node** | 지도에서 고유하게 구분되는 파일·함수·개념·시스템 같은 대상 하나다. |
| **Edge** | 두 Node가 호출·포함·의존처럼 어떻게 연결되는지 나타내는 관계다. |
| **Hyperedge** | 둘보다 많은 Node가 한 사건이나 개념에 함께 참여하는 관계다. |
| **Merge** | 여러 추출 결과에서 같은 대상을 맞추고 중복 없이 하나로 합치는 과정이다. |
| **정규 Source 지도** | 어떤 분석 제공자를 쓰더라도 Source Lens가 같은 형식으로 보존하는 표준 소스 지도다. 기존 schema type 이름은 `CanonicalSourceGraph`다. |
| **Structural Community** | Graphify 같은 지도 분석 제공자가 연결 밀도로 묶은 Node 집합이다. 원형 membership·cohesion·provenance를 보존하며 같은 제품 기능을 뜻한다고 가정하지 않는다. |
| **Functional Community** | Source Lens가 코드 근거를 검증해 같은 제품 기능에 기여한다고 정합화한 Source Node 집합이다. 여러 Structural Community를 가로지르고 한 Node가 여러 기능군에 속할 수 있다. |
| **Functional Context Bootstrap** | 최신 문서와 실제 소스 근거에서 기능 커뮤니티 정합화가 사용할 작은 기능 어휘 Pack을 미리 만드는 G10-0 Stage다. |
| **FunctionalContextPack** | 문서 원문 대신 기능 어휘·근거·신뢰도·문서/소스 fingerprint와 재사용 상태를 담는 제한된 현행 Artifact다. 완성된 Functional Community는 아니다. |
| **Community Evidence Pack** | Structural Community별 대표 파일·심볼·경로·Relation과 split/mixed 판정 근거를 G10에 전달하는 제한된 입력 묶음이다. |
| **Cohesion** | 한 Community 안의 Node가 서로 얼마나 촘촘히 연결됐는지 나타내는 수치다. |
| **God node** | 다른 Node와 유난히 많이 연결돼 지도의 중심 역할을 하는 Node다. |
| **Bridge** | 서로 다른 Community를 이어 주어 영역 사이의 연결을 전달하는 Node 또는 Edge다. |
| **Orphan** | 연결이 없거나 매우 적은 Node다. 실제 독립 대상일 수도 있고 추출 누락 신호일 수도 있다. |
| **Surprising connection** | 멀어 보이는 영역 사이에서 근거와 함께 발견된 예상 밖의 연결이다. |
| **Fingerprint** | 내용이나 구조가 바뀌었는지 비교하기 위한 짧은 고유 지문이다. |
| **Confidence** | 추출 결과를 근거가 얼마나 강하게 뒷받침하는지 나타내는 등급이며 사실 보증 자체는 아니다. |
| **Provenance** | 결과가 어느 파일·위치·방법·Adapter에서 나왔는지 추적하는 출처 기록이다. |
| **EXTRACTED** | 파일이나 구조에서 직접 확인한 결과다. 런타임에서 실제 실행됐다는 뜻은 아니다. |
| **INFERRED** | 직접 선언은 없지만 근거를 조합해 추론한 후보 결과다. |
| **AMBIGUOUS** | 둘 이상의 해석이 가능해 하나로 확정할 수 없는 결과다. |
| **UNKNOWN** | 근거 또는 지원 기능이 부족해 판단하지 않은 상태다. |
| **`graph.json`** | Graphify의 Node·Edge·Community 정보를 기계가 다시 읽을 수 있게 저장한 provider 호환용 레거시 현행 파일명이다. |
| **`GRAPH_REPORT.md`** | 중요 Node·Community·발견 사항을 사람이 읽을 수 있게 정리한 Graphify 보고서다. |
| **`graph.html`** | 지도를 브라우저에서 확대·이동하며 살펴보는 Graphify 시각화용 레거시 현행 파일명이다. |
| **query** | 질문과 관련된 Node 주변을 넓게 탐색해 연결된 맥락을 찾는 기능이다. |
| **path** | 두 대상 사이를 잇는 가장 짧은 관계 경로를 찾는 기능이다. |
| **explain** | 선택한 Node가 무엇이고 무엇과 연결되며 어떤 근거에서 나왔는지 쉽게 풀어 주는 기능이다. |
