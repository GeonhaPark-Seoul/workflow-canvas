// ── Multi-canvas localStorage layer ─────────────────────────────────────────
// Each canvas stores its nodes/edges under its own key, so canvases are fully
// independent. A list key tracks canvas ids + names; an active key remembers
// the last-opened canvas. Stage types stay global (shared across canvases).

const LIST_KEY = 'workflow-canvas-list'
const ACTIVE_KEY = 'workflow-canvas-active'
const TYPES_KEY = 'workflow-canvas-types'
const LEGACY_KEY = 'workflow-canvas' // pre-multi-canvas single store
const dataKey = (id) => `workflow-canvas-data-${id}`

export const uid = () => `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function read(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null } catch { return null }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}
function remove(key) {
  try { localStorage.removeItem(key) } catch {}
}

export function loadStageTypes() { return read(TYPES_KEY) }
export function saveStageTypes(types) { write(TYPES_KEY, types) }

export function loadCanvasData(id) { return read(dataKey(id)) }
export function saveCanvasData(id, data) { write(dataKey(id), data) }
export function deleteCanvasData(id) { remove(dataKey(id)) }

export function loadCanvasList() { return read(LIST_KEY) }
export function saveCanvasList(list) { write(LIST_KEY, list) }
export function loadActiveId() { return read(ACTIVE_KEY) }
export function saveActiveId(id) { write(ACTIVE_KEY, id) }

// Returns { list, activeId }. On first run, seeds canvases from legacy
// single-canvas data (if any) or the provided demo seeds. `seeds` is an array
// of { name, nodes, edges }; the first becomes the active canvas.
export function initCanvases(seeds) {
  const list = loadCanvasList()
  if (list && list.length) {
    let activeId = loadActiveId()
    if (!list.find((c) => c.id === activeId)) activeId = list[0].id
    return { list, activeId }
  }

  // Migrate a pre-multi-canvas single store into one canvas.
  const legacy = read(LEGACY_KEY)
  if (legacy) {
    const id = uid()
    const newList = [{ id, name: '캔버스 1' }]
    saveCanvasList(newList)
    saveActiveId(id)
    saveCanvasData(id, legacy)
    remove(LEGACY_KEY)
    return { list: newList, activeId: id }
  }

  // Fresh install: seed all demo canvases.
  const seedArr = Array.isArray(seeds) ? seeds : [seeds]
  const newList = seedArr.map((s, i) => ({ id: `${uid()}-${i}`, name: s.name }))
  newList.forEach((c, i) => saveCanvasData(c.id, { nodes: seedArr[i].nodes, edges: seedArr[i].edges }))
  saveCanvasList(newList)
  saveActiveId(newList[0].id)
  return { list: newList, activeId: newList[0].id }
}
