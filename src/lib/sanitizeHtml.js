import { normalizeSystemNodeData, SYSTEM_ONTOLOGY_TEXT_FIELDS } from '../../shared/systemOntology.js'
import { normalizeIntentNodeData } from '../../shared/intentOntology.js'
import { normalizeNodePresentation } from '../../shared/systemLayers.js'
import { normalizeSystemParts } from '../../shared/systemPartOntology.js'
import { sanitizeRichTextHtml } from '../../shared/richTextSanitizer.js'

export function sanitizeHtml(html) {
  return sanitizeRichTextHtml(html)
}

export function sanitizeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : ''
  } catch {
    return ''
  }
}

export function sanitizeNodeData(data) {
  if (!data || typeof data !== 'object') return data
  let next = { ...data }
  delete next.twinRuntime
  delete next.systemPartRuntime
  delete next.canRunSystemChecks
  delete next.onCheckSystemPart
  delete next.layerPortals
  delete next.onOpenLayerPortal
  delete next.securityOverlay
  for (const key of new Set(['label', 'description', 'header', 'text', ...SYSTEM_ONTOLOGY_TEXT_FIELDS])) {
    if (typeof next[key] === 'string') next[key] = sanitizeHtml(next[key])
  }
  if (typeof next.url === 'string') next.url = sanitizeExternalUrl(next.url)
  if (Array.isArray(next.parts)) {
    next.parts = next.parts.map((part) => ({ ...part, text: typeof part.text === 'string' ? sanitizeHtml(part.text) : part.text }))
  }
  if (Array.isArray(next.systemParts)) next.systemParts = normalizeSystemParts(next.systemParts)
  if (Object.hasOwn(next, 'presentation')) {
    const presentation = normalizeNodePresentation(next.presentation)
    if (presentation) next.presentation = presentation
    else delete next.presentation
  }
  if (next.systemKind != null || next.sourceKind != null || next.externalRef != null || next.trustZone != null) {
    next = normalizeSystemNodeData(next)
  }
  if (next.intentSchemaVersion != null || next.intentKind != null || next.statement != null || next.intentVersions != null) {
    next = normalizeIntentNodeData(next)
  }
  return next
}
