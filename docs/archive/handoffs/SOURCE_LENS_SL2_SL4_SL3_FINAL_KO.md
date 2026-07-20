# Source Lens SL-2 → SL-4 → SL-3 통합 결과

## 추적 정보

- 기준 커밋: `833c0e35e00e185c9941844bfed1572d09c4c279`
- 구현 커밋: `2f0ce39a621582318d6667ff5fca8791d9eb352f`
- 기준 문서: `docs/MASTER.md` v0.4.2
- 패치: `outputs/SOURCE_LENS_SL2_SL4_SL3.patch`
- SHA-256: `02c3cec7f8060a6c5c7d3c9f9161c9fd1e8ab8e41aa0fc09882b7be3dc393808`

## 제품 변화

1. **SL-2 읽기:** 코드를 AST 근거 파츠로 나누고, 비개발자가 이해할 수 있는 결정적 한국어 설명과 실제 근거를 함께 보여준다.
2. **SL-4 흐름:** UI·API·MCP 진입점에서 import, 호출, React 렌더·props 흐름을 추적하되 정적 근거와 실제 실행을 혼동하지 않는다.
3. **SL-3 쓰기:** 명시 등록된 UI 상수만 격리 worktree, 정확한 diff, 테스트·빌드, 웹·터미널 이중 승인, provenance, revert 방식 복구를 거쳐 수정한다.
4. **실체화:** 버튼과 드래그·드롭 모두 Proposal을 만들며 사용자의 승인 전에는 캔버스를 바꾸지 않는다.
5. **자기반영:** Source Lens의 새 분석·흐름·편집 구성요소도 다시 Source Twin과 시스템 지도 검토 대상으로 돌아간다.

## 출시 경계

- AI 설명 코드는 기본 비활성이다. 사용자 승인 전 외부 제공자·키·예산을 설정하지 않는다.
- AI를 켜더라도 소유자의 자기 시스템 지도에 한정되고 소스 본문 대신 제한된 AST 메타데이터만 서버에서 보낸다.
- 왕복 편집은 현재 소유자 내부 MVP다. 남은 Local Connector 상용화 부채를 닫기 전 일반 사용자 기능으로 홍보하면 안 된다.
- 정적 분석 결과는 CODE 근거의 declared/discovered이며 LIVE 실행 증명이 아니다.
- 기존 개인정보 출시 게이트 `blocked-pending-operator-blind-storage`는 그대로 남아 있다.

## 검증 요약

- 전체 테스트와 MCP 203개: 통과
- SQL 보안, 보안 경계, 성능 경계, manifest 정합: 통과
- 프로덕션 빌드, `git diff --check`: 통과
- 신규 외부 의존성: 없음
- 운영 SQL: `supabase-source-lens-roundtrip.sql` 1개

세부 내용과 배포 후 확인 순서는 `SOURCE_LENS_SL2_HANDOFF_KO.md`, `SOURCE_LENS_SL4_HANDOFF_KO.md`, `SOURCE_LENS_SL3_HANDOFF_KO.md`를 따른다.
