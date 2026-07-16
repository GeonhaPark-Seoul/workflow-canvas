import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createIntentNodeData, recordIntentVersion } from '../shared/intentOntology.js'
import {
  createWorkDefinition,
  MAX_WORK_INTENT_BINDINGS,
  normalizeWorkDefinition,
  normalizeWorkIntentBindings,
  validateWorkDefinition,
  workIntentBindingFromNode,
  workIntentOptionFromNode,
} from '../shared/workOntology.js'
import {
  normalizeSystemPart,
  normalizeSystemParts,
  validateSystemPartInput,
} from '../shared/systemPartOntology.js'

const blank = createWorkDefinition()
assert.equal(validateWorkDefinition(blank), 'Work에는 투입이 필요합니다.')

const validWork = normalizeWorkDefinition({
  ...blank,
  trigger: 'event',
  executor: 'Maintainer Agent',
  input: '승인된 변경 요청',
  process: '테스트 후 변경을 적용한다.',
  output: '검증된 변경 결과',
  successCriteria: '필수 테스트 통과',
  ignored: '저장되면 안 됨',
})
assert.equal(validateWorkDefinition(validWork), null)
assert.equal(validWork.ignored, undefined)

const normalPart = normalizeSystemPart({
  id: 'part-normal',
  kind: 'connection',
  label: '일반 연결',
  ref: '',
  exposure: 'internal',
  sourceKind: 'manual',
  evidenceRef: '',
  work: validWork,
})
assert.equal(normalPart.work, undefined, '일반 파츠는 Work/Intent 계약을 보관하지 않아야 한다.')

const workPart = normalizeSystemPart({
  id: 'part-work',
  kind: 'work',
  label: '배포 검증',
  ref: 'release-check',
  exposure: 'internal',
  sourceKind: 'manual',
  evidenceRef: '',
  work: validWork,
})
assert.equal(workPart.kind, 'work')
assert.equal(workPart.work.input, '승인된 변경 요청')

assert.match(validateSystemPartInput({
  ...workPart,
  work: { ...workPart.work, input: '실행 키는 sk_abcdefghijklmnopqrstuvwxyz 입니다.' },
}), /실제 키나 토큰/)

const intentV1 = recordIntentVersion({
  ...createIntentNodeData('principle'),
  label: '비밀값 금지',
  statement: '실제 비밀값을 코드나 캔버스에 저장하지 않는다.',
  intentStatus: 'active',
  intentClauses: [{
    id: 'intent-clause-1',
    clauseKind: 'prohibition',
    status: 'approved',
    enforcement: 'block',
    text: '실제 비밀값을 저장하지 않는다.',
    sourceId: 'intent-source-1',
    sourceExcerpt: '실제 비밀값을 저장하지 않는다.',
    confidence: 'high',
  }],
}, '2026-07-16T01:00:00.000Z')
const intentNodeV1 = { id: 'intent-node-1', type: 'intent', data: intentV1 }
const bindingV1 = workIntentBindingFromNode(intentNodeV1)
assert.equal(bindingV1.version, 1)
assert.equal(bindingV1.clauseCount, 1)
const dirtyOption = workIntentOptionFromNode({
  ...intentNodeV1,
  data: { ...intentV1, label: '아직 기록하지 않은 이름', statement: '아직 기록하지 않은 조문' },
})
assert.equal(dirtyOption.label, '비밀값 금지')
assert.equal(dirtyOption.statement, '실제 비밀값을 코드나 캔버스에 저장하지 않는다.')
assert.equal(dirtyOption.dirty, true)

const intentV2 = recordIntentVersion({ ...intentV1, statement: `${intentV1.statement} 외부 로그도 포함한다.` }, '2026-07-16T02:00:00.000Z')
const bindingV2 = workIntentBindingFromNode({ ...intentNodeV1, data: intentV2 })
assert.equal(bindingV1.version, 1, '기존 Work 바인딩은 새 Intent 버전이 생겨도 자동 변경되면 안 된다.')
assert.equal(bindingV2.version, 2)

const deduped = normalizeWorkIntentBindings([bindingV1, bindingV2])
assert.equal(deduped.length, 1)
assert.equal(deduped[0].version, 2)

const bounded = normalizeWorkIntentBindings(Array.from({ length: MAX_WORK_INTENT_BINDINGS + 6 }, (_, index) => ({
  ...bindingV1,
  intentNodeId: `intent-node-${index}`,
})))
assert.equal(bounded.length, MAX_WORK_INTENT_BINDINGS)

const normalizedParts = normalizeSystemParts([{ ...workPart, work: { ...workPart.work, intentBindings: [bindingV1] } }])
assert.equal(normalizedParts[0].work.intentBindings[0].intentNodeId, 'intent-node-1')

const [app, systemNode, picker, css] = await Promise.all([
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/nodes/SystemNode.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/WorkIntentPicker.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
])
assert.match(app, /workIntentLibrary/)
assert.match(app, /onCreateIntentForWork/)
assert.match(app, /intentNodeId:\s*idMap\.get\(binding\.intentNodeId\)/)
assert.match(systemNode, /work-intent-rail/)
assert.match(systemNode, /투입 → 처리 → 결과/)
assert.match(picker, /새 Intent 작성/)
assert.match(css, /\.work-intent-module/)

console.log('Work-only Intent assembly, pinned versions, and secret boundary checks passed')
