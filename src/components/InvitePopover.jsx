import { useState, useEffect, useCallback, useMemo } from 'react'
import { listShares, deleteShare, listShareMembers } from '../lib/shares'
import { createCanvasInvitation } from '../lib/sharedCanvasApi'
import { listFriendships } from '../lib/friendships'
import { Avatar } from './AuthPanel'

// Sharing controls positioned near the canvas/group/node header. Online state
// comes from presence.js; accepted members are resolved through shares.js.

const SCOPE_LABEL = {
  canvas: '캔버스 공유',
  group: '그룹 공유',
  node: '노드 공유',
}

export default function InvitePopover({ scope, targetId, ownerId, canvasId, isOwner, onClose, onlineUserIds, onSharesChanged }) {
  const [shares, setShares] = useState([])
  const [members, setMembers] = useState([]) // claimed members across all my shares for this canvas
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  const [restrictView, setRestrictView] = useState(false)

  const [creatingLink, setCreatingLink] = useState(false)
  const [linkUrl, setLinkUrl] = useState(null)
  const [linkShareId, setLinkShareId] = useState(null)
  const [copied, setCopied] = useState(false)

  const membersByShare = useMemo(() => {
    const grouped = new Map()
    members.forEach((member) => {
      const current = grouped.get(member.shareId)
      if (current) current.push(member)
      else grouped.set(member.shareId, [member])
    })
    return grouped
  }, [members])

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([
      isOwner ? listShares(canvasId) : Promise.resolve([]),
      isOwner ? listShareMembers(canvasId) : Promise.resolve([]),
      listFriendships().catch(() => []),
    ])
      .then(([all, mem, connections]) => {
        const scopedShares = all.filter((s) => s.scope === scope && (s.target_id ?? null) === (targetId ?? null))
        const linkShare = scopedShares.find((s) => s.link_token)
        setShares(scopedShares)
        setLinkShareId(linkShare?.id ?? null)
        setLinkUrl(linkShare?.link_token ? `${location.origin}/#share=${linkShare.link_token}` : null)
        setMembers(mem)
        setFriends(connections.filter((item) => item.status === 'accepted'))
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [canvasId, isOwner, scope, targetId])

  useEffect(() => { refresh() }, [refresh])

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!email.includes('@')) { setError('올바른 이메일을 입력하세요'); return }
    setInviting(true)
    setError(null)
    try {
      await createCanvasInvitation(ownerId, canvasId, {
        scope, targetId, email, restrictView, kind: 'email',
      })
      setEmail('')
      refresh()
      onSharesChanged?.()
    } catch (e2) {
      setError(e2.message)
    } finally {
      setInviting(false)
    }
  }

  const handleCreateLink = async () => {
    setCreatingLink(true)
    setError(null)
    try {
      const { share, url } = await createCanvasInvitation(ownerId, canvasId, {
        scope, targetId, restrictView, kind: 'link',
      })
      setLinkUrl(url ? `${location.origin}${url}` : null)
      setLinkShareId(share.id)
      refresh()
      onSharesChanged?.()
    } catch (e2) {
      setError(e2.message)
    } finally {
      setCreatingLink(false)
    }
  }

  const handleCopy = () => {
    if (!linkUrl) return
    navigator.clipboard.writeText(linkUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDelete = async (id) => {
    setError(null)
    try {
      await deleteShare(id)
      if (id === linkShareId) {
        setLinkUrl(null)
        setLinkShareId(null)
      }
      refresh()
      onSharesChanged?.()
    } catch (e2) {
      setError(e2.message)
    }
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 280,
        background: '#1e1e2a',
        border: '1px solid #ffffff22',
        borderRadius: 10,
        padding: '12px 14px',
        boxShadow: '0 8px 32px #000c',
        fontFamily: 'inherit',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ color: '#f0f0f0', fontSize: 13, fontWeight: 700 }}>{SCOPE_LABEL[scope] ?? '공유'}</span>
        <button
          onClick={onClose}
          title="닫기"
          style={{ background: 'transparent', border: 'none', color: '#666', fontSize: 14, cursor: 'pointer', padding: 2, lineHeight: 1 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ccc')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
        >
          ✕
        </button>
      </div>

      {friends.length > 0 && (
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 8, marginBottom: 2 }} aria-label="친구 빠른 선택">
          {friends.map((friend) => (
            <button
              key={friend.id}
              type="button"
              title={`${friend.profile?.nickname || friend.email} 선택`}
              onClick={() => setEmail(friend.email ?? '')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, background: '#ffffff0a', border: '1px solid #ffffff18', borderRadius: 6, color: '#bbb', fontSize: 10, padding: '4px 6px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Avatar profile={friend.profile} size={16} opacityOffState={false} />
              <span>{friend.profile?.nickname || friend.email}</span>
            </button>
          ))}
        </div>
      )}

      {/* Email invite */}
      <form onSubmit={handleInvite} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소"
          style={{
            flex: 1, minWidth: 0, background: '#12121a', border: '1px solid #ffffff22',
            borderRadius: 6, color: '#f0f0f0', fontSize: 12, padding: '7px 9px',
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={inviting}
          style={{
            background: '#3b82f622', border: '1px solid #3b82f666', borderRadius: 6,
            color: '#3b82f6', fontSize: 12, fontWeight: 600, padding: '0 12px',
            cursor: inviting ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          {inviting ? '...' : '초대'}
        </button>
      </form>

      {/* Link share */}
      {isOwner && (linkUrl ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            readOnly
            value={linkUrl}
            onFocus={(e) => e.target.select()}
            style={{
              flex: 1, minWidth: 0, background: '#12121a', border: '1px solid #ffffff22',
              borderRadius: 6, color: '#999', fontSize: 11, padding: '7px 9px',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleCopy}
            style={{
              background: copied ? '#22c55e22' : '#ffffff14', border: '1px solid #ffffff22', borderRadius: 6,
              color: copied ? '#22c55e' : '#ccc', fontSize: 12, fontWeight: 600, padding: '0 10px',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {copied ? '복사됨' : '복사'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleCreateLink}
          disabled={creatingLink}
          style={{
            width: '100%', background: 'transparent', border: '1px dashed #ffffff33', borderRadius: 6,
            color: '#aaa', fontSize: 12, fontWeight: 600, padding: '8px 0',
            cursor: creatingLink ? 'default' : 'pointer', fontFamily: 'inherit', marginBottom: 10,
          }}
        >
          {creatingLink ? '생성 중...' : '🔗 공유 링크 만들기'}
        </button>
      ))}

      {/* Restrict view checkbox — meaningless for canvas scope (the invited
          region IS the whole canvas, so there is no "outside" to hide). */}
      {scope !== 'canvas' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={restrictView}
            onChange={(e) => setRestrictView(e.target.checked)}
            style={{ accentColor: '#a855f7', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 11, color: '#aaa' }}>시야를 초대 구역으로 제한 (구역 밖은 도형만 표시)</span>
        </label>
      )}

      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{error}</div>
      )}

      {isOwner && <div style={{ height: 1, background: '#ffffff18', margin: '2px 0 8px' }} />}

      {/* Existing shares */}
      {isOwner && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
        {loading && <div style={{ fontSize: 11, color: '#555' }}>불러오는 중...</div>}
        {!loading && shares.length === 0 && (
          <div style={{ fontSize: 11, color: '#555' }}>아직 공유되지 않았습니다</div>
        )}
        {!loading && shares.map((s) => {
          const isOnline = !!onlineUserIds && (s.memberUserIds ?? []).some((uid) => onlineUserIds.has(uid))
          return (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 6px', borderRadius: 6, background: '#ffffff08',
              }}
            >
              <span
                title={isOnline ? '온라인' : '오프라인'}
                style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: isOnline ? '#22c55e' : '#444',
                  boxShadow: isOnline ? '0 0 6px 2px #22c55eaa' : 'none',
                  transition: 'background 0.2s, box-shadow 0.2s',
                }}
              />
              <span style={{ fontSize: 12, flexShrink: 0 }}>{s.link_token ? '🔗' : '✉'}</span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12, color: '#ddd',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {s.link_token ? '공유 링크' : s.invitee_email}
              </span>
              {s.restrict_view && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#a855f7', background: '#a855f722',
                  border: '1px solid #a855f744', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                }}>
                  시야제한
                </span>
              )}
              {(membersByShare.get(s.id) ?? []).map((m) => (
                <span key={m.userId} title={m.profile?.nickname || m.profile?.email || ''} style={{ flexShrink: 0, display: 'flex' }}>
                  <Avatar profile={m.profile} size={16} />
                </span>
              ))}
              <button
                onClick={() => handleDelete(s.id)}
                title="삭제"
                style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 11, cursor: 'pointer', padding: '2px 3px', flexShrink: 0 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>}
    </div>
  )
}
