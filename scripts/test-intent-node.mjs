import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createIntentNodeData,
  intentVersionState,
  MAX_INTENT_VERSIONS,
  normalizeIntentNodeData,
  recordIntentVersion,
} from '../shared/intentOntology.js'

const initial = createIntentNodeData('strategy')
assert.equal(initial.intentKind, 'strategy')
assert.equal(initial.intentStatus, 'draft')
assert.equal(initial.intentVersions.length, 0)
assert.equal(intentVersionState(initial).label, '미기록 초안')

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

let bounded = createIntentNodeData()
for (let index = 0; index < MAX_INTENT_VERSIONS + 5; index += 1) {
  bounded = recordIntentVersion({ ...bounded, statement: `revision ${index}` }, `2026-07-16T${String(index % 24).padStart(2, '0')}:00:00.000Z`)
}
assert.equal(bounded.intentVersions.length, MAX_INTENT_VERSIONS)
assert.equal(bounded.intentVersions.at(-1).version, MAX_INTENT_VERSIONS + 5)

const [app, palette, notes, store] = await Promise.all([
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NodePalette.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/NotesPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../mcp/store.js', import.meta.url), 'utf8'),
])
assert.match(app, /intent:\s*IntentNode/)
assert.match(app, /recordIntentNodeVersion/)
assert.match(palette, /nodeType:\s*'intent'/)
assert.match(notes, /현재 내용을 버전으로 기록/)
assert.match(store, /intent_versions/)

console.log('Intent node contract and explicit versioning checks passed')
