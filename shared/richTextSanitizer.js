// Shared rich-text policy. Browsers use DOMParser so malformed markup is
// interpreted before it is allowed; server-side callers use the conservative
// fallback as storage hygiene. Render-time browser sanitization is authoritative.
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'font', 'span', 'div', 'p', 'br',
  'ul', 'ol', 'li', 'details', 'summary', 'input', 'img', 'a',
])

const REMOVE_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'title',
  'svg', 'math', 'template', 'noscript',
])

const TAG_ATTRS = {
  font: new Set(['color', 'size', 'face']),
  input: new Set(['type', 'checked']),
  img: new Set(['src', 'width', 'height']),
  a: new Set(['href']),
  details: new Set(['open']),
}

const GLOBAL_ATTRS = new Set(['style', 'class'])
const BARE_ATTRS = new Set(['checked', 'open'])
const SAFE_CLASSES = new Set(['cl-item'])
const SAFE_STYLE_PROPERTIES = new Set([
  'color', 'background-color', 'font-size', 'font-family', 'font-weight',
  'font-style', 'text-decoration', 'text-align', 'vertical-align',
])
const SAFE_IMG_SRC = /^data:image\/(png|jpe?g|gif|webp);base64,/i
const SAFE_HREF = /^https?:/i
const UNSAFE_CSS_VALUE = /url\s*\(|expression\s*\(|var\s*\(|@import|behavior\s*:|-moz-binding|[{}<>\\]|!important|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i

function safeClassName(value) {
  return String(value ?? '').split(/\s+/).filter((name) => SAFE_CLASSES.has(name)).join(' ')
}

function safeFontSize(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (/^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/.test(normalized)) return true
  const match = /^(\d+(?:\.\d+)?)(px|em|rem|%)$/.exec(normalized)
  if (!match) return false
  const amount = Number(match[1])
  const limits = { px: 96, em: 6, rem: 6, '%': 600 }
  return amount > 0 && amount <= limits[match[2]]
}

function safeStyleValue(property, value) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized.length > 200 || UNSAFE_CSS_VALUE.test(normalized)) return false
  if (property === 'font-size') return safeFontSize(normalized)
  if (property === 'text-align') return /^(left|right|center|justify|start|end)$/i.test(normalized)
  if (property === 'vertical-align') return /^(baseline|sub|super|text-top|text-bottom|middle|top|bottom)$/i.test(normalized)
  return /^[#(),.%\s/'"a-zA-Z0-9_-]+$/.test(normalized)
}

export function sanitizeRichTextStyle(value) {
  const declarations = []
  for (const declaration of String(value ?? '').split(';')) {
    const separator = declaration.indexOf(':')
    if (separator < 1) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const propertyValue = declaration.slice(separator + 1).trim()
    if (!SAFE_STYLE_PROPERTIES.has(property) || !safeStyleValue(property, propertyValue)) continue
    declarations.push(`${property}: ${propertyValue}`)
  }
  return declarations.join('; ')
}

function sanitizeAttribute(tag, rawName, rawValue) {
  const name = String(rawName ?? '').toLowerCase()
  const value = String(rawValue ?? '')
  if (!name || name.startsWith('on')) return null
  if (!(GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name))) return null
  if (BARE_ATTRS.has(name)) return { name, value: '' }
  if (name === 'class') {
    const className = safeClassName(value)
    return className ? { name, value: className } : null
  }
  if (name === 'style') {
    const style = sanitizeRichTextStyle(value)
    return style ? { name, value: style } : null
  }
  if (tag === 'img' && name === 'src') return SAFE_IMG_SRC.test(value) ? { name, value } : false
  if (tag === 'a' && name === 'href') return SAFE_HREF.test(value) ? { name, value } : null
  if (tag === 'input' && name === 'type') return value.toLowerCase() === 'checkbox' ? { name, value: 'checkbox' } : false
  if (tag === 'font' && name === 'size' && !/^[1-7]$/.test(value)) return null
  if ((tag === 'img' && (name === 'width' || name === 'height')) && !/^\d{1,4}(?:\.\d+)?%?$/.test(value)) return null
  if (value.length > 500 || /[<>\u0000-\u001f]/.test(value)) return null
  return { name, value }
}

function sanitizeAttributeList(tag, attributes) {
  const clean = []
  for (const attribute of attributes) {
    const result = sanitizeAttribute(tag, attribute.name, attribute.value)
    if (result === false) return null
    if (result) clean.push(result)
  }
  if (tag === 'img' && !clean.some((attribute) => attribute.name === 'src')) return null
  if (tag === 'input' && !clean.some((attribute) => attribute.name === 'type')) return null
  return clean
}

function sanitizeWithDomParser(html, Parser) {
  const document = new Parser().parseFromString(String(html), 'text/html')
  const cleanChildren = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType !== 1) continue
      const tag = child.localName?.toLowerCase() ?? ''
      if (REMOVE_WITH_CONTENT.has(tag)) {
        child.remove()
        continue
      }
      if (!ALLOWED_TAGS.has(tag)) {
        cleanChildren(child)
        child.replaceWith(...child.childNodes)
        continue
      }
      const attributes = sanitizeAttributeList(tag, [...child.attributes].map(({ name, value }) => ({ name, value })))
      if (attributes === null) {
        child.remove()
        continue
      }
      for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name)
      for (const attribute of attributes) child.setAttribute(attribute.name, attribute.value)
      cleanChildren(child)
    }
  }
  cleanChildren(document.body)
  return document.body.innerHTML
}

function sanitizeFallback(html) {
  let result = String(html)
  const dangerous = [...REMOVE_WITH_CONTENT].join('|')
  result = result
    .replace(new RegExp(`<(${dangerous})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '')
    .replace(new RegExp(`<(${dangerous})\\b[^>]*\\/?>`, 'gi'), '')
    .replace(/<!--[\s\S]*?-->/g, '')

  return result.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g, (whole, slash, rawTag, attrText) => {
    const tag = rawTag.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''
    if (slash) return `</${tag}>`
    const attributes = []
    const matcher = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g
    let match
    while ((match = matcher.exec(attrText)) !== null) {
      attributes.push({ name: match[1], value: match[2] ?? match[3] ?? match[4] ?? '' })
    }
    const clean = sanitizeAttributeList(tag, attributes)
    if (clean === null) return ''
    const serialized = clean.map(({ name, value }) => (
      BARE_ATTRS.has(name) ? name : `${name}="${value.replace(/"/g, '&quot;')}"`
    ))
    return `<${tag}${serialized.length ? ` ${serialized.join(' ')}` : ''}>`
  })
}

export function sanitizeRichTextHtml(html) {
  if (typeof html !== 'string' || !html) return html
  const Parser = typeof globalThis.DOMParser === 'function' ? globalThis.DOMParser : null
  return Parser ? sanitizeWithDomParser(html, Parser) : sanitizeFallback(html)
}
