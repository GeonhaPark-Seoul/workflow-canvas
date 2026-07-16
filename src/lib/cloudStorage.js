import { supabase } from './supabase'
import { canvasWriteError } from './canvasSchemaGuard'

export class CanvasConflictError extends Error {
  constructor(message = '다른 곳에서 캔버스가 먼저 변경되었습니다.') {
    super(message)
    this.name = 'CanvasConflictError'
    this.code = 'CANVAS_CONFLICT'
  }
}

function nextRevision(expectedRevision) {
  const previous = Date.parse(expectedRevision ?? '')
  return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString()
}

export async function saveCanvas(userId, canvasId, name, nodes, edges, notes = [], views = [], stageTypes, expectedRevision = null) {
  const updatedAt = nextRevision(expectedRevision)
  const row = {
    user_id: userId,
    canvas_id: canvasId,
    name,
    nodes,
    edges,
    notes,
    views,
    stage_types: stageTypes,
    updated_at: updatedAt,
  }

  if (expectedRevision === null) {
    const { data, error } = await supabase.from('canvases').insert(row).select('updated_at').single()
    if (error?.code === '23505') throw new CanvasConflictError()
    if (error) { console.error('[cloud] saveCanvas insert:', error.message); throw canvasWriteError(error) }
    return data.updated_at
  }

  const { data, error } = await supabase.from('canvases')
    .update(row)
    .eq('user_id', userId)
    .eq('canvas_id', canvasId)
    .eq('updated_at', expectedRevision)
    .select('updated_at')
    .maybeSingle()
  if (error) { console.error('[cloud] saveCanvas update:', error.message); throw canvasWriteError(error) }
  if (!data) throw new CanvasConflictError()
  return data.updated_at
}

export async function loadCanvasSummaries(userId) {
  const rows = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('canvases')
      .select('canvas_id, name, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) { console.error('[cloud] loadCanvasSummaries:', error.message); throw new Error('loadCanvasSummaries: ' + error.message) }
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }
  return rows
}

export async function loadCanvasRow(userId, canvasId) {
  const { data, error } = await supabase.from('canvases')
    .select('user_id, canvas_id, name, nodes, edges, notes, views, stage_types, updated_at')
    .eq('user_id', userId)
    .eq('canvas_id', canvasId)
    .maybeSingle()
  if (error) throw new Error('loadCanvasRow: ' + error.message)
  return data
}

export async function deleteCanvas(userId, canvasId) {
  const { error } = await supabase.from('canvases').delete()
    .eq('user_id', userId).eq('canvas_id', canvasId)
  if (error) console.error('[cloud] deleteCanvas:', error.message)
}

export async function saveUserPrefs(userId, prefs) {
  const { error } = await supabase.from('user_prefs').upsert(
    { user_id: userId, ...prefs },
    { onConflict: 'user_id' }
  )
  if (error) { console.error('[cloud] saveUserPrefs:', error.message); throw new Error('saveUserPrefs: ' + error.message) }
}

export async function loadUserPrefs(userId) {
  const { data, error } = await supabase
    .from('user_prefs')
    .select('user_id, active_canvas_id, canvas_order, settings')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { console.error('[cloud] loadUserPrefs:', error.message); throw new Error('loadUserPrefs: ' + error.message) }
  return data
}
