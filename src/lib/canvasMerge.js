const MISSING = Symbol('missing')

const same = (left, right) => {
  if (left === MISSING || right === MISSING) return left === right
  return JSON.stringify(left) === JSON.stringify(right)
}

const plainObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
)

function mergeValue(base, local, remote, path, conflicts) {
  if (same(local, remote)) return local
  if (same(local, base)) return remote
  if (same(remote, base)) return local

  // Two editors may independently add different keys to a JSON object that
  // did not exist in the base snapshot yet. Treat an absent/null base as an
  // empty object so disjoint additions merge; edits to the same leaf still
  // take the normal conflict path below.
  const objectBase = plainObject(base)
    ? base
    : (base === MISSING || base === null ? {} : null)
  if (objectBase && plainObject(local) && plainObject(remote)) {
    const result = {}
    const keys = new Set([...Object.keys(objectBase), ...Object.keys(local), ...Object.keys(remote)])
    for (const key of keys) {
      const merged = mergeValue(
        Object.hasOwn(objectBase, key) ? objectBase[key] : MISSING,
        Object.hasOwn(local, key) ? local[key] : MISSING,
        Object.hasOwn(remote, key) ? remote[key] : MISSING,
        `${path}.${key}`,
        conflicts,
      )
      if (merged !== MISSING) result[key] = merged
    }
    return result
  }

  conflicts.push(path)
  return local
}

function mergeItemsById(baseItems = [], localItems = [], remoteItems = [], path, conflicts) {
  const base = new Map(baseItems.map((item) => [item.id, item]))
  const local = new Map(localItems.map((item) => [item.id, item]))
  const remote = new Map(remoteItems.map((item) => [item.id, item]))
  const orderedIds = [...remote.keys(), ...local.keys()].filter((id, index, all) => all.indexOf(id) === index)
  const result = []

  for (const id of orderedIds) {
    const merged = mergeValue(
      base.has(id) ? base.get(id) : MISSING,
      local.has(id) ? local.get(id) : MISSING,
      remote.has(id) ? remote.get(id) : MISSING,
      `${path}.${id}`,
      conflicts,
    )
    if (merged !== MISSING) result.push(merged)
  }
  return result
}

export function mergeCanvasSnapshots(base = {}, local = {}, remote = {}) {
  const conflicts = []
  const merged = {
    name: mergeValue(base.name ?? '', local.name ?? '', remote.name ?? '', 'name', conflicts),
    nodes: mergeItemsById(base.nodes, local.nodes, remote.nodes, 'nodes', conflicts),
    edges: mergeItemsById(base.edges, local.edges, remote.edges, 'edges', conflicts),
    notes: mergeItemsById(base.notes, local.notes, remote.notes, 'notes', conflicts),
    views: mergeValue(base.views ?? [], local.views ?? [], remote.views ?? [], 'views', conflicts),
    stageTypes: mergeValue(base.stageTypes ?? null, local.stageTypes ?? null, remote.stageTypes ?? null, 'stageTypes', conflicts),
  }
  return { merged, conflicts: [...new Set(conflicts)] }
}
