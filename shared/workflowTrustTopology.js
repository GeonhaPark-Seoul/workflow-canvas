import { normalizeTrustGateway, normalizeTrustZone } from './trustTopology.js'
import { WORKFLOW_SOURCE_METADATA_CLASS_ID } from './workflowOperationDefinitions.js'

export const WORKFLOW_TRUST_TOPOLOGY_EVIDENCE_ID = 'evidence:workflow-trust-topology'

export const WORKFLOW_PUBLIC_APP_ASSETS_CLASS_ID = 'data:workflow-public-app-assets'
export const WORKFLOW_CANVAS_CONTENT_CLASS_ID = 'data:workflow-canvas-content'
export const WORKFLOW_ACCESS_METADATA_CLASS_ID = 'data:workflow-access-metadata'
export const WORKFLOW_IMAGE_CONTENT_CLASS_ID = 'data:workflow-image-content'
export const WORKFLOW_SOURCE_CODE_CLASS_ID = 'data:workflow-source-code'
export const WORKFLOW_SOURCE_AI_EXPLANATION_INPUT_CLASS_ID = 'data:workflow-source-ai-explanation-input'

const ZONE_IDS = Object.freeze({
  unknown: 'zone:workflow-logical-unknown',
  local: 'zone:workflow-local-device',
  vercel: 'zone:workflow-vercel-public-cloud',
  supabaseService: 'zone:workflow-supabase-service',
  supabaseData: 'zone:workflow-supabase-private-data',
  github: 'zone:workflow-github-saas',
  aiProvider: 'zone:workflow-ai-provider-saas',
})

function evidenced(record) {
  return Object.freeze({
    ...record,
    evidenceIds: [WORKFLOW_TRUST_TOPOLOGY_EVIDENCE_ID],
  })
}

export const WORKFLOW_TRUST_ZONES = Object.freeze([
  evidenced({
    id: ZONE_IDS.unknown,
    kind: 'unknown',
    label: '논리 구성·실행 위치 미확인',
    controlOwner: 'Workflow Canvas 제품 설계',
    evidenceRef: 'shared/engineRegistry.js, shared/workflowCanvasSystemMap.js',
  }),
  evidenced({
    id: ZONE_IDS.local,
    kind: 'local-device',
    label: '사용자 로컬 기기',
    controlOwner: '기기 사용자',
    evidenceRef: 'src/App.jsx, src/storage.js, scripts/local-connector-agent.mjs',
  }),
  evidenced({
    id: ZONE_IDS.vercel,
    kind: 'public-cloud',
    label: 'Vercel 공개 클라우드',
    controlOwner: 'Workflow Canvas 운영자·Vercel',
    evidenceRef: 'vercel.json, api/shared-canvas.js, api/mcp.js',
  }),
  evidenced({
    id: ZONE_IDS.supabaseService,
    kind: 'external-saas',
    label: 'Supabase 관리 서비스',
    controlOwner: 'Workflow Canvas 운영자·Supabase',
    evidenceRef: 'src/lib/supabase.js, supabase-realtime.sql',
  }),
  evidenced({
    id: ZONE_IDS.supabaseData,
    kind: 'private-cloud',
    label: 'Supabase 프로젝트 데이터 경계',
    controlOwner: 'Workflow Canvas 운영자·Supabase',
    evidenceRef: 'supabase-schema.sql, supabase-shares.sql, supabase-storage.sql',
  }),
  evidenced({
    id: ZONE_IDS.github,
    kind: 'external-saas',
    label: 'GitHub 외부 SaaS',
    controlOwner: '저장소 소유자·GitHub',
    evidenceRef: 'package.json, scripts/local-connector-agent.mjs, vercel.json',
  }),
  evidenced({
    id: ZONE_IDS.aiProvider,
    kind: 'external-saas',
    label: '외부 AI 설명 제공자 · 선택 전',
    controlOwner: '선택된 AI 제공자·Workflow Canvas 운영자',
    evidenceRef: 'shared/sourceAiExplanation.js, api/source-twin.js',
  }),
])

const GATEWAY_IDS = Object.freeze({
  vercelBrowserDelivery: 'gateway:workflow-vercel-browser-delivery',
  browserSharedApi: 'gateway:workflow-browser-shared-api',
  authToBrowser: 'gateway:workflow-supabase-auth-to-browser',
  browserAuth: 'gateway:workflow-browser-supabase-auth',
  browserData: 'gateway:workflow-browser-supabase-data',
  serverData: 'gateway:workflow-vercel-supabase-data',
  browserRealtime: 'gateway:workflow-browser-supabase-realtime',
  realtimeData: 'gateway:workflow-supabase-realtime-data',
  browserStorage: 'gateway:workflow-browser-supabase-storage',
  localGithub: 'gateway:workflow-local-connector-github',
  githubVercel: 'gateway:workflow-github-vercel-webhook',
  browserSourceTwin: 'gateway:workflow-browser-source-twin-api',
  serverAiExplanation: 'gateway:workflow-server-ai-explanation',
})

export const WORKFLOW_TRUST_GATEWAYS = Object.freeze([
  evidenced({
    id: GATEWAY_IDS.vercelBrowserDelivery,
    kind: 'reverse-proxy',
    sourceZoneId: ZONE_IDS.vercel,
    targetZoneId: ZONE_IDS.local,
    direction: 'source-to-target',
    exposure: 'public',
    protocol: 'HTTPS',
    route: 'Vercel 배포 URL에서 브라우저로 정적 앱 전달',
    dataClasses: [WORKFLOW_PUBLIC_APP_ASSETS_CLASS_ID],
    authentication: '공개 앱 자원에는 사용자 인증 없음',
    authorization: '배포 라우팅과 공개 범위 설정',
    encryption: '전송 구간 TLS',
    initiator: '브라우저 사용자',
    evidenceRef: 'vercel.json, vite.config.js',
  }),
  evidenced({
    id: GATEWAY_IDS.browserSharedApi,
    kind: 'browser-api',
    sourceZoneId: ZONE_IDS.local,
    targetZoneId: ZONE_IDS.vercel,
    direction: 'source-to-target',
    exposure: 'public',
    protocol: 'HTTPS JSON',
    route: '/api/shared-canvas',
    dataClasses: [WORKFLOW_CANVAS_CONTENT_CLASS_ID, WORKFLOW_ACCESS_METADATA_CLASS_ID],
    authentication: 'Supabase 사용자 JWT 참조',
    authorization: '서버 공유 범위·리비전 재검사',
    encryption: '전송 구간 TLS',
    initiator: 'Workflow Canvas 웹 앱',
    evidenceRef: 'api/shared-canvas.js, mcp/shareAccess.js',
  }),
  evidenced({
    id: GATEWAY_IDS.authToBrowser,
    kind: 'browser-api',
    sourceZoneId: ZONE_IDS.supabaseService,
    targetZoneId: ZONE_IDS.local,
    direction: 'source-to-target',
    exposure: 'public',
    protocol: 'HTTPS',
    route: 'Supabase Auth 세션 응답',
    dataClasses: [WORKFLOW_ACCESS_METADATA_CLASS_ID],
    authentication: 'Supabase Auth 세션 교환',
    authorization: '인증된 사용자 본인 세션',
    encryption: '전송 구간 TLS',
    initiator: 'Supabase Auth',
    evidenceRef: 'src/lib/supabase.js, mcp/shareAccess.js',
  }),
  evidenced({
    id: GATEWAY_IDS.browserAuth,
    kind: 'browser-api',
    sourceZoneId: ZONE_IDS.local,
    targetZoneId: ZONE_IDS.supabaseService,
    direction: 'source-to-target',
    exposure: 'public',
    protocol: 'HTTPS',
    route: '브라우저에서 Supabase Auth 호출',
    dataClasses: [WORKFLOW_ACCESS_METADATA_CLASS_ID],
    authentication: 'Supabase 로그인 입력과 세션 참조',
    authorization: 'Supabase Auth 정책',
    encryption: '전송 구간 TLS',
    initiator: 'Workflow Canvas 웹 앱',
    evidenceRef: 'src/lib/supabase.js, src/components/AuthPanel.jsx',
  }),
  evidenced({
    id: GATEWAY_IDS.browserData,
    kind: 'database-gateway',
    sourceZoneId: ZONE_IDS.local,
    targetZoneId: ZONE_IDS.supabaseData,
    direction: 'source-to-target',
    exposure: 'public',
    protocol: 'HTTPS PostgREST',
    route: 'Supabase 공개 클라이언트 데이터 API',
    dataClasses: [WORKFLOW_CANVAS_CONTENT_CLASS_ID, WORKFLOW_ACCESS_METADATA_CLASS_ID],
    authentication: 'Supabase 사용자 JWT 참조',
    authorization: 'RLS와 DB 함수 정책',
    encryption: '전송 구간 TLS',
    initiator: 'Workflow Canvas 웹 앱',
    evidenceRef: 'src/cloudStorage.js, supabase-schema.sql, supabase-shares.sql',
  }),
  evidenced({
    id: GATEWAY_IDS.serverData,
    kind: 'database-gateway',
    sourceZoneId: ZONE_IDS.vercel,
    targetZoneId: ZONE_IDS.supabaseData,
    direction: 'source-to-target',
    exposure: 'restricted',
    protocol: 'HTTPS PostgREST',
    route: 'Vercel 서버 함수에서 Supabase 프로젝트 데이터 API 호출',
    dataClasses: [WORKFLOW_CANVAS_CONTENT_CLASS_ID, WORKFLOW_ACCESS_METADATA_CLASS_ID],
    authentication: '서버 환경 자격증명 참조',
    authorization: '서버 사용자·캔버스 범위 수동 제한',
    encryption: '전송 구간 TLS',
    initiator: 'Vercel 서버 함수',
    evidenceRef: 'mcp/supabaseAdmin.js, mcp/shareAccess.js, mcp/store.js',
  }),
  evidenced({
    id: GATEWAY_IDS.browserRealtime,
    kind: 'browser-api',
    sourceZoneId: ZONE_IDS.local,
    targetZoneId: ZONE_IDS.supabaseService,
    direction: 'bidirectional',
    exposure: 'public',
    protocol: 'WSS',
    route: 'Supabase Realtime 구독 채널',
    dataClasses: [WORKFLOW_CANVAS_CONTENT_CLASS_ID, WORKFLOW_ACCESS_METADATA_CLASS_ID],
    authentication: 'Supabase 사용자 JWT 참조',
    authorization: 'Realtime 채널과 DB 접근 정책',
    encryption: '전송 구간 TLS',
    initiator: 'Workflow Canvas 웹 앱',
    evidenceRef: 'src/App.jsx, supabase-realtime.sql',
  }),
  evidenced({
    id: GATEWAY_IDS.realtimeData,
    kind: 'database-gateway',
    sourceZoneId: ZONE_IDS.supabaseService,
    targetZoneId: ZONE_IDS.supabaseData,
    direction: 'source-to-target',
    exposure: 'restricted',
    protocol: 'Postgres changes',
    route: 'Supabase Realtime publication에서 canvases 변경 구독',
    dataClasses: [WORKFLOW_CANVAS_CONTENT_CLASS_ID, WORKFLOW_ACCESS_METADATA_CLASS_ID],
    authentication: 'Supabase 내부 서비스 신원',
    authorization: 'Realtime publication과 구독 정책',
    encryption: 'Supabase 관리 경계',
    initiator: 'Supabase Realtime',
    evidenceRef: 'supabase-realtime.sql, src/App.jsx',
  }),
  evidenced({
    id: GATEWAY_IDS.browserStorage,
    kind: 'browser-api',
    sourceZoneId: ZONE_IDS.local,
    targetZoneId: ZONE_IDS.supabaseData,
    direction: 'source-to-target',
    exposure: 'public',
    protocol: 'HTTPS Storage API',
    route: 'canvas-images 비공개 버킷',
    dataClasses: [WORKFLOW_IMAGE_CONTENT_CLASS_ID, WORKFLOW_ACCESS_METADATA_CLASS_ID],
    authentication: 'Supabase 사용자 JWT 참조',
    authorization: 'Storage 객체 정책과 캔버스 참여 관계',
    encryption: '전송 구간 TLS',
    initiator: 'Workflow Canvas 웹 앱',
    evidenceRef: 'src/imageStorage.js, supabase-storage.sql',
  }),
  evidenced({
    id: GATEWAY_IDS.localGithub,
    kind: 'local-connector',
    sourceZoneId: ZONE_IDS.local,
    targetZoneId: ZONE_IDS.github,
    direction: 'bidirectional',
    exposure: 'restricted',
    protocol: 'Git HTTPS 또는 SSH',
    route: '허용된 로컬 저장소의 고정 GitHub origin',
    dataClasses: [WORKFLOW_SOURCE_CODE_CLASS_ID, WORKFLOW_SOURCE_METADATA_CLASS_ID],
    authentication: 'Git 자격증명 도우미 또는 SSH 키 참조',
    authorization: '저장소 권한과 로컬 터미널 재승인',
    encryption: 'Git HTTPS 또는 SSH 암호화',
    initiator: '로컬 커넥터',
    evidenceRef: 'scripts/local-connector-agent.mjs, shared/localConnector.js',
  }),
  evidenced({
    id: GATEWAY_IDS.githubVercel,
    kind: 'webhook',
    sourceZoneId: ZONE_IDS.github,
    targetZoneId: ZONE_IDS.vercel,
    direction: 'source-to-target',
    exposure: 'restricted',
    protocol: 'HTTPS webhook',
    route: 'GitHub main 변경에서 Vercel 배포 트리거',
    dataClasses: [WORKFLOW_SOURCE_METADATA_CLASS_ID],
    authentication: 'GitHub·Vercel 연동 참조',
    authorization: '연결된 저장소와 배포 프로젝트 범위',
    encryption: '전송 구간 TLS',
    initiator: 'GitHub',
    evidenceRef: 'vercel.json, package.json',
  }),
  evidenced({
    id: GATEWAY_IDS.browserSourceTwin,
    kind: 'browser-api',
    sourceZoneId: ZONE_IDS.local,
    targetZoneId: ZONE_IDS.vercel,
    direction: 'source-to-target',
    exposure: 'restricted',
    protocol: 'HTTPS JSON',
    route: '/api/source-twin',
    dataClasses: [WORKFLOW_SOURCE_METADATA_CLASS_ID],
    authentication: 'Supabase 사용자 JWT 참조',
    authorization: 'WORKFLOW_CANVAS_OWNER_USER_ID 소유자 전용',
    encryption: '전송 구간 TLS',
    initiator: '소유자 코드 브라우저',
    evidenceRef: 'src/lib/sourceTwinApi.js, api/source-twin.js',
  }),
  evidenced({
    id: GATEWAY_IDS.serverAiExplanation,
    kind: 'api-gateway',
    sourceZoneId: ZONE_IDS.vercel,
    targetZoneId: ZONE_IDS.aiProvider,
    direction: 'source-to-target',
    exposure: 'restricted',
    protocol: 'HTTPS JSON',
    route: 'Source Lens AI 설명 provider adapter · 기본 비활성',
    dataClasses: [WORKFLOW_SOURCE_AI_EXPLANATION_INPUT_CLASS_ID],
    authentication: '서버 환경의 제공자 API 키 참조',
    authorization: '소유자 전용 + enabled/provider/model 명시 설정',
    encryption: '전송 구간 TLS',
    initiator: 'Source Lens 서버 API',
    evidenceRef: 'shared/sourceAiExplanation.js, api/source-twin.js',
  }),
])

const DIRECT_NODE_ZONE_IDS = Object.freeze({
  'map-user': ZONE_IDS.local,
  'map-web-app': ZONE_IDS.local,
  'map-canvas-engine': ZONE_IDS.local,
  'map-local-cache': ZONE_IDS.local,
  'map-pwa': ZONE_IDS.local,
  'map-owner': ZONE_IDS.local,
  'map-claude-code': ZONE_IDS.local,
  'map-local-repo': ZONE_IDS.local,
  'map-tests': ZONE_IDS.local,
  'map-vercel': ZONE_IDS.vercel,
  'map-shared-api': ZONE_IDS.vercel,
  'map-mcp-api': ZONE_IDS.vercel,
  'map-permission-gateway': ZONE_IDS.vercel,
  'map-supabase-auth': ZONE_IDS.supabaseService,
  'map-realtime': ZONE_IDS.supabaseService,
  'map-postgres': ZONE_IDS.supabaseData,
  'map-rls': ZONE_IDS.supabaseData,
  'map-canvases-table': ZONE_IDS.supabaseData,
  'map-sharing-tables': ZONE_IDS.supabaseData,
  'map-profiles-table': ZONE_IDS.supabaseData,
  'map-prefs-table': ZONE_IDS.supabaseData,
  'map-mcp-tokens-table': ZONE_IDS.supabaseData,
  'map-image-storage': ZONE_IDS.supabaseData,
  'map-github': ZONE_IDS.github,
  'map-source-twin-api': ZONE_IDS.vercel,
  'map-ai-explanation-provider': ZONE_IDS.aiProvider,
})

const RELATION_GATEWAY_IDS = Object.freeze({
  'map-edge-vercel-app': GATEWAY_IDS.vercelBrowserDelivery,
  'map-edge-app-shared': GATEWAY_IDS.browserSharedApi,
  'map-edge-auth-user': GATEWAY_IDS.authToBrowser,
  'map-edge-app-auth': GATEWAY_IDS.browserAuth,
  'map-edge-app-canvases-read': GATEWAY_IDS.browserData,
  'map-edge-app-canvases-write': GATEWAY_IDS.browserData,
  'map-edge-gateway-db': GATEWAY_IDS.serverData,
  'map-edge-mcp-tokens': GATEWAY_IDS.serverData,
  'map-edge-mcp-canvases': GATEWAY_IDS.serverData,
  'map-edge-mcp-canvases-write': GATEWAY_IDS.serverData,
  'map-edge-app-realtime': GATEWAY_IDS.browserRealtime,
  'map-edge-realtime-canvases': GATEWAY_IDS.realtimeData,
  'map-edge-app-storage': GATEWAY_IDS.browserStorage,
  'map-edge-repo-github': GATEWAY_IDS.localGithub,
  'map-edge-github-vercel': GATEWAY_IDS.githubVercel,
  'map-edge-app-source-twin': GATEWAY_IDS.browserSourceTwin,
  'map-edge-source-twin-ai': GATEWAY_IDS.serverAiExplanation,
})

const ZONE_BY_ID = new Map(WORKFLOW_TRUST_ZONES.map((zone) => [zone.id, zone]))
const GATEWAY_BY_ID = new Map(WORKFLOW_TRUST_GATEWAYS.map((gateway) => [gateway.id, gateway]))

export function workflowTrustZoneIdForNode(node) {
  if (DIRECT_NODE_ZONE_IDS[node?.id]) return DIRECT_NODE_ZONE_IDS[node.id]
  if (node?.type === 'system' && (node.id.startsWith('map-engine-') || node.id.startsWith('map-component-'))) {
    return ZONE_IDS.unknown
  }
  return null
}

export function workflowGatewayIdForEdge(edge) {
  return RELATION_GATEWAY_IDS[edge?.id] ?? null
}

export function applyWorkflowTrustTopologyToCanvas(canvas = {}) {
  return {
    ...canvas,
    nodes: (canvas.nodes ?? []).map((node) => {
      const zone = ZONE_BY_ID.get(workflowTrustZoneIdForNode(node))
      if (!zone) return node
      return {
        ...node,
        data: { ...node.data, trustZone: normalizeTrustZone(zone) },
      }
    }),
    edges: (canvas.edges ?? []).map((edge) => {
      const gateway = GATEWAY_BY_ID.get(workflowGatewayIdForEdge(edge))
      if (!gateway) return edge
      return {
        ...edge,
        data: { ...edge.data, trustGateway: normalizeTrustGateway(gateway) },
      }
    }),
  }
}
