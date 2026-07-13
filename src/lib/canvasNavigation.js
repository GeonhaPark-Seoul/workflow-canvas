const LAST_OPENED_PREFIX = 'wfc:last-opened-canvas:'

export function isSharedCanvasId(id) {
  return typeof id === 'string' && id.startsWith('shared:')
}

export function loadLastOpenedCanvas(userId) {
  if (!userId || typeof sessionStorage === 'undefined') return null
  try { return sessionStorage.getItem(`${LAST_OPENED_PREFIX}${userId}`) } catch { return null }
}

export function saveLastOpenedCanvas(userId, canvasId) {
  if (!userId || !canvasId || typeof sessionStorage === 'undefined') return
  try { sessionStorage.setItem(`${LAST_OPENED_PREFIX}${userId}`, canvasId) } catch {}
}

export function clearLastOpenedCanvas(userId) {
  if (!userId || typeof sessionStorage === 'undefined') return
  try { sessionStorage.removeItem(`${LAST_OPENED_PREFIX}${userId}`) } catch {}
}

// A tab-local choice wins because it is written synchronously before a canvas
// switch. Cloud preferences remain the cross-device fallback. Every candidate
// must still exist in the freshly loaded owner rows before it can be restored.
export function chooseOwnCanvasToRestore(rows, prefs, preferredId) {
  const ids = new Set((rows ?? []).map((row) => row.canvas_id))
  if (preferredId && !isSharedCanvasId(preferredId) && ids.has(preferredId)) return preferredId
  const cloudId = prefs?.active_canvas_id
  if (cloudId && ids.has(cloudId)) return cloudId
  return rows?.[0]?.canvas_id ?? null
}
