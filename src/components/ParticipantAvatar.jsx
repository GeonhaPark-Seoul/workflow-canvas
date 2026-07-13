import { Avatar } from './AuthPanel'

export default function ParticipantAvatar({
  participant,
  size,
  canManageRestriction = false,
  onToggleRestriction,
}) {
  const profile = participant.profile
    ?? (participant.email ? { glyph: participant.email[0]?.toUpperCase() } : null)
  const restricted = !!participant.restrictView
  const badge = canManageRestriction && onToggleRestriction ? (
      <button
        type="button"
        className={`view-restricted-badge${restricted ? '' : ' is-unrestricted'}`}
        title={restricted ? '시야 제한 해제' : '시야 제한 적용'}
        aria-label={restricted ? '시야 제한 해제' : '시야 제한 적용'}
        onClick={(event) => {
          event.stopPropagation()
          onToggleRestriction(participant, !restricted)
        }}
      >
        <span className={restricted ? 'eye-off-mark' : 'eye-mark'} aria-hidden="true" />
      </button>
    ) : restricted ? (
      <span
        className="view-restricted-badge"
        title="초대 구역으로 시야가 제한된 참여자"
        aria-label="시야 제한된 참여자"
      >
        <span className="eye-off-mark" aria-hidden="true" />
      </span>
    ) : null

  return (
    <span className="participant-avatar">
      <Avatar profile={profile} size={size} online={participant.userId ? participant.online : false} />
      {badge}
    </span>
  )
}
