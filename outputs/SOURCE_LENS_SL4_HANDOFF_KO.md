# Source Lens SL-4 전달 문서

## 적용 기준

- 선행 커밋: `833c0e35e00e185c9941844bfed1572d09c4c279` (SL-0/SL-1)
- 구현 커밋: `2f0ce39a621582318d6667ff5fca8791d9eb352f`
- 기준 문서: `docs/MASTER.md` v0.4.2
- 통합 패치: `outputs/SOURCE_LENS_SL2_SL4_SL3.patch`
- 패치 SHA-256: `02c3cec7f8060a6c5c7d3c9f9161c9fd1e8ab8e41aa0fc09882b7be3dc393808`
- 신규 외부 의존성·운영 SQL: 없음

## 구현 결과

### 호출·화면 흐름 발견

- import/call graph와 React 컴포넌트 렌더·props 흐름을 별도 근거층으로 만들었다.
- UI 이벤트 핸들러, API 라우트, MCP 도구를 진입점으로 분류하고 실제 모듈을 관통하는 정적 흐름을 추적한다.
- 정적 분석으로 확인한 관계는 CODE 근거의 declared 관계일 뿐 실제 실행으로 표시하지 않는다.
- 동적 dispatch처럼 정적으로 확정할 수 없는 구간은 추측하지 않고 `unknown`으로 남긴다.
- workflow는 초기에는 Component의 파츠로 표시한다. 독립 상태·책임·사용자 인지가 확인된 경우에만 승격 Proposal 후보가 된다.
- 승격 전 후보는 dimmed이며 자동 Asset 실체화는 하지 않는다.

### 자기반영

- Source Lens 자신의 Code Part Translator, Flow Discovery, AI 설명 파일럿, Safe Editor 구현 근거를 Source Profile과 Engine Registry에 연결했다.
- 이후 Source Lens가 자기 표현 범위를 바꾸면 그 변경도 다음 Source Twin 분석과 시스템 지도 검토 대상으로 돌아오는 구조를 유지한다.

### 지연 로드와 시각화 경계

- 전체 flow catalog는 서버 전용이다.
- 브라우저는 선택한 모듈 흐름만 `/api/source-twin?mode=flows`로 요청한다.
- 현재 서버 flow manifest는 약 5.10 MB이며 대형 저장소 최적화는 `PERF-004`에서 추적한다.
- Mermaid는 흐름을 별도 문서로 내보내는 후보로 평가만 했고 의존성은 도입하지 않았다.

## 검증

- 전체 `npm test`: 통과, MCP 테스트 203개 포함
- 진입점·호출·React·unknown·redaction·자기반영 회귀: 통과
- manifest 정합, SQL 보안, 보안 경계, 성능 경계: 통과
- `npm run build`, `git diff --check`: 통과

## 배포 후 확인 목록

1. 코드 브라우저에서 UI 이벤트, API, MCP 진입점별 흐름이 구분되는지 확인한다.
2. 선택한 모듈의 호출·import·React 흐름이 근거와 함께 지연 로드되는지 확인한다.
3. 실행 기록이 없는 선이 LIVE로 보이지 않고 CODE/declared로 표시되는지 확인한다.
4. 동적 호출의 미확정 구간이 `unknown`으로 보이는지 확인한다.
5. Source Lens 엔진 노드와 내부 구성요소가 새 버전·근거로 시스템 지도 검토에 나타나는지 확인한다.

## MASTER.md 갱신

- Source Lens `0.7.0-alpha.0`, Source Scanner `0.4.0-alpha.0`, Workflow Source Profile `0.7.0` 상태를 v0.4.2에 반영했다.
- 추가 갱신 필요 사항 없음.
