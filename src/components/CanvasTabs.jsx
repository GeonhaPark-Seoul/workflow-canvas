import { useState, useRef, useEffect } from 'react'
import ParticipantAvatar from './ParticipantAvatar'

// Compact count formatter: 1000 → 1k, 1500 → 1.5k, 1000000 → 1m (1 decimal,
// trailing .0 stripped).
const formatCount = (n) => {
  const fmt = (v, suffix) => `${(Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, '')}${suffix}`
  if (n >= 1000000000) return fmt(n / 1000000000, 'b')
  if (n >= 1000000) return fmt(n / 1000000, 'm')
  if (n >= 1000) return fmt(n / 1000, 'k')
  return String(n)
}

function textContent(value) {
  if (typeof value !== 'string' || !value) return ''
  const doc = new DOMParser().parseFromString(value, 'text/html')
  return (doc.body.textContent ?? '').trim()
}

function targetName(node, targetId) {
  if (!node) return targetId ? `삭제되었거나 볼 수 없는 대상 (${targetId})` : '대상 없음'
  const raw = node.type === 'memo' || node.type === 'content' ? node.data?.header : node.data?.label
  return textContent(raw) || targetId || '제목 없음'
}

function grantsFor(participant) {
  if (participant.isOwner) return []
  return participant.grants?.length ? participant.grants : [participant]
}

export default function CanvasTabs({
  canvases, activeId, onSwitch, onAdd, onRename, onDelete, mobile,
  sharedCanvases = [], onInvite,
  participants = [], nodes = [], sharedOutIds = new Set(),
  onLeaveShared = () => {}, onToggleMemberEdit = () => {}, onKickMember = () => {},
  onToggleViewRestriction = () => {},
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [value, setValue] = useState('')
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const [peopleOpen, setPeopleOpen] = useState(false) // 참여자 전체 목록 모달
  const peopleRef = useRef(null)

  useEffect(() => {
    if (editingId && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editingId])

  // Participants modal: close on outside click / Escape.
  useEffect(() => {
    if (!peopleOpen) return
    const onDown = (e) => {
      if (peopleRef.current && !peopleRef.current.contains(e.target)) setPeopleOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setPeopleOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [peopleOpen])

  // '방금 전' / 'N분 전' / 'N시간 전' / 'N일 전', or '기록 없음' with no data.
  const relativeLastSeen = (iso) => {
    if (!iso) return '기록 없음'
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (min < 1) return '방금 전'
    if (min < 60) return `${min}분 전`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}시간 전`
    return `${Math.floor(hr / 24)}일 전`
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') { setOpen(false); setEditingId(null) } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const startRename = (c, e) => { e.stopPropagation(); setEditingId(c.id); setValue(c.name) }
  const commit = () => {
    if (editingId && value.trim()) onRename(editingId, value.trim())
    setEditingId(null)
  }

  const activeCanvas = canvases.find((c) => c.id === activeId) ?? sharedCanvases.find((c) => c.id === activeId) ?? canvases[0]
  const isOwnActive = canvases.some((c) => c.id === activeId)

  // People bar: owner leftmost, then one more (online preferred, else the
  // earliest invite). 3+ participants collapse to just these two — the full
  // list lives in the participants modal (click any avatar).
  const ownerP = participants.find((p) => p.isOwner)
  const othersP = participants.filter((p) => !p.isOwner)
  const secondP = othersP.find((p) => p.online) ?? othersP[0]
  const shownPeople = participants.length >= 3
    ? [ownerP, secondP].filter(Boolean)
    : [ownerP, ...othersP.filter((p) => p !== ownerP)].filter(Boolean)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const avatarOf = (p, size) => {
    const grants = grantsFor(p)
    const hasCanvasGrant = grants.some((grant) => grant.scope === 'canvas')
    const scopedGrants = grants.filter((grant) => grant.scope === 'group' || grant.scope === 'node')
    const participant = {
      ...p,
      restrictView: !hasCanvasGrant && scopedGrants.length > 0 && scopedGrants.every((grant) => grant.restrictView),
    }
    return <ParticipantAvatar
      participant={participant}
      size={size}
      canManageRestriction={isOwnActive && !!p.userId && !p.isOwner && !hasCanvasGrant && scopedGrants.length > 0}
      onToggleRestriction={onToggleViewRestriction}
    />
  }

  const grantLabel = (grant) => {
    if (grant.scope === 'canvas') return '캔버스 전체 초대'
    const kind = grant.scope === 'group' ? '그룹 초대' : '노드 초대'
    return `${kind} · ${targetName(nodeById.get(grant.targetId), grant.targetId)}`
  }

  // Own canvases the owner has shared out (any active canvas_shares row)
  // move into the "공유 캔버스" section alongside canvases shared TO me.
  const ownRegular = canvases.filter((c) => !sharedOutIds.has(c.id))
  const ownShared = canvases.filter((c) => sharedOutIds.has(c.id))

  const renderOwnRow = (c, { shared }) => {
    const active = c.id === activeId
    return (
      <div
        key={c.id}
        onClick={() => { if (editingId !== c.id) { onSwitch(c.id); setOpen(false); setEditingId(null) } }}
        title="캔버스 전환"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          cursor: editingId === c.id ? 'default' : 'pointer',
          background: active ? '#3b82f622' : 'transparent',
          borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#ffffff0a' }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
      >
        {editingId === c.id ? (
          <input
            ref={inputRef}
            aria-label="캔버스 이름"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditingId(null) }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              background: '#2a2a36', border: '1px solid #3b82f6', borderRadius: 4,
              color: '#f0f0f0', fontSize: 12, padding: '2px 6px', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <>
            {shared && <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }} title="공유 중">↑</span>}
            <span style={{ flex: 1, color: active ? '#fff' : '#aaa', fontSize: 13, fontWeight: active ? 700 : 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
          </>
        )}

        {editingId !== c.id && (
          <button
            type="button"
            onClick={(e) => startRename(c, e)}
            title="이름 변경"
            aria-label={`\"${c.name}\" 이름 변경`}
            style={{
              background: 'transparent', border: 'none', color: '#666',
              cursor: 'pointer', padding: '1px 2px', fontSize: 12, lineHeight: 1, flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#60a5fa')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
          >
            ✎
          </button>
        )}

        {canvases.length > 1 && editingId !== c.id && (
          <button
            onClick={(e) => { e.stopPropagation(); if (window.confirm(`"${c.name}" 캔버스를 삭제할까요?`)) onDelete(c.id) }}
            title="삭제"
            style={{
              background: 'transparent', border: 'none', color: '#555',
              cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
          >
            ✕
          </button>
        )}
      </div>
    )
  }

  const showPeopleBar = participants.length > 0 || (isOwnActive && onInvite)

  return (
    <>
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: mobile ? 0 : 20,
        left: mobile ? 0 : 20,
        right: mobile ? 0 : 'auto',
        zIndex: 10,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <div style={{ position: 'relative', flex: mobile ? 1 : 'none', minWidth: 0 }}>
        {/* Collapsed trigger button */}
        <button
          className="main-hover-control"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: mobile ? '100%' : 'auto',
            background: '#1a1a22',
            border: '1px solid #ffffff18',
            borderRadius: mobile ? (open ? '0 0 0 0' : '0 0 12px 12px') : (open ? '12px 12px 0 0' : 12),
            padding: mobile ? 'calc(env(safe-area-inset-top, 0px) + 6px) 12px 6px' : '6px 12px',
            boxShadow: open ? 'none' : '0 4px 24px #000a',
            backdropFilter: 'blur(8px)',
            color: '#f0f0f0',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            transition: 'border-radius 0.1s',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ flex: 1, textAlign: 'left' }}>{activeCanvas?.name ?? '캔버스'}</span>
          <span style={{ color: '#888', fontSize: 11, flexShrink: 0 }}>▾</span>
        </button>

        {/* Expanded dropdown panel */}
        {open && (
          <div
            style={{
              position: mobile ? 'relative' : 'absolute',
              top: mobile ? 0 : '100%',
              left: 0,
              right: mobile ? 0 : 'auto',
              minWidth: mobile ? '100%' : 220,
              maxHeight: '60vh',
              overflowY: 'auto',
              background: '#1a1a22',
              border: '1px solid #ffffff18',
              borderTop: mobile ? '1px solid #ffffff18' : 'none',
              borderRadius: mobile ? '0 0 12px 12px' : '0 12px 12px 12px',
              boxShadow: '0 8px 32px #000c',
              backdropFilter: 'blur(8px)',
              zIndex: 11,
            }}
          >
            {ownRegular.map((c) => renderOwnRow(c, { shared: false }))}

            {/* Shared canvases: mine shared out + canvases shared to me */}
            {(ownShared.length > 0 || sharedCanvases.length > 0) && (
              <>
                <div style={{ padding: '6px 12px 4px', borderTop: '1px solid #ffffff10', color: '#666', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
                  공유 캔버스
                </div>
                {ownShared.map((c) => renderOwnRow(c, { shared: true }))}
                {sharedCanvases.map((c) => {
                  const active = c.id === activeId
                  return (
                    <div
                      key={c.id}
                      onClick={() => { onSwitch(c.id); setOpen(false) }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 12px',
                        cursor: 'pointer',
                        background: active ? '#3b82f622' : 'transparent',
                        borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#ffffff0a' }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ fontSize: 12, color: '#fff', flexShrink: 0 }}>↓</span>
                      <span style={{
                        flex: 1, color: active ? '#fff' : '#aaa', fontSize: 13, fontWeight: active ? 700 : 500,
                        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.name}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (window.confirm('이 공유에서 나갈까요?')) onLeaveShared(c.id) }}
                        title="나가기"
                        style={{
                          background: 'transparent', border: 'none', color: '#555',
                          cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, flexShrink: 0,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </>
            )}

            {/* Add canvas row */}
            <div
              onClick={() => { onAdd(); setOpen(false) }}
              style={{
                padding: '7px 12px',
                borderTop: '1px solid #ffffff10',
                color: '#888',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'color 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
            >
              + 새 캔버스
            </div>
          </div>
        )}
      </div>

      {/* People bar: avatars + invite, separate from the trigger button */}
      {showPeopleBar && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            background: '#1a1a22',
            border: '1px solid #ffffff18',
            borderRadius: 12,
            padding: mobile ? 'calc(env(safe-area-inset-top, 0px) + 6px) 8px 6px' : '5px 8px',
            boxShadow: '0 4px 24px #000a',
            backdropFilter: 'blur(8px)',
            boxSizing: 'border-box',
          }}
        >
          {shownPeople.map((p) => (
            <span
              className="main-avatar-control"
              key={p.userId ?? p.email}
              onClick={(e) => { e.stopPropagation(); setPeopleOpen(true) }}
              title={p.profile?.nickname || p.email || (p.isOwner ? '소유자' : '')}
              style={{ cursor: 'pointer', display: 'flex' }}
            >
              {avatarOf(p, 20)}
            </span>
          ))}
          {isOwnActive && onInvite && (
            <span
              className="main-avatar-control"
              onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); onInvite('canvas', null, rect) }}
              title="초대"
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '1px dashed #666',
                color: '#888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                lineHeight: 1,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              +
            </span>
          )}
        </div>
      )}
      </div>

      {/* Participants modal: full list, click any avatar to open */}
      {peopleOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000000aa',
            zIndex: 1001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            ref={peopleRef}
            style={{
              background: '#1a1a22',
              border: '1px solid #ffffff22',
              borderRadius: 14,
              width: 300,
              maxHeight: '70vh',
              overflowY: 'auto',
              padding: 16,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: '#f0f0f0', fontSize: 14, fontWeight: 700 }}>참여자 {formatCount(participants.length)}</span>
              <button
                onClick={() => setPeopleOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {participants.map((p) => {
              const nickname = p.profile?.nickname || '이름 없음'
              const email = p.email ?? p.profile?.email ?? '-'
              const lastSeen = p.online ? '접속 중' : `마지막 접속: ${relativeLastSeen(p.profile?.lastSeenAt ?? p.lastSeenAt)}`
              const grants = grantsFor(p)
              return (
                <div
                  key={p.userId ?? p.email}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #ffffff0e' }}
                >
                  {avatarOf(p, 28)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#f0f0f0', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nickname}
                      </span>
                      {p.isOwner && (
                        <span style={{ background: '#3b82f6', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                          소유자
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {email}
                    </div>
                    <div style={{ color: '#666', fontSize: 10 }}>{lastSeen}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                      {p.isOwner ? (
                        <span className="participant-scope-tag">캔버스 소유자</span>
                      ) : grants.map((grant) => (
                        <span key={grant.shareId ?? `${grant.scope}:${grant.targetId ?? ''}`} className="participant-scope-tag">
                          {grantLabel(grant)} · {grant.canEdit === false ? '읽기' : '편집'}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isOwnActive && p.shareId && p.userId && !p.isOwner && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {grants.length === 1 && (
                        <button
                          onClick={() => onToggleMemberEdit(p)}
                          title="편집 권한 전환"
                          style={{
                            background: 'transparent', border: '1px solid #3b82f655', borderRadius: 4,
                            color: '#3b82f6', fontSize: 10, fontWeight: 600, padding: '3px 6px',
                            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                          }}
                        >
                          {p.canEdit ? '편집' : '읽기'}
                        </button>
                      )}
                      <button
                        onClick={() => { if (window.confirm(`"${nickname}"님을 추방할까요?`)) onKickMember(p) }}
                        title="추방"
                        style={{
                          background: 'transparent', border: '1px solid #ef444455', borderRadius: 4,
                          color: '#ef4444', fontSize: 10, fontWeight: 600, padding: '3px 6px',
                          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                      >
                        추방
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
