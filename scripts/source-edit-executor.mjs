import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import {
  normalizeSourceEditableValue,
  publicSourceEditableProperty,
  serializeSourceEditableValue,
  sourceEditablePropertyDefinition,
} from '../shared/workflowSourceEditableProperties.js'

const MAX_EDITABLE_FILE_BYTES = 64 * 1024

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function editableFile(root, definition) {
  const repositoryRoot = realpathSync(root)
  const target = path.resolve(repositoryRoot, definition.anchor.path)
  if (!target.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error('등록된 편집 파일이 저장소 밖을 가리킵니다.')
  const stat = lstatSync(target)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_EDITABLE_FILE_BYTES) {
    throw new Error('등록된 편집 파일이 일반 소형 파일이 아니어서 중단했습니다.')
  }
  return { repositoryRoot, target }
}

function visit(node, callback) {
  if (!node || typeof node !== 'object') return
  callback(node)
  for (const [key, child] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue
    if (Array.isArray(child)) {
      for (const item of child) if (item?.type) visit(item, callback)
    } else if (child?.type) visit(child, callback)
  }
}

function literalValue(node) {
  if (node?.type === 'NumericLiteral' && Number.isFinite(node.value)) return node.value
  if (node?.type === 'StringLiteral' && typeof node.value === 'string') return node.value
  return undefined
}

export function inspectRegisteredSourceProperty(root, propertyId) {
  const definition = sourceEditablePropertyDefinition(propertyId)
  if (!definition) throw new Error('등록되지 않은 편집 속성입니다.')
  const { target } = editableFile(root, definition)
  const source = readFileSync(target, 'utf8')
  let ast
  try {
    ast = parse(source, {
      sourceType: 'module',
      errorRecovery: false,
      plugins: ['jsx', 'importAttributes', 'topLevelAwait'],
    })
  } catch {
    throw new Error('등록된 편집 파일을 AST로 해석하지 못했습니다.')
  }
  const matches = []
  visit(ast.program, (node) => {
    if (node.type !== 'ExportNamedDeclaration' || node.declaration?.type !== 'VariableDeclaration') return
    for (const declaration of node.declaration.declarations ?? []) {
      if (declaration.id?.type !== 'Identifier' || declaration.id.name !== definition.anchor.exportName) continue
      const currentValue = literalValue(declaration.init)
      if (currentValue === undefined || !Number.isInteger(declaration.init.start) || !Number.isInteger(declaration.init.end)) continue
      matches.push({ declaration: node.declaration, declarator: declaration, literal: declaration.init, currentValue })
    }
  })
  if (matches.length !== 1) throw new Error('등록된 상수 선언을 정확히 하나 찾지 못했습니다.')
  const match = matches[0]
  const property = publicSourceEditableProperty(definition, match.currentValue)
  if (!property) throw new Error('현재 상수 값이 등록된 속성 계약을 벗어났습니다.')
  return {
    definition,
    property,
    path: definition.anchor.path,
    currentValue: property.currentValue,
    sourceFingerprint: hash(source),
    declaration: {
      nodeType: match.declaration.type,
      symbol: 'module',
      lineStart: match.declaration.loc?.start?.line ?? 1,
      lineEnd: match.declaration.loc?.end?.line ?? match.declaration.loc?.start?.line ?? 1,
    },
    literal: {
      nodeType: match.literal.type,
      start: match.literal.start,
      end: match.literal.end,
      source: source.slice(match.literal.start, match.literal.end),
    },
  }
}

function sameValue(left, right) {
  return typeof left === 'number' && typeof right === 'number'
    ? Object.is(left, right)
    : String(left) === String(right)
}

export function applyRegisteredSourceProperty(root, {
  propertyId,
  expectedValue,
  nextValue,
  anchor,
} = {}) {
  const before = inspectRegisteredSourceProperty(root, propertyId)
  const expected = normalizeSourceEditableValue(before.definition, expectedValue)
  const next = normalizeSourceEditableValue(before.definition, nextValue)
  if (!expected.valid || !sameValue(before.currentValue, expected.value)) {
    throw new Error('승인 계획의 이전 값과 현재 AST 값이 달라 편집을 중단했습니다.')
  }
  if (!next.valid) throw new Error(next.error)
  if (sameValue(before.currentValue, next.value)) throw new Error('현재 값과 새 값이 같아 편집할 내용이 없습니다.')
  if (
    anchor
    && (
      anchor.path !== before.path
      || anchor.nodeType !== before.declaration.nodeType
      || anchor.symbol !== before.declaration.symbol
      || Number(anchor.lineStart) !== before.declaration.lineStart
      || Number(anchor.lineEnd) !== before.declaration.lineEnd
    )
  ) {
    throw new Error('승인한 AST 앵커와 현재 상수 선언 위치가 달라 편집을 중단했습니다.')
  }
  const definition = before.definition
  const { target } = editableFile(root, definition)
  const source = readFileSync(target, 'utf8')
  if (hash(source) !== before.sourceFingerprint) throw new Error('검사 중 편집 파일이 달라졌습니다.')
  const serialized = serializeSourceEditableValue(definition, next.value)
  if (serialized == null) throw new Error('새 값을 안전한 코드 literal로 직렬화하지 못했습니다.')
  const updated = `${source.slice(0, before.literal.start)}${serialized}${source.slice(before.literal.end)}`
  writeFileSync(target, updated, 'utf8')
  const after = inspectRegisteredSourceProperty(root, propertyId)
  if (!sameValue(after.currentValue, next.value)) throw new Error('편집 후 AST 값 검증에 실패했습니다.')
  return {
    propertyId,
    label: definition.label,
    path: definition.anchor.path,
    beforeValue: before.currentValue,
    afterValue: after.currentValue,
    beforeSourceFingerprint: before.sourceFingerprint,
    afterSourceFingerprint: after.sourceFingerprint,
    impactScope: [...definition.impactScope],
    requiredChecks: [...definition.requiredChecks],
  }
}
