export const SYSTEM_OBSERVATION_AVAILABILITY_DEFS = Object.freeze([
  Object.freeze({ id: 'available', label: '확인됨', tone: 'healthy' }),
  Object.freeze({ id: 'not_observed', label: '미확인', tone: 'neutral' }),
  Object.freeze({ id: 'permission_required', label: '권한 필요', tone: 'warning' }),
  Object.freeze({ id: 'connector_required', label: '연결 필요', tone: 'warning' }),
  Object.freeze({ id: 'unsupported', label: '미지원', tone: 'neutral' }),
  Object.freeze({ id: 'protected', label: '보호됨', tone: 'protected' }),
])

export const SYSTEM_OBSERVATION_CATEGORY_DEFS = Object.freeze([
  Object.freeze({ id: 'deployment', label: '배포' }),
  Object.freeze({ id: 'version', label: '버전' }),
  Object.freeze({ id: 'endpoint', label: '경로' }),
  Object.freeze({ id: 'verification', label: '검증' }),
  Object.freeze({ id: 'authentication', label: '인증' }),
  Object.freeze({ id: 'authorization', label: '권한' }),
  Object.freeze({ id: 'storage', label: '저장 규모' }),
  Object.freeze({ id: 'activity', label: '최근 활동' }),
  Object.freeze({ id: 'collaboration', label: '공유·협업' }),
  Object.freeze({ id: 'integrity', label: '무결성' }),
  Object.freeze({ id: 'security', label: '보호 경계' }),
  Object.freeze({ id: 'connector', label: '추가 연결' }),
  Object.freeze({ id: 'runtime', label: '실행 상태' }),
])

export const SYSTEM_OBSERVATION_REFRESH_DEFS = Object.freeze([
  Object.freeze({ id: 'on_check', label: '점검 시' }),
  Object.freeze({ id: 'on_request', label: '요청 시' }),
  Object.freeze({ id: 'on_deploy', label: '배포 시' }),
  Object.freeze({ id: 'on_event', label: '변경 시' }),
  Object.freeze({ id: 'manual', label: '수동' }),
])

const availabilityById = new Map(SYSTEM_OBSERVATION_AVAILABILITY_DEFS.map((item) => [item.id, item]))
const categoryById = new Map(SYSTEM_OBSERVATION_CATEGORY_DEFS.map((item) => [item.id, item]))
const refreshById = new Map(SYSTEM_OBSERVATION_REFRESH_DEFS.map((item) => [item.id, item]))

export function systemObservationAvailabilityDefinition(id) {
  return availabilityById.get(id) ?? availabilityById.get('not_observed')
}

export function systemObservationCategoryDefinition(id) {
  return categoryById.get(id) ?? { id: id || 'runtime', label: id || '기타' }
}

export function systemObservationRefreshDefinition(id) {
  return refreshById.get(id) ?? refreshById.get('manual')
}

function field(definition) {
  return Object.freeze({
    unit: '',
    sensitivity: 'internal',
    sourceKind: 'runtime',
    refreshMode: 'on_check',
    evidenceRef: '',
    defaultAvailability: 'not_observed',
    defaultReason: '아직 이 항목을 관측하지 않았습니다.',
    lockedAvailability: false,
    ...definition,
  })
}

const protectedField = (definition) => field({
  defaultAvailability: 'protected',
  defaultReason: '민감한 원문은 수집하거나 표시하지 않습니다.',
  lockedAvailability: true,
  ...definition,
})

const connectorField = (definition) => field({
  defaultAvailability: 'connector_required',
  defaultReason: '이 정보를 읽을 관리 커넥터가 아직 연결되지 않았습니다.',
  ...definition,
})

export const SYSTEM_OBSERVATION_CATALOGS = Object.freeze({
  'workflow.vercel.deployment.runtime': Object.freeze([
    field({ id: 'runtime-active', category: 'runtime', label: '프로덕션 함수 응답', valueType: 'boolean', evidenceRef: 'api/system-runtime.js' }),
    field({ id: 'environment', category: 'deployment', label: '배포 환경', valueType: 'status', refreshMode: 'on_deploy', evidenceRef: 'VERCEL_ENV' }),
    field({ id: 'region', category: 'deployment', label: '실행 리전', valueType: 'text', refreshMode: 'on_deploy', evidenceRef: 'VERCEL_REGION' }),
    field({ id: 'commit', category: 'version', label: '배포 커밋', valueType: 'text', refreshMode: 'on_deploy', evidenceRef: 'VERCEL_GIT_COMMIT_SHA' }),
    field({ id: 'host', category: 'endpoint', label: '배포 호스트', valueType: 'text', refreshMode: 'on_deploy', evidenceRef: 'VERCEL_URL' }),
    connectorField({ id: 'deployment-history', category: 'deployment', label: '배포 기록', valueType: 'number', sourceKind: 'connector', evidenceRef: 'Vercel Management API' }),
    connectorField({ id: 'build-logs', category: 'deployment', label: '빌드 로그', valueType: 'text', sourceKind: 'connector', evidenceRef: 'Vercel Management API' }),
  ]),
  'workflow.api.shared-canvas.health': Object.freeze([
    field({ id: 'route', category: 'endpoint', label: '고정 경로', valueType: 'text', sourceKind: 'code', evidenceRef: 'api/shared-canvas.js' }),
    field({ id: 'request-method', category: 'endpoint', label: '요청 방식', valueType: 'status', sourceKind: 'code', evidenceRef: 'api/system-runtime.js' }),
    field({ id: 'http-status', category: 'verification', label: 'HTTP 상태', valueType: 'number', evidenceRef: '/api/shared-canvas?mode=health' }),
    field({ id: 'authentication', category: 'authentication', label: '로그인 검증 포함', valueType: 'boolean', evidenceRef: 'api/shared-canvas.js' }),
    field({ id: 'coverage', category: 'verification', label: '검증 범위', valueType: 'status', evidenceRef: 'mcp/systemRuntime.js' }),
    protectedField({ id: 'response-body', category: 'security', label: '응답 본문', valueType: 'text', evidenceRef: 'HTTP 204' }),
  ]),
  'workflow.api.mcp.route': Object.freeze([
    field({ id: 'route', category: 'endpoint', label: '고정 경로', valueType: 'text', sourceKind: 'code', evidenceRef: 'api/mcp.js' }),
    field({ id: 'request-method', category: 'endpoint', label: '점검 요청 방식', valueType: 'status', sourceKind: 'code', evidenceRef: 'api/system-runtime.js' }),
    field({ id: 'http-status', category: 'verification', label: 'HTTP 상태', valueType: 'number', evidenceRef: '/api/mcp' }),
    field({ id: 'allowed-method', category: 'endpoint', label: '허용 방식', valueType: 'status', evidenceRef: 'Allow header' }),
    field({ id: 'coverage', category: 'verification', label: '검증 범위', valueType: 'status', evidenceRef: 'mcp/systemRuntime.js' }),
    field({ id: 'tools-list', category: 'verification', label: '배포 도구 목록', valueType: 'number', defaultReason: '현재 점검은 실제 MCP 세션을 열지 않습니다.', evidenceRef: 'tools/list' }),
    field({ id: 'tool-invocation', category: 'verification', label: '실제 도구 호출', valueType: 'boolean', defaultReason: '현재 점검은 실제 MCP 도구를 실행하지 않습니다.', evidenceRef: 'tools/call' }),
    protectedField({ id: 'response-body', category: 'security', label: '오류 응답 본문', valueType: 'text', evidenceRef: 'HTTP 405' }),
  ]),
  'workflow.supabase.auth.session': Object.freeze([
    field({ id: 'session-valid', category: 'authentication', label: '세션 유효', valueType: 'boolean', evidenceRef: 'Supabase Auth getUser' }),
    field({ id: 'identity-match', category: 'authorization', label: '등록 운영자 일치', valueType: 'boolean', evidenceRef: 'WORKFLOW_CANVAS_OWNER_USER_ID' }),
    protectedField({ id: 'identity-payload', category: 'security', label: '사용자 식별 정보', valueType: 'text', evidenceRef: 'Supabase Auth user' }),
    protectedField({ id: 'access-token', category: 'security', label: '접속 토큰 원문', valueType: 'text', evidenceRef: 'Authorization header' }),
  ]),
  'workflow.supabase.user-canvases.read': Object.freeze([
    field({ id: 'endpoint', category: 'endpoint', label: '고정 테이블 경로', valueType: 'text', sourceKind: 'code', evidenceRef: 'src/lib/supabase.js' }),
    field({ id: 'request-method', category: 'endpoint', label: '요청 방식', valueType: 'status', sourceKind: 'code', evidenceRef: 'mcp/systemRuntime.js' }),
    field({ id: 'http-status', category: 'verification', label: 'HTTP 상태', valueType: 'number', evidenceRef: 'Supabase PostgREST' }),
    field({ id: 'authenticated', category: 'authentication', label: '로그인 세션 포함', valueType: 'boolean', evidenceRef: 'Authorization header' }),
    field({ id: 'rls-path', category: 'authorization', label: 'RLS 읽기 경로', valueType: 'boolean', evidenceRef: 'supabase-schema.sql' }),
    field({ id: 'policy-name', category: 'authorization', label: '적용 정책 이름', valueType: 'text', defaultReason: 'PostgREST 응답만으로 실제 적용 정책 이름은 판별할 수 없습니다.', evidenceRef: 'PostgREST response' }),
    protectedField({ id: 'row-body', category: 'security', label: '캔버스 행 본문', valueType: 'text', evidenceRef: 'HEAD request' }),
    protectedField({ id: 'credential-value', category: 'security', label: '클라이언트 키 원문', valueType: 'text', evidenceRef: 'SUPABASE_ANON_KEY' }),
  ]),
  'workflow.supabase.canvas-service.operations': Object.freeze([
    field({ id: 'accounts', category: 'storage', label: '캔버스 보유 사용자', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'canvases', category: 'storage', label: '캔버스', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'nodes', category: 'storage', label: '노드', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'edges', category: 'storage', label: '연결선', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'notes', category: 'storage', label: '노트', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'canvases-24h', category: 'activity', label: '24시간 변경 캔버스', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'accounts-24h', category: 'activity', label: '24시간 변경 사용자', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'canvases-7d', category: 'activity', label: '7일 변경 캔버스', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'accounts-7d', category: 'activity', label: '7일 변경 사용자', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'latest-update', category: 'activity', label: '마지막 캔버스 변경', valueType: 'timestamp', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'active-invitations', category: 'collaboration', label: '활성 초대 경로', valueType: 'number', sourceKind: 'connector', evidenceRef: 'canvas_shares' }),
    field({ id: 'active-email-invitations', category: 'collaboration', label: '이메일 초대 경로', valueType: 'number', sourceKind: 'connector', evidenceRef: 'canvas_shares' }),
    field({ id: 'active-link-invitations', category: 'collaboration', label: '링크 초대 경로', valueType: 'number', sourceKind: 'connector', evidenceRef: 'canvas_shares' }),
    field({ id: 'active-memberships', category: 'collaboration', label: '참여 관계', valueType: 'number', sourceKind: 'connector', evidenceRef: 'share_members' }),
    field({ id: 'revoked-memberships', category: 'collaboration', label: '거절·추방 기록', valueType: 'number', sourceKind: 'connector', evidenceRef: 'share_revocations' }),
    field({ id: 'canvas-scope-shares', category: 'collaboration', label: '캔버스 범위 공유', valueType: 'number', sourceKind: 'connector', evidenceRef: 'canvas_shares.scope' }),
    field({ id: 'group-scope-shares', category: 'collaboration', label: '그룹 범위 공유', valueType: 'number', sourceKind: 'connector', evidenceRef: 'canvas_shares.scope' }),
    field({ id: 'node-scope-shares', category: 'collaboration', label: '노드 범위 공유', valueType: 'number', sourceKind: 'connector', evidenceRef: 'canvas_shares.scope' }),
    field({ id: 'invalid-documents', category: 'integrity', label: '문서 구조 경고', valueType: 'number', sourceKind: 'connector', evidenceRef: 'get_workflow_system_operational_snapshot' }),
    field({ id: 'operator-blind', category: 'security', label: '운영자 본문 차단', valueType: 'boolean', sourceKind: 'code', refreshMode: 'on_deploy', evidenceRef: 'shared/privacyCapabilities.js' }),
    field({ id: 'end-to-end-encryption', category: 'security', label: '종단간 암호화', valueType: 'boolean', sourceKind: 'code', refreshMode: 'on_deploy', evidenceRef: 'shared/privacyCapabilities.js' }),
    field({ id: 'server-access-audit', category: 'security', label: '서버 접근 감사', valueType: 'status', sourceKind: 'code', refreshMode: 'on_deploy', evidenceRef: 'supabase-data-access-audit.sql' }),
    field({ id: 'direct-db-audit-coverage', category: 'security', label: 'DB 관리자 직접 접근 감사', valueType: 'boolean', sourceKind: 'code', refreshMode: 'on_deploy', evidenceRef: 'shared/privacyCapabilities.js' }),
    field({ id: 'privacy-release-gate', category: 'security', label: '개인정보 출시 게이트', valueType: 'status', sourceKind: 'code', refreshMode: 'on_deploy', evidenceRef: 'scripts/check-privacy-release.mjs' }),
    protectedField({ id: 'canvas-bodies', category: 'security', label: '사용자 캔버스 본문', valueType: 'text', evidenceRef: 'aggregate-only contract' }),
    protectedField({ id: 'user-identities', category: 'security', label: '사용자 ID·이메일', valueType: 'text', evidenceRef: 'aggregate-only contract' }),
    connectorField({ id: 'database-size', category: 'connector', label: '데이터베이스 사용량', valueType: 'number', unit: 'bytes', sourceKind: 'connector', evidenceRef: 'Supabase Management API' }),
  ]),
})

export function systemObservationCatalogForCapability(capabilityId) {
  return SYSTEM_OBSERVATION_CATALOGS[capabilityId] ?? Object.freeze([])
}
