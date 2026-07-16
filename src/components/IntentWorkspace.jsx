import { useCallback, useEffect, useRef, useState } from 'react'
import {
  extractIntentClauseCandidates,
  INTENT_CLAUSE_KIND_DEFS,
  INTENT_CLAUSE_STATUS_DEFS,
  INTENT_ENFORCEMENT_DEFS,
  INTENT_SOURCE_KIND_DEFS,
  MAX_INTENT_CLAUSES,
  MAX_INTENT_SOURCES,
  normalizeIntentClauses,
  normalizeIntentSources,
} from '../../shared/intentOntology.js'

const nextLocalId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function definitionLabel(definitions, id) {
  return definitions.find((item) => item.id === id)?.label ?? id ?? '직접 작성'
}

export default function IntentWorkspace({ node, isEditable, onUpdateNode }) {
  const [sources, setSources] = useState(() => normalizeIntentSources(node.data?.intentSources))
  const [clauses, setClauses] = useState(() => normalizeIntentClauses(node.data?.intentClauses))
  const [selectedSourceId, setSelectedSourceId] = useState(() => normalizeIntentSources(node.data?.intentSources)[0]?.id ?? '')
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? sources[0] ?? null
  const approvedCount = clauses.filter((clause) => clause.status === 'approved').length
  const candidateCount = clauses.filter((clause) => clause.status === 'candidate').length
  const sourceAtLimit = sources.length >= MAX_INTENT_SOURCES
  const clauseAtLimit = clauses.length >= MAX_INTENT_CLAUSES
  const saveTimer = useRef(null)
  const pendingPatch = useRef(null)

  const flushPending = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (!pendingPatch.current) return
    const patch = pendingPatch.current
    pendingPatch.current = null
    onUpdateNode(node.id, patch)
  }, [node.id, onUpdateNode])

  useEffect(() => {
    const flush = () => flushPending()
    window.addEventListener('wfc:flush-note-edits', flush)
    return () => {
      window.removeEventListener('wfc:flush-note-edits', flush)
      flushPending()
    }
  }, [flushPending])

  const persistPatch = (patch, debounce = false) => {
    pendingPatch.current = { ...(pendingPatch.current ?? {}), ...patch }
    clearTimeout(saveTimer.current)
    if (!debounce) {
      flushPending()
      return
    }
    saveTimer.current = setTimeout(flushPending, 350)
  }

  const commitSources = (nextValue, debounce = false) => {
    const normalized = normalizeIntentSources(nextValue)
    setSources(normalized)
    persistPatch({ intentSources: normalized }, debounce)
    if (!normalized.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(normalized[0]?.id ?? '')
    }
  }

  const commitClauses = (nextValue, debounce = false) => {
    const normalized = normalizeIntentClauses(nextValue)
    setClauses(normalized)
    persistPatch({ intentClauses: normalized }, debounce)
  }

  const addSource = () => {
    if (!isEditable || sourceAtLimit) return
    const source = {
      id: nextLocalId('is'),
      sourceKind: 'meeting',
      title: '새 원문',
      text: '',
      sourceRef: '',
      addedAt: new Date().toISOString(),
    }
    commitSources([...sources, source])
    setSelectedSourceId(source.id)
  }

  const updateSource = (patch, debounce = false) => {
    if (!selectedSource || !isEditable) return
    commitSources(sources.map((source) => (
      source.id === selectedSource.id ? { ...source, ...patch } : source
    )), debounce)
  }

  const extractCandidates = () => {
    if (!isEditable || clauseAtLimit) return
    commitClauses(extractIntentClauseCandidates({
      ...node.data,
      intentSources: sources,
      intentClauses: clauses,
    }))
  }

  const addClause = () => {
    if (!isEditable || clauseAtLimit) return
    commitClauses([...clauses, {
      id: nextLocalId('ic'),
      clauseKind: 'direction',
      status: 'candidate',
      enforcement: 'guidance',
      text: '새 조문',
      sourceId: selectedSource?.id ?? '',
      sourceExcerpt: '',
      confidence: 'unknown',
    }])
  }

  const updateClause = (id, patch, debounce = false) => {
    if (!isEditable) return
    commitClauses(clauses.map((clause) => clause.id === id ? { ...clause, ...patch } : clause), debounce)
  }

  return (
    <div className="intent-workspace">
      <section className="intent-source-pane" aria-label="Intent 원문 자료">
        <div className="intent-workspace-heading">
          <div>
            <strong>원문 자료</strong>
            <span>회의, AI 대화, 문서 또는 요약본 · {sources.length}/{MAX_INTENT_SOURCES}</span>
          </div>
          <button
            type="button"
            title={sourceAtLimit ? `원문은 최대 ${MAX_INTENT_SOURCES}개까지 추가할 수 있습니다.` : '원문 추가'}
            aria-label="원문 추가"
            disabled={!isEditable || sourceAtLimit}
            onClick={addSource}
          >＋</button>
        </div>

        {sources.length > 0 ? (
          <>
            <div className="intent-source-tabs" role="tablist" aria-label="원문 목록">
              {sources.map((source) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedSource?.id === source.id}
                  className={selectedSource?.id === source.id ? 'is-active' : ''}
                  key={source.id}
                  title={source.title || definitionLabel(INTENT_SOURCE_KIND_DEFS, source.sourceKind)}
                  onClick={() => setSelectedSourceId(source.id)}
                >
                  <span>{definitionLabel(INTENT_SOURCE_KIND_DEFS, source.sourceKind)}</span>
                  <strong>{source.title || '제목 없음'}</strong>
                </button>
              ))}
            </div>
            {selectedSource && (
              <div className="intent-source-editor">
                <div className="intent-source-fields">
                  <label>
                    <span>종류</span>
                    <select disabled={!isEditable} value={selectedSource.sourceKind} onChange={(event) => updateSource({ sourceKind: event.target.value })}>
                      {INTENT_SOURCE_KIND_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>이름</span>
                    <input disabled={!isEditable} value={selectedSource.title} maxLength={180} onChange={(event) => updateSource({ title: event.target.value }, true)} />
                  </label>
                </div>
                <label className="is-stacked">
                  <span>출처 참조</span>
                  <input
                    disabled={!isEditable}
                    value={selectedSource.sourceRef}
                    maxLength={500}
                    placeholder="선택 사항: 문서명, URL 또는 대화 식별자"
                    onChange={(event) => updateSource({ sourceRef: event.target.value }, true)}
                  />
                </label>
                <label className="is-stacked intent-source-text">
                  <span>원문 또는 요약본</span>
                  <textarea
                    disabled={!isEditable}
                    value={selectedSource.text}
                    maxLength={20000}
                    placeholder="전략회의, AI 대화 또는 문서 내용을 붙여 넣으세요. 원문은 조문의 근거로 보존됩니다."
                    onChange={(event) => updateSource({ text: event.target.value }, true)}
                  />
                </label>
                {isEditable && (
                  <button
                    type="button"
                    className="intent-source-delete"
                    onClick={() => commitSources(sources.filter((source) => source.id !== selectedSource.id))}
                  >원문 제거</button>
                )}
              </div>
            )}
          </>
        ) : (
          <button type="button" className="intent-workspace-empty" disabled={!isEditable} onClick={addSource}>
            원문을 추가해 조문의 근거를 남기세요.
          </button>
        )}
      </section>

      <section className="intent-clause-pane" aria-label="Intent 조문">
        <div className="intent-workspace-heading">
          <div>
            <strong>조문</strong>
            <span>확정 {approvedCount} · 후보 {candidateCount} · 전체 {clauses.length}/{MAX_INTENT_CLAUSES}</span>
          </div>
          <div className="intent-clause-heading-actions">
            <button
              type="button"
              title={clauseAtLimit ? `조문은 최대 ${MAX_INTENT_CLAUSES}개까지 추가할 수 있습니다.` : '조문 직접 추가'}
              aria-label="조문 직접 추가"
              disabled={!isEditable || clauseAtLimit}
              onClick={addClause}
            >＋</button>
            <button
              type="button"
              className="intent-extract-button"
              disabled={!isEditable || clauseAtLimit || (!sources.some((source) => source.text.trim()) && !node.data?.statement?.trim())}
              title="원문 문장을 근거로 조문 후보를 찾습니다. 자동 확정하지 않습니다."
              onClick={extractCandidates}
            >조문 후보 찾기</button>
          </div>
        </div>

        <div className="intent-clause-list">
          {clauses.length ? clauses.map((clause) => (
            <article key={clause.id} className={`intent-clause-row is-${clause.status}`}>
              <div className="intent-clause-controls">
                <select
                  aria-label="조문 상태"
                  disabled={!isEditable}
                  value={clause.status}
                  onChange={(event) => updateClause(clause.id, { status: event.target.value })}
                >
                  {INTENT_CLAUSE_STATUS_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <select
                  aria-label="조문 종류"
                  disabled={!isEditable}
                  value={clause.clauseKind}
                  onChange={(event) => updateClause(clause.id, { clauseKind: event.target.value })}
                >
                  {INTENT_CLAUSE_KIND_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <select
                  aria-label="적용 강도"
                  disabled={!isEditable}
                  value={clause.enforcement}
                  onChange={(event) => updateClause(clause.id, { enforcement: event.target.value })}
                >
                  {INTENT_ENFORCEMENT_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                {isEditable && (
                  <button type="button" title="조문 삭제" aria-label="조문 삭제" onClick={() => commitClauses(clauses.filter((item) => item.id !== clause.id))}>×</button>
                )}
              </div>
              <textarea
                aria-label="조문 내용"
                disabled={!isEditable}
                value={clause.text}
                maxLength={800}
                rows={3}
                onChange={(event) => updateClause(clause.id, { text: event.target.value }, true)}
              />
              {clause.sourceExcerpt && (
                <details className="intent-clause-evidence">
                  <summary>원문 근거 · {definitionLabel(INTENT_SOURCE_KIND_DEFS, sources.find((source) => source.id === clause.sourceId)?.sourceKind)}</summary>
                  <blockquote>{clause.sourceExcerpt}</blockquote>
                </details>
              )}
            </article>
          )) : (
            <div className="intent-workspace-empty is-static">
              아직 조문이 없습니다. 원문에서 후보를 찾거나 직접 추가하세요.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
