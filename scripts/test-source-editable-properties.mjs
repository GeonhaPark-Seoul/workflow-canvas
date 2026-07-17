import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSourceEditablePropertyRegistry } from '../shared/sourceEditableProperties.js'
import {
  normalizeSourceEditableValue,
  SOURCE_EDITABLE_PROPERTY_DEFS,
  sourceEditablePropertyForAnchor,
} from '../shared/workflowSourceEditableProperties.js'
import {
  applyRegisteredSourceProperty,
  inspectRegisteredSourceProperty,
} from './source-edit-executor.mjs'

assert.equal(SOURCE_EDITABLE_PROPERTY_DEFS.length, 4)
assert.equal(sourceEditablePropertyForAnchor('shared/uiConstants.js', 'SYSTEM_NODE_DEFAULT_WIDTH').id, 'ui.system-node.default-width')
assert.equal(normalizeSourceEditableValue('ui.system-node.default-width', 159).valid, false)
assert.equal(normalizeSourceEditableValue('ui.system-module.color', 'red').valid, false)
assert.equal(normalizeSourceEditableValue('ui.source-twin.empty-message', '').valid, false)

const otherApplicationRegistry = createSourceEditablePropertyRegistry([{
  id: 'order.receipt.title',
  label: '주문서 제목',
  description: '주문 서비스의 영수증 제목',
  type: 'text',
  minimumLength: 1,
  maximumLength: 40,
  owner: '주문 UI',
  anchor: { path: 'app/ui_constants.py', exportName: 'RECEIPT_TITLE' },
  impactScope: ['주문 영수증'],
  requiredChecks: ['pytest'],
}])
assert.equal(otherApplicationRegistry.definitions.length, 1)
assert.equal(otherApplicationRegistry.definitionForAnchor('app/ui_constants.py', 'RECEIPT_TITLE').id, 'order.receipt.title')
assert.equal(otherApplicationRegistry.normalizeValue('order.receipt.title', '주문 완료').valid, true)
assert.equal(otherApplicationRegistry.definition('ui.system-node.default-width'), null)

const root = await mkdtemp(path.join(tmpdir(), 'workflow-source-edit-contract-'))
try {
  await mkdir(path.join(root, 'shared'))
  await writeFile(path.join(root, 'shared/uiConstants.js'), [
    'export const SYSTEM_NODE_DEFAULT_WIDTH = 240',
    'export const SYSTEM_NODE_DEFAULT_HEIGHT = 130',
    "export const SYSTEM_MODULE_COLOR = '#0d9488'",
    "export const SOURCE_TWIN_EMPTY_MESSAGE = '일치하는 코드 실체 없음'",
    '',
  ].join('\n'))
  const before = inspectRegisteredSourceProperty(root, 'ui.system-node.default-width')
  assert.equal(before.currentValue, 240)
  const edited = applyRegisteredSourceProperty(root, {
    propertyId: 'ui.system-node.default-width',
    expectedValue: 240,
    nextValue: 280,
    anchor: { path: 'shared/uiConstants.js', nodeType: 'VariableDeclaration', symbol: 'module', lineStart: 1, lineEnd: 1 },
  })
  assert.equal(edited.afterValue, 280)
  assert.match(await readFile(path.join(root, 'shared/uiConstants.js'), 'utf8'), /SYSTEM_NODE_DEFAULT_WIDTH = 280/)
  assert.throws(() => applyRegisteredSourceProperty(root, {
    propertyId: 'ui.system-node.default-width',
    expectedValue: 240,
    nextValue: 300,
  }), /이전 값과 현재 AST 값/)
  assert.throws(() => applyRegisteredSourceProperty(root, {
    propertyId: 'ui.system-node.default-width',
    expectedValue: 280,
    nextValue: 300,
    anchor: { path: 'shared/uiConstants.js', nodeType: 'VariableDeclaration', symbol: 'module', lineStart: 9, lineEnd: 9 },
  }), /AST 앵커/)
  assert.throws(() => inspectRegisteredSourceProperty(root, 'ui.unregistered'), /등록되지 않은/)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('Source editable-property contract checks passed')
