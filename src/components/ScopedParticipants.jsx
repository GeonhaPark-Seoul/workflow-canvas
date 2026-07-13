import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ParticipantAvatar from './ParticipantAvatar'

function relativeLastSeen(iso) {
  if (!iso) return '기록 없음'
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function participantKey(participant) {
  return participant.userId ? `user:${participant.userId}` : `email:${participant.email ?? ''}`
}

export default function ScopedParticipants({
  participants = [],
  canInvite = false,
  onInvite,
  scope,
  targetId,
  canManageRestrictions = false,
  onRemoveViewRestriction,
}) {
  const [open, setOpen] = useState(false)
  const people = useMemo(() => {
    const unique = new Map()
    participants.forEach((participant) => {
      const key = participantKey(participant)
      if (!unique.has(key)) unique.set(key, participant)
    })
    return [...unique.values()]
  }, [participants])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!people.length && !canInvite) return null

  const shown = people.slice(0, 2)
  const scopeLabel = scope === 'group' ? '그룹 참여자' : '노드 참여자'
  const avatar = (participant, size, allowManagement = true) => (
    <ParticipantAvatar
      participant={participant}
      size={size}
      canManageRestriction={allowManagement && canManageRestrictions && !!participant.userId && !participant.isOwner}
      onRemoveRestriction={onRemoveViewRestriction}
    />
  )

  return (
    <>
      <div
        className="nodrag nowheel"
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
          minHeight: 20, padding: '2px 4px', borderRadius: 10,
          background: '#111118cc', border: '1px solid #ffffff20',
          boxSizing: 'border-box',
        }}
      >
        {shown.map((participant) => (
          <button
            key={participantKey(participant)}
            type="button"
            title={participant.profile?.nickname || participant.email || (participant.isOwner ? '소유자' : '참여자')}
            onClick={(event) => { event.stopPropagation(); setOpen(true) }}
            style={{ display: 'flex', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            {avatar(participant, 16, false)}
          </button>
        ))}
        {people.length > 2 && (
          <button
            type="button"
            title={`참여자 ${people.length}명`}
            onClick={(event) => { event.stopPropagation(); setOpen(true) }}
            style={{
              minWidth: 18, height: 16, borderRadius: 8, border: '1px solid #ffffff22',
              background: '#ffffff10', color: '#aaa', fontSize: 8, padding: 0,
              lineHeight: '14px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {people.length > 101 ? '99+' : `+${people.length - 2}`}
          </button>
        )}
        {canInvite && onInvite && (
          <button
            type="button"
            title="공유 초대"
            onClick={(event) => {
              event.stopPropagation()
              onInvite(scope, targetId, event.currentTarget.getBoundingClientRect())
            }}
            style={{
              width: 16, height: 16, borderRadius: '50%', border: '1px dashed #666',
              background: 'transparent', color: '#aaa', fontSize: 11, padding: 0,
              lineHeight: '14px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            +
          </button>
        )}
      </div>

      {open && createPortal(
        <div
          className="nodrag nowheel"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1300, background: '#000000aa',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 'min(300px, calc(100vw - 24px))', maxHeight: '70vh', overflowY: 'auto', boxSizing: 'border-box',
            background: '#1a1a22', border: '1px solid #ffffff22', borderRadius: 8,
            padding: 16, boxShadow: '0 12px 48px #000d',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: '#f0f0f0', fontSize: 14, fontWeight: 700 }}>{scopeLabel} {people.length}</span>
              <button
                type="button"
                title="닫기"
                onClick={() => setOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            {people.map((participant) => {
              const nickname = participant.profile?.nickname || (participant.userId ? '이름 없음' : '초대 수락 전')
              const email = participant.email ?? participant.profile?.email ?? '-'
              const status = participant.userId
                ? (participant.online ? '접속 중' : `마지막 접속: ${relativeLastSeen(participant.profile?.lastSeenAt ?? participant.lastSeenAt)}`)
                : '초대 수락 전'
              return (
                <div
                  key={participantKey(participant)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #ffffff0e' }}
                >
                  {avatar(participant, 28)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#f0f0f0', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nickname}
                      </span>
                      {participant.isOwner && (
                        <span style={{ background: '#3b82f6', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                          소유자
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
                    <div style={{ color: participant.online ? '#22c55e' : '#666', fontSize: 10 }}>{status}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
