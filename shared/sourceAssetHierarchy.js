import { SYSTEM_COMPONENT_KIND_DEFS } from './systemOntology.js'

export const SOURCE_ASSET_HIERARCHY_SCHEMA_VERSION = 1
export const SOURCE_MODULE_ASSET_KINDS = Object.freeze(['file', 'function'])

const COMPONENT_KINDS = new Set(SYSTEM_COMPONENT_KIND_DEFS.map((item) => item.id))

function text(value, maximum = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function evidencePath(value) {
  const raw = text(value)
  const match = raw.match(/^(.+?\.(?:[cm]?[jt]sx?|mjs|cjs|sql|json|css|md))(?:[:#].*)?$/i)
  return match?.[1] ?? raw
}

export function normalizeSourceComponent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = text(value.id, 180)
  const label = text(value.label || value.name, 180)
  if (!id || !label || !COMPONENT_KINDS.has(value.kind)) return null
  return {
    id,
    label,
    kind: value.kind,
    parentId: text(value.parentId, 180),
    description: text(value.description, 800),
    technicalVersion: text(value.technicalVersion, 80),
    maturity: text(value.maturity, 40),
    codeEvidence: [...new Set((value.codeEvidence ?? []).map(evidencePath).filter(Boolean))].slice(0, 80),
  }
}

export function buildSourceAssetHierarchy({ entities = [], components = [], implementationRules = [] } = {}) {
  const files = new Map(entities.filter((item) => item.kind === 'file' && item.path).map((item) => [item.path, item]))
  const rulesByTarget = new Map()
  for (const rule of implementationRules) {
    if (!rule?.targetEntityId || !rule?.pathPattern) continue
    const list = rulesByTarget.get(rule.targetEntityId) ?? []
    list.push(new RegExp(rule.pathPattern, 'i'))
    rulesByTarget.set(rule.targetEntityId, list)
  }
  const catalog = []
  for (const raw of components) {
    const component = normalizeSourceComponent(raw)
    if (!component) continue
    const memberFiles = new Map()
    for (const path of component.codeEvidence) {
      if (files.has(path)) memberFiles.set(path, files.get(path))
    }
    for (const [path, file] of files) {
      if ((rulesByTarget.get(component.id) ?? []).some((pattern) => pattern.test(path))) memberFiles.set(path, file)
    }
    if (!memberFiles.size) continue
    const placements = new Map()
    for (const file of memberFiles.values()) {
      const key = `${file.area || 'project-foundation'}\u0000${file.subsystem || 'project-config'}`
      placements.set(key, (placements.get(key) ?? 0) + 1)
    }
    const [placement] = [...placements].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]
    const [area, subsystem] = placement.split('\u0000')
    catalog.push({ ...component, area, subsystem, moduleIds: [...memberFiles.values()].map((file) => file.id).sort() })
  }
  return {
    schemaVersion: SOURCE_ASSET_HIERARCHY_SCHEMA_VERSION,
    levels: ['product-area', 'subsystem', 'component', 'module', 'code-part'],
    moduleEntityKinds: SOURCE_MODULE_ASSET_KINDS,
    materialization: 'proposal-required',
    components: catalog.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id)),
  }
}

export function sourceEntityIsModuleAsset(manifest, entity) {
  return (manifest?.assetHierarchy?.moduleEntityKinds ?? SOURCE_MODULE_ASSET_KINDS).includes(entity?.kind)
}

export function sourceComponentsForSubsystem(manifest, area, subsystem, entities = []) {
  const visibleIds = new Set(entities.map((item) => item.id))
  return (manifest?.assetHierarchy?.components ?? [])
    .filter((item) => item.area === area && item.subsystem === subsystem)
    .map((item) => ({ ...item, moduleIds: item.moduleIds.filter((id) => visibleIds.has(id)) }))
    .filter((item) => item.moduleIds.length)
}
