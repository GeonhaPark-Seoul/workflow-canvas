import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createIntentNodeData,
  extractIntentClauseCandidates,
  intentVersionState,
  MAX_INTENT_CLAUSES,
  MAX_INTENT_SOURCES,
  MAX_INTENT_VERSIONS,
  normalizeIntentClauses,
  normalizeIntentNodeData,
  normalizeIntentSources,
  recordIntentVersion,
} from '../shared/intentOntology.js'
import { toExternalCanvasNode } from '../mcp/store.js'

const initial = createIntentNodeData('strategy')
assert.equal(initial.intentKind, 'strategy')
assert.equal(initial.intentStatus, 'draft')
assert.equal(initial.intentVersions.length, 0)
assert.deepEqual(initial.intentSources, [])
assert.deepEqual(initial.intentClauses, [])
assert.equal(intentVersionState(initial).label, '미기록 초안')

const sources = normalizeIntentSources([{
  id: 'source-meeting-1',
  sourceKind: 'meeting',
  title: '<b>출시 전략회의</b>',
  text: [
    '이번 출시는 비개발자 관제실을 먼저 만든다.',
    '사용자 비밀키를 저장하면 안 된다.',
    '배포 전 보안 검사는 반드시 통과해야 한다.',
    '성공 기준은 Work와 Intent의 연결을 캔버스에서 확인하는 것이다.',
  ].join('\n'),
  sourceRef: 'meeting:2026-07-16',
  addedAt: '2026-07-16T00:00:00.000Z',
}])
assert.equal(sources[0].title, '출시 전략회의')
const extracted = extractIntentClauseCandidates({ ...initial, intentSources: sources })
assert.ok(extracted.some((clause) => clause.clauseKind === 'prohibition' && clause.enforcement === 'block'))
assert.ok(extracted.some((clause) => clause.clauseKind === 'requirement'))
assert.ok(extracted.every((clause) => clause.status === 'candidate' && clause.sourceExcerpt))
assert.deepEqual(
  extractIntentClauseCandidates({ ...initial, intentSources: sources, intentClauses: extracted }),
  extracted,
)

const candidatesOnly = recordIntentVersion({
  ...initial,
  label: '후보 전용',
  statement: '후보는 승인 전까지 Work를 통제하지 않는다.',
  intentSources: sources,
  intentClauses: extracted,
}, '2026-07-16T00:30:00.000Z')
assert.deepEqual(candidatesOnly.intentVersions[0].intentClauses, [])

const approvedClause = { ...extracted[0], status: 'approved' }
const approved = recordIntentVersion({
  ...initial,
  label: '확정 조문',
  statement: '승인된 조문만 버전에 고정한다.',
  intentSources: sources,
  intentClauses: [approvedClause, ...extracted.slice(1)],
}, '2026-07-16T00:40:00.000Z')
assert.equal(approved.intentVersions[0].intentClauses.length, 1)
const revisedClause = normalizeIntentNodeData({
  ...approved,
  intentClauses: approved.intentClauses.map((clause) => (
    clause.id === approvedClause.id ? { ...clause, text: `${clause.text} 수정` } : clause
  )),
})
assert.equal(intentVersionState(revisedClause).dirty, true)

const first = recordIntentVersion({
  ...initial,
  label: '<b>출시 전략</b>',
  statement: '비개발자 바이브 코더가\n제품 상태를 이해하게 한다.',
  intentStatus: 'active',
}, '2026-07-16T01:00:00.000Z')
assert.equal(first.label, '출시 전략')
assert.equal(first.intentVersions[0].version, 1)
assert.equal(first.intentVersions[0].recordedAt, '2026-07-16T01:00:00.000Z')
assert.equal(intentVersionState(first).dirty, false)

const unchanged = recordIntentVersion(first, '2026-07-16T02:00:00.000Z')
assert.equal(unchanged.intentVersions.length, 1)

const edited = normalizeIntentNodeData({ ...first, statement: `${first.statement}\n보안 상태도 함께 보여준다.` })
assert.equal(intentVersionState(edited).label, 'v1 이후 수정')
const second = recordIntentVersion(edited, '2026-07-16T03:00:00.000Z')
assert.equal(second.intentVersions.at(-1).version, 2)
assert.equal(intentVersionState(second).label, 'v2 기록됨')

const malformed = normalizeIntentNodeData({
  intentKind: 'unknown-kind',
  intentStatus: 'unknown-status',
  intentVersions: [
    { version: 1, recordedAt: 'not-a-date' },
    { version: -1, recordedAt: '2026-07-16T00:00:00.000Z' },
  ],
})
assert.equal(malformed.intentKind, 'intent')
assert.equal(malformed.intentStatus, 'draft')
assert.deepEqual(malformed.intentVersions, [])

assert.equal(normalizeIntentSources(Array.from({ length: MAX_INTENT_SOURCES + 4 }, (_, index) => ({
  id: `source-${index}`,
  text: `source ${index}`,
}))).length, MAX_INTENT_SOURCES)
assert.equal(normalizeIntentClauses(Array.from({ length: MAX_INTENT_CLAUSES + 4 }, (_, index) => ({
  id: `clause-${index}`,
  text: `clause ${index}`,
}))).length, MAX_INTENT_CLAUSES)

let bounded = createIntentNodeData()
for (let index = 0; index < MAX_INTENT_VERSIONS + 5; index += 1) {
  bounded = recordIntentVersion({ ...bounded, statement: `revision ${index}` }, `2026-07-16T${String(index % 24).padStart(2, '0')}:00:00.000Z`)
}
assert.equal(bounded.intentVersions.length, MAX_INTENT_VERSIONS)
assert.equal(bounded.intentVersions.at(-1).version, MAX_INTENT_VERSIONS + 5)

const privateSourceText = 'PRIVATE-RAW-MEETING-TEXT'
const privateSourceExcerpt = 'PRIVATE-RAW-SOURCE-EXCERPT'
const externalData = recordIntentVersion({
  ...createIntentNodeData('principle'),
  label: '외부 표현 검사',
  statement: '공개 요약',
  intentSources: [{ id: 'private-source', sourceKind: 'meeting', title: '비공개 회의', text: privateSourceText }],
  intentClauses: [{
    id: 'approved-clause', clauseKind: 'prohibition', status: 'approved', enforcement: 'block',
    text: '비밀키를 저장하지 않는다.', sourceId: 'private-source', sourceExcerpt: privateSourceExcerpt, confidence: 'high',
  }],
})
const externalNode = toExternalCanvasNode({
  id: 'intent-external', type: 'intent', position: { x: 0, y: 0 }, data: externalData,
}, new Map())
assert.equal(JSON.stringify(externalNode).includes(privateSourceText), false)
assert.equal(JSON.stringify(externalNode).includes(privateSourceExcerpt), false)
assert.equal(externalNode.source_count, 1)
assert.equal(externalNode.approved_clauses.length, 1)
assert.deepEqual(Object.keys(externalNode.approved_clauses[0]).sort(), ['clause_kind', 'enforcement', 'id', 'text'])

const [app, palette, notes, workspace, store] = await Promise.all([
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NodePalette.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NotesPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/IntentWorkspace.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../mcp/store.js', import.meta.url), 'utf8'),
])
assert.match(app, /intent:\s*IntentNode/)
assert.match(app, /recordIntentNodeVersion/)
assert.match(palette, /nodeType:\s*'intent'/)
assert.match(notes, /현재 내용을 버전으로 기록/)
assert.match(notes, /IntentWorkspace/)
assert.match(workspace, /조문 후보 찾기/)
assert.match(store, /intent_versions/)
assert.doesNotMatch(store, /intentSources:/)

console.log('Intent source, clause extraction, privacy, and explicit versioning checks passed')
