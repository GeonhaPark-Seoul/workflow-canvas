import { useCallback, useMemo, useRef, useState } from 'react'
import { partitionDigitalTwinReviewItems } from '../../shared/digitalTwinReview.js'

const MIN_PANE_WIDTH = 360
const MIN_CANVAS_WIDTH = 320
const SPLITTER_WIDTH = 6

const CATEGORY_LABELS = {
  all: '전체',
  entity: '실체',
  relation: '관계',
  resource: '자원',
  security: '보안',
  runtime: '실행',
}

const CHANGE_LABELS = {
  added: '추가',
  changed: '변경',
  removed: '사라짐',
  evidence: '근거',
  warning: '주의',
}

const SEVERITY_COLORS = {
  critical: '#ef4444',
  attention: '#f59e0b',
  info: '#3b82f6',
}

const PROPOSAL_OPERATION_LABELS = {
  add_node: '노드 추가',
  add_edge: '관계 추가',
  add_part: '파츠 추가',
  replace_part: '파츠 교체',
}

function IconButton({ title, onClick, children }) {
  return (
    <button type="button" className="twin-review-icon-button" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  )
}

function ReviewRow({
  item,
  decision,
  canDecide,
  proposalPreviewed,
  proposalPlanError,
  onDecision,
  onClearDecision,
  onFocus,
  onPreviewProposal,
  onApplyProposal,
}) {
  const color = SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS.attention
  const replacesPart = item.proposal?.operations?.some((operation) => operation.action === 'replace_part')
  return (
    <article className="twin-review-row" style={{ '--review-accent': color }}>
      <div className="twin-review-row-heading">
        <span className="twin-review-severity" aria-hidden="true" />
        <div className="twin-review-title">{item.title}</div>
        <span className="twin-review-change-tag">{CHANGE_LABELS[item.changeType] ?? item.changeType}</span>
      </div>
      {item.summary && <div className="twin-review-summary">{item.summary}</div>}
      {item.evidence.length > 0 && (
        <div className="twin-review-evidence" aria-label="근거 참조">
          {item.evidence.slice(0, 4).map((entry) => <code key={entry.ref}>{entry.ref}</code>)}
          {item.evidence.length > 4 && <span>+{item.evidence.length - 4}</span>}
        </div>
      )}
      {proposalPreviewed && item.proposal && (
        <div className="twin-proposal-preview">
          <div className="twin-proposal-preview-heading">
            <strong>{replacesPart ? '변경 전 미리보기' : '추가 전 미리보기'}</strong>
            <span>
              노드 {item.proposal.counts.nodes} · 연결선 {item.proposal.counts.edges} · 파츠 {item.proposal.counts.parts ?? 0}
            </span>
          </div>
          {item.proposal.summary && <p>{item.proposal.summary}</p>}
          <div className="twin-proposal-operations">
            {item.proposal.operations.map((operation, index) => (
              <div key={`${operation.action}:${operation.node?.id ?? operation.edge?.id ?? operation.part?.id ?? index}`}>
                <span>{PROPOSAL_OPERATION_LABELS[operation.action] ?? '추가'}</span>
                <strong>{operation.label || operation.node?.id || operation.edge?.id || operation.part?.id}</strong>
              </div>
            ))}
          </div>
          <div className="twin-proposal-safety">
            {replacesPart
              ? '표시된 파츠의 현재 지문이 미리보기와 정확히 같을 때만 교체하며, 다른 노드·연결선·파츠는 바꾸지 않습니다.'
              : '기존 필드는 바꾸거나 삭제하지 않고 표시된 노드·연결선·파츠만 덧붙입니다.'}
          </div>
          {proposalPlanError && <div className="twin-proposal-error">{proposalPlanError}</div>}
          <div className="twin-proposal-preview-actions">
            <button type="button" onClick={() => onPreviewProposal(item)}>미리보기 닫기</button>
            {canDecide && !decision && (
              <button
                type="button"
                className="is-apply"
                disabled={!!proposalPlanError}
                title={replacesPart ? '표시된 파츠만 안전하게 교체' : '표시된 새 노드, 연결선, 파츠만 현재 지도에 추가'}
                onClick={() => onApplyProposal(item)}
              >
                지도에 적용
              </button>
            )}
          </div>
        </div>
      )}
      <div className="twin-review-actions">
        {item.focus && (
          <button type="button" title="관련 노드 또는 연결선을 캔버스에서 보기" onClick={() => onFocus(item)}>
            캔버스에서 보기
          </button>
        )}
        {item.proposal && (
          <button
            type="button"
            className={proposalPreviewed ? 'is-proposal-active' : ''}
            title="적용될 노드, 연결선, 파츠 변경을 저장하지 않고 캔버스에서 확인"
            onClick={() => onPreviewProposal(item)}
          >
            {proposalPreviewed ? '미리보기 중' : '수정안 보기'}
          </button>
        )}
        <span className="twin-review-action-spacer" />
        {decision ? (
          <>
            <span className={`twin-review-decision is-${decision.disposition}`}>
              {decision.disposition === 'reviewed' ? '확인함' : '무시'}
            </span>
            {canDecide && (
              <button type="button" title="이 항목을 다시 검토 대상으로 되돌리기" onClick={() => onClearDecision(item)}>
                되돌리기
              </button>
            )}
          </>
        ) : canDecide ? (
          <>
            <button type="button" title="현재 근거가 다시 바뀌기 전까지 검토 목록에서 숨기기" onClick={() => onDecision(item, 'ignored')}>
              무시
            </button>
            <button type="button" className="is-primary" title="현재 발견 결과를 확인한 것으로 기록하기" onClick={() => onDecision(item, 'reviewed')}>
              확인함
            </button>
          </>
        ) : (
          <span className="twin-review-readonly">읽기 전용</span>
        )}
      </div>
    </article>
  )
}

export default function DigitalTwinReviewPanel({
  review,
  reviewState,
  canDecide,
  side = 'right',
  onSideChange,
  onClose,
  onDecision,
  onClearDecision,
  onFocus,
  proposalPreview,
  proposalStatus,
  proposalPlanError,
  onPreviewProposal,
  onApplyProposal,
}) {
  const [paneWidth, setPaneWidth] = useState(440)
  const [tab, setTab] = useState('pending')
  const [category, setCategory] = useState('all')
  const dragRef = useRef(null)
  const partitions = useMemo(
    () => partitionDigitalTwinReviewItems(review.items, reviewState),
    [review.items, reviewState],
  )
  const processed = useMemo(
    () => [...partitions.reviewed, ...partitions.ignored],
    [partitions.reviewed, partitions.ignored],
  )
  const displayed = (tab === 'pending' ? partitions.pending : processed)
    .filter((item) => category === 'all' || item.category === category)
  const baselineLabel = review.source.baselineTrust === 'declared-not-server-verified'
    ? '설계 기준'
    : review.source.baselineTrust === 'unavailable'
      ? '기준 없음'
      : '검증 기준'

  const onSplitterDown = useCallback((event) => {
    dragRef.current = { startX: event.clientX, startWidth: paneWidth }
    event.preventDefault()
    const onMove = (moveEvent) => {
      if (!dragRef.current) return
      const delta = side === 'right'
        ? dragRef.current.startX - moveEvent.clientX
        : moveEvent.clientX - dragRef.current.startX
      const maximum = Math.max(MIN_PANE_WIDTH, window.innerWidth - MIN_CANVAS_WIDTH)
      setPaneWidth(Math.min(maximum, Math.max(MIN_PANE_WIDTH, dragRef.current.startWidth + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [paneWidth, side])

  const splitter = (
    <div
      className="twin-review-splitter"
      title="변경 검토 창 크기 조절"
      onPointerDown={onSplitterDown}
      style={{ width: SPLITTER_WIDTH }}
    />
  )

  return (
    <aside
      className="twin-review-pane"
      style={{
        width: paneWidth,
        minWidth: MIN_PANE_WIDTH,
        maxWidth: `calc(100vw - ${MIN_CANVAS_WIDTH}px)`,
        order: side === 'left' ? 0 : 2,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {side === 'right' && splitter}
      <div className="twin-review-content">
        <header className="twin-review-header">
          <div className="twin-review-header-title">
            <strong>변경 검토</strong>
            <span>{partitions.pending.length}</span>
          </div>
          <div className="twin-review-header-actions">
            <IconButton
              title={side === 'right' ? '변경 검토 창을 왼쪽으로 이동' : '변경 검토 창을 오른쪽으로 이동'}
              onClick={() => onSideChange(side === 'right' ? 'left' : 'right')}
            >
              {side === 'right' ? '←' : '→'}
            </IconButton>
            <IconButton title="변경 검토 닫기" onClick={onClose}>✕</IconButton>
          </div>
          <div className="twin-review-source-name">{review.source.label}</div>
          <code className="twin-review-snapshot" title="발견 스냅샷 ID">{review.source.snapshotId}</code>
        </header>

        <div className="twin-review-reality-band">
          <span className="is-discovered">{review.source.observationLabel}</span>
          <span>{review.source.runtimeLabel}</span>
          <span>{baselineLabel}</span>
        </div>

        <div className="twin-review-counts">
          <span>실체 <strong>{review.summary.node_findings}</strong></span>
          <span>관계 <strong>{review.summary.relation_findings}</strong></span>
          <span>미모델 <strong>{review.summary.unmodeled_resources}</strong></span>
        </div>

        {proposalStatus && (
          <div className={`twin-proposal-status is-${proposalStatus.type}`} role="status">
            {proposalStatus.message}
          </div>
        )}

        <div className="twin-review-controls">
          <div className="twin-review-segments" role="tablist" aria-label="검토 상태">
            <button type="button" role="tab" aria-selected={tab === 'pending'} className={tab === 'pending' ? 'is-active' : ''} onClick={() => setTab('pending')}>
              검토 필요 {partitions.pending.length}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'processed'} className={tab === 'processed' ? 'is-active' : ''} onClick={() => setTab('processed')}>
              처리됨 {processed.length}
            </button>
          </div>
          <select value={category} aria-label="변경 종류 필터" onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="twin-review-list">
          {displayed.length === 0 ? (
            <div className="twin-review-empty">
              {tab === 'pending' ? '새 변경 없음' : '처리된 항목 없음'}
            </div>
          ) : displayed.map((item) => (
            <ReviewRow
              key={item.id}
              item={item}
              decision={partitions.decisions[item.id] ?? null}
              canDecide={canDecide}
              proposalPreviewed={proposalPreview?.itemId === item.id && proposalPreview?.itemFingerprint === item.fingerprint}
              proposalPlanError={proposalPreview?.itemId === item.id ? proposalPlanError : null}
              onDecision={onDecision}
              onClearDecision={onClearDecision}
              onFocus={onFocus}
              onPreviewProposal={onPreviewProposal}
              onApplyProposal={onApplyProposal}
            />
          ))}
        </div>
      </div>
      {side === 'left' && splitter}
    </aside>
  )
}
