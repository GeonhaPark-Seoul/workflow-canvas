function elementFromTarget(target) {
  if (!target) return null
  return target.nodeType === 1 ? target : target.parentElement ?? null
}

function hasClass(element, className) {
  return !!element?.classList?.contains?.(className)
}

function nearestClass(element, className, root) {
  let current = element
  while (current) {
    if (hasClass(current, className)) return current
    if (current === root) break
    current = current.parentElement
  }
  return null
}

function axisCanScroll(element, style, deltaX, deltaY) {
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX)
  const overflow = vertical ? style?.overflowY : style?.overflowX
  if (!['auto', 'scroll', 'overlay'].includes(overflow)) return false
  return vertical
    ? element.scrollHeight > element.clientHeight
    : element.scrollWidth > element.clientWidth
}

// The canvas owns trackpad gestures by default. Native scrolling is reserved
// for a real overflow region inside a selected node or an open system-part
// editor. The decision deliberately ignores the current scroll position so a
// gesture at an inner boundary never leaks into a sudden canvas pan.
export function nativeWheelScrollTarget(target, root, deltaX, deltaY, getStyle = globalThis.getComputedStyle) {
  const start = elementFromTarget(target)
  if (!start || !root || typeof getStyle !== 'function') return null

  const node = nearestClass(start, 'react-flow__node', root)
  const selectedNode = hasClass(node, 'selected')
  const openPart = !!nearestClass(start, 'system-part-editor', root)
  if (!selectedNode && !openPart) return null

  let current = start
  while (current) {
    if (axisCanScroll(current, getStyle(current), deltaX, deltaY)) return current
    if (current === root) break
    current = current.parentElement
  }
  return null
}
