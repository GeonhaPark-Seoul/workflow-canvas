import { Avatar } from './AuthPanel'

export default function ParticipantAvatar({
  participant,
  size,
  canManageRestriction = false,
  onRemoveRestriction,
}) {
  const profile = participant.profile
    ?? (participant.email ? { glyph: participant.email[0]?.toUpperCase() } : null)
  const badge = participant.restrictView && (
    canManageRestriction && onRemoveRestriction ? (
      <button
        type="button"
        className="view-restricted-badge"
        title="시야 제한 해제"
        aria-label="시야 제한 해제"
        onClick={(event) => {
          event.stopPropagation()
          onRemoveRestriction(participant)
        }}
      >
        <span className="eye-off-mark" aria-hidden="true" />
      </button>
    ) : (
      <span
        className="view-restricted-badge"
        title="초대 구역으로 시야가 제한된 참여자"
        aria-label="시야 제한된 참여자"
      >
        <span className="eye-off-mark" aria-hidden="true" />
      </span>
    )
  )

  return (
    <span className="participant-avatar">
      <Avatar profile={profile} size={size} online={participant.userId ? participant.online : false} />
      {badge}
    </span>
  )
}
