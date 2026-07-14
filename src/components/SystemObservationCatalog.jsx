import { useMemo, useState } from 'react'
import {
  systemObservationAvailabilityDefinition,
  systemObservationCategoryDefinition,
  systemObservationRefreshDefinition,
} from '../../shared/systemObservationCatalog.js'

const FILTERS = Object.freeze([
  Object.freeze({ id: 'all', label: '전체' }),
  Object.freeze({ id: 'available', label: '확인됨' }),
  Object.freeze({ id: 'unavailable', label: '제한·미확인' }),
])

const SOURCE_LABELS = Object.freeze({
  runtime: '실행',
  code: '코드',
  connector: '커넥터',
  manual: '수동',
})

const SENSITIVITY_LABELS = Object.freeze({
  public: '공개',
  internal: '내부',
  sensitive: '민감',
  secret_reference: '비밀 참조',
})

function formattedValue(item) {
  if (item.valueType === 'boolean') return item.value ? '예' : '아니오'
  if (item.valueType === 'duration_ms') return `${item.value}ms`
  if (item.valueType === 'timestamp') {
    const date = new Date(item.value)
    if (Number.isFinite(date.getTime())) {
      return date.toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    }
  }
  return `${item.value}${item.unit ? ` ${item.unit}` : ''}`
}

export default function SystemObservationCatalog({ catalog, collectionLabel }) {
  const [filter, setFilter] = useState('all')
  const entries = Array.isArray(catalog) ? catalog : []
  const availableCount = entries.filter((item) => item.availability === 'available').length
  const groups = useMemo(() => {
    const filtered = entries.filter((item) => (
      filter === 'all'
      || (filter === 'available' && item.availability === 'available')
      || (filter === 'unavailable' && item.availability !== 'available')
    ))
    const byCategory = new Map()
    for (const item of filtered) {
      if (!byCategory.has(item.category)) byCategory.set(item.category, [])
      byCategory.get(item.category).push(item)
    }
    return [...byCategory.entries()]
  }, [entries, filter])

  return (
    <div className="system-observation-catalog" aria-label={collectionLabel || '관측 정보'}>
      <div className="system-observation-catalog-heading">
        <strong>{collectionLabel || '관측 정보'}</strong>
        <span>{availableCount}/{entries.length}</span>
      </div>
      <div className="system-observation-catalog-filters" role="group" aria-label="관측 정보 필터">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? 'is-active' : ''}
            aria-pressed={filter === item.id}
            onClick={(event) => { event.stopPropagation(); setFilter(item.id) }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="system-observation-catalog-list">
        {groups.length ? groups.map(([categoryId, items]) => {
          const category = systemObservationCategoryDefinition(categoryId)
          const categoryAvailable = items.filter((item) => item.availability === 'available').length
          return (
            <section key={categoryId} className="system-observation-category">
              <div className="system-observation-category-heading">
                <strong>{category.label}</strong>
                <span>{categoryAvailable}/{items.length}</span>
              </div>
              {items.map((item) => {
                const availability = systemObservationAvailabilityDefinition(item.availability)
                const refresh = systemObservationRefreshDefinition(item.refreshMode)
                return (
                  <div className="system-observation-row" key={item.id}>
                    <div className="system-observation-row-heading">
                      <strong title={item.label}>{item.label}</strong>
                      <span className={`is-${availability.tone}`}>{availability.label}</span>
                    </div>
                    <div className={`system-observation-value${item.availability === 'available' ? '' : ' is-unavailable'}`}>
                      {item.availability === 'available' ? formattedValue(item) : item.reason}
                    </div>
                    <div className="system-observation-meta">
                      <span>{SOURCE_LABELS[item.sourceKind] || item.sourceKind}</span>
                      <span>{refresh.label}</span>
                      <span>{SENSITIVITY_LABELS[item.sensitivity] || item.sensitivity}</span>
                      {item.evidenceRef && <code title={item.evidenceRef}>{item.evidenceRef}</code>}
                    </div>
                  </div>
                )
              })}
            </section>
          )
        }) : (
          <div className="system-runtime-data-empty">표시할 항목 없음</div>
        )}
      </div>
    </div>
  )
}
