export default function OpenSourceTwinButton({ visible, entry, onOpen }) {
  if (!visible || !entry || !onOpen) return null
  return (
    <button
      type="button"
      className="node-open-source-twin nodrag nowheel"
      title={`${entry.panelTitle}에서 ${entry.actionLabel} 열기`}
      aria-label={`${entry.panelTitle}에서 ${entry.actionLabel} 열기`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(entry)
      }}
    >
      {entry.actionLabel}
    </button>
  )
}
