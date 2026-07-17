import { createSourceEditablePropertyRegistry } from './sourceEditableProperties.js'

const REGISTRY = createSourceEditablePropertyRegistry([
  {
    id: 'ui.system-node.default-width',
    label: '시스템 노드 기본 너비',
    description: '새로 만드는 시스템 노드의 가로 크기입니다.',
    type: 'number',
    unit: 'px',
    minimum: 160,
    maximum: 640,
    owner: '캔버스 시스템 노드 UI',
    anchor: { path: 'shared/uiConstants.js', exportName: 'SYSTEM_NODE_DEFAULT_WIDTH' },
    impactScope: ['새 시스템 노드 생성'],
    requiredChecks: ['node scripts/test-source-editable-properties.mjs', 'npm run build'],
  },
  {
    id: 'ui.system-node.default-height',
    label: '시스템 노드 기본 높이',
    description: '새로 만드는 시스템 노드의 세로 크기입니다.',
    type: 'number',
    unit: 'px',
    minimum: 80,
    maximum: 480,
    owner: '캔버스 시스템 노드 UI',
    anchor: { path: 'shared/uiConstants.js', exportName: 'SYSTEM_NODE_DEFAULT_HEIGHT' },
    impactScope: ['새 시스템 노드 생성'],
    requiredChecks: ['node scripts/test-source-editable-properties.mjs', 'npm run build'],
  },
  {
    id: 'ui.system-module.color',
    label: '코드 모듈 색상',
    description: '코드 모듈 Asset을 구분하는 강조 색상입니다.',
    type: 'color',
    unit: '',
    owner: '시스템 온톨로지 UI',
    anchor: { path: 'shared/uiConstants.js', exportName: 'SYSTEM_MODULE_COLOR' },
    impactScope: ['코드 모듈 노드 테두리', '코드 모듈 종류 표시'],
    requiredChecks: ['node scripts/test-source-editable-properties.mjs', 'npm run build'],
  },
  {
    id: 'ui.source-twin.empty-message',
    label: '코드 검색 빈 화면 문구',
    description: '코드 트리에서 검색 결과가 없을 때 보여주는 안내 문구입니다.',
    type: 'text',
    unit: '',
    minimumLength: 1,
    maximumLength: 80,
    owner: 'Source Lens 코드 브라우저 UI',
    anchor: { path: 'shared/uiConstants.js', exportName: 'SOURCE_TWIN_EMPTY_MESSAGE' },
    impactScope: ['Source Lens 코드 검색 빈 상태'],
    requiredChecks: ['node scripts/test-source-editable-properties.mjs', 'npm run build'],
  },
])

export const SOURCE_EDITABLE_PROPERTY_DEFS = REGISTRY.definitions
export const sourceEditablePropertyDefinition = REGISTRY.definition
export const sourceEditablePropertyForAnchor = REGISTRY.definitionForAnchor
export const normalizeSourceEditableValue = REGISTRY.normalizeValue
export const serializeSourceEditableValue = REGISTRY.serializeValue
export const publicSourceEditableProperty = REGISTRY.publicProperty
