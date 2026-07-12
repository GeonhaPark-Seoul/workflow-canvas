// Browser-side allowlist for rich-text node fields rendered as HTML.
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'font', 'span', 'div', 'p', 'br',
  'ul', 'ol', 'li', 'details', 'summary', 'input', 'img', 'a',
])
const TAG_ATTRS = {
  font: new Set(['color', 'size', 'face']), input: new Set(['type', 'checked']),
  img: new Set(['src', 'width', 'height']), a: new Set(['href']), details: new Set(['open']),
}
const GLOBAL_ATTRS = new Set(['style', 'class'])
const BARE_ATTRS = new Set(['checked', 'open'])
const DANGEROUS_VALUE = /javascript:|vbscript:|data:(?!image\/)/i
const DANGEROUS_STYLE = /expression|url\s*\((?!\s*['"]?data:image\/)/i
const SAFE_IMG_SRC = /^data:image\/(png|jpe?g|gif|webp);base64,/i
const SAFE_HREF = /^https?:/i

function sanitizeAttrs(tag, attrStr) {
  const out = []
  const re = /([a-zA-Z-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]*))?/g
  let match
  while ((match = re.exec(attrStr)) !== null) {
    const name = match[1].toLowerCase()
    const value = match[3] ?? match[4] ?? (match[2] ?? '')
    if (name.startsWith('on')) continue
    if (!(GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name))) continue
    if (BARE_ATTRS.has(name)) { out.push(name); continue }
    if (DANGEROUS_VALUE.test(value)) continue
    if (name === 'style' && DANGEROUS_STYLE.test(value)) continue
    if (tag === 'img' && name === 'src' && !SAFE_IMG_SRC.test(value)) return null
    if (tag === 'a' && name === 'href' && !SAFE_HREF.test(value)) continue
    if (tag === 'input' && name === 'type' && value.toLowerCase() !== 'checkbox') return null
    out.push(`${name}="${value.replace(/"/g, '&quot;')}"`)
  }
  return out
}

export function sanitizeHtml(html) {
  if (typeof html !== 'string' || !html) return html
  let result = html
    .replace(/<(script|style|iframe|object|embed|link|meta|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta|title)\b[^>]*\/?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  result = result.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g, (whole, slash, rawTag, attrStr) => {
    const tag = rawTag.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''
    if (slash) return `</${tag}>`
    const attrs = sanitizeAttrs(tag, attrStr)
    if (attrs === null || (tag === 'img' && !attrs.some((attr) => attr.startsWith('src=')))) return ''
    return `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`
  })
  return result
}

export function sanitizeNodeData(data) {
  if (!data || typeof data !== 'object') return data
  const next = { ...data }
  for (const key of ['label', 'description', 'header', 'text']) {
    if (typeof next[key] === 'string') next[key] = sanitizeHtml(next[key])
  }
  if (Array.isArray(next.parts)) {
    next.parts = next.parts.map((part) => ({ ...part, text: typeof part.text === 'string' ? sanitizeHtml(part.text) : part.text }))
  }
  return next
}
