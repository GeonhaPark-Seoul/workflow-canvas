import { normalizeSystemNodeData, SYSTEM_ONTOLOGY_TEXT_FIELDS } from '../shared/systemOntology.js'

// HTML allowlist sanitizer for MCP-supplied node text (label/description/header/text).
//
// The app renders these fields with dangerouslySetInnerHTML, so MCP input is a
// stored-XSS surface. Rows are single-user and writes require the user's own
// bearer token, so this regex allowlist (self-XSS defense-in-depth) is enough
// for now. If canvases ever become shareable, replace with DOMPurify.
//
// Must preserve the editor's load-bearing markup exactly:
//   <div class="cl-item"><input type="checkbox">&nbsp;항목</div>   (checklist)
//   <details><summary>제목</summary><div>내용</div></details>       (toggle)

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'font', 'span', 'div', 'p', 'br',
  'ul', 'ol', 'li', 'details', 'summary', 'input', 'img', 'a',
])

// Per-tag extra attributes on top of the global style/class
const TAG_ATTRS = {
  font: new Set(['color', 'size', 'face']),
  input: new Set(['type', 'checked']),
  img: new Set(['src', 'width', 'height']),
  a: new Set(['href']),
  details: new Set(['open']),
}

const GLOBAL_ATTRS = new Set(['style', 'class'])
const BARE_ATTRS = new Set(['checked', 'open']) // valueless attributes to keep as-is

const DANGEROUS_VALUE = /javascript:|vbscript:|data:(?!image\/)/i
const DANGEROUS_STYLE = /expression|url\s*\((?!\s*['"]?data:image\/)/i
const SAFE_IMG_SRC = /^data:image\/(png|jpe?g|gif|webp);base64,/i
const SAFE_HREF = /^https?:/i

function sanitizeAttrs(tag, attrStr) {
  const out = []
  const re = /([a-zA-Z-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]*))?/g
  let m
  while ((m = re.exec(attrStr)) !== null) {
    if (!m[0].trim()) continue
    const name = m[1].toLowerCase()
    const value = m[3] ?? m[4] ?? (m[2] ?? '')
    if (name.startsWith('on')) continue
    const allowed = GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name)
    if (!allowed) continue
    if (BARE_ATTRS.has(name)) { out.push(name); continue }
    if (DANGEROUS_VALUE.test(value)) continue
    if (name === 'style' && DANGEROUS_STYLE.test(value)) continue
    if (tag === 'img' && name === 'src' && !SAFE_IMG_SRC.test(value)) return null // drop whole tag
    if (tag === 'a' && name === 'href' && !SAFE_HREF.test(value)) continue
    if (tag === 'input' && name === 'type' && value.toLowerCase() !== 'checkbox') return null
    out.push(`${name}="${value.replace(/"/g, '&quot;')}"`)
  }
  return out
}

export function sanitizeHtml(html) {
  if (typeof html !== 'string' || !html) return html
  let s = html
  // Strip dangerous containers with their content, then comments
  s = s.replace(/<(script|style|iframe|object|embed|link|meta|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  s = s.replace(/<(script|style|iframe|object|embed|link|meta|title)\b[^>]*\/?>/gi, '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  // Rewrite every remaining tag against the allowlist
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g, (whole, slash, rawTag, attrStr) => {
    const tag = rawTag.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return '' // drop tag markup, keep surrounding text
    if (slash) return `</${tag}>`
    const attrs = sanitizeAttrs(tag, attrStr)
    if (attrs === null) return '' // tag rejected outright (bad img src / non-checkbox input)
    // img without a surviving src is useless — drop it
    if (tag === 'img' && !attrs.some((a) => a.startsWith('src='))) return ''
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`
  })
  return s
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
  for (const key of new Set(['label', 'description', 'header', 'text', ...SYSTEM_ONTOLOGY_TEXT_FIELDS])) {
    if (typeof obj[key] === 'string') obj[key] = sanitizeHtml(obj[key])
  }
  if (typeof obj.url === 'string') obj.url = sanitizeExternalUrl(obj.url)
  const systemPlainFields = ['systemKind', 'environment', 'sourceKind', 'provider', 'externalRef']
  if (systemPlainFields.some((key) => Object.hasOwn(obj, key))) {
    const normalized = normalizeSystemNodeData(obj)
    // A patch must not gain defaults for fields it did not provide, otherwise
    // editing only externalRef could silently reset the entity kind/source.
    for (const key of systemPlainFields) {
      if (Object.hasOwn(obj, key)) obj[key] = normalized[key]
    }
  }
  return obj
}
