export const SOURCE_TWIN_AREA_DEFINITIONS = Object.freeze([
  {
    id: 'canvas-interface',
    label: '캔버스 화면·편집',
    description: '사용자가 캔버스를 보고 노드·연결선·도구를 직접 조작하는 영역',
  },
  {
    id: 'canvas-model',
    label: '캔버스 구조·동기화',
    description: '캔버스의 구조를 검사하고 위치·저장 상태를 일관되게 유지하는 영역',
  },
  {
    id: 'notes-content',
    label: '노트·콘텐츠',
    description: '메모, 본문, 이미지와 노트 화면을 다루는 영역',
  },
  {
    id: 'sharing-collaboration',
    label: '공유·협업',
    description: '초대, 참여자, 공동 편집 범위와 접속 상태를 다루는 영역',
  },
  {
    id: 'identity-profile',
    label: '로그인·프로필',
    description: '로그인한 사람의 신원, 프로필과 개인 설정을 다루는 영역',
  },
  {
    id: 'digital-twin-engine',
    label: '디지털 트윈 엔진',
    description: '실제 시스템을 발견하고 표준 구조로 바꿔 캔버스와 대조하는 영역',
  },
  {
    id: 'source-code-twin',
    label: '코드 구조·Git 동기화',
    description: '로컬·GitHub 코드 구조와 변경 이력, 안전한 동기화를 다루는 영역',
  },
  {
    id: 'ai-integration',
    label: 'AI·MCP 연결',
    description: 'AI가 허용된 캔버스 도구를 호출하도록 연결하는 영역',
  },
  {
    id: 'data-storage-sync',
    label: '데이터 저장·실시간 동기화',
    description: '브라우저와 데이터베이스에 상태를 저장하고 최신 상태를 맞추는 영역',
  },
  {
    id: 'media-files',
    label: '이미지·파일',
    description: '캔버스에서 사용하는 이미지와 첨부 파일을 보관하는 영역',
  },
  {
    id: 'security-privacy',
    label: '보안·개인정보',
    description: '권한, 입력 정리, 개인정보 접근 기록과 신뢰 경계를 다루는 영역',
  },
  {
    id: 'deployment-operations',
    label: '배포·운영',
    description: '웹 앱을 빌드·배포하고 실제 운영 상태를 확인하는 영역',
  },
  {
    id: 'testing-quality',
    label: '테스트·품질',
    description: '변경이 기존 기능·보안 규칙을 깨뜨리지 않는지 자동 확인하는 영역',
  },
  {
    id: 'project-foundation',
    label: '프로젝트 기반·공통 규칙',
    description: '여러 기능이 함께 사용하는 공통 규칙, 외부 라이브러리와 문서 영역',
  },
])

export const SOURCE_TWIN_SUBSYSTEM_DEFINITIONS = Object.freeze([
  { id: 'canvas-workspace', area: 'canvas-interface', label: '캔버스 작업 화면', description: '앱 시작, 전체 화면, 캔버스 전환과 주요 도구' },
  { id: 'canvas-elements', area: 'canvas-interface', label: '노드·연결선 표현', description: '노드 종류, 연결선, 관계 편집과 화면 상호작용' },
  { id: 'canvas-state', area: 'canvas-model', label: '캔버스 상태·좌표', description: '자료 형식, 위치, 이동, 병합과 동기화 규칙' },
  { id: 'notes-workspace', area: 'notes-content', label: '노트 작업 공간', description: '노트 창, 계층 탐색과 캔버스 연결' },
  { id: 'content-editing', area: 'notes-content', label: '본문·서식 편집', description: '메모, 본문, 서식과 직접 편집 동작' },
  { id: 'sharing-entry', area: 'sharing-collaboration', label: '초대·공유 진입', description: '이메일·링크 초대와 최초 수락·거절 흐름' },
  { id: 'participants-presence', area: 'sharing-collaboration', label: '참여자·접속 상태', description: '참여자 표시, 현재 접속과 활동 상태' },
  { id: 'sharing-policy', area: 'sharing-collaboration', label: '공유 권한 집행', description: '캔버스·그룹·노드별 읽기·편집·시야 범위' },
  { id: 'identity-account', area: 'identity-profile', label: '계정·프로필', description: '로그인, 사용자 신원과 프로필 설정' },
  { id: 'twin-core', area: 'digital-twin-engine', label: '엔진 공통 규격', description: '모든 프로그램을 같은 엔티티·파츠·관계·증거 형식으로 표현하는 중심 모델' },
  { id: 'engine-product-registry', area: 'digital-twin-engine', label: '제품·엔진 레지스트리', description: '제품 엔진의 이름, 버전, 내부 구성요소, 입출력과 코드·테스트 근거를 관리' },
  { id: 'twin-discovery', area: 'digital-twin-engine', label: '시스템 발견·정규화', description: '코드·DB·설정에서 실제 구성 요소를 찾고 표준 자료로 변환' },
  { id: 'twin-reconciliation', area: 'digital-twin-engine', label: '변경 대조·검토', description: '새 발견 결과와 현재 캔버스를 비교하고 사람에게 수정안을 제시' },
  { id: 'twin-materialization', area: 'digital-twin-engine', label: '지도 실체화', description: '승인된 엔티티·파츠·관계를 실제 캔버스 요소로 반영' },
  { id: 'twin-runtime', area: 'digital-twin-engine', label: '운영 상태 관측', description: '실제 시스템 상태, 관측 시각과 LIVE·stale 판정' },
  { id: 'twin-workflow-adapter', area: 'digital-twin-engine', label: 'Workflow Canvas 어댑터', description: '현재 앱을 범용 트윈 엔진 계약에 연결하는 번역층' },
  { id: 'twin-operations', area: 'digital-twin-engine', label: '조작·검증 수명주기', description: '미리보기, 승인, 실행, 확인, 감사와 복구의 공통 절차' },
  { id: 'source-analysis', area: 'source-code-twin', label: '코드 발견·설명 생성', description: '소스 구조를 읽고 역할·영역·근거 manifest를 생성' },
  { id: 'source-browser-history', area: 'source-code-twin', label: '코드 탐색·상태 이력', description: '로컬·GitHub 코드 보기, 검색, 변경과 배포별 비교' },
  { id: 'local-connector', area: 'source-code-twin', label: '로컬 커넥터', description: 'Mac 저장소의 제한된 메타데이터와 Git 상태 연결' },
  { id: 'git-delivery', area: 'source-code-twin', label: 'Git 변경·전달', description: 'GitHub push 신호, 코드 포트와 방향성 동기화' },
  { id: 'mcp-transport', area: 'ai-integration', label: 'MCP 연결·인증', description: 'AI 요청 접수, 연결 토큰과 도구 목록 공개' },
  { id: 'mcp-tools', area: 'ai-integration', label: 'AI 캔버스 도구', description: 'AI가 권한 범위 안에서 캔버스를 읽고 조작하는 서버 기능' },
  { id: 'browser-persistence', area: 'data-storage-sync', label: '브라우저 저장', description: '네트워크 전후의 로컬 상태 보관과 이전 형식 이동' },
  { id: 'cloud-persistence', area: 'data-storage-sync', label: '클라우드 저장·실시간 동기화', description: 'Supabase 읽기·쓰기, 변경 구독과 충돌 처리' },
  { id: 'database-schema', area: 'data-storage-sync', label: '데이터베이스 구조', description: '핵심 테이블, DB 함수와 저장 규칙' },
  { id: 'media-presentation', area: 'media-files', label: '이미지 표시', description: '캔버스와 노트에서 이미지 표현' },
  { id: 'media-storage', area: 'media-files', label: '파일 저장·접근', description: '이미지 업로드, 삭제와 저장소 권한' },
  { id: 'input-safety', area: 'security-privacy', label: '입력·콘텐츠 안전', description: 'HTML, URL과 외부 입력에서 실행 가능한 위험 제거' },
  { id: 'access-privacy', area: 'security-privacy', label: '접근 감사·개인정보', description: '운영 접근 기록, 개인정보 기능과 공개 범위' },
  { id: 'trust-controls', area: 'security-privacy', label: '신뢰 경계·보호 규칙', description: '로컬·클라우드 경계, 권한 정책과 메타데이터 보호' },
  { id: 'build-release', area: 'deployment-operations', label: '빌드·배포', description: '프로덕션 번들, Vercel 설정과 출시 경로' },
  { id: 'runtime-operations', area: 'deployment-operations', label: '서비스 운영', description: '배포된 서비스의 상태와 운영 환경 설정' },
  { id: 'source-tests', area: 'testing-quality', label: '코드 트윈·커넥터 검사', description: '코드 발견, 로컬 연결과 Git 동기화 회귀 테스트' },
  { id: 'engine-tests', area: 'testing-quality', label: '트윈 엔진 검사', description: '공통 모델, 어댑터, 대조와 조작 수명주기 테스트' },
  { id: 'app-tests', area: 'testing-quality', label: '앱 기능·보안 검사', description: '캔버스, 공유, SQL과 개인정보 출시 조건 테스트' },
  { id: 'project-config', area: 'project-foundation', label: '프로젝트 설정·외부 라이브러리', description: '패키지 명령, 공통 의존성과 실행 설정' },
  { id: 'project-docs', area: 'project-foundation', label: '설계·운영 문서', description: '제품 구조, 안전 계약과 향후 계획 문서' },
])

const AREA_BY_ID = new Map(SOURCE_TWIN_AREA_DEFINITIONS.map((item, index) => [item.id, { ...item, order: index }]))
const SUBSYSTEM_BY_ID = new Map(SOURCE_TWIN_SUBSYSTEM_DEFINITIONS.map((item, index) => [item.id, { ...item, order: index }]))

const FALLBACK_AREA_BY_LAYER = Object.freeze({
  frontend: 'canvas-interface',
  api: 'data-storage-sync',
  mcp: 'ai-integration',
  shared: 'project-foundation',
  database: 'data-storage-sync',
  security: 'security-privacy',
  deployment: 'deployment-operations',
  test: 'testing-quality',
  documentation: 'project-foundation',
  code: 'project-foundation',
})

const FALLBACK_SUBSYSTEM_BY_AREA = Object.freeze({
  'canvas-interface': 'canvas-workspace',
  'canvas-model': 'canvas-state',
  'notes-content': 'content-editing',
  'sharing-collaboration': 'sharing-policy',
  'identity-profile': 'identity-account',
  'digital-twin-engine': 'twin-core',
  'source-code-twin': 'source-analysis',
  'ai-integration': 'mcp-tools',
  'data-storage-sync': 'cloud-persistence',
  'media-files': 'media-storage',
  'security-privacy': 'trust-controls',
  'deployment-operations': 'build-release',
  'testing-quality': 'app-tests',
  'project-foundation': 'project-config',
})

function text(value, maximum = 300) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

export function sourceTwinAreaId(entity = {}) {
  return text(entity.area, 120) || FALLBACK_AREA_BY_LAYER[entity.layer] || 'project-foundation'
}

export function sourceTwinAreaDefinition(areaId, manifest = null) {
  const custom = (manifest?.areas ?? []).find((item) => item?.id === areaId)
  if (custom) {
    return {
      id: areaId,
      label: text(custom.label, 120) || areaId,
      description: text(custom.description, 300),
      order: Number.isInteger(custom.order) ? custom.order : 1_000,
    }
  }
  return AREA_BY_ID.get(areaId) ?? {
    id: areaId,
    label: areaId || '기타',
    description: '',
    order: 1_000,
  }
}

export function sourceTwinSubsystemId(entity = {}) {
  const areaId = sourceTwinAreaId(entity)
  return text(entity.subsystem, 120) || FALLBACK_SUBSYSTEM_BY_AREA[areaId] || 'project-config'
}

export function sourceTwinSubsystemDefinition(subsystemId, manifest = null) {
  const custom = (manifest?.subsystems ?? []).find((item) => item?.id === subsystemId)
  if (custom) {
    return {
      id: subsystemId,
      area: text(custom.area, 120),
      label: text(custom.label, 120) || subsystemId,
      description: text(custom.description, 300),
      order: Number.isInteger(custom.order) ? custom.order : 1_000,
    }
  }
  return SUBSYSTEM_BY_ID.get(subsystemId) ?? {
    id: subsystemId,
    area: '',
    label: subsystemId || '기타 코드',
    description: '',
    order: 1_000,
  }
}

export function sourceTwinAreaCatalog(areaIds = []) {
  const selected = new Set(areaIds.filter(Boolean))
  return SOURCE_TWIN_AREA_DEFINITIONS
    .filter((item) => selected.has(item.id))
    .map((item, order) => ({ ...item, order }))
}

export function sourceTwinSubsystemCatalog(subsystemIds = []) {
  const selected = new Set(subsystemIds.filter(Boolean))
  return SOURCE_TWIN_SUBSYSTEM_DEFINITIONS
    .filter((item) => selected.has(item.id))
    .map((item, order) => ({ ...item, order }))
}

export function groupSourceTwinEntitiesByArea(manifest, entities = []) {
  const groups = new Map()
  for (const entity of entities) {
    const areaId = sourceTwinAreaId(entity)
    const group = groups.get(areaId) ?? {
      ...sourceTwinAreaDefinition(areaId, manifest),
      entities: [],
    }
    group.entities.push(entity)
    groups.set(areaId, group)
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      entities: group.entities.sort((left, right) => (
        `${left.path ?? ''}:${left.label}`.localeCompare(`${right.path ?? ''}:${right.label}`, 'ko')
      )),
    }))
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, 'ko'))
}

export function groupSourceTwinEntitiesBySubsystem(manifest, entities = []) {
  const groups = new Map()
  for (const entity of entities) {
    const subsystemId = sourceTwinSubsystemId(entity)
    const group = groups.get(subsystemId) ?? {
      ...sourceTwinSubsystemDefinition(subsystemId, manifest),
      entities: [],
    }
    group.entities.push(entity)
    groups.set(subsystemId, group)
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      entities: group.entities.sort((left, right) => (
        `${left.path ?? ''}:${left.label}`.localeCompare(`${right.path ?? ''}:${right.label}`, 'ko')
      )),
    }))
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, 'ko'))
}
