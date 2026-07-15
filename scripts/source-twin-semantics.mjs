const ROLE = (area, summary, userImpact) => Object.freeze({ area, summary, userImpact })

const WORKFLOW_CANVAS_FILE_ROLES = Object.freeze({
  'src/App.jsx': ROLE(
    'canvas-interface',
    '캔버스 편집 화면 전체를 조율합니다. 노드·연결선 편집, 현재 캔버스, 공유 상태, 오른쪽 작업 창과 저장 동작을 서로 연결합니다.',
    '사용자가 캔버스에서 보고 클릭하는 대부분의 동작이 이 파일을 거쳐 함께 작동합니다.',
  ),
  'src/main.jsx': ROLE(
    'canvas-interface',
    '브라우저가 Workflow Canvas 화면을 처음 시작하도록 React 앱을 페이지에 연결합니다.',
    '이 진입점이 실패하면 로그인 화면과 캔버스 자체가 열리지 않습니다.',
  ),
  'src/index.css': ROLE(
    'canvas-interface',
    '캔버스, 노드, 연결선, 패널과 팝업의 크기·색·배치·반응형 모양을 결정합니다.',
    '화면이 읽기 쉽고 모바일과 데스크톱에서 겹치지 않게 보이는 방식을 바꿉니다.',
  ),
  'src/storage.js': ROLE(
    'data-storage-sync',
    '로그인 전이나 네트워크 연결 전에도 캔버스 목록과 편집 상태를 브라우저에 보관하고, 오래된 저장 형식을 현재 형식으로 옮깁니다.',
    '새로고침 뒤 작업이 남아 있게 하고 예전 버전에서 만든 캔버스도 계속 열리게 합니다.',
  ),
  'src/demoCanvases.js': ROLE(
    'canvas-model',
    '개발과 초기 화면에서 사용할 수 있는 예시 캔버스 자료를 정의합니다.',
    '예시 자료가 실제 사용자 캔버스로 잘못 생성되지 않도록 사용 위치를 확인해야 하는 파일입니다.',
  ),
  'src/edges/StubEdge.jsx': ROLE(
    'canvas-interface',
    '노드 사이 연결선, 화살표, 관계 설명과 연결선 위 실행 버튼을 화면에 그립니다.',
    '사용자가 정보 흐름의 방향을 보고 동기화 같은 관계 조작을 시작하는 방식에 영향을 줍니다.',
  ),
  'src/edges/stubEdgeGeometry.js': ROLE(
    'canvas-model',
    '연결선이 노드나 파츠의 실제 테두리에서 시작하고 끝나도록 좌표를 계산합니다.',
    '화살표가 노드와 떨어지거나 줌할 때 연결점이 어긋나는 현상을 막습니다.',
  ),
  'src/nodes/GroupNode.jsx': ROLE('canvas-interface', '여러 노드를 묶는 그룹 상자와 그룹 편집 동작을 화면에 그립니다.', '업무 묶음과 시야·편집 범위를 캔버스에서 구분하게 합니다.'),
  'src/nodes/ContentNode.jsx': ROLE('notes-content', '본문, 링크와 이미지를 담는 콘텐츠 노드를 그리고 직접 편집할 수 있게 합니다.', '사용자가 자료와 긴 내용을 캔버스 안에서 작성하고 볼 수 있게 합니다.'),
  'src/nodes/StageNode.jsx': ROLE('canvas-interface', '단계와 계층을 나타내는 노드를 그리고 제목·본문 편집을 처리합니다.', '절차와 상하위 구조를 캔버스에서 정리하는 방식에 영향을 줍니다.'),
  'src/nodes/SystemNode.jsx': ROLE('digital-twin-engine', '앱·서버·DB 같은 실제 시스템 노드와 파츠, 운영 상태, 실행 가능한 기능을 화면에 표시합니다.', '정보성 도형과 실제 시스템에 연결된 디지털 트윈을 구분하고 조작하게 합니다.'),
  'src/nodes/MemoNode.jsx': ROLE('notes-content', '짧은 참고 내용과 메모를 빠르게 적는 노드를 화면에 그립니다.', '캔버스 흐름을 방해하지 않고 간단한 설명을 남기게 합니다.'),

  'src/components/Toolbar.jsx': ROLE('canvas-interface', '노드 추가, 전체 보기, 되돌리기 같은 캔버스의 주요 명령을 모아 보여줍니다.', '반복해서 쓰는 편집 기능을 빠르게 실행하게 합니다.'),
  'src/components/EditToolbar.jsx': ROLE('notes-content', '선택한 노드 본문의 글꼴, 정렬, 색과 이미지 삽입 도구를 제공합니다.', '노드 내용을 문서처럼 편집하게 합니다.'),
  'src/components/NodePalette.jsx': ROLE('canvas-interface', '새로 만들 수 있는 노드 종류를 보여주고 드래그해 캔버스에 놓을 자료를 준비합니다.', '사용자가 원하는 형태의 노드를 캔버스에 추가하게 합니다.'),
  'src/components/CanvasTabs.jsx': ROLE('canvas-interface', '개인·공유 캔버스 목록과 현재 캔버스 전환 화면을 표시합니다.', '여러 캔버스 사이를 이동하고 공유 상태를 구분하게 합니다.'),
  'src/components/AuthPanel.jsx': ROLE('identity-profile', '로그인·회원가입·프로필 편집과 아바타 설정 화면을 제공합니다.', '사용자가 자기 계정으로 접속하고 표시 이름과 색상을 관리하게 합니다.'),
  'src/components/InvitePopover.jsx': ROLE('sharing-collaboration', '이메일이나 링크로 캔버스·그룹·노드에 사람을 초대하는 화면을 제공합니다.', '공동 작업자를 초대하고 초대 범위를 지정하게 합니다.'),
  'src/components/ParticipantAvatar.jsx': ROLE('sharing-collaboration', '참여자 프로필과 접속·시야 제한 상태를 작은 아바타로 표시합니다.', '누가 함께 작업 중이고 어떤 범위만 볼 수 있는지 한눈에 확인하게 합니다.'),
  'src/components/ScopedParticipants.jsx': ROLE('sharing-collaboration', '캔버스·그룹·노드별 참여자를 초대된 위치와 권한 범위에 맞춰 보여줍니다.', '참여자가 어디에 초대되었고 어떤 접근 권한이 있는지 구분하게 합니다.'),
  'src/components/NotesPanel.jsx': ROLE('notes-content', '캔버스와 동등한 분할 창에서 노트를 만들고 계층·연결 관계를 문서 형태로 탐색합니다.', '캔버스가 복잡할 때 내용을 노트 앱처럼 읽고 편집하게 합니다.'),
  'src/components/OpenInNotesButton.jsx': ROLE('notes-content', '캔버스 노드를 현재 노트 창에서 바로 여는 단축 버튼을 제공합니다.', '노드 편집 중 긴 내용을 넓은 노트 화면으로 빠르게 이어서 작업하게 합니다.'),
  'src/components/CanvasImage.jsx': ROLE('media-files', '저장된 이미지 주소를 안전하게 불러와 캔버스와 노트에 표시합니다.', '첨부 이미지가 권한과 만료 상태에 맞게 보이도록 합니다.'),
  'src/components/EdgeRelationEditor.jsx': ROLE('canvas-interface', '연결선의 관계 종류, 방향, 근거와 표시 이름을 편집하는 화면을 제공합니다.', '연결선이 단순한 선이 아니라 실제 의미와 근거를 가진 관계가 되게 합니다.'),
  'src/components/DigitalTwinReviewPanel.jsx': ROLE('digital-twin-engine', '실제 시스템에서 발견한 변경안을 미리 보고 적용·무시·보류하도록 검토 목록을 보여줍니다.', '엔진이 캔버스를 마음대로 바꾸지 못하게 하고 사람이 변경을 승인하게 합니다.'),
  'src/components/SystemObservationCatalog.jsx': ROLE('digital-twin-engine', '시스템 파츠에서 현재 확인할 수 있는 운영 정보와 아직 알 수 없는 정보를 목록으로 보여줍니다.', 'LIVE 표시가 무엇을 근거로 하는지, 추가 연결이 필요한 정보는 무엇인지 알게 합니다.'),
  'src/components/SourceTwinPanel.jsx': ROLE('source-code-twin', '로컬·GitHub 코드의 역할별 구조, 변경 이력, Git 동기화와 상태 스냅샷을 한 창에서 보여줍니다.', '비개발자도 앱의 어느 부분이 어떤 일을 하는지 보고 실제 코드와 변경 내역까지 따라가게 합니다.'),

  'src/lib/canvasGeometry.js': ROLE('canvas-model', '중첩된 노드의 실제 화면 위치와 여러 노드가 차지하는 범위를 계산합니다.', '선택 영역, 시점 이동과 자동 배치가 정확한 위치를 사용하게 합니다.'),
  'src/lib/canvasNavigation.js': ROLE('canvas-model', '현재 캔버스 ID와 주소를 맞추고 새로고침 뒤에도 같은 캔버스로 돌아오게 합니다.', '새로고침할 때 다른 캔버스로 튀는 일을 막습니다.'),
  'src/lib/canvasSchemaGuard.js': ROLE('canvas-model', '저장된 캔버스 자료가 허용된 노드·연결선 형식인지 검사하고 오래된 형식을 안전하게 보정합니다.', '깨진 데이터가 화면 전체를 망가뜨리거나 위험한 필드가 섞이는 일을 줄입니다.'),
  'src/lib/canvasMerge.js': ROLE('data-storage-sync', '브라우저와 서버에서 각각 바뀐 캔버스 자료를 충돌 없이 합칠 기준을 제공합니다.', '동시에 편집하거나 연결이 잠시 끊겨도 작업이 불필요하게 사라지는 일을 줄입니다.'),
  'src/lib/canvasSync.js': ROLE('data-storage-sync', '캔버스 저장 요청, 서버 변경 구독과 충돌 재시도를 한 흐름으로 조율합니다.', '여러 참여자의 변경이 최신 상태로 맞춰지고 저장 실패를 감지하게 합니다.'),
  'src/lib/cloudStorage.js': ROLE('data-storage-sync', 'Supabase에서 캔버스 목록과 노드·연결선을 불러오고 저장·삭제합니다.', '로그인한 사용자의 캔버스가 여러 기기와 참여자 사이에서 유지되게 합니다.'),
  'src/lib/supabase.js': ROLE('data-storage-sync', '브라우저가 로그인과 허용된 데이터 요청에 사용할 Supabase 공개 클라이언트를 한 번만 만듭니다.', '앱 화면이 사용자 세션과 데이터베이스에 연결되는 출발점입니다.'),
  'src/lib/shares.js': ROLE('sharing-collaboration', '초대, 공유 링크, 참여자 권한과 나가기·추방 요청을 서버와 주고받습니다.', '공유 캔버스에 누가 어떤 방식으로 참여하고 나가는지를 실제로 바꿉니다.'),
  'src/lib/sharedCanvasApi.js': ROLE('sharing-collaboration', '공유 링크 최초 접속의 확인·수락·거절 요청을 전용 서버 경로로 보냅니다.', '링크를 연 사람이 동의하기 전에는 참여자로 확정되지 않게 합니다.'),
  'src/lib/shareLaunchCoordinator.js': ROLE('sharing-collaboration', '하나의 공유 링크가 브라우저 탭을 중복해서 여는 일을 막고 최초 접속을 한 번만 처리합니다.', '링크 하나를 눌렀을 때 불필요한 창이 여러 개 생기지 않게 합니다.'),
  'src/lib/presence.js': ROLE('sharing-collaboration', '같은 캔버스에 접속 중인 참여자와 마지막 활동 상태를 실시간으로 교환합니다.', '공동 작업자가 지금 접속해 있는지 서로 확인하게 합니다.'),
  'src/lib/profiles.js': ROLE('identity-profile', '사용자 프로필을 불러오고 이름·아바타·색상 변경을 저장합니다.', '프로필 저장 버튼의 결과가 계정에 실제 반영되게 합니다.'),
  'src/lib/imageStorage.js': ROLE('media-files', '캔버스 이미지를 Supabase Storage에 올리고 삭제하며 접근 가능한 주소를 만듭니다.', '큰 이미지가 캔버스 데이터 본문에 섞이지 않고 별도 파일로 안전하게 보관되게 합니다.'),
  'src/lib/sanitizeHtml.js': ROLE('security-privacy', '노드 본문에서 위험한 HTML, 스크립트와 외부 주소를 제거한 뒤 화면에 표시할 자료만 남깁니다.', '공유된 콘텐츠를 이용한 스크립트 실행과 악성 링크 위험을 줄입니다.'),
  'src/lib/wheelRouting.js': ROLE('canvas-interface', '트랙패드 스크롤을 선택한 노드·파츠 내부 스크롤과 캔버스 확대·이동 중 어디로 보낼지 결정합니다.', '노드 내용을 스크롤하려다 캔버스 전체가 움직이는 불편을 막습니다.'),
  'src/lib/localConnectorApi.js': ROLE('source-code-twin', '브라우저에서 로컬 커넥터 생성·해제·상태 조회와 Git 동기화 계획 요청을 서버로 보냅니다.', '캔버스에서 로컬 저장소 상태를 보고 승인된 동기화를 시작하게 합니다.'),
  'src/lib/sourceTwinApi.js': ROLE('source-code-twin', '배포된 코드 구조, GitHub 변경과 상태 스냅샷을 서버에서 불러오고 기록 요청을 보냅니다.', '코드 구조 화면과 이전 배포 비교가 실제 서버 정보로 작동하게 합니다.'),
  'src/lib/digitalTwinAdapters.js': ROLE('digital-twin-engine', '화면에서 사용할 디지털 트윈 어댑터를 등록하고 대상 캔버스에 맞는 어댑터를 고릅니다.', '새 시스템 종류를 엔진에 추가해도 검토 화면을 다시 만들지 않게 합니다.'),
  'src/lib/systemRuntimeApi.js': ROLE('digital-twin-engine', '시스템 파츠의 운영 상태를 서버에 확인하고 최신 관측 결과를 불러옵니다.', '새로고침 버튼을 눌렀을 때 선언이 아니라 실제 확인 결과로 LIVE 상태를 갱신하게 합니다.'),
  'src/lib/mcpTokens.js': ROLE('ai-integration', '사용자가 AI 커넥터에 쓸 MCP 토큰을 발급·조회·폐기하도록 서버와 통신합니다.', 'AI 연결 권한을 사용자가 직접 끊거나 다시 만들 수 있게 합니다.'),

  'api/local-connector.js': ROLE('source-code-twin', '브라우저와 로컬 커넥터 사이에서 페어링, 상태 보고와 승인된 Git 작업 요청을 중계합니다.', '웹이 로컬 파일 경로를 직접 읽지 않고도 제한된 코드 구조와 Git 상태만 받게 합니다.'),
  'api/mcp.js': ROLE('ai-integration', '외부 AI의 MCP 요청을 받아 토큰을 확인한 뒤 허용된 캔버스 도구 서버로 전달합니다.', '연결된 AI가 사용자 권한 안에서 캔버스를 읽고 조작하게 합니다.'),
  'api/shared-canvas.js': ROLE('sharing-collaboration', '공유 링크의 유효성, 최초 참여 동의와 링크 취소 상태를 서버에서 판정합니다.', '로그아웃 방문자도 링크 안내를 보고 수락·거절할 수 있으며 취소된 링크는 들어오지 못하게 합니다.'),
  'api/source-twin-webhook.js': ROLE('source-code-twin', 'GitHub push 웹훅의 서명을 검증하고 변경된 커밋과 파일 경로만 기록합니다.', '어떤 코드 변경이 현재 배포보다 앞서 있는지 코드 구조 화면에 보여줍니다.'),
  'api/source-twin.js': ROLE('source-code-twin', '현재 배포 코드 구조, 변경 이벤트와 상태 스냅샷 조회·생성을 소유자에게 제공합니다.', '코드 구조 대시보드가 배포 서버의 기준 자료와 이력을 읽게 합니다.'),
  'api/system-runtime.js': ROLE('digital-twin-engine', '시스템 지도에서 선택한 파츠의 실제 운영 상태를 제한된 검사 목록으로 확인하고 결과를 저장합니다.', 'LIVE 여부가 단순 선언이 아니라 방금 확인한 운영 증거를 뜻하게 합니다.'),

  'mcp/server.js': ROLE('ai-integration', 'AI에게 공개할 캔버스 도구의 이름, 입력 형식과 실행 함수를 등록합니다.', 'AI가 할 수 있는 작업의 전체 목록과 경계를 결정합니다.'),
  'mcp/store.js': ROLE('ai-integration', 'AI 도구가 캔버스·노드·연결선을 읽고 바꿀 때 소유권과 공유 범위를 검사하고 Supabase에 반영합니다.', 'AI가 화면과 같은 권한 규칙을 지키며 실제 캔버스를 조작하게 합니다.'),
  'mcp/shareAccess.js': ROLE('sharing-collaboration', 'MCP에서 공유 참여자 목록과 초대 범위를 계산하고 시야 제한을 적용합니다.', 'AI로 조회해도 캔버스 참여자끼리 허용된 정보만 보이게 합니다.'),
  'mcp/layout.js': ROLE('canvas-model', '여러 노드와 연결선을 계층·방사형 같은 배치로 정리할 좌표를 계산합니다.', 'AI가 만든 구조도도 겹치지 않고 읽기 쉬운 위치에 놓이게 합니다.'),
  'mcp/sanitize.js': ROLE('security-privacy', 'AI나 외부 요청에서 들어온 텍스트·HTML·URL의 위험한 내용을 서버에서도 제거합니다.', '브라우저 검사를 우회한 악성 입력이 저장되는 것을 막습니다.'),
  'mcp/dataAccessAudit.js': ROLE('security-privacy', '관리자 권한으로 사용자 캔버스 자료에 접근한 이유와 결과를 감사 기록으로 남깁니다.', '운영 접근이 조용히 일어나지 않도록 추적 가능한 근거를 만듭니다.'),
  'mcp/systemOperationPlan.js': ROLE('security-privacy', '실행 전에 대상·변경 범위·만료 시각을 고정한 계획에 서명하고 적용 시 같은 계획인지 검증합니다.', '오래되거나 변조된 승인으로 다른 작업이 실행되는 것을 막습니다.'),
  'mcp/systemRuntime.js': ROLE('digital-twin-engine', 'Vercel·Supabase·MCP 같은 시스템의 허용된 운영 지표를 수집하고 민감한 값을 제거합니다.', '시스템 노드의 운영 상태를 실제 데이터로 채우되 사용자 본문과 비밀값은 내보내지 않습니다.'),
  'mcp/sourceTwinStore.js': ROLE('source-code-twin', '소스 트윈 상태 스냅샷의 미리보기·승인·저장·비교를 서버에서 수행합니다.', '특정 배포 시점의 코드·DB·운영 상태를 나중에 다시 비교하게 합니다.'),
  'mcp/localConnectorStore.js': ROLE('source-code-twin', '로컬 커넥터 등록, heartbeat, Git 동기화 계획과 실행 결과를 서버에 보관합니다.', '클라우드가 임의 명령을 보내지 못하고 승인된 Git 작업만 로컬에서 실행되게 합니다.'),

  'shared/twinBuild.js': ROLE('digital-twin-engine', '서로 다른 앱에서 발견한 시스템을 엔티티·파츠·관계·신뢰 경계·증거라는 공통 형식으로 정규화합니다.', '어떤 프로그램을 가져와도 같은 캔버스 문법으로 표현할 수 있게 하는 엔진의 중심 규격입니다.'),
  'shared/twinBuildReconciler.js': ROLE('digital-twin-engine', '새로 발견한 디지털 트윈과 현재 캔버스를 비교해 추가·변경·삭제 검토안을 만듭니다.', '재검사할 때 사용자의 배치와 메모를 지키면서 실제 변경만 검토하게 합니다.'),
  'shared/twinBuildCanvas.js': ROLE('digital-twin-engine', '표준 트윈의 엔티티·파츠·관계를 실제 캔버스 노드와 연결선으로 바꾸고 다시 대응시킵니다.', '엔진 결과가 눈에 보이는 캔버스로 실체화되게 합니다.'),
  'shared/twinAdapterContract.js': ROLE('digital-twin-engine', '새 프로그램 종류를 연결하는 어댑터가 제공해야 할 발견·권한·조작 계약을 검증합니다.', '두 번째 앱을 추가할 때 핵심 엔진을 고치지 않고도 안전하게 확장하게 합니다.'),
  'shared/workflowSystemTwinAdapter.js': ROLE('digital-twin-engine', 'Workflow Canvas 자체를 디지털 트윈으로 검사해 현재 지도와 다른 점을 검토안으로 만듭니다.', '지금 개발 중인 앱을 첫 실제 사례로 엔진의 발견·대조 과정을 검증합니다.'),
  'shared/workflowSystemTwinAdapterDescriptor.js': ROLE('digital-twin-engine', 'Workflow Canvas 어댑터가 읽는 정보, 필요한 권한과 지원하는 조작을 선언합니다.', '엔진이 어댑터의 실제 능력보다 넓은 권한을 주지 않게 합니다.'),
  'shared/workflowSystemTwinBuild.js': ROLE('digital-twin-engine', 'Workflow Canvas 시스템 지도를 표준 TwinBuild 자료로 변환하고 검증합니다.', '현재 앱에 특화된 구조와 범용 엔진 사이의 번역층 역할을 합니다.'),
  'shared/workflowSystemDiscovery.js': ROLE('digital-twin-engine', '코드·DB·MCP·환경설정의 현재 발견 결과와 시스템 지도 기준을 비교합니다.', '지도에 빠진 자원이나 실제와 달라진 관계를 검토 항목으로 찾습니다.'),
  'shared/workflowCanvasSystemMap.js': ROLE('digital-twin-engine', 'Workflow Canvas 앱의 브라우저·서버·DB·저장소·배포 구조를 나타내는 기준 시스템 지도를 정의합니다.', '앱 자체를 캔버스에서 개발·점검할 출발 지도를 만듭니다.'),
  'shared/systemOntology.js': ROLE('digital-twin-engine', '앱·서버·DB·사람 같은 시스템 노드 종류와 실재성 표시 규칙을 정의합니다.', '정보성 노드와 실제 시스템에 연결된 노드를 구분하게 합니다.'),
  'shared/systemPartOntology.js': ROLE('digital-twin-engine', '시스템 노드 파츠의 종류, 연결점과 운영 상태 필드를 공통 규칙으로 정의합니다.', '파츠가 단순 장식이 아니라 확인·입출력·조작 능력을 뜻하게 합니다.'),
  'shared/relationOntology.js': ROLE('digital-twin-engine', '연결선이 호출·읽기·쓰기·동기화 중 무엇인지와 근거·신뢰도를 정의합니다.', '같아 보이는 연결선도 실제 관계와 방향을 명확히 구분하게 합니다.'),
  'shared/trustTopology.js': ROLE('security-privacy', '로컬·클라우드·외부 SaaS 같은 신뢰 영역과 그 경계를 통과하는 게이트웨이를 검사합니다.', '외부에서 로컬이나 개인정보로 들어올 수 있는 경로와 설명되지 않은 보안 구멍을 표시하게 합니다.'),
  'shared/systemRuntime.js': ROLE('digital-twin-engine', '운영 상태 검사 요청과 결과, 관측 신선도와 LIVE 판정 기준을 표준화합니다.', '오래된 결과가 계속 살아 있는 것처럼 표시되지 않게 합니다.'),
  'shared/systemObservationCatalog.js': ROLE('digital-twin-engine', '각 시스템 파츠에서 조회 가능한 운영 정보, 보호되는 정보와 추가 연결이 필요한 정보를 정의합니다.', '사용자가 파츠에서 무엇을 더 볼 수 있고 왜 아직 못 보는지 알게 합니다.'),
  'shared/digitalTwinProposal.js': ROLE('digital-twin-engine', '검토가 승인된 디지털 트윈 변경만 캔버스 자료에 적용하고 충돌을 검사합니다.', '미리보기와 다른 오래된 수정안이 캔버스를 덮어쓰는 일을 막습니다.'),
  'shared/digitalTwinReview.js': ROLE('digital-twin-engine', '트윈 변경안의 적용·무시·보류 결정을 저장하고 새 검사에서도 같은 결정을 찾습니다.', '검토한 항목이 새로고침할 때 계속 처음 상태로 돌아가지 않게 합니다.'),
  'shared/workflowSystemMapRepair.js': ROLE('digital-twin-engine', '기존 시스템 지도 연결선에서 빠진 관계 메타데이터만 골라 복구 계획을 만듭니다.', '이미 사람이 수정한 설명은 보호하면서 누락된 근거만 복원하게 합니다.'),
  'shared/operationLifecycle.js': ROLE('digital-twin-engine', '직접 클릭·자동화·미래 AI가 실행하는 조작을 계획, 승인, 실행, 확인, 감사, 복구 순서로 제한합니다.', '실제 시스템 조작이 누가 시작했든 같은 안전 절차를 건너뛰지 못하게 합니다.'),
  'shared/workflowOperationDefinitions.js': ROLE('digital-twin-engine', 'Git 동기화와 상태 스냅샷처럼 현재 허용된 실제 조작의 대상·위험·검증 조건을 선언합니다.', '화면 버튼이 임의 명령이 아니라 정해진 능력만 실행하게 합니다.'),
  'shared/edgeOperation.js': ROLE('digital-twin-engine', '연결선 위 조작의 방향, 실행 상태와 완료 표시를 표준 화면 정보로 바꿉니다.', '자동 흐름과 사용자가 눌러야 하는 수동 조작을 다르게 보이게 합니다.'),
  'shared/sourceTwin.js': ROLE('source-code-twin', '코드 구조 관점, 검색, GitHub 코드 링크와 배포별 상태 스냅샷 형식을 정의합니다.', '코드 구조 화면과 서버가 같은 소스 트윈 자료를 이해하게 합니다.'),
  'shared/sourceTwinSemantics.js': ROLE('source-code-twin', '코드 파일을 제품 영역별로 묶는 공통 분류 이름과 표시 순서를 정의합니다.', '기능·코드 목록이 파일 경로 나열이 아니라 실제 제품 영역 순서로 보이게 합니다.'),
  'shared/workflowSourceTwinCanvas.js': ROLE('source-code-twin', '시스템 지도의 로컬 저장소·GitHub·Vercel 파츠를 알맞은 코드 구조 화면과 조작에 연결합니다.', '노드 위 코드 파츠를 눌렀을 때 관련 없는 탭이 아니라 해당 저장소 정보가 열리게 합니다.'),
  'shared/localConnector.js': ROLE('source-code-twin', '로컬 커넥터가 클라우드로 보낼 수 있는 코드 메타데이터와 Git 동기화 방향을 제한·판정합니다.', '소스 본문과 토큰을 보내지 않고 파일 역할·Git 상태만 안전하게 보여줍니다.'),
  'shared/sharePermissions.js': ROLE('sharing-collaboration', '캔버스·그룹·노드 초대 권한을 합쳐 실제로 볼 수 있고 편집할 수 있는 범위를 계산합니다.', '같은 팀 참여자는 서로 보되 시야 제한을 우회해 본문을 읽지는 못하게 합니다.'),
  'shared/privacyCapabilities.js': ROLE('security-privacy', '운영자가 어떤 사용자 정보에 접근할 수 있는지와 감사 준비 상태를 표준 항목으로 정의합니다.', '개인정보 보호 주장을 기능별 근거와 함께 표시할 토대를 만듭니다.'),

  'scripts/source-twin-scanner.mjs': ROLE('source-code-twin', '저장소 파일을 AST로 읽어 파일·함수·API·DB·보안 참조를 증거 기반 소스 트윈으로 만듭니다.', '코드가 바뀔 때 코드 구조 화면의 실체와 연결 관계를 자동 갱신합니다.'),
  'scripts/source-twin-semantics.mjs': ROLE('source-code-twin', '발견된 코드 증거를 비개발자가 이해할 역할 설명과 제품 영역으로 바꾸는 규칙을 제공합니다.', '함수 개수 같은 무의미한 요약 대신 제품에서 실제 하는 일을 보여줍니다.'),
  'scripts/generate-source-twin.mjs': ROLE('source-code-twin', '현재 저장소를 스캔해 배포에 포함할 소스 트윈 manifest를 생성하고 오래되지 않았는지 검사합니다.', '배포된 코드 구조 설명이 실제 커밋과 함께 갱신되게 합니다.'),
  'scripts/local-connector-agent.mjs': ROLE('source-code-twin', '사용자 Mac에서 허용된 저장소만 읽어 코드 구조와 Git 상태를 서버에 주기적으로 보고하고 승인된 동기화를 실행합니다.', '웹 서버에 로컬 파일 접근 권한을 주지 않고도 캔버스에서 실제 로컬 상태를 확인하게 합니다.'),
  'scripts/system-discovery.mjs': ROLE('digital-twin-engine', '코드·SQL·MCP 도구·환경변수 이름을 스캔해 Workflow Canvas 시스템 자원 목록을 만듭니다.', '시스템 지도에서 빠진 실제 구성 요소를 자동으로 발견하게 합니다.'),
  'scripts/generate-system-discovery.mjs': ROLE('digital-twin-engine', '시스템 발견 결과를 배포 manifest로 만들고 현재 코드와 일치하는지 검사합니다.', '시스템 지도 검사의 기준 자료가 배포 시점 코드와 어긋나지 않게 합니다.'),
  'scripts/check-privacy-release.mjs': ROLE('testing-quality', '배포 전에 개인정보 감사 설정과 사용자 본문 접근 경로의 필수 보호 장치를 검사합니다.', '개인정보 보호 조건이 빠진 빌드가 출시되는 것을 차단합니다.'),

  'supabase-schema.sql': ROLE('data-storage-sync', '캔버스, 노드, 연결선과 사용자 설정의 기본 테이블·권한·저장 함수를 만듭니다.', '로그인한 사용자의 핵심 캔버스 자료가 Supabase에 저장되는 구조를 결정합니다.'),
  'supabase-shares.sql': ROLE('sharing-collaboration', '이메일·링크 초대, 참여자, 취소와 시야 제한을 저장하고 공유 범위별 접근 규칙을 만듭니다.', '초대 수락·거절·나가기·추방과 제한된 본문 공개가 실제 DB 권한으로 작동하게 합니다.'),
  'supabase-profiles.sql': ROLE('identity-profile', '사용자 프로필과 아바타 정보를 저장하고 허용된 참여자끼리 조회할 규칙을 만듭니다.', '공유 참여자 이름과 아바타가 보이되 관계없는 사용자는 조회하지 못하게 합니다.'),
  'supabase-profile-privacy.sql': ROLE('security-privacy', '프로필 이메일과 마지막 접속 정보가 공유 관계 안에서만 보이도록 DB 조회 경계를 보강합니다.', '관계없는 사람이 프로필 정보를 직접 조회하는 일을 막습니다.'),
  'supabase-canvas-notes.sql': ROLE('notes-content', '캔버스 밖에서 만든 노트와 캔버스 노드의 연결 상태를 저장할 구조를 만듭니다.', '노트 앱에서 만든 내용이 캔버스에 올리기 전에도 보존되게 합니다.'),
  'supabase-canvas-images.sql': ROLE('media-files', '캔버스 이미지 저장 공간과 파일 접근·삭제 권한을 만듭니다.', '이미지 파일을 캔버스 소유권과 공유 범위에 맞게 보호합니다.'),
  'supabase-realtime.sql': ROLE('data-storage-sync', '캔버스 변경을 참여자 브라우저에 실시간으로 알리는 DB 설정을 만듭니다.', '공동 편집자가 새로고침하지 않아도 변경을 받게 합니다.'),
  'supabase-runtime-observations.sql': ROLE('digital-twin-engine', '시스템 파츠의 운영 상태 확인 결과와 확인 시각을 저장합니다.', 'LIVE 상태가 새로고침 뒤에도 남고 오래되면 stale로 판정할 근거가 됩니다.'),
  'supabase-runtime-read.sql': ROLE('digital-twin-engine', '운영 대시보드가 사용자 본문 없이 집계 상태만 읽도록 제한된 DB 함수를 만듭니다.', '시스템 지도가 사용자 캔버스 내용을 노출하지 않고 운영 수치만 확인하게 합니다.'),
  'supabase-source-twin-history.sql': ROLE('source-code-twin', '배포별 코드·DB·운영 상태 스냅샷과 GitHub 변경 이벤트를 저장합니다.', '현재 상태와 이전 배포를 비교하고 변경 근거를 남기게 합니다.'),
  'supabase-local-connectors.sql': ROLE('source-code-twin', '로컬 커넥터 등록, heartbeat, 제한된 manifest와 Git 실행 요청을 저장합니다.', '각 사용자의 Mac 연결이 다른 계정과 섞이지 않고 폐기 가능하게 합니다.'),
  'supabase-data-access-audit.sql': ROLE('security-privacy', '관리자 권한의 사용자 캔버스 접근을 추가만 가능한 감사 기록으로 저장합니다.', '운영자 열람이 있었다면 나중에 지우거나 숨기기 어렵게 만드는 기반입니다.'),
  'supabase-relation-metadata-guard.sql': ROLE('security-privacy', '근거가 채워진 시스템 관계 메타데이터를 오래된 탭이나 무근거 저장이 덮어쓰지 못하게 합니다.', '복구한 연결선 설명과 보안 근거가 다시 사라지는 일을 막습니다.'),
  'supabase-mcp-schema.sql': ROLE('ai-integration', 'AI 연결 토큰과 MCP에서 사용하는 서버 저장 함수를 만들고 계정별 접근을 제한합니다.', '사용자가 발급한 AI 연결만 자기 캔버스에 접근하게 합니다.'),
  'supabase-canvas-stage-types.sql': ROLE('canvas-model', '캔버스별 단계 종류와 이름을 저장하고 변경하는 DB 함수를 만듭니다.', '사용자가 자기 업무 방식에 맞는 단계 분류를 만들게 합니다.'),
  'supabase-canvas-views.sql': ROLE('canvas-model', '캔버스별 화면 위치와 보기 설정을 사용자마다 저장합니다.', '같은 공유 캔버스에서도 각자 마지막 시점과 보기 설정을 유지하게 합니다.'),
})

const WORD_LABELS = Object.freeze({
  access: '접근 권한', active: '현재 선택', admin: '서버 관리자 연결', agent: '로컬 연결 프로그램', api: '서버 기능',
  anchor: '연결점', anchors: '연결점', approved: '승인된 상태', array: '목록 자료', async: '응답 대기 작업',
  all: '전체', apply: '승인된 변경 적용', audit: '접근 감사', auth: '로그인 인증', avatar: '아바타',
  base: '기준', bearer: '요청 인증', body: '요청 본문', boolean: '참·거짓 값', bounds: '화면 범위', branch: 'Git 브랜치', browser: '브라우저', build: '트윈 구성',
  canvas: '캔버스', canvases: '캔버스 목록', capture: '상태 기록', catalog: '조회 가능 정보 목록',
  change: '변경', changes: '변경 내역', child: '하위 항목', children: '하위 항목', clear: '비우기',
  claim: '실행 권한 선점', code: '코드', compact: '필요한 정보만 남기기', config: '설정', connector: '로컬 커넥터', content: '본문', context: '실행 문맥', create: '새 항목', credential: '비밀정보 참조', crossing: '경계 통과', crossings: '경계 통과',
  current: '현재 상태', data: '데이터', decision: '검토 결정', delete: '삭제', deployment: '배포',
  default: '기본값', definition: '기능 정의', detail: '상세 정보', direction: '방향', edge: '연결선', edges: '연결선', encoded: '인코딩된 자료', entity: '시스템 실체', error: '오류', event: '이벤트',
  evidence: '근거', external: '외부 공개 자료', file: '파일', filter: '조건에 맞는 항목', fingerprint: '변경 식별값',
  function: '함수', gateway: '신뢰 경계 통로', git: 'Git 상태', github: 'GitHub', graph: '노드·연결선 구조', group: '그룹', guard: '보호 규칙',
  handler: '서버 요청 진입점', hash: '변경 식별값', heartbeat: '연결 생존 신호', history: '상태 이력', host: '배포 주소', html: '본문 HTML', id: '식별자', image: '이미지', import: '코드 연결', input: '입력 자료',
  inspect: '시스템 검사', invite: '초대', item: '검토 항목', layout: '자동 배치', link: '공유 링크',
  label: '화면 이름', layered: '계층형', list: '목록', local: '로컬 저장소', manifest: '코드 구조 목록', map: '시스템 지도', merge: '동시 변경 병합', metadata: '설명 메타데이터',
  mcp: 'AI 도구 연결', metric: '운영 수치', metrics: '운영 수치', node: '노드', nodes: '노드', normalize: '안전한 공통 형식', note: '노트', observation: '운영 관측',
  operation: '실제 조작', parent: '상위 항목', part: '시스템 파츠', permission: '권한', plan: '실행 계획',
  preview: '실행 전 미리보기', profile: '프로필', proposal: '수정 제안', radial: '방사형', raw: '가공 전 자료', rect: '노드 경계 상자', relation: '관계', repository: '코드 저장소', request: '요청', response: '응답', result: '결과', results: '결과',
  resolve: '대상 판정', revoke: '권한 해제', role: '역할', route: '서버 경로', runtime: '실제 운영 상태', safe: '허용 범위로 제한', sanitize: '위험한 입력 제거', save: '저장',
  schema: '데이터 구조', select: '선택', service: '서버 기능', sha: 'Git 커밋 식별값', share: '공유', side: '연결 방향', signature: '요청 서명', snapshot: '상태 스냅샷', source: '소스 코드',
  stage: '단계', state: '상태', status: '상태', structural: '구조용', sync: '동기화', system: '시스템', table: 'DB 테이블', target: '대상', text: '텍스트', twin: '디지털 트윈',
  token: '연결 토큰', topology: '시스템 연결 구조', url: '웹 주소', update: '변경', user: '사용자', valid: '유효성', validate: '유효성 검사', value: '값',
  verification: '실행 결과 확인', view: '화면 상태', visible: '볼 수 있는 범위', webhook: '외부 변경 알림', workflow: '워크플로우', zone: '신뢰 영역',
})

const ACTIONS = Object.freeze({
  get: '불러옵니다', list: '목록을 불러옵니다', load: '불러옵니다', read: '읽습니다', fetch: '서버에서 가져옵니다',
  create: '새로 만듭니다', build: '구성합니다', make: '만듭니다', add: '추가합니다', update: '변경합니다', set: '설정합니다',
  delete: '삭제합니다', remove: '제거합니다', revoke: '권한을 해제합니다', resolve: '찾아 결정합니다', validate: '규칙에 맞는지 검사합니다',
  verify: '결과가 맞는지 확인합니다', normalize: '안전한 공통 형식으로 정리합니다', sanitize: '위험한 내용을 제거합니다',
  compare: '서로 비교합니다', inspect: '실제 상태와 대조합니다', discover: '구성 요소를 발견합니다', parse: '구조를 읽어냅니다',
  serialize: '저장 가능한 형식으로 바꿉니다', apply: '승인된 변경을 적용합니다', record: '기록합니다', persist: '저장합니다',
  capture: '현재 상태를 기록합니다', sync: '두 상태를 맞춥니다', filter: '조건에 맞는 것만 고릅니다', find: '대상을 찾습니다',
  open: '화면을 엽니다', close: '화면을 닫습니다', toggle: '켜거나 끕니다', calculate: '값을 계산합니다', compute: '값을 계산합니다',
  assert: '허용 조건을 강제합니다', can: '허용 가능한지 판단합니다', is: '해당 상태인지 판단합니다', has: '해당 정보가 있는지 판단합니다',
  send: '처리 결과를 브라우저에 보냅니다', handle: '요청을 받아 필요한 절차를 실행합니다',
})

function identifierWords(value) {
  return String(value ?? '')
    .replace(/GitHub/g, ' github ')
    .replace(/SourceTwin/g, ' source twin ')
    .replace(/DigitalTwin/g, ' digital twin ')
    .replace(/MCP/g, ' mcp ')
    .replace(/API/g, ' api ')
    .replace(/URL/g, ' url ')
    .replace(/HTML/g, ' html ')
    .replace(/RLS/g, ' rls ')
    .replace(/SHA/g, ' sha ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function conceptLabel(words) {
  return [...new Set(words.flatMap((word) => Object.hasOwn(WORD_LABELS, word) ? [WORD_LABELS[word]] : []))].join(' · ')
}

function baseName(relativePath) {
  return String(relativePath ?? '').split('/').pop()?.replace(/\.[^.]+$/, '') ?? ''
}

function genericArea(record) {
  const source = `${record.path} ${record.imports?.map((item) => item.source).join(' ') ?? ''}`.toLocaleLowerCase()
  if (/test|spec|fixture|check-/.test(source) || record.layer === 'test') return 'testing-quality'
  if (/auth|profile|session|login/.test(source)) return 'identity-profile'
  if (/share|invite|participant|presence|collab/.test(source)) return 'sharing-collaboration'
  if (/source.?twin|local.?connector|github|git.?sync/.test(source)) return 'source-code-twin'
  if (/twin|ontology|reconcil|system.?runtime|observation/.test(source)) return 'digital-twin-engine'
  if (/sanitize|privacy|permission|audit|trust|security/.test(source) || record.securitySignals?.length) return 'security-privacy'
  if (/note|memo|content|editor/.test(source)) return 'notes-content'
  if (/image|media|upload|storage/.test(source) && !/cloudstorage/.test(source)) return 'media-files'
  if (/canvas|node|edge|toolbar|palette|geometry|layout|navigation/.test(source) && record.layer === 'frontend') return 'canvas-interface'
  if (/mcp|agent|ai/.test(source) || record.layer === 'mcp') return 'ai-integration'
  if (/deploy|vercel|vite|package\.json/.test(source) || record.layer === 'deployment') return 'deployment-operations'
  if (/database|supabase|storage|sync|schema|\.sql/.test(source) || record.layer === 'database') return 'data-storage-sync'
  if (record.layer === 'frontend') return 'canvas-interface'
  return 'project-foundation'
}

function subsystemFromArea(record, area) {
  // A file belongs to the subsystem responsible for its own work. Imports are
  // evidence of connections between subsystems, not ownership of the file.
  const source = String(record.path ?? '').toLocaleLowerCase()
  if (area === 'canvas-interface') {
    return /src\/(?:nodes|edges)\/|edgerelationeditor|edittoolbar|wheelrouting/.test(source)
      ? 'canvas-elements'
      : 'canvas-workspace'
  }
  if (area === 'canvas-model') return 'canvas-state'
  if (area === 'notes-content') return /notespanel|openinnotes|canvas-notes/.test(source) ? 'notes-workspace' : 'content-editing'
  if (area === 'sharing-collaboration') {
    if (/invite|shared-canvas|sharelaunch|revocation/.test(source)) return 'sharing-entry'
    if (/participant|presence|avatar/.test(source)) return 'participants-presence'
    return 'sharing-policy'
  }
  if (area === 'identity-profile') return 'identity-account'
  if (area === 'digital-twin-engine') {
    if (/twinadaptercontract/.test(source)) return 'twin-core'
    if (/workflow(system)?twinadapter|workflow-system-twin-adapter|digitaltwinadapters|workflowsystemtwinbuild/.test(source)) return 'twin-workflow-adapter'
    if (/operationlifecycle|workflowoperation|edgeoperation/.test(source)) return 'twin-operations'
    if (/twinbuildcanvas|workflowcanvassystemmap|systemmaprepair/.test(source)) return 'twin-materialization'
    if (/reconcil|digitaltwinreview|digitaltwinproposal/.test(source)) return 'twin-reconciliation'
    if (/discovery|system-discovery/.test(source)) return 'twin-discovery'
    if (/systemruntime|system-runtime|observation|runtime-read|runtime-observations/.test(source)) return 'twin-runtime'
    return 'twin-core'
  }
  if (area === 'source-code-twin') {
    if (/localconnector|local-connector|local_connectors/.test(source)) return 'local-connector'
    if (/source-twin-webhook|workflowsourcetwincanvas|github/.test(source)) return 'git-delivery'
    if (/scripts\/(?:generate-source-twin|source-twin-(?:scanner|semantics))|shared\/sourcetwinsemantics/.test(source)) return 'source-analysis'
    if (/sourcetwinpanel|sourcetwinapi|api\/source-twin\.js|source-twin-history|shared\/sourcetwin\.js|sourcetwinstore|supabase-source-twin-history/.test(source)) return 'source-browser-history'
    return 'source-analysis'
  }
  if (area === 'ai-integration') return /api\/mcp|mcp\/server|mcptoken|mcp-schema/.test(source) ? 'mcp-transport' : 'mcp-tools'
  if (area === 'data-storage-sync') {
    if (/src\/storage\.js/.test(source)) return 'browser-persistence'
    if (/\.sql$/.test(record.path)) return 'database-schema'
    return 'cloud-persistence'
  }
  if (area === 'media-files') return /canvasimage|contentnode/.test(source) ? 'media-presentation' : 'media-storage'
  if (area === 'security-privacy') {
    if (/sanitize|html|url/.test(source)) return 'input-safety'
    if (/audit|privacy|profile-privacy/.test(source)) return 'access-privacy'
    return 'trust-controls'
  }
  if (area === 'deployment-operations') return /system-runtime|runtime|operation/.test(source) ? 'runtime-operations' : 'build-release'
  if (area === 'testing-quality') {
    if (/source-twin|local-connector/.test(source)) return 'source-tests'
    if (/twin-build|twin-adapter|operation-lifecycle/.test(source)) return 'engine-tests'
    return 'app-tests'
  }
  if (area === 'project-foundation') return /readme|docs\//.test(source) ? 'project-docs' : 'project-config'
  return 'project-config'
}

export function sourceTwinSubsystemForRecord(record, project = {}, area = '') {
  const resolvedArea = area || genericArea(record)
  return subsystemFromArea(record, resolvedArea)
}

function genericFileExplanation(record) {
  const label = baseName(record.path)
  const route = record.apiRoutes?.[0]
  const tables = record.dbTables?.slice(0, 3) ?? []
  if (route) {
    return ROLE(
      genericArea(record),
      `${route}로 들어온 브라우저 요청을 받아 로그인과 입력을 확인하고 필요한 서버 작업 결과를 돌려줍니다.`,
      '이 경로의 권한 검사와 오류 처리가 화면에서 해당 기능이 실제로 작동하는 방식을 결정합니다.',
    )
  }
  if (record.layer === 'database') {
    const target = tables.length ? `${tables.join(', ')} 자료` : '데이터베이스 자료'
    return ROLE(
      genericArea(record),
      `${target}의 저장 구조, 서버 함수 또는 사용자별 접근 규칙을 정의합니다.`,
      '화면 코드가 우회되더라도 데이터베이스가 허용할 읽기와 변경 범위를 결정합니다.',
    )
  }
  if (record.layer === 'test') {
    return ROLE('testing-quality', `${label} 관련 동작이 변경 뒤에도 예상대로 유지되는지 자동으로 확인합니다.`, '문제가 있는 코드가 배포되기 전에 실패 신호를 냅니다.')
  }
  if (record.layer === 'mcp') {
    return ROLE('ai-integration', `${label} 관련 AI 도구 요청을 권한 범위 안에서 실행하거나 검증합니다.`, '연결된 AI가 실제로 할 수 있는 작업과 제한에 영향을 줍니다.')
  }
  if (record.layer === 'shared') {
    return ROLE(genericArea(record), `${conceptLabel(identifierWords(label)) || label}에 대해 브라우저와 서버가 함께 지켜야 할 공통 판단 규칙을 제공합니다.`, '같은 자료를 서로 다른 화면과 서버가 다르게 해석하는 일을 줄입니다.')
  }
  if (record.layer === 'frontend') {
    const component = /^[A-Z]/.test(label)
    return ROLE(genericArea(record), component
      ? `${conceptLabel(identifierWords(label)) || label} 화면을 그리고 사용자의 클릭·입력 결과를 연결합니다.`
      : `${conceptLabel(identifierWords(label)) || label} 기능을 화면의 여러 부분에서 다시 쓸 수 있게 제공합니다.`,
    '사용자가 화면에서 해당 기능을 보고 조작하는 방식에 영향을 줍니다.')
  }
  if (record.layer === 'deployment') {
    return ROLE('deployment-operations', '개발 코드를 검사·빌드해 실제 웹 서비스로 실행할 설정과 명령을 정의합니다.', '잘못된 빌드가 배포되는 것을 막고 배포 환경의 실행 방식을 결정합니다.')
  }
  return ROLE('project-foundation', `${label}에 필요한 프로젝트 구조와 참고 정보를 제공합니다.`, '다른 기능이 같은 기준과 설정을 사용하게 합니다.')
}

export function sourceTwinProjectIdentity(files) {
  try {
    const packageJson = JSON.parse(files.get('package.json') ?? '{}')
    return {
      name: String(packageJson.name ?? '').trim(),
      label: String(packageJson.productName ?? packageJson.name ?? '소프트웨어').trim(),
    }
  } catch {
    return { name: '', label: '소프트웨어' }
  }
}

export function explainSourceFile(record, project = {}) {
  if (project.name === 'workflow-canvas' && WORKFLOW_CANVAS_FILE_ROLES[record.path]) {
    return WORKFLOW_CANVAS_FILE_ROLES[record.path]
  }
  if (/^scripts\/test-|(?:\.test|\.spec)\.[^.]+$/i.test(record.path)) {
    const subject = baseName(record.path).replace(/^test-/, '').replace(/-/g, ' ')
    return ROLE('testing-quality', `${subject} 기능과 보호 규칙이 변경 뒤에도 유지되는지 자동으로 확인합니다.`, '회귀나 보안 약화가 있는 빌드의 배포를 막습니다.')
  }
  return genericFileExplanation(record)
}

export function sourceTwinTechnicalSummary(record) {
  const facts = []
  if (record.functions.length) facts.push(`함수 ${record.functions.length}개`)
  if (record.imports.length) facts.push(`코드 연결 ${record.imports.length}개`)
  if (record.apiRoutes.length) facts.push(`API ${record.apiRoutes.length}개`)
  if (record.dbTables.length) facts.push(`DB 테이블 ${record.dbTables.length}개 참조`)
  if (record.dbFunctions.length) facts.push(`DB 함수 ${record.dbFunctions.length}개 참조`)
  if (record.securitySignals.length) facts.push(`보안 점검 신호 ${record.securitySignals.length}개`)
  return facts.join(' · ') || `${record.lineCount}줄의 ${record.language} 파일`
}

function functionActionSummary(action, subject) {
  if (['get', 'list', 'load', 'read', 'fetch'].includes(action)) return `${subject} 정보를 ${ACTIONS[action]}`
  if (['create', 'build', 'make', 'add'].includes(action)) return `${subject} 항목이나 구조를 ${ACTIONS[action]}`
  if (['update', 'set', 'delete', 'remove', 'revoke'].includes(action)) return `${subject} 대상을 ${ACTIONS[action]}`
  if (['resolve', 'validate', 'verify', 'compare', 'inspect', 'discover', 'filter', 'find', 'assert', 'can', 'is', 'has'].includes(action)) {
    return `${subject} 상태나 허용 여부를 ${ACTIONS[action]}`
  }
  if (action === 'normalize') return `${subject} 자료를 안전한 공통 형식으로 정리합니다.`
  if (action === 'sanitize') return `${subject}에서 위험한 내용을 제거합니다.`
  if (action === 'parse') return `${subject} 자료의 구조를 읽어냅니다.`
  if (action === 'serialize') return `${subject} 자료를 저장 가능한 형식으로 바꿉니다.`
  if (action === 'handle') return `${subject} 관련 요청을 받아 필요한 절차를 실행합니다.`
  if (action === 'send') return `${subject} 결과를 브라우저에 보냅니다.`
  return `${subject} 작업을 ${ACTIONS[action]}`
}

export function explainSourceFunction(fn, record, fileExplanation) {
  const words = identifierWords(fn.displayName)
  const first = words[0]
  const rest = words.slice(1)
  if (fn.displayName === 'handler') {
    return `이 서버 경로로 들어온 요청의 로그인과 입력을 확인하고 결과를 돌려줍니다. 이 요청은 다음 역할을 맡습니다: ${fileExplanation.summary}`
  }
  if (fn.displayName === 'send') return '서버 작업의 성공·오류 상태와 결과를 브라우저가 이해할 응답으로 보냅니다.'
  if (fn.displayName === 'admin') return '서버에서만 허용된 Supabase 관리자 연결을 준비합니다. 브라우저에는 이 권한을 넘기지 않습니다.'
  if (/^[A-Z]/.test(fn.displayName) && record.layer === 'frontend') {
    return `${conceptLabel(words) || fn.displayName} 화면을 그리고 사용자의 입력과 화면 상태를 연결합니다.`
  }
  if (Object.hasOwn(ACTIONS, first)) {
    const subject = conceptLabel(rest) || conceptLabel(words) || '이 기능'
    return functionActionSummary(first, subject)
  }
  const knownConcept = conceptLabel(words)
  if (knownConcept) {
    return `${knownConcept}에 필요한 한 단계의 판단이나 변환을 수행합니다.`
  }
  return `이 파일이 맡은 “${fileExplanation.summary}” 작업 안에서 필요한 내부 판단이나 변환을 수행합니다.`
}

export function areaForSourceResource(kind, name, parentArea = '') {
  const value = String(name ?? '').toLocaleLowerCase()
  if (kind === 'environment-variable') {
    if (/secret|token|credential|password|service_role|(?:^|_)key(?:_|$)/.test(value)) return 'security-privacy'
    if (/vercel|deploy|commit_sha|node_env/.test(value)) return 'deployment-operations'
  }
  if (/share|invite|participant|revocation/.test(value)) return 'sharing-collaboration'
  if (/profile|auth|session|user_pref/.test(value)) return 'identity-profile'
  if (/source_twin|local_connector|github|git/.test(value)) return 'source-code-twin'
  if (/runtime|observation|twin|system_operation/.test(value)) return 'digital-twin-engine'
  if (/image|attachment|media/.test(value)) return 'media-files'
  if (/audit|privacy|permission|policy|credential|token|secret/.test(value)) return 'security-privacy'
  if (/canvas|node|edge|stage|view|note/.test(value)) return kind === 'db-table' ? 'data-storage-sync' : 'canvas-model'
  return parentArea || (kind.startsWith('db-') ? 'data-storage-sync' : 'project-foundation')
}

export function subsystemForSourceResource(kind, name, area = '', parentSubsystem = '') {
  const value = String(name ?? '').toLocaleLowerCase()
  if (area === 'source-code-twin') {
    if (/local_connector/.test(value)) return 'local-connector'
    if (/github|git/.test(value)) return 'git-delivery'
    return 'source-browser-history'
  }
  if (area === 'sharing-collaboration') return 'sharing-policy'
  if (area === 'identity-profile') return 'identity-account'
  if (area === 'digital-twin-engine') {
    if (/system_operation/.test(value)) return 'twin-operations'
    if (/runtime|observation/.test(value)) return 'twin-runtime'
    return 'twin-core'
  }
  if (area === 'media-files') return 'media-storage'
  if (area === 'security-privacy') return /audit|privacy/.test(value) ? 'access-privacy' : 'trust-controls'
  if (area === 'data-storage-sync') return kind.startsWith('db-') || kind === 'rls-policy' ? 'database-schema' : 'cloud-persistence'
  if (area === 'canvas-model') return 'canvas-state'
  if (area === 'deployment-operations') return 'build-release'
  return parentSubsystem || subsystemFromArea({ path: value, imports: [] }, area)
}

export function explainDatabaseResource(kind, name) {
  const subject = conceptLabel(identifierWords(name)).replaceAll(' · ', ' ') || name
  if (kind === 'db-table') return `${subject} 자료를 데이터베이스에 지속적으로 보관하는 칸입니다.`
  if (kind === 'db-function') return `${subject} 작업을 데이터베이스 권한 안에서 한 번에 수행하는 서버 함수입니다.`
  return `${subject} 자료에 누가 접근할 수 있는지 데이터베이스에서 강제하는 규칙입니다.`
}

export function explainEnvironmentVariable(name) {
  const value = String(name ?? '')
  if (value === 'SUPABASE_SERVICE_ROLE_KEY') return '서버가 제한된 관리자 DB 작업을 할 때 사용하는 비밀 키의 이름입니다. 실제 값은 수집하지 않습니다.'
  if (value === 'WORKFLOW_CANVAS_OWNER_USER_ID') return '내부 시스템 지도와 운영 도구를 사용할 제품 소유자 계정을 지정합니다.'
  if (/TOKEN|SECRET|PASSWORD|CREDENTIAL|KEY/i.test(value)) return `${value} 비밀 설정의 이름 참조입니다. 실제 값은 소스 트윈에 포함하지 않습니다.`
  return `${value} 배포 환경 설정의 이름과 사용 위치입니다. 실제 값은 수집하지 않습니다.`
}
