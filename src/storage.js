// ── Multi-canvas localStorage layer ─────────────────────────────────────────
// Each canvas stores its nodes/edges/stageTypes under its own key, so canvases
// are fully independent (including their own set of stage-node types). A list
// key tracks canvas ids + names; an active key remembers the last-opened canvas.

const LIST_KEY = 'workflow-canvas-list'
const ACTIVE_KEY = 'workflow-canvas-active'
const LEGACY_KEY = 'workflow-canvas' // pre-multi-canvas single store
const LEGACY_TYPES_KEY = 'workflow-canvas-types' // pre-per-canvas global stage types
const OWNER_KEY = 'workflow-canvas-owner-id' // authenticated account owning this local mirror
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

export function loadCanvasData(id) { return read(dataKey(id)) }
export function saveCanvasData(id, data) { write(dataKey(id), data) }
export function deleteCanvasData(id) { remove(dataKey(id)) }

export function loadCanvasList() { return read(LIST_KEY) }
export function saveCanvasList(list) { write(LIST_KEY, list) }
export function loadActiveId() { return read(ACTIVE_KEY) }
export function saveActiveId(id) { write(ACTIVE_KEY, id) }
export function loadCanvasStorageOwner() { return read(OWNER_KEY) }
export function saveCanvasStorageOwner(userId) { write(OWNER_KEY, userId) }

// Canvas data is a cache for a signed-in account, not a cross-account workspace.
// Delete it on account changes while leaving unrelated app/site localStorage alone.
export function clearCanvasStorage() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('workflow-canvas-data-')) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
    ;[LIST_KEY, ACTIVE_KEY, LEGACY_KEY, LEGACY_TYPES_KEY, LOD_KEY, OWNER_KEY].forEach((key) => localStorage.removeItem(key))
  } catch {}
}

export function resetCanvasStorage(seeds) {
  clearCanvasStorage()
  return initCanvases(seeds)
}

const LOD_KEY = 'wfc:lodThreshold'
export function loadLodThreshold() {
  const v = read(LOD_KEY)
  if (v == null) return 0.55
  return Math.min(Math.max(Number(v), 0), 0.9)
}
export function saveLodThreshold(v) { write(LOD_KEY, Math.min(Math.max(Number(v), 0), 0.9)) }

// Returns { list, activeId }. On first run, seeds canvases from legacy
// single-canvas data (if any) or the provided demo seeds. `seeds` is an array
// of { name, nodes, edges }; the first becomes the active canvas.
export function initCanvases(seeds) {
  // A persisted owner means this is a signed-in user's cache. Never show it
  // while the auth session is still being resolved on a fresh page load.
  if (loadCanvasStorageOwner()) clearCanvasStorage()
  const list = loadCanvasList()
  if (list && list.length) {
    let activeId = loadActiveId()
    if (!list.find((c) => c.id === activeId)) activeId = list[0].id
    migrateLegacyStageTypes(activeId)
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

// One-time migration: stage types used to be a single list shared by every
// canvas. Fold that legacy value into the active canvas so a prior
// customization isn't silently lost, then drop the legacy key so every other
// (and future) canvas starts from the built-in defaults, as intended.
function migrateLegacyStageTypes(activeId) {
  const legacyTypes = read(LEGACY_TYPES_KEY)
  if (!legacyTypes) return
  const data = read(dataKey(activeId))
  if (data && !data.stageTypes) write(dataKey(activeId), { ...data, stageTypes: legacyTypes })
  remove(LEGACY_TYPES_KEY)
}
