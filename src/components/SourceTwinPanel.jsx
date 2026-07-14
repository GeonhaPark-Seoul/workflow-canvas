import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SOURCE_TWIN_PERSPECTIVES,
  sourceTwinCodeUrl,
  sourceTwinEntities,
  sourceTwinEntityMap,
} from '../../shared/sourceTwin.js'
import {
  captureSourceTwinHistory,
  compareSourceTwinHistory,
  loadSourceTwinCurrent,
  loadSourceTwinHistory,
} from '../lib/sourceTwinApi.js'

const MIN_PANE_WIDTH = 380
const MIN_CANVAS_WIDTH = 320
const SPLITTER_WIDTH = 6
const KIND_LABELS = {
  file: '파일', function: '함수', dependency: '의존성', 'api-route': 'API',
  'db-table': '테이블', 'db-function': 'DB 함수', 'rls-policy': 'RLS',
  'environment-variable': '환경변수', deployment: '배포', 'npm-script': '명령',
}
const LAYER_LABELS = {
  frontend: '사용자 화면', api: '웹 API', mcp: 'AI 연결', shared: '공통 규칙',
  database: '데이터베이스', test: '검증', deployment: '배포', documentation: '문서',
  security: '보안', code: '외부 의존',
}

function IconButton({ title, onClick, disabled = false, children }) {
  return (
    <button type="button" className="twin-review-icon-button" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function EntityDetail({ manifest, entity, commitSha, onClose }) {
  if (!entity) return null
  const codeUrl = sourceTwinCodeUrl(manifest, entity, commitSha)
  return (
    <section className="source-twin-detail" aria-label="선택한 코드 실체">
      <div className="source-twin-detail-heading">
        <div>
          <strong>{entity.label}</strong>
          <span>{KIND_LABELS[entity.kind] ?? entity.kind}</span>
        </div>
        <IconButton title="선택 해제" onClick={onClose}>✕</IconButton>
      </div>
      <p>{entity.summary}</p>
      {entity.path && <code>{entity.path}{entity.lineStart ? `:${entity.lineStart}` : ''}</code>}
      {entity.details && (
        <div className="source-twin-detail-facts">
          {(entity.details.apiRoutes ?? []).map((value) => <span key={`api:${value}`}>{value}</span>)}
          {(entity.details.dbTables ?? []).map((value) => <span key={`db:${value}`}>DB {value}</span>)}
          {(entity.details.environmentVariables ?? []).map((value) => <span key={`env:${value}`}>{value}</span>)}
          {(entity.details.securitySignals ?? []).map((value) => <span className="is-security" key={`security:${value}`}>{value}</span>)}
        </div>
      )}
      {codeUrl && <a href={codeUrl} target="_blank" rel="noreferrer">GitHub에서 실제 코드 열기 ↗</a>}
    </section>
  )
}

function EntityRow({ entity, children, expanded, selectedId, onToggle, onSelect }) {
  const hasChildren = children.length > 0
  return (
    <div className="source-twin-tree-block">
      <button type="button" className={`source-twin-entity-row${selectedId === entity.id ? ' is-selected' : ''}`} onClick={() => onSelect(entity)}>
        <span
          className="source-twin-expand"
          onClick={(event) => { event.stopPropagation(); if (hasChildren) onToggle(entity.id) }}
          aria-hidden="true"
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </span>
        <span className="source-twin-entity-main">
          <strong>{entity.label}</strong>
          <small>{entity.summary}</small>
        </span>
        <span className="source-twin-kind">{KIND_LABELS[entity.kind] ?? entity.kind}</span>
      </button>
      {expanded && children.map((child) => (
        <button type="button" className={`source-twin-function-row${selectedId === child.id ? ' is-selected' : ''}`} key={child.id} onClick={() => onSelect(child)}>
          <span>ƒ</span>
          <span><strong>{child.label}</strong><small>{child.summary}</small></span>
          <code>L{child.lineStart}</code>
        </button>
      ))}
    </div>
  )
}

function StructureView({ current, perspective, setPerspective, query, setQuery, selectedId, setSelectedId }) {
  const manifest = current.manifest
  const [expanded, setExpanded] = useState(() => new Set())
  const entityMap = useMemo(() => sourceTwinEntityMap(manifest), [manifest])
  const filtered = useMemo(
    () => sourceTwinEntities(manifest, { perspective, query, limit: 700 }),
    [manifest, perspective, query],
  )
  const filteredIds = useMemo(() => new Set(filtered.map((entity) => entity.id)), [filtered])
  const childrenByParent = useMemo(() => {
    const result = new Map()
    for (const entity of manifest.entities ?? []) {
      if (!entity.parentId || entity.kind !== 'function') continue
      const list = result.get(entity.parentId) ?? []
      list.push(entity)
      result.set(entity.parentId, list)
    }
    for (const list of result.values()) list.sort((left, right) => left.lineStart - right.lineStart)
    return result
  }, [manifest])
  const roots = useMemo(() => {
    const result = []
    const includedParents = new Set(filtered.filter((entity) => entity.parentId).map((entity) => entity.parentId))
    for (const entity of filtered) {
      if (!entity.parentId || entity.kind !== 'function') result.push(entity)
    }
    for (const parentId of includedParents) {
      if (!result.some((entity) => entity.id === parentId) && entityMap.has(parentId)) result.push(entityMap.get(parentId))
    }
    return result.sort((left, right) => `${left.layer}:${left.path ?? ''}:${left.label}`.localeCompare(`${right.layer}:${right.path ?? ''}:${right.label}`))
  }, [entityMap, filtered])
  const selected = entityMap.get(selectedId)
  const toggle = (id) => setExpanded((currentSet) => {
    const next = new Set(currentSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <>
      <div className="source-twin-perspectives" role="tablist" aria-label="코드 트리 관점">
        {Object.entries(SOURCE_TWIN_PERSPECTIVES).map(([value, label]) => (
          <button type="button" key={value} className={perspective === value ? 'is-active' : ''} onClick={() => setPerspective(value)}>{label}</button>
        ))}
      </div>
      <div className="source-twin-search">
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일, 함수, DB, 환경변수 검색" aria-label="소스 트윈 검색" />
      </div>
      <EntityDetail manifest={manifest} entity={selected} commitSha={current.deployment?.commitSha} onClose={() => setSelectedId('')} />
      <div className="source-twin-tree">
        {roots.length === 0 ? <div className="twin-review-empty">일치하는 코드 실체 없음</div> : roots.map((entity) => {
          const children = (childrenByParent.get(entity.id) ?? []).filter((child) => filteredIds.has(child.id))
          return <EntityRow key={entity.id} entity={entity} children={children} expanded={expanded.has(entity.id) || !!query} selectedId={selectedId} onToggle={toggle} onSelect={(value) => setSelectedId(value.id)} />
        })}
      </div>
    </>
  )
}

function ChangeEntityList({ title, ids, entityMap }) {
  if (!ids?.length) return null
  return (
    <section className="source-twin-change-section">
      <h3>{title}<span>{ids.length}</span></h3>
      {ids.slice(0, 100).map((id) => {
        const item = entityMap.get(id)
        return <div key={id}><strong>{item?.label ?? id}</strong><code>{item?.path ?? ''}</code></div>
      })}
      {ids.length > 100 && <p>나머지 {ids.length - 100}개는 검색에서 확인할 수 있습니다.</p>}
    </section>
  )
}

function ChangesView({ current }) {
  const manifest = current.manifest
  const changes = manifest.changeSet
  const entityMap = sourceTwinEntityMap(manifest)
  const pendingEvents = current.events?.events ?? []
  return (
    <div className="source-twin-change-list">
      {changes.initialBaseline ? (
        <div className="source-twin-baseline">첫 소스 기준선입니다. 다음 커밋부터 변경분만 표시됩니다.</div>
      ) : changes.summary.added + changes.summary.changed + changes.summary.removed === 0 ? (
        <div className="twin-review-empty">직전 manifest 이후 소스 변경 없음</div>
      ) : (
        <>
          <ChangeEntityList title="추가" ids={changes.added} entityMap={entityMap} />
          <ChangeEntityList title="변경" ids={changes.changed} entityMap={entityMap} />
          <ChangeEntityList title="삭제" ids={changes.removed} entityMap={entityMap} />
        </>
      )}
      <section className="source-twin-event-section">
        <h3>GitHub push 이벤트</h3>
        {!current.webhookConfigured && <p>Webhook 미연결 · 배포된 manifest 비교만 사용 중</p>}
        {pendingEvents.length === 0 && current.webhookConfigured && <p>수신된 push 없음</p>}
        {pendingEvents.map((event) => (
          <article key={event.delivery_id}>
            <div>
              <strong>{event.ref?.replace('refs/heads/', '') || 'push'}</strong>
              <code>{event.after_sha?.slice(0, 8)}</code>
              <em className={event.after_sha && event.after_sha === current.deployment?.commitSha ? 'is-deployed' : ''}>
                {event.after_sha && event.after_sha === current.deployment?.commitSha ? '현재 배포 반영' : '배포 전 변경'}
              </em>
            </div>
            <span>{new Date(event.received_at).toLocaleString()}</span>
            <p>{(event.changed_paths ?? []).slice(0, 8).join(' · ') || '변경 경로 없음'}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

function HistoryView({ history, historyError, captureBusy, onCapture, comparison, compareBusy, onCompare }) {
  const snapshots = history?.snapshots ?? []
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  useEffect(() => {
    if (snapshots.length < 2) return
    setFromId((value) => value || snapshots[1].id)
    setToId((value) => value || snapshots[0].id)
  }, [snapshots])
  return (
    <div className="source-twin-history">
      <p className="source-twin-evidence-scope">
        내부 변경 추적 기록입니다. 상태 기록과 비교는 앱 코드·DB 구조·배포를 수정하지 않으며, 외부 공증 기록은 아닙니다.
      </p>
      <div className="source-twin-history-actions">
        <button type="button" onClick={onCapture} disabled={captureBusy}>{captureBusy ? '기록 중…' : '현재 상태 기록'}</button>
        <span>코드·DB·배포·운영을 함께 저장</span>
      </div>
      {historyError && <div className="source-twin-error">{historyError}</div>}
      {snapshots.length === 0 ? <div className="twin-review-empty">기록된 상태 없음</div> : (
        <>
          <div className="source-twin-compare-controls">
            <select value={fromId} onChange={(event) => setFromId(event.target.value)} aria-label="이전 상태">
              {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.commitSha?.slice(0, 7) || 'local'}</option>)}
            </select>
            <span>→</span>
            <select value={toId} onChange={(event) => setToId(event.target.value)} aria-label="새 상태">
              {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.commitSha?.slice(0, 7) || 'local'}</option>)}
            </select>
            <button type="button" disabled={!fromId || !toId || fromId === toId || compareBusy} onClick={() => onCompare(fromId, toId)}>{compareBusy ? '비교 중…' : '비교'}</button>
          </div>
          {comparison && (
            <section className="source-twin-comparison">
              <div className="source-twin-comparison-summary">
                <span>변경 영역 <strong>{comparison.summary.changedSections}</strong></span>
                <span>추가 <strong>{comparison.summary.addedEntities}</strong></span>
                <span>수정 <strong>{comparison.summary.changedEntities}</strong></span>
                <span>삭제 <strong>{comparison.summary.removedEntities}</strong></span>
              </div>
              {[...comparison.entities.added, ...comparison.entities.changed, ...comparison.entities.removed].slice(0, 120).map((entity) => (
                <div key={`${entity.id}:${entity.fingerprint}`}><strong>{entity.label}</strong><code>{entity.path}</code></div>
              ))}
              {comparison.metrics.map((metric) => (
                <div key={`metric:${metric.key}`}><strong>{metric.key}</strong><span>{String(metric.before)} → {String(metric.after)}</span></div>
              ))}
            </section>
          )}
          <div className="source-twin-snapshot-list">
            {snapshots.map((snapshot) => (
              <div key={snapshot.id}>
                <strong>{new Date(snapshot.capturedAt).toLocaleString()}</strong>
                <span>{snapshot.reason === 'deployment' ? '배포 기준' : '수동 기록'} · {snapshot.commitSha?.slice(0, 8) || 'local'}</span>
                <code>{snapshot.manifestId}</code>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function SourceTwinPanel({ side = 'right', onSideChange, onClose }) {
  const [paneWidth, setPaneWidth] = useState(500)
  const [tab, setTab] = useState('structure')
  const [perspective, setPerspective] = useState('functionality')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(true)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [compareBusy, setCompareBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const dragRef = useRef(null)

  const refreshHistory = useCallback(async () => {
    const next = await loadSourceTwinHistory(40)
    setHistory(next)
    if (!next.available) setHistoryError('통합 상태 이력 SQL이 아직 적용되지 않았습니다.')
    else setHistoryError('')
  }, [])

  const refreshCurrent = useCallback(async () => {
    const next = await loadSourceTwinCurrent()
    setCurrent(next)
    return next
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([refreshCurrent(), refreshHistory()])
      .then(async () => {
        try {
          const result = await captureSourceTwinHistory('deployment')
          if (!cancelled && result?.snapshot) await refreshHistory()
        } catch (captureError) {
          if (!cancelled && captureError.code !== 'SOURCE_TWIN_HISTORY_UNAVAILABLE') setHistoryError(captureError.message)
        }
      })
      .catch((loadError) => { if (!cancelled) setError(loadError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    const timer = setInterval(() => {
      refreshCurrent().catch(() => {})
    }, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [refreshCurrent, refreshHistory])

  const capture = useCallback(async () => {
    setCaptureBusy(true)
    setHistoryError('')
    try {
      await captureSourceTwinHistory('manual')
      await refreshHistory()
    } catch (captureError) {
      setHistoryError(captureError.message)
    } finally {
      setCaptureBusy(false)
    }
  }, [refreshHistory])

  const compare = useCallback(async (from, to) => {
    setCompareBusy(true)
    setHistoryError('')
    try {
      const result = await compareSourceTwinHistory(from, to)
      setComparison(result.comparison)
    } catch (compareError) {
      setHistoryError(compareError.message)
    } finally {
      setCompareBusy(false)
    }
  }, [])

  const onSplitterDown = useCallback((event) => {
    dragRef.current = { startX: event.clientX, startWidth: paneWidth }
    event.preventDefault()
    const onMove = (moveEvent) => {
      if (!dragRef.current) return
      const delta = side === 'right' ? dragRef.current.startX - moveEvent.clientX : moveEvent.clientX - dragRef.current.startX
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

  const splitter = <div className="twin-review-splitter source-twin-splitter" title="코드 트리 창 크기 조절" onPointerDown={onSplitterDown} style={{ width: SPLITTER_WIDTH }} />
  const manifest = current?.manifest

  return (
    <aside className="twin-review-pane source-twin-pane" style={{ width: paneWidth, minWidth: MIN_PANE_WIDTH, maxWidth: `calc(100vw - ${MIN_CANVAS_WIDTH}px)`, order: side === 'left' ? 0 : 2 }} onClick={(event) => event.stopPropagation()}>
      {side === 'right' && splitter}
      <div className="twin-review-content">
        <header className="twin-review-header source-twin-header">
          <div className="twin-review-header-title"><strong>소스 트윈</strong>{manifest && <span>{manifest.summary.files}</span>}</div>
          <div className="twin-review-header-actions">
            <IconButton title="소스 트윈 새로고침" onClick={() => { setLoading(true); Promise.all([refreshCurrent(), refreshHistory()]).catch((loadError) => setError(loadError.message)).finally(() => setLoading(false)) }}>↻</IconButton>
            <IconButton title={side === 'right' ? '코드 트리 창을 왼쪽으로 이동' : '코드 트리 창을 오른쪽으로 이동'} onClick={() => onSideChange(side === 'right' ? 'left' : 'right')}>{side === 'right' ? '←' : '→'}</IconButton>
            <IconButton title="코드 트리 닫기" onClick={onClose}>✕</IconButton>
          </div>
          <div className="twin-review-source-name">{manifest?.source?.label ?? 'Workflow Canvas 소스 코드'}</div>
          <code className="twin-review-snapshot" title="소스 manifest ID">{manifest?.id ?? ''}</code>
        </header>
        {manifest && (
          <div className="twin-review-counts source-twin-counts">
            <span>함수 <strong>{manifest.summary.functions}</strong></span>
            <span>API <strong>{manifest.summary.apiRoutes}</strong></span>
            <span>DB <strong>{manifest.summary.dbTables}</strong></span>
            <span>커밋 <strong>{current.deployment?.commitSha?.slice(0, 7) || 'local'}</strong></span>
          </div>
        )}
        <div className="source-twin-tabs" role="tablist" aria-label="소스 트윈 보기">
          {[['structure', '구조'], ['changes', '변경'], ['history', '이력']].map(([value, label]) => (
            <button type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} key={value} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>
        {loading && !current ? <div className="twin-review-empty">소스 트윈 불러오는 중…</div> : error ? <div className="source-twin-error">{error}</div> : current && (
          tab === 'structure'
            ? <StructureView current={current} perspective={perspective} setPerspective={setPerspective} query={query} setQuery={setQuery} selectedId={selectedId} setSelectedId={setSelectedId} />
            : tab === 'changes'
              ? <ChangesView current={current} />
              : <HistoryView history={history} historyError={historyError} captureBusy={captureBusy} onCapture={capture} comparison={comparison} compareBusy={compareBusy} onCompare={compare} />
        )}
      </div>
      {side === 'left' && splitter}
    </aside>
  )
}
