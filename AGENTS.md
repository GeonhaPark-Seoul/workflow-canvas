# Workflow Canvas OS agent bootstrap

1. 공통 AI 지휘 라우터인 `docs/AI_MASTER.md`를 먼저 읽는다.
2. 제품 방향·용어·범위의 정본은 사람이 소유하는 `docs/MASTER.md`다.
3. `docs/MASTER.md` 전체를 매번 읽지 말고 AI_MASTER가 지정한 절과 작업 관련 문서만 읽는다.
4. 구조 탐색은 기존 Graphify graph를 우선 사용하되 현재 commit과 실제 코드로 재검증한다.
5. 사용자 변경과 dirty worktree를 보존하고 요청 범위 밖의 수정은 하지 않는다.
6. 현재 역할·commit·push·배포 권한은 복제하지 말고 `docs/MASTER.md` §12와 사용자 지시를 따른다.

`docs/AI_MASTER.md`는 실행 라우터이며 제품 기획 정본이 아니다. 충돌 시 제품 방향은
`docs/MASTER.md`, 실제 동작은 코드와 테스트를 확인하고 충돌을 사용자에게 보고한다.
