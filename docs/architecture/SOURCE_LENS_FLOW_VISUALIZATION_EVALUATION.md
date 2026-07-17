# Source Lens 흐름 시각화 평가서

- 기준: Source Lens 0.7.0-alpha.0
- 결정: SL-4에서는 흐름 근거와 목록 UI만 구축, 새 시각화 의존성은 보류

## 현재 표현

SL-4는 import/call graph, React 렌더·props, UI 이벤트, API 라우트, MCP 도구를 서로 다른 `CODE` 근거로 보존한다. 코드 브라우저와 Component 파츠는 실행 기록이 없는 관계를 `declared`로 표시하고, 동적 dispatch는 `unknown`으로 남긴다.

## Mermaid 후보

장점:

- 문자 기반으로 작은 호출 흐름을 빠르게 미리보기 편하다.
- 진입점별 읽기 전용 요약 뷰와 문서 내보내기에 적합하다.

비용·주의:

- 대형 그래프 레이아웃, 산출물 위조 방지, 라벨 sanitize, 번들 크기를 별도로 관리해야 한다.
- Mermaid 문자열을 Source of Truth로 삼으면 캔버스 관계 근거와 두 개의 실체가 생긴다.
- 현재 캔버스 엔진과 다른 호버·선택·층·오버레이 문법을 새로 학습해야 한다.

## 권고안

- SL-5에서 진입점 하나의 작은 하위 그래프만 서버에서 sanitize해 읽기 전용 Mermaid 미리보기로 만드는 파일럿을 검토한다.
- 변경·승인·관계 근거의 Source of Truth는 기존 Source Flow manifest와 캔버스 데이터로 고정한다.
- 화면에서 조작해야 할 흐름은 Mermaid가 아니라 기존 캔버스 프리미티브로 실체화한다.

이 배치에서 새 시각화 의존성은 추가하지 않았다.
