export function canvasSnapshotSignature(data = {}) {
  return JSON.stringify({
    nodes: data.nodes ?? [],
    edges: data.edges ?? [],
    views: data.views ?? [],
    stageTypes: data.stageTypes ?? null,
  })
}

export function sameCanvasSnapshot(left, right) {
  return canvasSnapshotSignature(left) === canvasSnapshotSignature(right)
}

export function appendHistorySnapshot(stack, pointer, snapshot, limit = 100) {
  const next = [...stack.slice(0, pointer + 1), snapshot]
  return next.length > limit ? next.slice(next.length - limit) : next
}
