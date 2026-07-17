export const SOURCE_EDITABLE_PROPERTY_SCHEMA_VERSION = 1

function plainText(value, maximum = 200) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

function normalizeDefinition(value) {
  if (!value?.id || !value?.anchor?.path || !value?.anchor?.exportName) {
    throw new Error('편집 속성 ID와 AST 앵커가 필요합니다.')
  }
  if (!['number', 'color', 'text'].includes(value.type)) {
    throw new Error(`${value.id}의 편집 속성 타입을 지원하지 않습니다.`)
  }
  return Object.freeze({
    schemaVersion: SOURCE_EDITABLE_PROPERTY_SCHEMA_VERSION,
    ...value,
    id: plainText(value.id, 180),
    label: plainText(value.label, 180),
    description: plainText(value.description, 500),
    unit: plainText(value.unit, 32),
    owner: plainText(value.owner, 180),
    anchor: Object.freeze({
      path: plainText(value.anchor.path, 500),
      exportName: plainText(value.anchor.exportName, 180),
    }),
    impactScope: Object.freeze((value.impactScope ?? []).map((item) => plainText(item, 180)).filter(Boolean)),
    requiredChecks: Object.freeze((value.requiredChecks ?? []).map((item) => plainText(item, 300)).filter(Boolean)),
  })
}

export function createSourceEditablePropertyRegistry(rawDefinitions = []) {
  const definitions = Object.freeze(rawDefinitions.map(normalizeDefinition))
  const byId = new Map()
  const byAnchor = new Map()
  for (const definition of definitions) {
    const anchorKey = `${definition.anchor.path}:${definition.anchor.exportName}`
    if (!definition.id || byId.has(definition.id) || byAnchor.has(anchorKey)) {
      throw new Error('편집 속성 ID 또는 AST 앵커가 중복되었습니다.')
    }
    byId.set(definition.id, definition)
    byAnchor.set(anchorKey, definition)
  }

  const definition = (id) => byId.get(plainText(id, 180)) ?? null
  const definitionForAnchor = (path, exportName) => (
    byAnchor.get(`${plainText(path, 500)}:${plainText(exportName, 180)}`) ?? null
  )
  const normalizeValue = (definitionOrId, value) => {
    const property = typeof definitionOrId === 'string' ? definition(definitionOrId) : definitionOrId
    if (!property) return { valid: false, error: '등록되지 않은 편집 속성입니다.' }
    if (property.type === 'number') {
      const number = Number(value)
      if (!Number.isFinite(number)) return { valid: false, error: '숫자를 입력해야 합니다.' }
      if (number < property.minimum || number > property.maximum) {
        return { valid: false, error: `${property.minimum}${property.unit}에서 ${property.maximum}${property.unit} 사이여야 합니다.` }
      }
      return { valid: true, value: number }
    }
    if (property.type === 'color') {
      const color = plainText(value, 16).toLowerCase()
      if (!/^#[a-f0-9]{6}$/.test(color)) return { valid: false, error: '#RRGGBB 형식의 색상이어야 합니다.' }
      return { valid: true, value: color }
    }
    const valueText = plainText(value, property.maximumLength ?? 200)
    if (valueText.length < (property.minimumLength ?? 0)) return { valid: false, error: '문구가 비어 있습니다.' }
    return { valid: true, value: valueText }
  }
  const serializeValue = (definitionOrId, value) => {
    const property = typeof definitionOrId === 'string' ? definition(definitionOrId) : definitionOrId
    const normalized = normalizeValue(property, value)
    if (!normalized.valid) return null
    return property.type === 'number' ? String(normalized.value) : JSON.stringify(normalized.value)
  }
  const publicProperty = (definitionOrId, currentValue) => {
    const property = typeof definitionOrId === 'string' ? definition(definitionOrId) : definitionOrId
    if (!property) return null
    const current = normalizeValue(property, currentValue)
    if (!current.valid) return null
    return {
      schemaVersion: SOURCE_EDITABLE_PROPERTY_SCHEMA_VERSION,
      id: property.id,
      label: property.label,
      description: property.description,
      type: property.type,
      unit: property.unit,
      minimum: property.minimum,
      maximum: property.maximum,
      minimumLength: property.minimumLength,
      maximumLength: property.maximumLength,
      owner: property.owner,
      anchor: { ...property.anchor },
      impactScope: [...property.impactScope],
      requiredChecks: [...property.requiredChecks],
      currentValue: current.value,
    }
  }

  return Object.freeze({
    definitions,
    definition,
    definitionForAnchor,
    normalizeValue,
    serializeValue,
    publicProperty,
  })
}
