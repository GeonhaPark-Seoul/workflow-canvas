export default function OpenInNotesButton({ visible, onOpen }) {
  if (!visible || !onOpen) return null
  return (
    <button
      type="button"
      className="node-open-notes nodrag nowheel"
      title="노트에서 열기"
      aria-label="노트에서 열기"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      <span aria-hidden="true">▤</span>
    </button>
  )
}
