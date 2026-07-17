# Source Lens tree-sitter 평가서

- 기준: Source Lens 0.7.0-alpha.0
- 결정: 이번 배치에서 도입하지 않음
- 재검토 시점: JavaScript/JSX 외 실제 소프트웨어 온보딩 프로필을 추가할 때

## 현재 구조

Source Lens는 현재 `@babel/parser` 기반 AST로 JavaScript/JSX의 모듈, 코드 파츠, import/call, React 렌더·props, UI/API/MCP 진입점을 수집한다. SQL은 제한된 선언 스캐너를 사용하며, Python/FastAPI 참조 프로필은 현재 구조 전용이다.

## 도입 효과

- 다중 언어 문법을 동일한 CST 접근으로 확장할 수 있다.
- 문법 오류가 있는 편집 중 파일을 부분적으로 구조화하기 유리하다.
- 증분 파싱과 안정적인 노드 범위는 대형 저장소의 변경 파일 재분석에 도움이 될 수 있다.

## 비용·위험

- 언어별 grammar 의존성, WASM 또는 native 배포 표면, 버전·라이선스 관리가 추가된다.
- CST는 호출 의미, React 역할, API/MCP 진입점을 자동으로 알려주지 않는다. 언어별 의미 해석 어댑터는 여전히 필요하다.
- 지금 교체하면 Babel AST 기반 앵커와 SL-3 편집 계약을 다시 검증해야 하며, 즉시 사용자 효익에 비해 변경 범위가 크다.

## 권고안

1. JavaScript/JSX는 Babel AST를 유지한다.
2. 두 번째 실제 앱의 주요 언어가 Python일 때 tree-sitter Python 또는 Python AST 어댑터를 작은 비교 파일럿으로 평가한다.
3. 동일 fixture에서 파싱 시간, 앵커 안정성, 오탐·누락, 번들 크기, 유지보수 비용을 비교한 후 별도 승인으로 도입한다.

이 배치에서 새 파서 의존성은 추가하지 않았다.
