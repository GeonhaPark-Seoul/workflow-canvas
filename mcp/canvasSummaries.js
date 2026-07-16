const PAGE_SIZE = 500
const ID_BATCH_SIZE = 200

function missingSummaryFunction(error) {
  return /get_canvas_summaries|schema cache|could not find the function|PGRST202/i.test(String(error?.message ?? ''))
}

function summaryRow(row) {
  const count = (value) => value == null ? null : (Number.isFinite(Number(value)) ? Number(value) : null)
  return {
    canvas_id: row.canvas_id,
    name: row.name,
    node_count: count(row.node_count),
    edge_count: count(row.edge_count),
    updated_at: row.updated_at,
  }
}

async function fallbackMetadata(db, ownerId, canvasIds) {
  const rows = []
  const batches = canvasIds?.length
    ? Array.from({ length: Math.ceil(canvasIds.length / ID_BATCH_SIZE) }, (_, index) => (
        canvasIds.slice(index * ID_BATCH_SIZE, (index + 1) * ID_BATCH_SIZE)
      ))
    : [null]

  for (const ids of batches) {
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = db.from('canvases')
        .select('canvas_id, name, updated_at')
        .eq('user_id', ownerId)
        .order('updated_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (ids) query = query.in('canvas_id', ids)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []).map(summaryRow))
      if ((data?.length ?? 0) < PAGE_SIZE) break
    }
  }
  return rows
}

// Uses a service-role-only SQL function so JSON array counts are computed in
// Postgres rather than downloading every node and edge. During a rolling
// deploy, metadata-only fallback keeps the app working until SQL is installed.
export async function loadCanvasSummaries(db, { ownerId, canvasIds = null }) {
  const ids = canvasIds ? [...new Set(canvasIds.filter(Boolean))] : null
  if (ids && !ids.length) return []
  const { data, error } = await db.rpc('get_canvas_summaries', {
    p_user_id: ownerId,
    p_canvas_ids: ids,
  })
  if (!error) return (data ?? []).map(summaryRow)
  if (!missingSummaryFunction(error)) throw new Error(error.message)
  return fallbackMetadata(db, ownerId, ids)
}
