# Source Lens SL-3 전달 문서

## 적용 기준

- 선행 커밋: `833c0e35e00e185c9941844bfed1572d09c4c279` (SL-0/SL-1)
- 구현 커밋: `2f0ce39a621582318d6667ff5fca8791d9eb352f`
- 기준 문서: `docs/MASTER.md` v0.4.2
- 통합 패치: `outputs/SOURCE_LENS_SL2_SL4_SL3.patch`
- 패치 SHA-256: `02c3cec7f8060a6c5c7d3c9f9161c9fd1e8ab8e41aa0fc09882b7be3dc393808`
- 신규 외부 의존성: 없음
- 운영 SQL: `supabase-source-lens-roundtrip.sql`

## 구현 결과

### 첫 편집 범위

- 공통 편집 코어와 Workflow Canvas 전용 속성 등록부를 분리했다.
- 임의 코드나 문자열 치환은 금지한다. AST에서 정확히 등록된 export literal만 수정한다.
- 첫 등록 대상은 노드 기본 너비·높이, 모듈 색상, 코드 검색 빈 화면 문구다.
- 각 속성은 타입, 단위, 범위, 소유자, 안정 앵커, 영향 범위를 선언한다.
- SL-2 자연어 설명과 편집값·diff를 같은 화면에서 비교할 수 있다.

### 안전한 왕복 편집 경계

| ENG-006 요건 | 구현 상태 |
|---|---|
| 명시적 editable-property schema | 구현 |
| 안정 앵커와 stale 차단 | 구현 |
| 별도 쓰기 동의 | `--allow-source-write`로 구현 |
| 저장소·remote·HEAD pin | 구현 |
| 격리 branch/worktree | 구현 |
| 정확한 diff | 구현 |
| formatter·속성 테스트·build·diff 검사 | 구현 |
| 웹 승인 + 로컬 터미널 확인 | 구현 |
| provenance 커밋 | 구현 |
| rollback | reset이 아닌 별도 승인 revert 커밋으로 구현 |
| 상용 보안 경계 | 미완료, 소유자 내부 MVP로 제한 |

- 읽기 전용 Local Connector와 소스 쓰기 동의를 분리했다. 기존 Git 동기화 허용만으로는 코드 편집을 실행할 수 없다.
- 서버는 서명된 계획만 큐에 넣고 connector id, 저장소, remote, HEAD, manifest 일치를 검사한다.
- 로컬 커넥터는 격리 worktree에서 변경·검증한 뒤 터미널 확인 문구를 요구한다.
- 원래 브랜치가 바뀌지 않았을 때만 fast-forward로 반영한다.
- rollback도 기록을 지우지 않고 새 revert 커밋을 만드는 별도 승인 작업이다.
- 자동 push나 Vercel 배포는 하지 않는다.
- `LOC-002·005·006·007·008`이 남아 있으므로 화면과 문서에서 소유자 내부 기능임을 명시한다.

## DB 변경

- `local_connector_operations.action` 허용값에 `source_edit`, `source_edit_rollback`을 추가한다.
- 운영 SQL은 앱 배포 후 사용자가 Supabase SQL Editor에서 한 번 실행한다.
- SQL 본문 대신 저장소의 `supabase-source-lens-roundtrip.sql`을 사용한다.

## 검증

- 전체 `npm test`: 통과, MCP 테스트 203개 포함
- 경로 이탈·symlink·stale anchor·타입·범위·HEAD/remote mismatch 차단 회귀: 통과
- 격리 worktree, 이중 승인, provenance, rollback 계약 회귀: 통과
- SQL 보안·보안 경계·성능 경계 검사: 통과
- `npm run build`, `git diff --check`: 통과

## 배포 후 확인 목록

1. 운영 SQL 적용 전 편집 실행이 안전하게 거절되는지 확인한다.
2. Local Connector를 `--allow-source-write` 없이 실행하면 읽기 기능만 가능한지 확인한다.
3. 등록된 UI 상수만 편집 버튼이 활성화되고 임의 코드는 읽기 전용인지 확인한다.
4. 편집 미리보기에서 자연어 설명, 이전값·새값, 정확한 diff, 영향 범위가 함께 보이는지 확인한다.
5. 웹 승인 뒤에도 로컬 터미널 확인 없이는 적용되지 않는지 확인한다.
6. 적용 후 provenance 커밋과 검증 결과가 남는지 확인한다.
7. rollback이 별도 승인과 새 revert 커밋으로 처리되는지 확인한다.

## MASTER.md 갱신

- SL-3 내부 MVP, ENG-006 구현 상태, Local Connector `1.3.0`, 남은 상용화 부채를 v0.4.2에 반영했다.
- 추가 갱신 필요 사항 없음.
