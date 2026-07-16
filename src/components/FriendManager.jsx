import { useCallback, useEffect, useState } from 'react'
import {
  listFriendships,
  removeFriendship,
  respondFriendRequest,
  sendFriendRequest,
} from '../lib/friendships'

const actionButton = (color = '#3b82f6') => ({
  background: 'transparent', border: `1px solid ${color}55`, borderRadius: 4,
  color, fontSize: 10, fontWeight: 700, padding: '3px 6px', cursor: 'pointer',
  fontFamily: 'inherit', whiteSpace: 'nowrap',
})

export default function FriendManager({ active, AvatarComponent }) {
  const [connections, setConnections] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    if (!active) return
    setLoading(true)
    try {
      setConnections(await listFriendships())
      setError('')
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }, [active])

  useEffect(() => { refresh() }, [refresh])

  const run = async (operation, successMessage) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
      setNotice(successMessage)
      await refresh()
      return true
    } catch (nextError) {
      setError(nextError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const submit = (event) => {
    event.preventDefault()
    if (!email.includes('@')) { setError('올바른 이메일을 입력하세요.'); return }
    run(() => sendFriendRequest(email), '친구 요청을 보냈습니다.')
      .then((succeeded) => { if (succeeded) setEmail('') })
  }

  const incoming = connections.filter((item) => item.status === 'pending' && item.direction === 'incoming')
  const outgoing = connections.filter((item) => item.status === 'pending' && item.direction === 'outgoing')
  const friends = connections.filter((item) => item.status === 'accepted')

  const personRow = (item, actions) => (
    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #ffffff0e' }}>
      <AvatarComponent profile={item.profile} size={24} opacityOffState={false} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: '#ddd', fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.profile?.nickname || item.email || '이름 없음'}
        </div>
        <div style={{ color: '#666', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.email}</div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>{actions}</div>
    </div>
  )

  return (
    <section>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>친구</div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="이메일 주소"
          disabled={busy}
          style={{ flex: 1, minWidth: 0, background: '#12121a', border: '1px solid #ffffff22', borderRadius: 6, color: '#f0f0f0', fontSize: 11, padding: '7px 8px', outline: 'none', fontFamily: 'inherit' }}
        />
        <button type="submit" disabled={busy} style={actionButton()} title="친구 요청 보내기">요청</button>
      </form>
      {loading && <div style={{ color: '#555', fontSize: 11 }}>불러오는 중...</div>}
      {error && <div role="alert" style={{ color: '#ef4444', fontSize: 10, lineHeight: 1.45, marginBottom: 6 }}>{error}</div>}
      {notice && <div aria-live="polite" style={{ color: '#22c55e', fontSize: 10, lineHeight: 1.45, marginBottom: 6 }}>{notice}</div>}

      {incoming.map((item) => personRow(item, [
        <button key="accept" type="button" disabled={busy} style={actionButton('#22c55e')} onClick={() => run(() => respondFriendRequest(item.id, true), '친구가 되었습니다.')}>수락</button>,
        <button key="reject" type="button" disabled={busy} style={actionButton('#ef4444')} onClick={() => run(() => respondFriendRequest(item.id, false), '친구 요청을 거절했습니다.')}>거절</button>,
      ]))}
      {friends.map((item) => personRow(item, [
        <button key="remove" type="button" disabled={busy} title="친구 삭제" style={actionButton('#888')} onClick={() => run(() => removeFriendship(item.id), '친구 관계를 삭제했습니다.')}>삭제</button>,
      ]))}
      {outgoing.map((item) => personRow(item, [
        <span key="pending" style={{ color: '#777', fontSize: 9, whiteSpace: 'nowrap' }}>수락 대기</span>,
      ]))}
      {!loading && !connections.length && <div style={{ color: '#555', fontSize: 10 }}>등록된 친구가 없습니다.</div>}
    </section>
  )
}
