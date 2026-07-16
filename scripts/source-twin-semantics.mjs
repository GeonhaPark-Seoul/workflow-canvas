import { sourceProfileRole, sourceProfileRuleResult } from '../shared/sourceProfileContract.js'

const ROLE = (area, summary, userImpact, subsystem = '') => ({
  area, summary, userImpact, ...(subsystem ? { subsystem } : {}),
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

function genericArea(record, profile = null) {
  const profiledArea = sourceProfileRuleResult(profile, 'area', record)
  if (profiledArea) return profiledArea
  const source = `${record.path} ${record.imports?.map((item) => item.source).join(' ') ?? ''}`.toLocaleLowerCase()
  if (/test|spec|fixture|check-/.test(source) || record.layer === 'test') return 'testing-quality'
  if (/auth|profile|session|login/.test(source)) return 'identity-profile'
  if (/share|invite|participant|presence|collab/.test(source)) return 'sharing-collaboration'
  if (/sanitize|privacy|permission|audit|trust|security/.test(source) || record.securitySignals?.length) return 'security-privacy'
  if (/note|memo|content|editor/.test(source)) return 'notes-content'
  if (/image|media|upload|storage/.test(source) && !/cloudstorage/.test(source)) return 'media-files'
  if (/mcp|agent|ai/.test(source) || record.layer === 'mcp') return 'ai-integration'
  if (/deploy|vercel|vite|package\.json/.test(source) || record.layer === 'deployment') return 'deployment-operations'
  if (/database|supabase|storage|sync|schema|\.sql/.test(source) || record.layer === 'database') return 'data-storage-sync'
  if (record.layer === 'frontend') return 'canvas-interface'
  return 'project-foundation'
}

function subsystemFromArea(record, area) {
  if (area === 'canvas-interface') return 'canvas-workspace'
  if (area === 'canvas-model') return 'canvas-state'
  if (area === 'notes-content') return 'content-editing'
  if (area === 'sharing-collaboration') return 'sharing-policy'
  if (area === 'identity-profile') return 'identity-account'
  if (area === 'digital-twin-engine') return 'twin-core'
  if (area === 'source-code-twin') return 'source-analysis'
  if (area === 'ai-integration') return 'mcp-tools'
  if (area === 'data-storage-sync') return /\.sql$/i.test(record.path) ? 'database-schema' : 'cloud-persistence'
  if (area === 'media-files') return 'media-storage'
  if (area === 'security-privacy') return 'trust-controls'
  if (area === 'deployment-operations') return 'build-release'
  if (area === 'testing-quality') return 'app-tests'
  if (area === 'project-foundation') return /^docs\//i.test(record.path) ? 'project-docs' : 'project-config'
  return `${area || 'project'}-general`
}

export function sourceTwinSubsystemForRecord(record, project = {}, area = '', profile = null) {
  const resolvedArea = area || genericArea(record, profile)
  const role = sourceProfileRole(profile, record.path)
  if (role?.subsystem) return role.subsystem
  const profiledSubsystem = sourceProfileRuleResult(profile, 'subsystem', record, resolvedArea)
  if (profiledSubsystem) return profiledSubsystem
  return subsystemFromArea(record, resolvedArea)
}

function genericFileExplanation(record, profile = null) {
  const label = baseName(record.path)
  const route = record.apiRoutes?.[0]
  const tables = record.dbTables?.slice(0, 3) ?? []
  if (route) {
    return ROLE(
      genericArea(record, profile),
      `${route}로 들어온 브라우저 요청을 받아 로그인과 입력을 확인하고 필요한 서버 작업 결과를 돌려줍니다.`,
      '이 경로의 권한 검사와 오류 처리가 화면에서 해당 기능이 실제로 작동하는 방식을 결정합니다.',
    )
  }
  if (record.layer === 'database') {
    const target = tables.length ? `${tables.join(', ')} 자료` : '데이터베이스 자료'
    return ROLE(
      genericArea(record, profile),
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
  if (record.layer === 'backend') {
    return ROLE(
      genericArea(record, profile),
      `${conceptLabel(identifierWords(label)) || label}에 필요한 서버 처리와 업무 규칙을 제공합니다.`,
      '화면에서 요청한 작업이 서버에서 어떤 순서와 조건으로 처리되는지에 영향을 줍니다.',
    )
  }
  if (record.layer === 'shared') {
    return ROLE(genericArea(record, profile), `${conceptLabel(identifierWords(label)) || label}에 대해 브라우저와 서버가 함께 지켜야 할 공통 판단 규칙을 제공합니다.`, '같은 자료를 서로 다른 화면과 서버가 다르게 해석하는 일을 줄입니다.')
  }
  if (record.layer === 'frontend') {
    const component = /^[A-Z]/.test(label)
    return ROLE(genericArea(record, profile), component
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
      label: String(packageJson.productName ?? packageJson.name ?? '').trim(),
    }
  } catch {
    return { name: '', label: '' }
  }
}

export function explainSourceFile(record, project = {}, profile = null) {
  const profiledRole = sourceProfileRole(profile, record.path)
  if (profiledRole) {
    return {
      ...profiledRole,
      explanationMethod: 'curated-product-profile',
    }
  }
  if (/^scripts\/test-|(?:\.test|\.spec)\.[^.]+$/i.test(record.path)) {
    const subject = baseName(record.path).replace(/^test-/, '').replace(/-/g, ' ')
    return {
      ...ROLE('testing-quality', `${subject} 기능과 보호 규칙이 변경 뒤에도 유지되는지 자동으로 확인합니다.`, '회귀나 보안 약화가 있는 빌드의 배포를 막습니다.'),
      explanationMethod: 'test-file-rule',
    }
  }
  return {
    ...genericFileExplanation(record, profile),
    explanationMethod: 'deterministic-source-rule',
  }
}

export function sourceTwinTechnicalSummary(record) {
  if (record.analysisStatus === 'structure-only') {
    return `${record.lineCount}줄의 ${record.language} 파일 · 파일 역할만 확인 · 함수 구조는 아직 분석하지 않음`
  }
  if (record.analysisStatus === 'unsupported') {
    return `${record.lineCount}줄의 ${record.language} 파일 · 현재 분석 지원 범위 밖`
  }
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
