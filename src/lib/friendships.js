import { supabase } from './supabase'

export async function listFriendships() {
  const { data, error } = await supabase.rpc('list_my_friendships')
  if (error) throw new Error('list_my_friendships: ' + error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.other_user_id,
    status: row.status,
    direction: row.direction,
    email: row.email,
    profile: {
      nickname: row.nickname,
      glyph: row.glyph,
      color: row.color,
      email: row.email,
      lastSeenAt: row.last_seen_at,
    },
  }))
}

export async function sendFriendRequest(email) {
  const { data, error } = await supabase.rpc('send_friend_request', { p_email: String(email ?? '').trim() })
  if (error) throw new Error('친구 요청을 보낼 수 없습니다.')
  return data
}

export async function respondFriendRequest(friendshipId, accept) {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_friendship_id: friendshipId,
    p_accept: !!accept,
  })
  if (error) throw new Error('친구 요청에 응답할 수 없습니다.')
  return data === true
}

export async function removeFriendship(friendshipId) {
  const { error } = await supabase.rpc('remove_friendship', { p_friendship_id: friendshipId })
  if (error) throw new Error('친구 관계를 삭제할 수 없습니다.')
}
