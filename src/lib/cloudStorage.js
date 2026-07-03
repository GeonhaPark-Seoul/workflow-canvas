import { supabase } from './supabase'

export async function saveCanvas(userId, canvasId, name, nodes, edges, views = [], stageTypes) {
  const { error } = await supabase.from('canvases').upsert(
    { user_id: userId, canvas_id: canvasId, name, nodes, edges, views, stage_types: stageTypes, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,canvas_id' }
  )
  if (error) { console.error('[cloud] saveCanvas:', error.message); throw new Error('saveCanvas: ' + error.message) }
}

export async function loadAllCanvases(userId) {
  const { data, error } = await supabase
    .from('canvases')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true })
  if (error) { console.error('[cloud] loadAllCanvases:', error.message); throw new Error('loadAllCanvases: ' + error.message) }
  return data ?? []
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
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { console.error('[cloud] loadUserPrefs:', error.message); throw new Error('loadUserPrefs: ' + error.message) }
  return data
}
