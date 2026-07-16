# 기반 기술·의존성 결정 기록

- 마지막 검토일: 2026-07-16
- 기계 가독 직접 의존성 목록: [`dependency-registry.json`](dependency-registry.json)
- 상태 의미: `유지`는 현재 구현을 계속 사용, `후보`는 비교만 완료, `승인 필요`는 사용자 확인 전 도입 금지

## 현재 결정

| 영역 | 현재 결정 | 후보 | 상태 | 다시 검토할 조건 |
|---|---|---|---|---|
| 그래프 화면 | `@xyflow/react` 유지 | 다른 캔버스 렌더러 | 유지 | 대규모 그래프 성능이나 접근성 한계가 측정될 때 |
| 자동 배치 | 현재 결정적 방향형·방사형 배치 유지 | ELK/elkjs, Dagre | 후보·승인 필요 | 복합 계층, 포트 제약, 교차 최소화 요구가 현재 엔진의 유지보수 비용보다 커질 때 |
| JavaScript 분석 | Babel parser 기반 AST 유지 | Tree-sitter, TypeScript compiler, LSP | 유지 | 두 번째 언어 또는 타입·참조 해석이 필요할 때 |
| Python 분석 | 파일 구조와 Source Profile 역할만 표시 | Python 표준 AST, Tree-sitter, LSP | 도입 보류·승인 필요 | 실제 FastAPI 저장소에서 함수·import·호출 근거가 제품 기능에 필요할 때 |
| 권한 집행 | Supabase RLS와 앱의 공유 계약 유지 | OpenFGA, SpiceDB | 후보·승인 필요 | 조직·자원·역할 관계가 현재 RLS로 검증하기 어려워지고 별도 권한 서비스 운영비가 정당화될 때 |
| 장기 작업 | 현재 Operation Lifecycle 계약과 작업별 저장 유지 | Temporal, Inngest, BullMQ 계열 | 후보·승인 필요 | 예약·이벤트·24시간 작업에 내구 큐, lease, 재시도와 dead-letter가 실제로 필요할 때 |
| 그래프 저장 | Supabase PostgreSQL의 정규 자료와 캔버스 JSON 유지 | 그래프 DB | 후보 | 다중 hop 질의와 공격 경로 분석이 PostgreSQL 모델의 측정된 한계를 넘을 때 |
| AI 도구 연결 | MCP SDK 유지 | 공급자별 독자 도구 계약 | 유지 | MCP로 표현할 수 없는 검증된 제품 요구가 생길 때 |

## 결정 원칙

대형 후보를 도입하기 전에는 다음을 사용자에게 하나씩 설명한다.

- 지금 해결되는 구체적인 사용자 문제
- 현재 구현을 유지했을 때의 실제 비용
- 새 라이브러리·서비스의 번들, 서버, 계정, 데이터 이동과 장애 비용
- 라이선스와 공급망 위험
- 기존 자료와 API의 마이그레이션 방법
- 도입하지 않고 미룰 수 있는 범위

## 이번 결정

제품·엔진 구성층은 새 그래프 라이브러리나 권한 서비스를 도입하지 않고 Engine Registry, Capability Mapper와 기존 TwinBuild·React Flow 계약으로 구현한다. 목적은 제품 엔진을 눈에 보이게 하는 것이며 새로운 레이아웃 또는 권한 문제를 푸는 작업이 아니기 때문이다.

Source Profile 분리는 새 의존성 없이 데이터 전용 계약과 registry로 구현한다. 두 번째 FastAPI 참조 프로필은 Python을 `structure-only`로 명시한다. 실제 Python parser 채택은 정확도 fixture, 호출 관계 범위, 성능, 라이선스와 유지보수 비용을 비교해 사용자 승인을 받은 뒤 별도 결정한다.
