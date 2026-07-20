# Source Lens AI 설명 파일럿

- 기준: Source Lens 0.7.0-alpha.0
- 상태: 구현됨, 기본 비활성, 제공자·모델·비용 승인 대기
- 범위: `WORKFLOW_CANVAS_OWNER_USER_ID` 소유자의 Workflow Canvas 자기 시스템 Source Lens만

## 보내는 정보

서버는 다음 메타데이터만 선택한 제공자에 전송할 수 있다.

- 코드 파츠 종류·대상 심볼
- 결정적 템플릿 설명
- 저장소 상대 경로
- AST 노드 종류와 줄 범위

소스 코드 본문, 캔버스 본문, 사용자 정보, 토큰·키 값은 전송하지 않는다. 외부 전송은 시스템 지도의 `external-saas` 신뢰영역과 AI 설명 API 게이트웨이로 선언한다.

## 출력 경계

- AI 설명은 `AI 설명` artifact와 제공자·모델 배지를 유지한다.
- 결정적 템플릿 설명과 근거 링크를 나란히 보여준다.
- AI는 관계, 권한, Reality Level, 편집 속성, 캔버스 제안을 만들 수 없다.
- 분당 최대 6회로 제한하며 서버 타임아웃을 적용한다.

## 제공자 후보

| 후보 | 이 파일럿에서의 의미 | 비용·데이터 확인 |
|---|---|---|
| Claude API | 코드 설명을 자연어로 풀어내는 품질 상한을 먼저 확인하는 후보 | [가격](https://docs.anthropic.com/en/docs/about-claude/pricing), [보존 정책](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) |
| OpenAI API | 구조화 출력과 후속 에이전트 확장성을 함께 비교하는 후보 | [가격](https://openai.com/api/pricing/), [데이터 제어](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint) |
| Gemini API | 비용·장문 맥락과 유료 데이터 정책을 함께 비교하는 후보 | [가격](https://ai.google.dev/gemini-api/docs/pricing), [ZDR](https://ai.google.dev/gemini-api/docs/zdr) |

현재 권고는 **Claude API의 저비용 코드 설명 모델로 작은 A/B 파일럿을 먼저 하되, 모델 ID와 월 사용 한도를 사용자가 명시 승인한 후만 활성화**하는 것이다. 이 권고는 품질 상한 확인을 위한 파일럿 순서이며, 상용화 제공자 확정이 아니다.

## 활성화 전 필수 승인

1. 제공자와 정확한 모델 ID
2. 예상 호출 수·월 예산·사용량 알림 기준
3. 제공자 보존·학습·지역 정책
4. Vercel Production 환경변수 설정

```text
SOURCE_LENS_AI_ENABLED=true
SOURCE_LENS_AI_PROVIDER=anthropic|openai|gemini
SOURCE_LENS_AI_MODEL=<승인된 모델 ID>
SOURCE_LENS_AI_API_KEY=<Vercel의 암호화된 Production 비밀값>
```

키 값은 문서, Git, 캔버스, 로그, 클라이언트 번들에 기록하지 않는다. 승인 전에는 위 환경변수를 설정하지 않으며 결정적 설명만 사용한다.
