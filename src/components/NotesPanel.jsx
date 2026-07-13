import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sanitizeExternalUrl, sanitizeHtml } from '../lib/sanitizeHtml'
import CanvasImage from './CanvasImage'

// ── Notes-app-style right-docked panel ───────────────────────────────────────
// LIST column (node titles, tree for stage / flat for memo & content) +
// resizable PAGE column (full note editor for the selected node).
// See task spec for full behavior; kept deliberately simple (not pixel-perfect).

const TYPE_LABEL = { stage: '단계', memo: '메모', content: '컨텐츠' }
const CONTENT_KIND_LABEL = { photo: '사진', database: '데이터베이스', browser: '브라우저' }
const NO_TITLE = '(제목 없음)'

function stripHtml(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = sanitizeHtml(html)
  return (div.textContent || div.innerText || '').trim()
}

function nodeTitle(node) {
  if (!node) return NO_TITLE
  if (node.type === 'stage') return stripHtml(node.data?.label) || NO_TITLE
  if (node.type === 'memo') return stripHtml(node.data?.header) || NO_TITLE
  if (node.type === 'content') return stripHtml(node.data?.header) || CONTENT_KIND_LABEL[node.data?.kind] || '컨텐츠'
  return NO_TITLE
}

function nodeBadge(node) {
  if (!node) return ''
  if (node.type === 'content') return `컨텐츠 · ${CONTENT_KIND_LABEL[node.data?.kind] ?? ''}`
  return TYPE_LABEL[node.type] ?? node.type
}

function bodyPreviewText(node) {
  if (!node) return ''
  if (node.type === 'stage') return stripHtml(node.data?.description)
  if (node.type === 'memo') return stripHtml(node.data?.text)
  if (node.type === 'content') {
    if (node.data?.kind === 'photo') return node.data?.src ? '[사진]' : ''
    if (node.data?.kind === 'browser') return node.data?.url ?? ''
    if (node.data?.kind === 'database') return '데이터베이스 (준비 중)'
  }
  return ''
}

// A "부품(part) 연결선" links two part handles — not part of note hierarchy.
function isPartEdge(e) {
  return !!e.data?.partsLink || (!!e.sourceHandle?.startsWith('p-') && !!e.targetHandle?.startsWith('p-'))
}

// ── Small building blocks ────────────────────────────────────────────────────
function IconBtn({ onClick, title, children, style }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'transparent', border: 'none', color: '#8b94a7', cursor: 'pointer',
        padding: '2px 6px', borderRadius: 4, fontSize: 13, lineHeight: 1, flexShrink: 0, ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#f0f0f0')}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#8b94a7')}
    >
      {children}
    </button>
  )
}

function ListRow({ title, depth, dim, expandable, expanded, onToggle, onClickTitle, onFocus, selected }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        paddingLeft: 8 + depth * 16, paddingRight: 6, height: 30,
        opacity: dim ? 0.6 : 1,
        background: selected ? '#ffffff12' : 'transparent',
        borderRadius: 6,
      }}
    >
      {expandable ? (
        <IconBtn title={expanded ? '접기' : '펼치기'} onClick={onToggle} style={{ width: 16, textAlign: 'center', padding: 0 }}>
          {expanded ? '▾' : '▸'}
        </IconBtn>
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} />
      )}
      <button
        onClick={onClickTitle}
        title={title}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none',
          color: '#e4e6ec', fontSize: 12.5, cursor: 'pointer', padding: '4px 2px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'inherit',
        }}
      >
        {title}
      </button>
      <IconBtn title="캔버스에서 보기" onClick={onFocus}>⌖</IconBtn>
    </div>
  )
}

// Recursive stage tree row (children = other stage nodes via source→target
// hierarchy edges; attachments = connected non-stage nodes, dimmer, leaves).
function StageTreeRow({ id, depth, byId, childrenMap, attachMap, expanded, onToggle, selectedId, onSelect, onFocusNode, ancestors }) {
  const node = byId.get(id)
  if (!node) return null
  const isCycle = ancestors.has(id)
  const kids = isCycle ? [] : (childrenMap.get(id) ?? [])
  const atts = isCycle ? [] : (attachMap.get(id) ?? [])
  const hasChildren = kids.length > 0 || atts.length > 0
  const isExpanded = expanded.has(id)
  const nextAncestors = useMemo(() => new Set([...ancestors, id]), [ancestors, id])

  return (
    <div>
      <ListRow
        title={nodeTitle(node)}
        depth={depth}
        dim={false}
        expandable={hasChildren}
        expanded={isExpanded}
        onToggle={() => onToggle(id)}
        onClickTitle={() => onSelect(id)}
        onFocus={() => onFocusNode(id)}
        selected={selectedId === id}
      />
      {isExpanded && hasChildren && (
        <div>
          {kids.map((cid) => (
            <StageTreeRow
              key={cid} id={cid} depth={depth + 1} byId={byId}
              childrenMap={childrenMap} attachMap={attachMap}
              expanded={expanded} onToggle={onToggle}
              selectedId={selectedId} onSelect={onSelect} onFocusNode={onFocusNode}
              ancestors={nextAncestors}
            />
          ))}
          {atts.map((aid) => {
            const anode = byId.get(aid)
            if (!anode) return null
            return (
              <ListRow
                key={aid}
                title={nodeTitle(anode)}
                depth={depth + 1}
                dim
                expandable={false}
                onClickTitle={() => onSelect(aid)}
                onFocus={() => onFocusNode(aid)}
                selected={selectedId === aid}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// Inline sub-note (page column "하위 노트"): recursive, read-only preview.
function SubNoteRow({ id, depth, byId, outMap, expanded, onToggle, onFocusNode, onOpen, ancestors }) {
  const node = byId.get(id)
  if (!node) return null
  const isCycle = ancestors.has(id)
  const kids = isCycle ? [] : (outMap.get(id) ?? [])
  const isExpanded = expanded.has(id)
  const dim = node.type !== 'stage'
  const nextAncestors = useMemo(() => new Set([...ancestors, id]), [ancestors, id])
  const preview = bodyPreviewText(node)

  return (
    <div style={{ marginLeft: depth * 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: dim ? 0.6 : 1, height: 26 }}>
        {kids.length > 0 ? (
          <IconBtn title={isExpanded ? '접기' : '펼치기'} onClick={() => onToggle(id)} style={{ width: 14, textAlign: 'center', padding: 0 }}>
            {isExpanded ? '▾' : '▸'}
          </IconBtn>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        <button
          onClick={() => onOpen(id)}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none',
            color: '#ccd0da', fontSize: 12, cursor: 'pointer', padding: '3px 2px', fontFamily: 'inherit',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {nodeTitle(node)}
        </button>
        <IconBtn title="캔버스에서 보기" onClick={() => onFocusNode(id)}>⌖</IconBtn>
      </div>
      {isExpanded && preview && (
        <div style={{ marginLeft: 18, marginBottom: 4, fontSize: 11.5, color: '#888', whiteSpace: 'pre-wrap', opacity: dim ? 0.6 : 1 }}>
          {preview}
        </div>
      )}
      {isExpanded && kids.map((cid) => (
        <SubNoteRow
          key={cid} id={cid} depth={depth + 1} byId={byId} outMap={outMap}
          expanded={expanded} onToggle={onToggle} onFocusNode={onFocusNode} onOpen={onOpen}
          ancestors={nextAncestors}
        />
      ))}
    </div>
  )
}

// ── Page column: full note editor for the selected node ────────────────────
// Keyed by node.id at the call site so switching pages remounts this fresh
// (simplest way to reset all local editing state).
function NotePage({ node, byId, outMap, isEditable, onUpdateNode, onFocusNode, onOpen, onBack }) {
  const titleSaveTimer = useRef(null)
  const bodySaveTimer = useRef(null)
  const pendingTitle = useRef(null)
  const pendingBody = useRef(null)

  const [subExpanded, setSubExpanded] = useState(() => new Set())
  const toggleSub = useCallback((id) => {
    setSubExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const titleField = node.type === 'stage' ? 'label' : 'header'
  const bodyField = node.type === 'stage' ? 'description' : node.type === 'memo' ? 'text' : null

  const flushPending = useCallback(() => {
    clearTimeout(titleSaveTimer.current)
    clearTimeout(bodySaveTimer.current)
    if (pendingTitle.current !== null) {
      onUpdateNode(node.id, { [titleField]: pendingTitle.current })
      pendingTitle.current = null
    }
    if (bodyField && pendingBody.current !== null) {
      onUpdateNode(node.id, { [bodyField]: pendingBody.current })
      pendingBody.current = null
    }
  }, [bodyField, node.id, onUpdateNode, titleField])

  useEffect(() => () => flushPending(), [flushPending])

  const scheduleTitleSave = (value) => {
    pendingTitle.current = value
    clearTimeout(titleSaveTimer.current)
    titleSaveTimer.current = setTimeout(() => {
      if (pendingTitle.current === null) return
      onUpdateNode(node.id, { [titleField]: pendingTitle.current })
      pendingTitle.current = null
    }, 400)
  }
  const scheduleBodySave = (html) => {
    if (!bodyField) return
    pendingBody.current = html
    clearTimeout(bodySaveTimer.current)
    bodySaveTimer.current = setTimeout(() => {
      if (pendingBody.current === null) return
      onUpdateNode(node.id, { [bodyField]: pendingBody.current })
      pendingBody.current = null
    }, 400)
  }

  const kids = outMap.get(node.id) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
        borderBottom: '1px solid #ffffff18', flexShrink: 0,
      }}>
        <IconBtn title="뒤로" onClick={onBack} style={{ fontSize: 16 }}>←</IconBtn>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: '#8b94a7',
          background: '#ffffff10', borderRadius: 4, padding: '2px 6px', flexShrink: 0,
        }}>
          {nodeBadge(node)}
        </span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#f0f0f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nodeTitle(node)}
        </div>
        <IconBtn title="캔버스에서 보기" onClick={() => onFocusNode(node.id)}>⌖</IconBtn>
        <IconBtn title="패널 닫기" onClick={onBack}>✕</IconBtn>
      </div>

      {/* Body (scrollable) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <input
          key={`title-${node.id}`}
          defaultValue={stripHtml(node.data?.[titleField])}
          disabled={!isEditable}
          onChange={(e) => scheduleTitleSave(e.target.value)}
          placeholder="제목"
          style={{
            width: '100%', background: '#12121a', border: '1px solid #ffffff18', borderRadius: 6,
            color: '#f0f0f0', fontSize: 15, fontWeight: 700, padding: '8px 10px', marginBottom: 10,
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />

        {(node.type === 'stage' || node.type === 'memo') && (
          <div
            key={`body-${node.id}`}
            contentEditable={isEditable}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.data?.[bodyField] ?? '') }}
            onInput={(e) => scheduleBodySave(e.currentTarget.innerHTML)}
            style={{
              minHeight: 160, background: '#12121a', border: '1px solid #ffffff18', borderRadius: 6,
              color: '#d8dae0', fontSize: 13, lineHeight: 1.6, padding: '10px 12px', outline: 'none',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          />
        )}

        {node.type === 'content' && node.data?.kind === 'photo' && (
          <div style={{ background: '#12121a', border: '1px solid #ffffff18', borderRadius: 6, padding: 12, textAlign: 'center' }}>
            {node.data?.storagePath || node.data?.src ? (
              <CanvasImage storagePath={node.data.storagePath} legacySrc={node.data.src} style={{ maxWidth: '100%', borderRadius: 6 }} />
            ) : (
              <div style={{ color: '#666', fontSize: 12, padding: '40px 0' }}>사진이 없습니다</div>
            )}
          </div>
        )}

        {node.type === 'content' && node.data?.kind === 'browser' && (
          <div style={{ background: '#12121a', border: '1px solid #ffffff18', borderRadius: 6, overflow: 'hidden' }}>
            {sanitizeExternalUrl(node.data?.url) ? (
              <>
                <a
                  href={sanitizeExternalUrl(node.data.url)} target="_blank" rel="noreferrer"
                  style={{ display: 'block', padding: '8px 10px', color: '#60a5fa', fontSize: 12, borderBottom: '1px solid #ffffff18', wordBreak: 'break-all' }}
                >
                  {sanitizeExternalUrl(node.data.url)}
                </a>
                <iframe
                  src={sanitizeExternalUrl(node.data.url)}
                  title="브라우저창"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  style={{ width: '100%', height: 420, border: 'none', display: 'block' }}
                />
              </>
            ) : (
              <div style={{ color: '#666', fontSize: 12, padding: '40px 0', textAlign: 'center' }}>URL이 없습니다</div>
            )}
          </div>
        )}

        {node.type === 'content' && node.data?.kind === 'database' && (
          // TODO: database 노드 편집 기능은 여기에 구현 (사용자가 추후 사양을 정할 예정)
          <div style={{ background: '#12121a', border: '1px solid #ffffff18', borderRadius: 6, padding: '40px 0', textAlign: 'center', color: '#666', fontSize: 12 }}>
            데이터베이스 (준비 중)
          </div>
        )}

        {/* 파츠 (stage only) — read-only placeholder */}
        {node.type === 'stage' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#666', textTransform: 'uppercase', marginBottom: 6 }}>파츠</div>
            {(node.data?.parts ?? []).length === 0 ? (
              <div style={{ fontSize: 12, color: '#555' }}>파츠가 없습니다</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {node.data.parts.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, background: '#ffffff10',
                      border: '1px solid #ffffff18', borderRadius: 999, padding: '4px 10px', fontSize: 12, color: '#ddd',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#8b94a7', flexShrink: 0 }} />
                    {stripHtml(p.text) || p.text}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#666' }}>파츠 기능은 준비 중입니다.</div>
          </div>
        )}

        {/* 하위 노트 (outgoing edges) */}
        {kids.length > 0 && (
          <div style={{ marginTop: 18, borderTop: '1px solid #ffffff18', paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#666', textTransform: 'uppercase', marginBottom: 6 }}>
              하위 노트
            </div>
            {kids.map((cid) => (
              <SubNoteRow
                key={cid} id={cid} depth={0} byId={byId} outMap={outMap}
                expanded={subExpanded} onToggle={toggleSub}
                onFocusNode={onFocusNode} onOpen={onOpen}
                ancestors={new Set([node.id])}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────
export default function NotesPanel({ type, nodes, edges, selectedId, onSelect, onClose, onFocusNode, onUpdateNode, isNodeEditable }) {
  const LIST_W = 260
  const SPLIT_W = 6
  const MIN_PAGE_W = 280

  const [pageWidth, setPageWidth] = useState(() => Math.max(MIN_PAGE_W, Math.round(window.innerWidth / 3)))
  const [expanded, setExpanded] = useState(() => new Set()) // stage-tree expand state
  const [narrow, setNarrow] = useState(() => window.innerWidth < 700)

  useEffect(() => {
    const fn = () => setNarrow(window.innerWidth < 700)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // Reset tree expand state whenever the panel is (re)opened for a type.
  useEffect(() => { setExpanded(new Set()) }, [type])

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const typeNodes = useMemo(() => nodes.filter((n) => n.type === type), [nodes, type])

  // Stage hierarchy: source→target edges between two stage nodes (excluding part links).
  const stageIds = useMemo(() => new Set(nodes.filter((n) => n.type === 'stage').map((n) => n.id)), [nodes])
  const hierEdges = useMemo(
    () => edges.filter((e) => !isPartEdge(e) && stageIds.has(e.source) && stageIds.has(e.target)),
    [edges, stageIds],
  )
  const childrenMap = useMemo(() => {
    const m = new Map()
    hierEdges.forEach((e) => { if (!m.has(e.source)) m.set(e.source, []); m.get(e.source).push(e.target) })
    return m
  }, [hierEdges])
  const hasIncoming = useMemo(() => new Set(hierEdges.map((e) => e.target)), [hierEdges])
  const stageRoots = useMemo(() => nodes.filter((n) => n.type === 'stage' && !hasIncoming.has(n.id)), [nodes, hasIncoming])

  // Non-stage nodes attached (via any non-part edge, either direction) to a stage.
  const attachMap = useMemo(() => {
    const m = new Map()
    edges.forEach((e) => {
      if (isPartEdge(e)) return
      const sIsStage = stageIds.has(e.source), tIsStage = stageIds.has(e.target)
      if (sIsStage && !tIsStage) { if (!m.has(e.source)) m.set(e.source, []); m.get(e.source).push(e.target) }
      else if (tIsStage && !sIsStage) { if (!m.has(e.target)) m.set(e.target, []); m.get(e.target).push(e.source) }
    })
    return m
  }, [edges, stageIds])

  // Generic outgoing map (any node type, source→target) for the page's 하위 노트.
  const outMap = useMemo(() => {
    const m = new Map()
    edges.forEach((e) => {
      if (isPartEdge(e)) return
      if (!m.has(e.source)) m.set(e.source, [])
      m.get(e.source).push(e.target)
    })
    return m
  }, [edges])

  // ── Splitter drag ──────────────────────────────────────────────────────────
  const dragRef = useRef(null)
  const onSplitterDown = useCallback((e) => {
    dragRef.current = { startX: e.clientX, startWidth: pageWidth }
    e.preventDefault()
    const onMove = (ev) => {
      if (!dragRef.current) return
      const dx = dragRef.current.startX - ev.clientX
      const maxW = Math.round(window.innerWidth * 0.7)
      const next = Math.min(maxW, Math.max(MIN_PAGE_W, dragRef.current.startWidth + dx))
      setPageWidth(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [pageWidth])

  const selectedNode = selectedId ? byId.get(selectedId) : null
  const pageOpen = !!selectedNode
  const showList = !narrow || !pageOpen

  const handleBack = () => onSelect(null)

  const totalWidth = LIST_W + (pageOpen ? SPLIT_W + pageWidth : 0)

  return (
    <div
      style={{
        position: 'fixed', right: 0, top: 0, height: '100vh',
        width: narrow ? (pageOpen ? '100vw' : LIST_W) : totalWidth,
        maxWidth: '100vw',
        display: 'flex', zIndex: 20,
        background: '#1a1a22', borderLeft: '1px solid #ffffff18',
        boxShadow: '-8px 0 32px #000a',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* LIST column */}
      {showList && (
        <div style={{ width: LIST_W, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 10px',
            borderBottom: '1px solid #ffffff18', flexShrink: 0,
          }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#f0f0f0' }}>
              {TYPE_LABEL[type] ?? type} <span style={{ color: '#666', fontWeight: 400 }}>({typeNodes.length})</span>
            </div>
            <IconBtn title="닫기" onClick={onClose} style={{ fontSize: 14 }}>✕</IconBtn>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
            {type === 'stage' ? (
              stageRoots.length === 0 ? (
                <div style={{ color: '#555', fontSize: 12, padding: '10px 12px' }}>단계 노드가 없습니다</div>
              ) : (
                stageRoots.map((n) => (
                  <StageTreeRow
                    key={n.id} id={n.id} depth={0} byId={byId}
                    childrenMap={childrenMap} attachMap={attachMap}
                    expanded={expanded} onToggle={toggleExpand}
                    selectedId={selectedId} onSelect={onSelect} onFocusNode={onFocusNode}
                    ancestors={new Set()}
                  />
                ))
              )
            ) : (
              typeNodes.length === 0 ? (
                <div style={{ color: '#555', fontSize: 12, padding: '10px 12px' }}>노드가 없습니다</div>
              ) : (
                typeNodes.map((n) => (
                  <ListRow
                    key={n.id}
                    title={nodeTitle(n)}
                    depth={0}
                    dim={false}
                    expandable={false}
                    onClickTitle={() => onSelect(n.id)}
                    onFocus={() => onFocusNode(n.id)}
                    selected={selectedId === n.id}
                  />
                ))
              )
            )}
          </div>
        </div>
      )}

      {/* Splitter */}
      {pageOpen && !narrow && (
        <div
          onPointerDown={onSplitterDown}
          style={{ width: SPLIT_W, flexShrink: 0, cursor: 'col-resize', background: '#ffffff08', touchAction: 'none' }}
        />
      )}

      {/* PAGE column */}
      {pageOpen && (
        <div style={{ width: narrow ? '100%' : pageWidth, flexShrink: 0, height: '100%', background: '#12121a', minWidth: 0 }}>
          <NotePage
            key={selectedNode.id}
            node={selectedNode}
            byId={byId}
            outMap={outMap}
            isEditable={isNodeEditable ? isNodeEditable(selectedNode.id) : true}
            onUpdateNode={onUpdateNode}
            onFocusNode={onFocusNode}
            onOpen={onSelect}
            onBack={handleBack}
          />
        </div>
      )}
    </div>
  )
}
