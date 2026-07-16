import { useMemo, useState } from 'react'
import {
  INTENT_KIND_DEFS,
  intentKindDefinition,
  intentStatusDefinition,
} from '../../shared/intentOntology.js'
import { MAX_WORK_INTENT_BINDINGS } from '../../shared/workOntology.js'

export default function WorkIntentPicker({ workPart, intentOptions, onAttach, onCreate, onClose }) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ label: '', statement: '', intentKind: 'intent' })
  const [error, setError] = useState('')
  const bindings = workPart?.work?.intentBindings ?? []
  const atLimit = bindings.length >= MAX_WORK_INTENT_BINDINGS
  const boundByNode = new Map(bindings.map((binding) => [binding.intentNodeId, binding]))
  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return [...(intentOptions ?? [])]
      .filter((option) => !needle || `${option.label} ${option.statement}`.toLocaleLowerCase().includes(needle))
      .sort((left, right) => {
        const activeOrder = Number(right.intentStatus === 'active') - Number(left.intentStatus === 'active')
        return activeOrder || left.label.localeCompare(right.label, 'ko')
      })
  }, [intentOptions, query])

  const createAndAttach = () => {
    if (atLimit) {
      setError(`Work 하나에는 Intent를 최대 ${MAX_WORK_INTENT_BINDINGS}개까지 장착할 수 있습니다.`)
      return
    }
    if (!draft.label.trim() || !draft.statement.trim()) {
      setError('Intent 이름과 조문을 입력해 주세요.')
      return
    }
    const binding = onCreate?.({
      label: draft.label,
      statement: draft.statement,
      intentKind: draft.intentKind,
    })
    if (!binding) {
      setError('새 Intent를 작성할 권한이 없습니다.')
      return
    }
    onAttach(binding)
    setDraft({ label: '', statement: '', intentKind: 'intent' })
    setCreating(false)
    setError('')
  }

  return (
    <div
      className="work-intent-picker nodrag nowheel"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="work-intent-picker-heading">
        <div>
          <strong>Intent 장착</strong>
          <span>{workPart?.label ?? 'Work'} · {bindings.length}/{MAX_WORK_INTENT_BINDINGS}</span>
        </div>
        <button type="button" title="닫기" aria-label="닫기" onClick={onClose}>×</button>
      </div>

      {!creating && (
        <>
          <input
            className="work-intent-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Intent 검색"
            aria-label="Intent 검색"
          />
          <div className="work-intent-options" aria-label="기존 Intent 목록">
            {options.length ? options.map((option) => {
              const current = boundByNode.get(option.nodeId)
              const versionAvailable = option.version > 0
              const alreadyCurrent = current?.version === option.version
              const blockedByLimit = atLimit && !current
              const kind = intentKindDefinition(option.intentKind)
              const status = intentStatusDefinition(option.intentStatus)
              return (
                <button
                  type="button"
                  key={option.nodeId}
                  className={alreadyCurrent ? 'is-attached' : ''}
                  disabled={!versionAvailable || alreadyCurrent || blockedByLimit}
                  title={!versionAvailable
                    ? 'Intent 노트에서 현재 내용을 버전으로 기록한 뒤 장착할 수 있습니다.'
                    : blockedByLimit
                      ? `Work 하나에는 Intent를 최대 ${MAX_WORK_INTENT_BINDINGS}개까지 장착할 수 있습니다.`
                    : current
                      ? `${current.version}에서 ${option.version}로 갱신`
                      : `${option.label} v${option.version} 장착`}
                  onClick={() => onAttach({
                    intentNodeId: option.nodeId,
                    version: option.version,
                    label: option.label,
                    intentKind: option.intentKind,
                    clauseCount: option.clauseCount,
                  })}
                >
                  <span className="work-intent-option-mark" style={{ '--intent-color': kind.color }}>◇</span>
                  <span className="work-intent-option-copy">
                    <strong>{option.label}</strong>
                    <small>{kind.label} · {status.label}{option.dirty && option.version ? ' · 기록 후 수정됨' : ''}</small>
                  </span>
                  <span className="work-intent-option-action">
                    {!versionAvailable ? '미기록' : blockedByLimit ? '한도 도달' : alreadyCurrent ? '장착됨' : current ? `v${option.version} 갱신` : `v${option.version} 장착`}
                  </span>
                </button>
              )
            }) : (
              <div className="work-intent-options-empty">찾은 Intent가 없습니다.</div>
            )}
          </div>
          {onCreate && (
            <button
              type="button"
              className="work-intent-create-toggle"
              disabled={atLimit}
              title={atLimit ? `Intent를 최대 ${MAX_WORK_INTENT_BINDINGS}개까지 장착할 수 있습니다.` : '새 Intent 작성'}
              onClick={() => setCreating(true)}
            >
              <span aria-hidden="true">＋</span> 새 Intent 작성
            </button>
          )}
        </>
      )}

      {creating && (
        <div className="work-intent-create-form">
          <label>
            <span>종류</span>
            <select value={draft.intentKind} onChange={(event) => setDraft({ ...draft, intentKind: event.target.value })}>
              {INTENT_KIND_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span>이름</span>
            <input value={draft.label} maxLength={180} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
          </label>
          <label className="is-stacked">
            <span>조문</span>
            <textarea value={draft.statement} maxLength={4000} rows={5} onChange={(event) => setDraft({ ...draft, statement: event.target.value })} />
          </label>
          {error && <div className="work-intent-picker-error">{error}</div>}
          <div className="work-intent-create-actions">
            <button type="button" onClick={() => { setCreating(false); setError('') }}>취소</button>
            <button type="button" className="is-save" onClick={createAndAttach}>작성·장착</button>
          </div>
        </div>
      )}
    </div>
  )
}
