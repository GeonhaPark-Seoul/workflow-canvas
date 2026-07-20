import assert from 'node:assert/strict'

import {
  parseGeneratedFunctionalContextPack,
  runSourceLensWorkflow,
  serializeFunctionalContextPack,
  SOURCE_FUNCTIONAL_CONTEXT_SCHEMA_VERSION,
} from './source-lens-engine.mjs'

const sourceFiles = new Map([
  ['package.json', JSON.stringify({ name: 'functional-context-fixture' })],
  ['AGENTS.md', '# AI 작업 규칙\n\n## 저장소 지휘 명령\n'],
  ['docs/IMPLEMENTATION_NOTES.md', '# 내부 배포 명령\n\n## 작업 로그\n'],
  ['README.md', [
    '# 주문 서비스',
    '',
    '## 주문 관리',
    '',
    '- 주문 조회',
    '- 주문 취소',
    '',
  ].join('\n')],
  ['src/App.jsx', `
export function App() {
  return <div>{(() => {
    const styles = { background: '#12121a', border: '1px solid #ffffff18' }
    return <a href="/orders" title="주문 관리" style={styles}>주문하기</a>
  })()}</div>
}
`],
  ['api/orders.js', 'export function handler() { return { ok: true } }\n'],
  ['orders.sql', 'create table if not exists orders (id bigint primary key);\n'],
  ['scripts/test-orders.mjs', 'export const ordersStayValid = () => true\n'],
])

const baseline = runSourceLensWorkflow({
  files: sourceFiles,
  outputs: { featureModel: true, flows: true },
})
const baselinePack = baseline.functionalContextPack
assert.equal(baselinePack.schemaVersion, SOURCE_FUNCTIONAL_CONTEXT_SCHEMA_VERSION)
assert.equal(baselinePack.type, 'FunctionalContextPack')
assert.equal(baselinePack.strategy, 'documents-with-source-validation')
assert.equal(baselinePack.documents.find((item) => item.path === 'README.md')?.freshness, 'baseline')
assert.equal(baselinePack.documents.find((item) => item.path === 'README.md')?.used, true)
assert.equal(baselinePack.documents.some((item) => item.path === 'AGENTS.md'), false)
assert.equal(baselinePack.vocabulary.some((item) => item.normalized === '저장소 지휘 명령'), false)
assert.equal(baselinePack.documents.some((item) => item.path === 'docs/IMPLEMENTATION_NOTES.md'), false)
assert.equal(baselinePack.vocabulary.some((item) => item.normalized === '내부 배포 명령'), false)
const documentedOrderTerm = baselinePack.vocabulary.find((item) => item.normalized === '주문 관리')
assert.ok(documentedOrderTerm)
assert.ok(documentedOrderTerm.sourceKinds.includes('document-heading'))
assert.ok(documentedOrderTerm.sourceKinds.includes('ui-text'))
assert.equal(documentedOrderTerm.verification, 'source-evidence')
assert.equal(baselinePack.vocabulary.some((item) => item.normalized === '12121a'), false)
assert.equal(baselinePack.vocabulary.some((item) => item.normalized.includes('solid ffffff18')), false)

const repeated = runSourceLensWorkflow({
  files: sourceFiles,
  previous: baseline.manifest,
  previousFunctionalContextPack: baselinePack,
  outputs: { featureModel: true, flows: true },
})
assert.equal(repeated.functionalContextPack.documents.find((item) => item.path === 'README.md')?.freshness, 'current')
assert.equal(repeated.functionalContextPack.fingerprint, baselinePack.fingerprint)
assert.ok(repeated.functionalContextPack.summary.reusedTerms > 0)
assert.ok(repeated.functionalContextPack.vocabulary.some((item) => item.reusedFromPrevious))

const changedCodeFiles = new Map(sourceFiles)
changedCodeFiles.set('src/App.jsx', `
export function App() {
  return <a href="/payments" title="결제 관리">결제하기</a>
}
`)
const staleDocumentRun = runSourceLensWorkflow({
  files: changedCodeFiles,
  previous: baseline.manifest,
  previousFunctionalContextPack: baselinePack,
  outputs: { flows: true },
})
assert.equal(staleDocumentRun.functionalContextPack.strategy, 'source-evidence-fallback')
assert.equal(
  staleDocumentRun.functionalContextPack.documents.find((item) => item.path === 'README.md')?.freshness,
  'possibly-stale',
)
assert.equal(staleDocumentRun.functionalContextPack.documents.find((item) => item.path === 'README.md')?.used, false)
assert.ok(staleDocumentRun.functionalContextPack.diagnostics.some((item) => item.code === 'functional-context-documents-possibly-stale'))
assert.ok(staleDocumentRun.functionalContextPack.vocabulary.some((item) => item.normalized === '결제 관리'))

const changedDocumentFiles = new Map(changedCodeFiles)
changedDocumentFiles.set('README.md', [
  '# 주문 서비스',
  '',
  '## 결제 관리',
  '',
  '- 결제 실행',
  '',
].join('\n'))
const changedDocumentRun = runSourceLensWorkflow({
  files: changedDocumentFiles,
  previous: baseline.manifest,
  previousFunctionalContextPack: baselinePack,
  outputs: { flows: true },
})
assert.equal(changedDocumentRun.functionalContextPack.strategy, 'documents-with-source-validation')
assert.equal(
  changedDocumentRun.functionalContextPack.documents.find((item) => item.path === 'README.md')?.freshness,
  'changed',
)
assert.ok(changedDocumentRun.functionalContextPack.vocabulary.some((item) => item.normalized === '결제 관리'))

const noDocumentFiles = new Map([...sourceFiles].filter(([path]) => !/\.mdx?$/i.test(path)))
const fallback = runSourceLensWorkflow({
  files: noDocumentFiles,
  outputs: { flows: true },
}).functionalContextPack
assert.equal(fallback.strategy, 'source-evidence-fallback')
const fallbackKinds = new Set(fallback.vocabulary.flatMap((item) => item.sourceKinds))
for (const kind of ['ui-text', 'screen-path', 'api-route', 'database', 'test', 'static-flow']) {
  assert.ok(fallbackKinds.has(kind), `fallback 기능 어휘에 ${kind} 근거가 필요합니다.`)
}
assert.ok(fallback.diagnostics.some((item) => item.code === 'functional-context-document-fallback'))

const serialized = serializeFunctionalContextPack(baselinePack)
assert.deepEqual(parseGeneratedFunctionalContextPack(serialized), baselinePack)
assert.equal(parseGeneratedFunctionalContextPack('not a manifest'), null)

console.log('Source Lens functional-context bootstrap checks passed')
