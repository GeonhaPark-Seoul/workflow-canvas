import { supabase } from './supabase'

// Phase 1: tiny presence helper for the sharing/invite feature. Not wired
// into the app yet (phase 2 will use it to glow invite icons for online
// invitees). Dependency-free beyond the supabase client already in use.

// Joins the presence channel for a canvas and reports who's online.
// `onlineCallback` is called with an array of `{ user_id, email }` on every
// sync (initial join, and whenever someone else joins/leaves). It may also
// be passed as a ref object (`{ current: [] }`) — if so, `.current` is set
// instead of calling it as a function.
// Returns `{ unsubscribe }`.
export function joinCanvasPresence({ ownerId, canvasId, user, onlineRef_or_callback }) {
  const channel = supabase.channel(`presence:${ownerId}:${canvasId}`, {
    config: { presence: { key: user.id } },
  })

  const report = () => {
    const state = channel.presenceState()
    const online = Object.values(state)
      .flat()
      .map((p) => ({ user_id: p.user_id, email: p.email }))

    if (typeof onlineRef_or_callback === 'function') {
      onlineRef_or_callback(online)
    } else if (onlineRef_or_callback && typeof onlineRef_or_callback === 'object') {
      onlineRef_or_callback.current = online
    }
  }

  channel
    .on('presence', { event: 'sync' }, report)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ user_id: user.id, email: user.email })
      }
    })

  return {
    unsubscribe: () => { supabase.removeChannel(channel) },
  }
}
