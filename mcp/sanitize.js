import { normalizeSystemNodeData, SYSTEM_ONTOLOGY_TEXT_FIELDS } from '../shared/systemOntology.js'
import { normalizeNodePresentation } from '../shared/systemLayers.js'
import { normalizeSystemParts } from '../shared/systemPartOntology.js'
import { sanitizeRichTextHtml } from '../shared/richTextSanitizer.js'

// HTML allowlist sanitizer for MCP-supplied node text
// (label/description/header/text). The browser applies the same policy through
// DOMParser before every HTML render; this server pass keeps stored data clean.
//
// Must preserve the editor's load-bearing markup exactly:
//   <div class="cl-item"><input type="checkbox">&nbsp;항목</div>   (checklist)
//   <details><summary>제목</summary><div>내용</div></details>       (toggle)

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

// Sanitize the HTML-bearing text fields of a node input/patch object, in place-ish.
export function sanitizeTextFields(obj) {
  if (!obj || typeof obj !== 'object') return obj
  delete obj.layerPortals
  delete obj.onOpenLayerPortal
  for (const key of new Set(['label', 'description', 'header', 'text', ...SYSTEM_ONTOLOGY_TEXT_FIELDS])) {
    if (typeof obj[key] === 'string') obj[key] = sanitizeHtml(obj[key])
  }
  if (typeof obj.url === 'string') obj.url = sanitizeExternalUrl(obj.url)
  if (Array.isArray(obj.systemParts)) obj.systemParts = normalizeSystemParts(obj.systemParts)
  if (Object.hasOwn(obj, 'presentation')) {
    const presentation = normalizeNodePresentation(obj.presentation)
    if (presentation) obj.presentation = presentation
    else delete obj.presentation
  }
  const systemPlainFields = ['systemKind', 'environment', 'sourceKind', 'provider', 'externalRef']
  const hasTrustZone = Object.hasOwn(obj, 'trustZone')
  if (hasTrustZone || systemPlainFields.some((key) => Object.hasOwn(obj, key))) {
    const normalized = normalizeSystemNodeData(obj)
    // A patch must not gain defaults for fields it did not provide, otherwise
    // Editing only externalRef could silently reset the Asset kind/source.
    for (const key of systemPlainFields) {
      if (Object.hasOwn(obj, key)) obj[key] = normalized[key]
    }
    if (hasTrustZone) {
      if (normalized.trustZone) obj.trustZone = normalized.trustZone
      else delete obj.trustZone
    }
  }
  return obj
}
