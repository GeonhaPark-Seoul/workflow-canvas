import { sourceCodePartsForModule } from './sourceCodeParts.js'
import {
  normalizeSourceEditableValue,
  publicSourceEditableProperty,
  sourceEditablePropertyDefinition,
  sourceEditablePropertyForAnchor,
} from './workflowSourceEditableProperties.js'

const readonly = (reason = '등록되지 않은 코드는 읽기 전용입니다.') => ({
  schemaVersion: 1,
  eligible: false,
  propertyId: '',
  reason,
})

export const WORKFLOW_SOURCE_EDIT_CODE_PART_ADAPTER = Object.freeze({
  id: 'workflow-canvas.source-edit-code-part-hints',
  version: '1.0.0',
  annotateDeclaration({ path, exportName, rawValue } = {}) {
    const definition = sourceEditablePropertyForAnchor(path, exportName)
    const normalized = normalizeSourceEditableValue(definition, rawValue)
    if (!definition || !normalized.valid) return readonly()
    return {
      schemaVersion: 1,
      eligible: true,
      propertyId: definition.id,
      currentValue: normalized.value,
      reason: '',
    }
  },
})

function applyWorkflowSourceEditPolicy(part) {
  const propertyId = part?.editable?.propertyId ?? ''
  const definition = sourceEditablePropertyDefinition(propertyId)
  const anchorDefinition = sourceEditablePropertyForAnchor(part?.anchor?.path, part?.subject)
  const property = definition && anchorDefinition?.id === definition.id
    ? publicSourceEditableProperty(definition, part.editable.currentValue)
    : null
  if (!property) {
    return {
      ...part,
      editable: readonly(part?.editable?.reason || '현재 버전은 읽기 전용입니다.'),
    }
  }
  return {
    ...part,
    editable: {
      schemaVersion: 1,
      eligible: true,
      propertyId: property.id,
      currentValue: property.currentValue,
      property,
      reason: '',
    },
  }
}

export function sourceCodePartsForModuleWithWorkflowEditPolicy(catalog, moduleId, options) {
  const module = sourceCodePartsForModule(catalog, moduleId, options)
  if (!module) return null
  return {
    ...module,
    parts: module.parts.map(applyWorkflowSourceEditPolicy),
  }
}
