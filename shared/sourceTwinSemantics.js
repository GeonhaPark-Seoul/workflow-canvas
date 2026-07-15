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

const AREA_BY_ID = new Map(SOURCE_TWIN_AREA_DEFINITIONS.map((item, index) => [item.id, { ...item, order: index }]))

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

export function sourceTwinAreaCatalog(areaIds = []) {
  const selected = new Set(areaIds.filter(Boolean))
  return SOURCE_TWIN_AREA_DEFINITIONS
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
