import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sanitizeExternalUrl, sanitizeHtml } from '../lib/sanitizeHtml'
import { uploadCanvasImage } from '../lib/imageStorage'
import CanvasImage from './CanvasImage'
import {
  SYSTEM_ENVIRONMENT_DEFS,
  SYSTEM_KIND_DEFS,
  SYSTEM_SOURCE_DEFS,
  systemKindDefinition,
  systemNodeReality,
} from '../../shared/systemOntology.js'

// ── Notes-app-style split pane ───────────────────────────────────────────────
// LIST column (node titles, tree for stage / flat for memo & content) +
// resizable PAGE column (full note editor for the selected node).
// The pane can be resized and moved to either side of the canvas.

const TYPE_LABEL = { stage: '단계', memo: '메모', content: '컨텐츠', system: '시스템' }
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
  if (node.type === 'system') return stripHtml(node.data?.label) || NO_TITLE
  return NO_TITLE
}

function nodeBadge(node) {
  if (!node) return ''
  if (node.type === 'content') return `컨텐츠 · ${CONTENT_KIND_LABEL[node.data?.kind] ?? ''}`
  if (node.type === 'system') return `시스템 · ${systemKindDefinition(node.data?.systemKind).label}`
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
  if (node.type === 'system') return stripHtml(node.data?.purpose || node.data?.description)
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
      onPointerDown={(event) => event.stopPropagation()}
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

function ListRow({
  title, depth, dim, expandable, expanded, onToggle, onClickTitle, onFocus, selected,
  noteOnly = false, canPromote = false, onPromoteMenu,
}) {
  return (
    <div
      className="notes-list-row"
      draggable={noteOnly && canPromote}
      onDragStart={(event) => {
        if (!noteOnly || !canPromote) return
        window.dispatchEvent(new Event('wfc:flush-note-edits'))
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('application/wfc-note', event.currentTarget.dataset.noteId)
      }}
      data-note-id={noteOnly ? onPromoteMenu?.noteId : undefined}
      onContextMenu={(event) => {
        if (!noteOnly || !canPromote || !onPromoteMenu) return
        event.preventDefault()
        window.dispatchEvent(new Event('wfc:flush-note-edits'))
        onPromoteMenu.open(event)
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        paddingLeft: 8 + depth * 16, paddingRight: 6, height: 30,
        opacity: dim ? 0.6 : 1,
        background: selected ? '#ffffff12' : 'transparent',
        borderRadius: 6,
        cursor: noteOnly && canPromote ? 'grab' : 'default',
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
      {onFocus && <IconBtn title="캔버스에서 보기" onClick={onFocus}>⌖</IconBtn>}
    </div>
  )
}

// Recursive stage tree row (children = other stage nodes via source→target
// hierarchy edges; attachments = connected non-stage nodes, dimmer, leaves).
function StageTreeRow({ id, depth, byId, childrenMap, attachMap, expanded, onToggle, selectedId, onSelect, onFocusNode, onPromoteMenu, canPromote, ancestors }) {
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
        onFocus={node.noteOnly ? null : () => onFocusNode(id)}
        noteOnly={node.noteOnly}
        canPromote={canPromote}
        onPromoteMenu={node.noteOnly ? { noteId: id, open: (event) => onPromoteMenu(event, id) } : null}
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
              onPromoteMenu={onPromoteMenu} canPromote={canPromote}
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

// Inline related note: follows either the incoming or outgoing relation map.
function SubNoteRow({ id, depth, byId, relationMap, expanded, onToggle, onFocusNode, onOpen, ancestors }) {
  const node = byId.get(id)
  if (!node) return null
  const isCycle = ancestors.has(id)
  const kids = isCycle ? [] : (relationMap.get(id) ?? [])
  const isExpanded = expanded.has(id)
  const dim = node.type !== 'stage' && node.type !== 'system'
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
        {!node.noteOnly && <IconBtn title="캔버스에서 보기" onClick={() => onFocusNode(id)}>⌖</IconBtn>}
      </div>
      {isExpanded && preview && (
        <div style={{ marginLeft: 18, marginBottom: 4, fontSize: 11.5, color: '#888', whiteSpace: 'pre-wrap', opacity: dim ? 0.6 : 1 }}>
          {preview}
        </div>
      )}
      {isExpanded && kids.map((cid) => (
        <SubNoteRow
          key={cid} id={cid} depth={depth + 1} byId={byId} relationMap={relationMap}
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
function NotePage({ node, byId, inMap, outMap, isEditable, onUpdateNode, onFocusNode, onOpen, onBack, onClose, imageContext }) {
  const titleSaveTimer = useRef(null)
  const bodySaveTimer = useRef(null)
  const pendingTitle = useRef(null)
  const pendingBody = useRef(null)

  const [subExpanded, setSubExpanded] = useState(() => new Set())
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState(null)
  const toggleSub = useCallback((id) => {
    setSubExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const titleField = node.type === 'stage' || node.type === 'system' ? 'label' : 'header'
  const bodyField = node.type === 'stage' || node.type === 'system' ? 'description' : node.type === 'memo' ? 'text' : null

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
  useEffect(() => {
    const flush = () => flushPending()
    window.addEventListener('wfc:flush-note-edits', flush)
    return () => window.removeEventListener('wfc:flush-note-edits', flush)
  }, [flushPending])

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

  const parents = inMap.get(node.id) ?? []
  const kids = outMap.get(node.id) ?? []

  const uploadImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !isEditable || !imageContext) return
    setImageBusy(true)
    setImageError(null)
    try {
      const { storagePath } = await uploadCanvasImage({
        ...imageContext,
        nodeId: node.id,
        blob: file,
        previousPath: node.data?.storagePath,
      })
      onUpdateNode(node.id, { storagePath, src: null })
    } catch (error) {
      setImageError(error.message)
    } finally {
      setImageBusy(false)
    }
  }

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
        {!node.noteOnly && <IconBtn title="캔버스에서 보기" onClick={() => onFocusNode(node.id)}>⌖</IconBtn>}
        <IconBtn title="노트 창 닫기" onClick={onClose}>✕</IconBtn>
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

        {(node.type === 'stage' || node.type === 'memo' || node.type === 'system') && (
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

        {node.type === 'system' && (() => {
          const reality = systemNodeReality(node.data)
          const fieldStyle = {
            width: '100%', boxSizing: 'border-box', background: '#12121a',
            border: '1px solid #ffffff18', borderRadius: 6, color: '#d8dae0',
            fontSize: 12, padding: '7px 9px', outline: 'none', fontFamily: 'inherit',
          }
          const commit = (field) => (event) => onUpdateNode(node.id, { [field]: event.target.value })
          return (
            <div style={{ marginTop: 16, borderTop: '1px solid #ffffff18', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ color: '#8b94a7', fontSize: 10, fontWeight: 800, letterSpacing: 0.8 }}>실체 상태</span>
                <span style={{
                  color: reality.color, background: `${reality.color}18`, border: `1px solid ${reality.color}66`,
                  borderRadius: 4, padding: '2px 6px', fontSize: 9, fontWeight: 800,
                }}>
                  {reality.label}
                </span>
                <span style={{ color: '#666', fontSize: 10.5 }}>
                  {reality.id === 'twin' ? '서버에서 외부 자원 확인됨' : '외부 자원 검증 전'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
                  <span style={{ color: '#777f90', fontSize: 10, fontWeight: 700 }}>무엇인가</span>
                  <select disabled={!isEditable} value={node.data?.systemKind ?? 'service'} onChange={commit('systemKind')} style={fieldStyle}>
                    {SYSTEM_KIND_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
                  <span style={{ color: '#777f90', fontSize: 10, fontWeight: 700 }}>환경</span>
                  <select disabled={!isEditable} value={node.data?.environment ?? 'unknown'} onChange={commit('environment')} style={fieldStyle}>
                    {SYSTEM_ENVIRONMENT_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
                  <span style={{ color: '#777f90', fontSize: 10, fontWeight: 700 }}>발견 출처</span>
                  <select disabled={!isEditable} value={node.data?.sourceKind ?? 'manual'} onChange={commit('sourceKind')} style={fieldStyle}>
                    {SYSTEM_SOURCE_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 5, minWidth: 0 }}>
                  <span style={{ color: '#777f90', fontSize: 10, fontWeight: 700 }}>제공자·플랫폼</span>
                  <input
                    disabled={!isEditable}
                    defaultValue={node.data?.provider ?? ''}
                    onBlur={commit('provider')}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                    placeholder="예: Supabase, Vercel"
                    style={fieldStyle}
                  />
                </label>
              </div>

              <label style={{ display: 'grid', gap: 5, marginTop: 10 }}>
                <span style={{ color: '#777f90', fontSize: 10, fontWeight: 700 }}>리소스 참조</span>
                <input
                  disabled={!isEditable}
                  defaultValue={node.data?.externalRef ?? ''}
                  onBlur={commit('externalRef')}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                  placeholder="프로젝트 ID·테이블 이름 등, 비밀 키 값은 입력하지 않음"
                  style={fieldStyle}
                />
              </label>

              {[
                ['purpose', '왜 존재하는가', '이 실체가 달성해야 하는 목적'],
                ['responsibility', '무엇을 책임지는가', '입력·처리·출력과 책임 범위'],
                ['constraints', '어떤 제약이 있는가', '권한·보안·성능·비용·법적 제약'],
                ['evidence', '무엇이 이를 증명하는가', '코드·설정·로그·문서 등 근거'],
              ].map(([field, label, placeholder]) => (
                <label key={field} style={{ display: 'grid', gap: 5, marginTop: 10 }}>
                  <span style={{ color: '#777f90', fontSize: 10, fontWeight: 700 }}>{label}</span>
                  <textarea
                    disabled={!isEditable}
                    defaultValue={stripHtml(node.data?.[field])}
                    onBlur={commit(field)}
                    placeholder={placeholder}
                    rows={3}
                    style={{ ...fieldStyle, resize: 'vertical', minHeight: 68, lineHeight: 1.5 }}
                  />
                </label>
              ))}
            </div>
          )
        })()}

        {node.type === 'content' && node.data?.kind === 'photo' && (
          <div style={{ background: '#12121a', border: '1px solid #ffffff18', borderRadius: 6, padding: 12, textAlign: 'center' }}>
            {node.data?.storagePath || node.data?.src ? (
              <CanvasImage storagePath={node.data.storagePath} legacySrc={node.data.src} style={{ maxWidth: '100%', borderRadius: 6 }} />
            ) : (
              <div style={{ color: '#666', fontSize: 12, padding: '40px 0' }}>사진이 없습니다</div>
            )}
            {isEditable && (
              <label className="notes-image-upload">
                {imageBusy ? '업로드 중...' : '사진 선택'}
                <input type="file" accept="image/*" disabled={imageBusy} onChange={uploadImage} />
              </label>
            )}
            {imageError && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 8 }}>{imageError}</div>}
          </div>
        )}

        {node.type === 'content' && node.data?.kind === 'browser' && (
          <div style={{ background: '#12121a', border: '1px solid #ffffff18', borderRadius: 6, overflow: 'hidden' }}>
            <input
              key={`url-${node.id}`}
              defaultValue={node.data?.url ?? ''}
              disabled={!isEditable}
              placeholder="https://"
              onBlur={(event) => onUpdateNode(node.id, { url: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
              style={{ width: '100%', border: 'none', borderBottom: '1px solid #ffffff18', background: '#181822', color: '#d8dae0', padding: '8px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
            />
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

        {/* 상위 노트 (incoming edges) */}
        {parents.length > 0 && (
          <div style={{ marginTop: 18, borderTop: '1px solid #ffffff18', paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#666', textTransform: 'uppercase', marginBottom: 6 }}>
              상위 노트
            </div>
            {parents.map((pid) => (
              <SubNoteRow
                key={pid} id={pid} depth={0} byId={byId} relationMap={inMap}
                expanded={subExpanded} onToggle={toggleSub}
                onFocusNode={onFocusNode} onOpen={onOpen}
                ancestors={new Set([node.id])}
              />
            ))}
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
                key={cid} id={cid} depth={0} byId={byId} relationMap={outMap}
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
export default function NotesPanel({
  type,
  nodes,
  notes = [],
  edges,
  selectedId,
  onSelect,
  onClose,
  onFocusNode,
  onUpdateNode,
  onUpdateNote,
  onCreateNote,
  onPromoteNote,
  isNodeEditable,
  isNoteEditable,
  canCreateNotes = false,
  side = 'right',
  onSideChange,
  imageContext,
}) {
  const LIST_W = 240
  const SPLIT_W = 6
  const MIN_PANE_W = 300
  const MIN_CANVAS_W = 320

  const [paneWidth, setPaneWidth] = useState(() => Math.max(MIN_PANE_W, Math.round(window.innerWidth * 0.45)))
  const [expanded, setExpanded] = useState(() => new Set()) // stage-tree expand state
  const [promoteMenu, setPromoteMenu] = useState(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)

  useEffect(() => {
    const fn = () => setPaneWidth((width) => Math.min(width, Math.max(MIN_PANE_W, window.innerWidth - MIN_CANVAS_W)))
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    if (!promoteMenu && !createMenuOpen) return
    const close = () => { setPromoteMenu(null); setCreateMenuOpen(false) }
    const onKeyDown = (event) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [promoteMenu, createMenuOpen])

  // Reset tree expand state whenever the panel is (re)opened for a type.
  useEffect(() => { setExpanded(new Set()) }, [type])

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const entries = useMemo(() => [
    ...notes.map((note) => ({ ...note, noteOnly: true })),
    ...nodes.map((node) => ({ ...node, noteOnly: false })),
  ], [nodes, notes])
  const byId = useMemo(() => new Map(entries.map((n) => [n.id, n])), [entries])

  const typeNodes = useMemo(() => entries.filter((n) => n.type === type), [entries, type])
  const canCreateStandaloneNote = canCreateNotes && type !== 'system'

  // Stage hierarchy: source→target edges between two stage nodes (excluding part links).
  const stageIds = useMemo(() => new Set(entries.filter((n) => n.type === 'stage').map((n) => n.id)), [entries])
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
  const stageRoots = useMemo(() => entries.filter((n) => n.type === 'stage' && !hasIncoming.has(n.id)), [entries, hasIncoming])

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
  const inMap = useMemo(() => {
    const m = new Map()
    edges.forEach((e) => {
      if (isPartEdge(e)) return
      if (!m.has(e.target)) m.set(e.target, [])
      m.get(e.target).push(e.source)
    })
    return m
  }, [edges])

  // ── Splitter drag ──────────────────────────────────────────────────────────
  const dragRef = useRef(null)
  const onSplitterDown = useCallback((e) => {
    dragRef.current = { startX: e.clientX, startWidth: paneWidth }
    e.preventDefault()
    const onMove = (ev) => {
      if (!dragRef.current) return
      const dx = side === 'right'
        ? dragRef.current.startX - ev.clientX
        : ev.clientX - dragRef.current.startX
      const maxW = Math.max(MIN_PANE_W, window.innerWidth - MIN_CANVAS_W)
      setPaneWidth(Math.min(maxW, Math.max(MIN_PANE_W, dragRef.current.startWidth + dx)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [paneWidth, side])

  const selectedNode = selectedId ? byId.get(selectedId) : null
  const pageOpen = !!selectedNode
  const compact = paneWidth < 520
  const showList = !compact || !pageOpen

  const handleBack = () => onSelect(null)

  const openPromoteMenu = useCallback((event, noteId) => {
    setPromoteMenu({ noteId, x: event.clientX, y: event.clientY })
  }, [])

  const createNote = (kind) => {
    onCreateNote?.(type, kind)
    setCreateMenuOpen(false)
  }

  const splitter = (
    <div
      className="notes-pane-splitter"
      onPointerDown={onSplitterDown}
      title="노트 창 크기 조절"
      style={{ width: SPLIT_W, flexShrink: 0, cursor: 'col-resize', touchAction: 'none' }}
    />
  )

  return (
    <div
      className="notes-pane"
      style={{
        position: 'relative', height: '100%', width: paneWidth, minWidth: MIN_PANE_W,
        maxWidth: `calc(100vw - ${MIN_CANVAS_W}px)`, display: 'flex', flexShrink: 0,
        background: '#1a1a22', zIndex: 20, overflow: 'hidden',
        order: side === 'left' ? 0 : 2,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {side === 'right' && splitter}
      <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex' }}>
        {showList && (
          <div style={{ width: pageOpen ? LIST_W : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <div style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 4, padding: '9px 8px',
              borderBottom: '1px solid #ffffff18', flexShrink: 0,
            }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#f0f0f0' }}>
                {TYPE_LABEL[type] ?? type} <span style={{ color: '#666', fontWeight: 400 }}>({typeNodes.length})</span>
              </div>
              {canCreateStandaloneNote && (
                <IconBtn
                  title="새 노트"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (type === 'content') setCreateMenuOpen((open) => !open)
                    else createNote()
                  }}
                  style={{ fontSize: 18, width: 26, height: 26, padding: 0 }}
                >+</IconBtn>
              )}
              <IconBtn
                title={side === 'right' ? '노트 창을 왼쪽으로 이동' : '노트 창을 오른쪽으로 이동'}
                onClick={() => onSideChange?.(side === 'right' ? 'left' : 'right')}
                style={{ fontSize: 15, width: 24, height: 26, padding: 0 }}
              >{side === 'right' ? '←' : '→'}</IconBtn>
              <IconBtn title="닫기" onClick={onClose} style={{ fontSize: 14, width: 24, height: 26, padding: 0 }}>✕</IconBtn>
              {createMenuOpen && type === 'content' && (
                <div
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{
                    position: 'absolute', right: 34, top: 38, zIndex: 50, minWidth: 130,
                    background: '#20202a', border: '1px solid #ffffff22', borderRadius: 6, padding: 4,
                  }}
                >
                  {[['photo', '사진'], ['database', '데이터베이스'], ['browser', '브라우저']].map(([kind, label]) => (
                    <button key={kind} type="button" className="notes-create-option" onClick={() => createNote(kind)}>{label}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
              {type === 'stage' ? (
                stageRoots.length === 0 ? (
                  <div style={{ color: '#555', fontSize: 12, padding: '10px 12px' }}>단계 노드가 없습니다</div>
                ) : stageRoots.map((n) => (
                  <StageTreeRow
                    key={n.id} id={n.id} depth={0} byId={byId}
                    childrenMap={childrenMap} attachMap={attachMap}
                    expanded={expanded} onToggle={toggleExpand}
                    selectedId={selectedId} onSelect={onSelect} onFocusNode={onFocusNode}
                    onPromoteMenu={openPromoteMenu} canPromote={canCreateNotes}
                    ancestors={new Set()}
                  />
                ))
              ) : typeNodes.length === 0 ? (
                <div style={{ color: '#555', fontSize: 12, padding: '10px 12px' }}>노드가 없습니다</div>
              ) : typeNodes.map((n) => (
                <ListRow
                  key={n.id}
                  title={nodeTitle(n)}
                  depth={0}
                  dim={false}
                  expandable={false}
                  onClickTitle={() => onSelect(n.id)}
                  onFocus={n.noteOnly ? null : () => onFocusNode(n.id)}
                  selected={selectedId === n.id}
                  noteOnly={n.noteOnly}
                  canPromote={canCreateNotes}
                  onPromoteMenu={n.noteOnly ? { noteId: n.id, open: (event) => openPromoteMenu(event, n.id) } : null}
                />
              ))}
            </div>
          </div>
        )}
        {pageOpen && (
          <div style={{ flex: 1, height: '100%', background: '#12121a', minWidth: 0 }}>
          <NotePage
            key={selectedNode.id}
            node={selectedNode}
            byId={byId}
            inMap={inMap}
            outMap={outMap}
            isEditable={selectedNode.noteOnly ? !!isNoteEditable?.(selectedNode.id) : (isNodeEditable ? isNodeEditable(selectedNode.id) : true)}
            onUpdateNode={selectedNode.noteOnly ? onUpdateNote : onUpdateNode}
            onFocusNode={onFocusNode}
            onOpen={onSelect}
            onBack={handleBack}
            onClose={onClose}
            imageContext={imageContext}
          />
          </div>
        )}
      </div>
      {side === 'left' && splitter}

      {promoteMenu && (
        <div
          className="notes-promote-menu"
          onPointerDown={(event) => event.stopPropagation()}
          style={{ position: 'fixed', left: promoteMenu.x, top: promoteMenu.y, zIndex: 1400 }}
        >
          <button
            type="button"
            onClick={() => {
              onPromoteNote?.(promoteMenu.noteId)
              setPromoteMenu(null)
            }}
          >캔버스에 추가</button>
        </div>
      )}
    </div>
  )
}
