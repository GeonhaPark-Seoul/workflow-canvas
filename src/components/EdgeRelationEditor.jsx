import { useEffect, useState } from 'react'
import {
  edgeRelationInfo,
  RELATION_CONFIDENCE_DEFS,
  RELATION_DEFS,
  RELATION_FAMILY_DEFS,
  RELATION_SOURCE_DEFS,
} from '../../shared/relationOntology.js'

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #ffffff22',
  borderRadius: 5,
  background: '#14141c',
  color: '#e5e7eb',
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '7px 8px',
  outline: 'none',
}

export default function EdgeRelationEditor({ edge, sourceLabel, targetLabel, readOnly = false, onChange }) {
  const relation = edgeRelationInfo(edge?.data)
  const [customDraft, setCustomDraft] = useState(edge?.data?.relationLabel ?? '')
  const [evidenceDraft, setEvidenceDraft] = useState(edge?.data?.relationEvidence ?? '')
  const [evidenceRefDraft, setEvidenceRefDraft] = useState(edge?.data?.relationEvidenceRef ?? '')

  useEffect(() => {
    setCustomDraft(edge?.data?.relationLabel ?? '')
    setEvidenceDraft(edge?.data?.relationEvidence ?? '')
    setEvidenceRefDraft(edge?.data?.relationEvidenceRef ?? '')
  }, [edge?.id, edge?.data?.relationLabel, edge?.data?.relationEvidence, edge?.data?.relationEvidenceRef])

  const selectRelation = (event) => {
    const relationType = event.target.value
    onChange?.({
      relationType,
      relationLabel: relationType === 'custom' ? customDraft : '',
      relationExplicit: true,
    })
  }

  const commitCustom = () => {
    if (relation.id !== 'custom') return
    onChange?.({ relationType: 'custom', relationLabel: customDraft, relationExplicit: true })
  }

  const commitEvidence = () => {
    onChange?.({ relationEvidence: evidenceDraft, relationEvidenceRef: evidenceRefDraft })
  }

  return (
    <div style={{ padding: '5px 7px 8px', borderBottom: '1px solid #ffffff18', marginBottom: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: relation.color, flexShrink: 0 }} />
        <span style={{ color: '#b8bfcc', fontSize: 10, fontWeight: 800 }}>관계 의미</span>
        <span
          title={relation.provenance.reality.id === 'verified' ? '서버가 확인한 관계' : '작성자가 기록한 관계'}
          style={{
            marginLeft: 'auto', color: relation.provenance.reality.color,
            border: `1px solid ${relation.provenance.reality.color}66`, borderRadius: 4,
            padding: '1px 5px', fontSize: 9, fontWeight: 800,
          }}
        >
          {relation.provenance.reality.label}
        </span>
      </div>

      <select value={relation.id} onChange={selectRelation} disabled={readOnly} style={fieldStyle} aria-label="연결선 관계 종류">
        {RELATION_FAMILY_DEFS.map((family) => (
          <optgroup key={family.id} label={family.label}>
            {RELATION_DEFS.filter((item) => item.family === family.id).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, color: '#8f97a7', fontSize: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={relation.explicit}
          disabled={readOnly}
          onChange={(event) => onChange?.({
            relationType: relation.id,
            relationLabel: edge?.data?.relationLabel ?? '',
            relationExplicit: event.target.checked,
          })}
          style={{ accentColor: relation.color }}
        />
        캔버스에 관계 라벨 표시
      </label>

      {relation.id === 'custom' && (
        <input
          value={customDraft}
          onChange={(event) => setCustomDraft(event.target.value)}
          onBlur={commitCustom}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          maxLength={40}
          disabled={readOnly}
          placeholder="이 관계의 이름"
          aria-label="사용자 정의 관계 이름"
          style={{ ...fieldStyle, marginTop: 6 }}
        />
      )}

      <details style={{ marginTop: 8, borderTop: '1px solid #ffffff12', paddingTop: 6 }}>
        <summary style={{ color: '#8f97a7', fontSize: 10, fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>
          근거·출처
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, marginTop: 7 }}>
          <label style={{ minWidth: 0, color: '#737b8b', fontSize: 9 }}>
            출처
            <select
              value={relation.provenance.source.id}
              onChange={(event) => onChange?.({ relationSourceKind: event.target.value })}
              disabled={readOnly}
              style={{ ...fieldStyle, marginTop: 3 }}
              aria-label="관계 근거 출처"
            >
              {RELATION_SOURCE_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label
            title="작성자의 판단이며 서버 검증 상태와 별개입니다."
            style={{ minWidth: 0, color: '#737b8b', fontSize: 9 }}
          >
            작성자 신뢰도
            <select
              value={relation.provenance.confidence.id}
              onChange={(event) => onChange?.({ relationConfidence: event.target.value })}
              disabled={readOnly}
              style={{ ...fieldStyle, marginTop: 3 }}
              aria-label="작성자 판단 신뢰도"
            >
              {RELATION_CONFIDENCE_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <textarea
          value={evidenceDraft}
          onChange={(event) => setEvidenceDraft(event.target.value)}
          onBlur={commitEvidence}
          maxLength={500}
          rows={3}
          disabled={readOnly}
          placeholder="판단 근거"
          aria-label="관계 판단 근거"
          style={{ ...fieldStyle, marginTop: 6, resize: 'vertical', minHeight: 58 }}
        />
        <input
          value={evidenceRefDraft}
          onChange={(event) => setEvidenceRefDraft(event.target.value)}
          onBlur={commitEvidence}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
          maxLength={300}
          disabled={readOnly}
          placeholder="문서·코드·URL·자원 참조 (비밀값 금지)"
          aria-label="관계 근거 참조"
          style={{ ...fieldStyle, marginTop: 6 }}
        />
      </details>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span title={sourceLabel} style={{ color: '#9ca3af', fontSize: 9.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sourceLabel}</span>
        <span style={{ color: relation.color, fontSize: 9.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {relation.directed ? '→' : '↔'} {relation.label}
        </span>
        <span title={targetLabel} style={{ color: '#9ca3af', fontSize: 9.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{targetLabel}</span>
      </div>
    </div>
  )
}
