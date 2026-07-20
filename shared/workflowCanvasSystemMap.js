import { createEdgeRelationData, edgeRelationInfo } from './relationOntology.js'
import { createSystemNodeData } from './systemOntology.js'
import { createEngineCapabilityMap } from './capabilityMapper.js'
import { MAINTAINER_AGENT_MANIFEST, WORKFLOW_ENGINE_REGISTRY } from './engineRegistry.js'
import { createSystemLayerViews } from './systemLayers.js'
import { WORKFLOW_SYSTEM_DISCOVERY } from './workflowSystemDiscoveryManifest.js'
import {
  WORKFLOW_SOURCE_TWIN_PART_IDS,
  WORKFLOW_SOURCE_TWIN_PART_REFS,
} from './workflowSourceTwinCanvas.js'

const GROUPS = Object.freeze([
  { id: 'map-group-experience', label: '사용자 인터페이스층', x: 0, y: 0, width: 1000, height: 560 },
  { id: 'map-group-runtime', label: 'Vercel·서버 경계층', x: 1080, y: 0, width: 940, height: 560 },
  { id: 'map-group-data', label: 'Supabase 데이터·보안층', x: 2100, y: 0, width: 1180, height: 1160 },
  { id: 'map-group-development', label: '개발·검증·배포층', x: 0, y: 650, width: 2020, height: 510 },
])

function runtimePart({ id, kind, label, ref, evidenceRef }) {
  const entityKey = `runtime-capability:${ref}`
  return Object.freeze({
    id,
    kind,
    label,
    ref,
    exposure: 'internal',
    sourceKind: 'code',
    evidenceRef,
    digitalTwinBinding: {
      schemaVersion: 1,
      sourceId: 'workflow-canvas:self-system',
      entityKey,
      observedFingerprint: WORKFLOW_SYSTEM_DISCOVERY.current.resources[entityKey]?.fingerprint ?? '',
      observedSnapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
    },
  })
}

const VERCEL_RUNTIME_PART = runtimePart({
  id: 'map-part-vercel-runtime',
  kind: 'output',
  label: '프로덕션 운영 상태',
  ref: 'workflow.vercel.deployment.runtime',
  evidenceRef: 'api/system-runtime.js, mcp/systemRuntime.js, vercel.json',
})

function sourceTwinViewPart({ id, kind = 'view', label, ref, evidenceRef, sourceKind = 'code' }) {
  return Object.freeze({
    id,
    kind,
    label,
    ref,
    exposure: 'internal',
    sourceKind,
    evidenceRef,
  })
}

const LOCAL_CODE_PART = sourceTwinViewPart({
  id: WORKFLOW_SOURCE_TWIN_PART_IDS.localCode,
  kind: 'code',
  label: '로컬 코드',
  ref: WORKFLOW_SOURCE_TWIN_PART_REFS.localCode,
  evidenceRef: 'scripts/source-twin-scanner.mjs, scripts/local-connector-agent.mjs',
  sourceKind: 'connector',
})

const GITHUB_CODE_PART = sourceTwinViewPart({
  id: WORKFLOW_SOURCE_TWIN_PART_IDS.githubCode,
  kind: 'code',
  label: 'GitHub 코드',
  ref: WORKFLOW_SOURCE_TWIN_PART_REFS.githubCode,
  evidenceRef: 'shared/sourceTwinManifest.js, api/source-twin.js',
})

const GITHUB_COMMIT_CHANGES_PART = sourceTwinViewPart({
  id: WORKFLOW_SOURCE_TWIN_PART_IDS.githubChanges,
  label: '커밋 변경',
  ref: WORKFLOW_SOURCE_TWIN_PART_REFS.githubChanges,
  evidenceRef: 'api/source-twin-webhook.js, shared/sourceTwinManifest.js',
})

const VERCEL_STATUS_HISTORY_PART = sourceTwinViewPart({
  id: WORKFLOW_SOURCE_TWIN_PART_IDS.vercelHistory,
  label: '상태 이력',
  ref: WORKFLOW_SOURCE_TWIN_PART_REFS.vercelHistory,
  evidenceRef: 'mcp/sourceTwinStore.js, supabase-source-twin-history.sql',
})

const SHARED_API_RUNTIME_PART = runtimePart({
  id: 'map-part-shared-api-health',
  kind: 'connection',
  label: '공유 API 상태',
  ref: 'workflow.api.shared-canvas.health',
  evidenceRef: 'api/shared-canvas.js, api/system-runtime.js, mcp/systemRuntime.js',
})

const MCP_RUNTIME_PART = runtimePart({
  id: 'map-part-mcp-route',
  kind: 'connection',
  label: 'MCP 배포 경로',
  ref: 'workflow.api.mcp.route',
  evidenceRef: 'api/mcp.js, mcp/server.js, api/system-runtime.js',
})

const AUTH_RUNTIME_PART = runtimePart({
  id: 'map-part-auth-session',
  kind: 'connection',
  label: 'Auth 세션 검증',
  ref: 'workflow.supabase.auth.session',
  evidenceRef: 'mcp/shareAccess.js, api/system-runtime.js, mcp/systemRuntime.js',
})

const CANVAS_SERVICE_OPERATIONS_PART = runtimePart({
  // Keep the original id so an already deployed map can replace this exact part safely.
  id: 'map-part-own-canvas-summary',
  kind: 'output',
  label: '캔버스 서비스 운영 현황',
  ref: 'workflow.supabase.canvas-service.operations',
  evidenceRef: 'mcp/systemRuntime.js, supabase-runtime-read.sql',
})

function groupNode(group) {
  return {
    id: group.id,
    type: 'group',
    position: { x: group.x, y: group.y },
    width: group.width,
    height: group.height,
    zIndex: -1,
    data: {
      label: group.label,
      ...(group.id === 'map-group-experience'
        ? {
            systemMapSnapshot: {
              schemaVersion: WORKFLOW_SYSTEM_DISCOVERY.schemaVersion,
              manifestId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
              source: 'server-template',
            },
          }
        : {}),
    },
  }
}

function systemNode(id, parentId, x, y, systemKind, label, fields = {}) {
  return {
    id,
    type: 'system',
    parentId,
    position: { x, y },
    width: fields.width ?? 240,
    height: fields.height ?? 140,
    data: {
      ...createSystemNodeData(systemKind),
      label,
      description: fields.description ?? '',
      purpose: fields.purpose ?? '',
      responsibility: fields.responsibility ?? '',
      constraints: fields.constraints ?? '',
      evidence: fields.evidence ?? '',
      environment: fields.environment ?? 'production',
      sourceKind: 'code',
      provider: fields.provider ?? '',
      externalRef: fields.externalRef ?? '',
      ...(fields.assetStatus ? { assetStatus: fields.assetStatus } : {}),
      ...(fields.dimmed === true ? { dimmed: true } : {}),
      ...(Array.isArray(fields.systemParts) && fields.systemParts.length
        ? { systemParts: fields.systemParts }
        : {}),
    },
  }
}

function relationEdge(id, source, target, relationType, evidenceRef, evidence, handles = {}) {
  const data = createEdgeRelationData(relationType, '', true, {
    relationSourceKind: 'code',
    relationConfidence: 'high',
    relationEvidence: evidence,
    relationEvidenceRef: evidenceRef,
  })
  const sourceHandle = handles.sourceHandle ?? 'right'
  const targetHandle = handles.targetHandle ?? 'left'
  if (sourceHandle.startsWith('p-') && targetHandle.startsWith('p-')) data.partsLink = true
  const relation = edgeRelationInfo(data)
  const style = { stroke: relation.color, strokeWidth: 3 }
  return {
    id,
    source,
    target,
    type: 'stub',
    sourceHandle,
    targetHandle,
    data,
    style,
    markerEnd: relation.directed ? { type: 'arrowclosed', color: relation.color } : undefined,
  }
}

function mapNodes(engineCapabilityMap) {
  return [
    ...GROUPS.map(groupNode),
    engineCapabilityMap.group,
    ...engineCapabilityMap.nodes,

    systemNode('map-user', 'map-group-experience', 45, 85, 'actor', '브라우저 사용자', {
      purpose: '캔버스를 보고 편집하며 공유와 AI 작업을 승인한다.',
      responsibility: '최종 의사결정과 권한 부여',
      constraints: '본인에게 허용된 캔버스와 초대 범위만 접근',
      evidence: '로그인·프로필·캔버스 상호작용 UI',
      provider: 'Workflow Canvas',
      externalRef: 'src/App.jsx',
    }),
    systemNode('map-web-app', 'map-group-experience', 355, 80, 'frontend', 'Workflow Canvas 웹 앱', {
      purpose: '노드·연결선·노트·공유를 한 화면에서 조작한다.',
      responsibility: '브라우저 상태, 편집 UI, 로컬·클라우드 동기화',
      constraints: '서버 권한 판정을 우회해 신뢰하지 않음',
      evidence: 'React/Vite 애플리케이션 진입점과 상태 관리',
      provider: 'React + Vite',
      externalRef: 'src/App.jsx',
    }),
    systemNode('map-canvas-engine', 'map-group-experience', 675, 65, 'frontend', 'React Flow 캔버스 엔진', {
      purpose: '노드·연결선의 배치, 선택, 이동, 확대·축소를 렌더링한다.',
      responsibility: '2D 지도 상호작용과 화면 좌표계',
      constraints: '저장·권한의 최종 판정자가 아님',
      evidence: 'ReactFlow nodeTypes·edgeTypes 구성',
      provider: '@xyflow/react',
      externalRef: 'src/App.jsx',
    }),
    systemNode('map-local-cache', 'map-group-experience', 355, 330, 'storage', '브라우저 로컬 데이터·캐시', {
      purpose: '오프라인 편집과 빠른 복원에 필요한 로컬 상태를 보관한다.',
      responsibility: '캔버스 스냅샷, 선택한 캔버스, UI 설정의 임시 지속성',
      constraints: '서버 원본이나 권한 증거로 사용하지 않음',
      evidence: 'localStorage 기반 저장 모듈',
      environment: 'local',
      provider: 'Web Storage',
      externalRef: 'src/storage.js',
    }),
    systemNode('map-pwa', 'map-group-experience', 675, 330, 'service', 'PWA 서비스 워커', {
      purpose: '설치 가능한 웹 앱과 정적 자원 캐시를 제공한다.',
      responsibility: '빌드 자원 precache와 앱 셸 로딩',
      constraints: '사용자 캔버스 권한을 판정하지 않음',
      evidence: 'Vite PWA generateSW 설정',
      provider: 'vite-plugin-pwa',
      externalRef: 'vite.config.js',
    }),

    systemNode('map-vercel', 'map-group-runtime', 45, 80, 'deployment', 'Vercel 프로덕션', {
      purpose: '웹 앱과 서버리스 API를 외부에 제공한다.',
      responsibility: '정적 배포, 라우팅, 서버리스 함수 실행',
      constraints: '서비스 역할 키는 서버 환경에서만 사용',
      evidence: 'Vercel 라우팅과 API 엔트리',
      provider: 'Vercel',
      externalRef: 'vercel.json',
      systemParts: [VERCEL_RUNTIME_PART, VERCEL_STATUS_HISTORY_PART],
    }),
    systemNode('map-shared-api', 'map-group-runtime', 350, 65, 'api', '공유 캔버스 API', {
      purpose: '공유 참여자의 읽기·저장을 서버에서 다시 검증한다.',
      responsibility: '공유 범위 redaction, 수정 가능 영역 검사, 동시 수정 충돌 방지',
      constraints: '클라이언트가 보낸 권한과 숨은 데이터를 신뢰하지 않음',
      evidence: '공유 API와 서버 권한 게이트웨이',
      provider: 'Vercel Function',
      externalRef: '/api/shared-canvas',
      systemParts: [SHARED_API_RUNTIME_PART],
    }),
    systemNode('map-mcp-api', 'map-group-runtime', 350, 315, 'mcp', 'Workflow Canvas MCP 서버', {
      purpose: 'AI가 캔버스를 구조적으로 읽고 안전한 도구로 수정하게 한다.',
      responsibility: '토큰 인증, 도구 스키마, 사용자·공유 범위별 작업 제한',
      constraints: '서비스 역할 사용 시 모든 쿼리를 사용자와 캔버스에 수동 한정',
      evidence: 'MCP 서버와 Supabase 저장 계층',
      provider: 'Vercel Function + MCP SDK',
      externalRef: '/api/mcp',
      systemParts: [MCP_RUNTIME_PART],
    }),
    systemNode('map-permission-gateway', 'map-group-runtime', 665, 190, 'policy', '서버 권한 게이트웨이', {
      purpose: '초대 범위 밖의 읽기·쓰기를 서버에서 차단한다.',
      responsibility: '접근 해석, 노드 범위 계산, 관계·본문 redaction, 저장 병합',
      constraints: '소유자·참여자·시야 제한 규칙을 한곳에서 일관되게 적용',
      evidence: '공유 접근 판정 순수 함수와 저장 게이트웨이',
      provider: 'Workflow Canvas',
      externalRef: 'mcp/shareAccess.js',
    }),
    systemNode('map-source-twin-api', 'map-group-runtime', 665, 390, 'api', 'Source Lens 서버 API', {
      purpose: '코드 파츠·흐름을 모듈 단위로 지연 제공하고 소유자 전용 AI 비교·편집 계획을 중계한다.',
      responsibility: '소유자 확인, compact 근거 조회, AI 메타데이터 전송, 서명된 로컬 편집 계획',
      constraints: '코드 본문·캔버스 본문·키 값은 외부 AI나 브라우저 응답에 포함하지 않음',
      evidence: 'Source Lens API와 서버 전용 코드 파츠·흐름 catalog',
      provider: 'Vercel Function',
      externalRef: '/api/source-twin',
    }),

    systemNode('map-supabase-auth', 'map-group-data', 45, 75, 'auth', 'Supabase Auth', {
      purpose: '사용자 세션과 신원을 확인한다.',
      responsibility: '로그인 세션, auth.uid와 사용자 JWT',
      constraints: '인증은 권한 부여와 다르며 RLS·서버 범위 검사가 추가로 필요',
      evidence: 'Supabase 클라이언트 인증 사용',
      provider: 'Supabase',
      externalRef: 'auth.users',
      systemParts: [AUTH_RUNTIME_PART],
    }),
    systemNode('map-postgres', 'map-group-data', 350, 75, 'database', 'Supabase Postgres', {
      purpose: '캔버스와 사용자·공유 메타데이터의 단일 저장소가 된다.',
      responsibility: '관계형 행과 JSON 캔버스 문서의 영구 저장',
      constraints: 'RLS 또는 서버의 사용자 범위 제한 없이 노출하지 않음',
      evidence: 'Supabase SQL 스키마',
      provider: 'Supabase',
      externalRef: 'PostgreSQL',
    }),
    systemNode('map-rls', 'map-group-data', 665, 75, 'policy', 'RLS·DB 함수 정책', {
      purpose: 'DB 접근 시 사용자와 공유 관계를 강제한다.',
      responsibility: '행 단위 읽기·쓰기, 초대 수락·나가기·회수 함수',
      constraints: '서비스 역할 경로에는 RLS가 적용되지 않으므로 서버 검증이 별도로 필요',
      evidence: '테이블별 정책과 SECURITY DEFINER 함수',
      provider: 'Supabase RLS',
      externalRef: 'supabase-*.sql',
    }),
    systemNode('map-canvases-table', 'map-group-data', 45, 300, 'table', 'canvases', {
      purpose: '캔버스의 노드·연결선·노트·뷰를 한 행에 보관한다.',
      responsibility: '사용자별 캔버스 JSON과 수정 시각',
      constraints: 'user_id + canvas_id 고유, 공유 저장은 범위 검증 필수',
      evidence: '기본 캔버스 스키마',
      provider: 'Supabase',
      externalRef: 'public.canvases',
      systemParts: [CANVAS_SERVICE_OPERATIONS_PART],
    }),
    systemNode('map-sharing-tables', 'map-group-data', 350, 300, 'table', 'canvas_shares·share_members', {
      purpose: '초대 수단과 실제 참여 상태를 분리해 기록한다.',
      responsibility: '링크·이메일 초대, 참여자, 범위, 편집·시야 제한',
      constraints: '초대 삭제가 이미 수락한 참여자를 자동 추방하지 않음',
      evidence: '공유 스키마와 RPC 함수',
      provider: 'Supabase',
      externalRef: 'public.canvas_shares, public.share_members',
    }),
    systemNode('map-profiles-table', 'map-group-data', 665, 300, 'table', 'profiles', {
      purpose: '참여자에게 보이는 프로필 정보를 보관한다.',
      responsibility: '닉네임, 아바타, 색상, 마지막 접속 정보',
      constraints: '같은 캔버스 참여 관계가 있는 사용자만 조회',
      evidence: '프로필 privacy 함수와 RLS',
      provider: 'Supabase',
      externalRef: 'public.profiles',
    }),
    systemNode('map-prefs-table', 'map-group-data', 45, 515, 'table', 'user_prefs', {
      purpose: '사용자별 탭 순서와 화면 설정을 보관한다.',
      responsibility: '활성 캔버스, 캔버스 순서, 테마·표시 설정',
      constraints: '본인 행만 접근',
      evidence: '기본 스키마와 클라우드 저장 모듈',
      provider: 'Supabase',
      externalRef: 'public.user_prefs',
    }),
    systemNode('map-mcp-tokens-table', 'map-group-data', 350, 515, 'table', 'mcp_tokens', {
      purpose: '개인 MCP 연결을 사용자 계정에 매핑한다.',
      responsibility: '해시된 토큰, 마지막 사용 시각, 만료·폐기',
      constraints: '원문 토큰을 DB에 저장하거나 캔버스에 표시하지 않음',
      evidence: 'MCP 토큰 스키마와 검증 함수',
      provider: 'Supabase',
      externalRef: 'public.mcp_tokens',
    }),
    systemNode('map-realtime', 'map-group-data', 45, 760, 'queue', 'Supabase Realtime', {
      purpose: '다른 탭·참여자·MCP 변경을 브라우저에 전달한다.',
      responsibility: 'canvases 행의 postgres_changes 구독',
      constraints: '수신 스냅샷도 공유 권한과 충돌 규칙을 따라 처리',
      evidence: 'Realtime publication과 앱 구독 코드',
      provider: 'Supabase',
      externalRef: 'supabase_realtime:public.canvases',
    }),
    systemNode('map-image-storage', 'map-group-data', 350, 760, 'storage', 'canvas-images 저장소', {
      purpose: '캔버스 이미지 파일을 JSON 본문과 분리해 보관한다.',
      responsibility: '이미지 업로드·조회·삭제',
      constraints: '비공개 버킷과 캔버스 참여자 정책, 파일 크기·MIME 제한',
      evidence: 'Storage bucket과 객체 정책',
      provider: 'Supabase Storage',
      externalRef: 'canvas-images',
    }),

    systemNode('map-owner', 'map-group-development', 45, 100, 'actor', '제품 소유자·개발자', {
      purpose: '제품 방향을 결정하고 변경을 검토·승인한다.',
      responsibility: '요구사항, 위험 승인, 배포 판단',
      constraints: 'AI가 만든 변경을 검토 가능한 형태로 유지',
      evidence: '로컬 개발·배포 작업 흐름',
      environment: 'local',
      provider: 'Workflow Canvas',
      externalRef: 'CLAUDE.md',
    }),
    systemNode('map-claude-code', 'map-group-development', 350, 100, 'external', 'Claude Code', {
      purpose: '승인된 변경을 실제 저장소에 적용하고 배포한다.',
      responsibility: '패치 검토, 코드 수정, 테스트, 커밋·푸시·배포',
      constraints: '전달 문서의 기준 커밋과 보안 의도를 확인',
      evidence: '현재 로컬 협업 절차',
      environment: 'local',
      provider: 'Anthropic',
      externalRef: 'local coding agent',
    }),
    systemNode('map-local-repo', 'map-group-development', 655, 100, 'external', '로컬 코드 저장소', {
      purpose: '제품 코드와 SQL·테스트·배포 설정의 변경 기준이 된다.',
      responsibility: 'Git 작업 트리와 커밋 전 소스',
      constraints: '허용한 프로젝트만 읽고, 미커밋 변경·분기된 이력·강제 push를 자동 처리하지 않음',
      evidence: '별도 범위 로컬 커넥터의 AST manifest와 Git 상태',
      environment: 'local',
      provider: 'Git',
      externalRef: 'workflow-canvas local checkout',
      systemParts: [LOCAL_CODE_PART],
    }),
    systemNode('map-tests', 'map-group-development', 960, 100, 'service', '테스트·보안 검사', {
      purpose: '코드 변경이 기존 동작과 권한 경계를 깨지 않았는지 확인한다.',
      responsibility: 'MCP 로직, 공유 보안, SQL 정책, 프로덕션 빌드 검사',
      constraints: '자동 테스트 통과가 브라우저 수동 검증을 대체하지 않음',
      evidence: 'npm test와 Vite build',
      environment: 'local',
      provider: 'Node.js + Vite',
      externalRef: 'scripts/test-mcp-logic.mjs, scripts/test-sql-security.mjs',
    }),
    systemNode('map-github', 'map-group-development', 1270, 100, 'external', 'GitHub 저장소', {
      purpose: '검토된 커밋을 원격으로 보관하고 배포 소스가 된다.',
      responsibility: '원격 main 이력과 Vercel 연동',
      constraints: '검증되지 않은 로컬 변경을 자동 푸시하지 않음',
      evidence: 'Git remote와 현재 배포 절차',
      environment: 'production',
      provider: 'GitHub',
      externalRef: 'origin/main',
      systemParts: [GITHUB_CODE_PART, GITHUB_COMMIT_CHANGES_PART],
    }),
    systemNode('map-ai-explanation-provider', 'map-group-development', 1575, 100, 'external', '외부 AI 설명 제공자 · 선택 전', {
      purpose: '결정적 코드 파츠 설명과 비교할 문장 품질 상한을 시험한다.',
      responsibility: '허용된 AST 메타데이터만 받아 쉬운 설명 문장을 반환',
      constraints: '기본 비활성·제공자/모델/비용 승인 전 호출 없음·관계/권한/Reality 생성 금지',
      evidence: 'provider-neutral AI 설명 어댑터와 전송 계약',
      provider: '미선택',
      externalRef: 'shared/sourceAiExplanation.js',
      assetStatus: 'candidate',
      dimmed: true,
    }),
  ]
}

function mapEdges(engineCapabilityMap) {
  return [
    relationEdge('map-edge-user-app', 'map-user', 'map-web-app', 'uses', 'src/App.jsx', '사용자는 브라우저 UI를 통해 캔버스를 조작한다.'),
    relationEdge('map-edge-canvas-part', 'map-canvas-engine', 'map-web-app', 'part_of', 'src/App.jsx', 'ReactFlow가 웹 앱의 중심 캔버스 화면으로 등록되어 있다.', { sourceHandle: 'left', targetHandle: 'right' }),
    relationEdge('map-edge-app-cache', 'map-web-app', 'map-local-cache', 'writes', 'src/storage.js', '웹 앱이 로컬 캔버스 스냅샷과 설정을 저장한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-pwa-part', 'map-pwa', 'map-web-app', 'part_of', 'vite.config.js', 'PWA 서비스 워커가 웹 앱 빌드에 포함된다.', { sourceHandle: 'left', targetHandle: 'bottom' }),

    relationEdge('map-edge-vercel-app', 'map-vercel', 'map-web-app', 'contains', 'vercel.json, vite.config.js', 'Vercel 배포가 빌드된 웹 앱을 제공한다.', { sourceHandle: 'left', targetHandle: 'right' }),
    relationEdge('map-edge-vercel-shared', 'map-vercel', 'map-shared-api', 'contains', 'api/shared-canvas.js', '공유 캔버스 API가 Vercel 함수로 배포된다.'),
    relationEdge('map-edge-vercel-mcp', 'map-vercel', 'map-mcp-api', 'contains', 'api/mcp.js', 'MCP 엔드포인트가 Vercel 함수로 배포된다.', { sourceHandle: 'bottom', targetHandle: 'left' }),
    relationEdge('map-edge-vercel-source-twin', 'map-vercel', 'map-source-twin-api', 'contains', 'api/source-twin.js', 'Source Lens API가 Vercel 함수로 배포된다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-app-shared', 'map-web-app', 'map-shared-api', 'calls', 'src/lib/sharedCanvasApi.js', '공유 캔버스 읽기·저장은 서버 API를 호출한다.'),
    relationEdge('map-edge-app-source-twin', 'map-web-app', 'map-source-twin-api', 'calls', 'src/lib/sourceTwinApi.js, api/source-twin.js', '소유자 코드 브라우저가 인증된 Source Lens 서버 API를 호출한다.'),
    relationEdge('map-edge-shared-gateway', 'map-shared-api', 'map-permission-gateway', 'requires', 'api/shared-canvas.js, mcp/shareAccess.js', '공유 API가 서버 권한 판정을 거쳐야 한다.'),
    relationEdge('map-edge-mcp-gateway', 'map-mcp-api', 'map-permission-gateway', 'requires', 'mcp/store.js, mcp/shareAccess.js', 'MCP 공유 작업도 같은 범위 판정을 사용한다.'),

    relationEdge('map-edge-auth-user', 'map-supabase-auth', 'map-user', 'authenticates', 'src/lib/supabase.js, src/App.jsx', 'Supabase Auth가 로그인 사용자의 세션을 확인한다.', { sourceHandle: 'left', targetHandle: 'right' }),
    relationEdge('map-edge-app-auth', 'map-web-app', 'map-supabase-auth', 'calls', 'src/lib/supabase.js', '브라우저가 Supabase 인증 클라이언트를 호출한다.'),
    relationEdge('map-edge-db-canvases', 'map-postgres', 'map-canvases-table', 'contains', 'supabase-schema.sql', 'Postgres가 canvases 테이블을 포함한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-db-sharing', 'map-postgres', 'map-sharing-tables', 'contains', 'supabase-shares.sql', 'Postgres가 공유 초대·참여 테이블을 포함한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-db-profiles', 'map-postgres', 'map-profiles-table', 'contains', 'supabase-profiles.sql', 'Postgres가 profiles 테이블을 포함한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-db-prefs', 'map-postgres', 'map-prefs-table', 'contains', 'supabase-schema.sql', 'Postgres가 user_prefs 테이블을 포함한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-db-tokens', 'map-postgres', 'map-mcp-tokens-table', 'contains', 'supabase-mcp-schema.sql', 'Postgres가 해시된 MCP 토큰 테이블을 포함한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-rls-canvases', 'map-rls', 'map-canvases-table', 'authorizes', 'supabase-schema.sql, supabase-shares.sql', 'RLS와 공유 정책이 canvases 행 접근을 판정한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-rls-sharing', 'map-rls', 'map-sharing-tables', 'authorizes', 'supabase-shares.sql', '공유 테이블 정책이 소유자와 참여자의 범위를 제한한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-rls-profiles', 'map-rls', 'map-profiles-table', 'authorizes', 'supabase-profile-privacy.sql', '프로필 정책이 같은 캔버스 참여 관계를 확인한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-rls-prefs', 'map-rls', 'map-prefs-table', 'authorizes', 'supabase-schema.sql', '사용자는 본인의 user_prefs 행만 관리한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-rls-tokens', 'map-rls', 'map-mcp-tokens-table', 'authorizes', 'supabase-mcp-schema.sql', '사용자는 본인의 MCP 토큰 메타데이터만 관리한다.', { sourceHandle: 'bottom', targetHandle: 'top' }),
    relationEdge('map-edge-app-canvases-read', 'map-web-app', 'map-canvases-table', 'reads', 'src/lib/cloudStorage.js', '본인 캔버스는 Supabase 클라이언트로 읽는다.'),
    relationEdge('map-edge-app-canvases-write', 'map-web-app', 'map-canvases-table', 'writes', 'src/lib/cloudStorage.js', '본인 캔버스 변경을 충돌 검사와 함께 저장한다.', { sourceHandle: 'bottom', targetHandle: 'left' }),
    relationEdge('map-edge-gateway-db', 'map-permission-gateway', 'map-postgres', 'authorizes', 'mcp/shareAccess.js', '서비스 역할 경로의 사용자·공유 범위를 서버 코드가 판정한다.'),
    relationEdge('map-edge-mcp-tokens', 'map-mcp-api', 'map-mcp-tokens-table', 'reads', 'mcp/store.js', 'MCP 요청 토큰의 해시를 조회해 사용자를 식별한다.'),
    relationEdge('map-edge-mcp-canvases', 'map-mcp-api', 'map-canvases-table', 'reads', 'mcp/store.js', 'MCP 도구가 허용된 캔버스 데이터를 조회한다.'),
    relationEdge('map-edge-mcp-canvases-write', 'map-mcp-api', 'map-canvases-table', 'writes', 'mcp/store.js', 'MCP 수정 도구가 사용자·영역 검사 후 캔버스를 저장한다.', { sourceHandle: 'bottom', targetHandle: 'left' }),
    relationEdge('map-edge-realtime-canvases', 'map-realtime', 'map-canvases-table', 'reads', 'supabase-realtime.sql', 'Realtime publication이 canvases 변경을 관측한다.', { sourceHandle: 'top', targetHandle: 'bottom' }),
    relationEdge('map-edge-app-realtime', 'map-web-app', 'map-realtime', 'syncs_with', 'src/App.jsx, supabase-realtime.sql', '브라우저가 캔버스 변경 이벤트를 구독해 병합한다.'),
    relationEdge('map-edge-app-storage', 'map-web-app', 'map-image-storage', 'writes', 'src/lib/imageStorage.js', '브라우저가 캔버스 이미지를 비공개 버킷에 업로드한다.'),
    relationEdge('map-edge-storage-canvases', 'map-image-storage', 'map-canvases-table', 'depends_on', 'supabase-canvas-images.sql', '이미지 경로와 정책이 소유자·캔버스 식별자를 사용한다.', { sourceHandle: 'top', targetHandle: 'bottom' }),

    relationEdge('map-edge-owner-claude', 'map-owner', 'map-claude-code', 'uses', 'CLAUDE.md', '제품 소유자가 승인한 구현 작업에 Claude Code를 사용한다.'),
    relationEdge('map-edge-claude-repo', 'map-claude-code', 'map-local-repo', 'writes', 'CLAUDE.md', 'Claude Code가 전달된 변경을 로컬 저장소에 적용한다.'),
    relationEdge('map-edge-owner-review', 'map-owner', 'map-local-repo', 'reviews', 'CLAUDE.md', '제품 소유자가 동작과 의도를 확인하고 배포를 승인한다.', { sourceHandle: 'bottom', targetHandle: 'left' }),
    relationEdge('map-edge-tests-repo', 'map-tests', 'map-local-repo', 'reads', 'scripts/test-mcp-logic.mjs, scripts/test-sql-security.mjs', '테스트와 빌드가 로컬 소스의 동작·보안 규칙을 검사한다.', { sourceHandle: 'left', targetHandle: 'right' }),
    relationEdge('map-edge-repo-github', 'map-local-repo', 'map-github', 'syncs_with', 'Git remote origin/main', '로컬 코드와 GitHub 코드 포트가 연결되며 계획·승인 뒤 일반 push 또는 fast-forward pull만 실행한다.', {
      sourceHandle: `p-${WORKFLOW_SOURCE_TWIN_PART_IDS.localCode}-r`,
      targetHandle: `p-${WORKFLOW_SOURCE_TWIN_PART_IDS.githubCode}-l`,
    }),
    relationEdge('map-edge-github-vercel', 'map-github', 'map-vercel', 'triggers', 'vercel.json', '원격 저장소의 배포 대상 변경이 Vercel 배포 흐름을 촉발한다.', { sourceHandle: 'top', targetHandle: 'bottom' }),
    relationEdge('map-edge-source-twin-ai', 'map-source-twin-api', 'map-ai-explanation-provider', 'calls', 'api/source-twin.js, shared/sourceAiExplanation.js', '명시적으로 활성화된 경우에만 AST 종류·심볼·상대 경로·줄 범위·결정적 요약을 선택한 외부 AI 제공자에 전송한다.'),
    ...engineCapabilityMap.edges,
  ]
}

export function createWorkflowCanvasSystemMap() {
  const engineCapabilityMap = createEngineCapabilityMap(WORKFLOW_ENGINE_REGISTRY, MAINTAINER_AGENT_MANIFEST)
  return {
    name: 'Workflow Canvas 시스템 지도',
    nodes: mapNodes(engineCapabilityMap),
    edges: mapEdges(engineCapabilityMap),
    notes: [],
    views: createSystemLayerViews().concat(GROUPS.map((group) => ({
      id: `view-${group.id}`,
      name: group.label,
      bounds: { x: group.x, y: group.y, width: group.width, height: group.height },
    })).concat({
      id: `view-${engineCapabilityMap.group.id}`,
      name: engineCapabilityMap.group.data.label,
      bounds: {
        x: engineCapabilityMap.group.position.x,
        y: engineCapabilityMap.group.position.y,
        width: engineCapabilityMap.group.width,
        height: engineCapabilityMap.group.height,
      },
    })),
    stageTypes: null,
  }
}
