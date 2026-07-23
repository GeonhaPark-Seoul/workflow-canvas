import { systemPartContainsSecretLiteral } from './systemPartOntology.js'
import {
  WORKSHOP_DISPLAY_NAMES,
  WORKSHOP_STAGE_DISPLAY_NAMES,
} from './uiConstants.js'

export const WORKSHOP_STAGES = Object.freeze([
  'backlog',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
])

export const WORKSHOP_ASSIGNEE_KINDS = Object.freeze([
  'manual',
  'yescode',
  'nocode',
])

export const WORKSHOP_STATUSES = Object.freeze([
  'active',
  'done',
  'archived',
])

export const WORKSHOP_LIMITS = Object.freeze({
  title: 240,
  reason: 5000,
  assigneeLabel: 160,
  threadTitle: 240,
  authorLabel: 160,
  messageBody: 100000,
  artifactKind: 120,
  artifactBody: 100000,
  externalRef: 2000,
  contextPack: 12000,
})

export const WORKSHOP_STAGE_CONTRACTS = Object.freeze([
  Object.freeze({
    stage: 'backlog',
    position: 0,
    recommendedArtifactKinds: Object.freeze([]),
    requiredRecordFields: Object.freeze(['title', 'reason']),
    gateGuidance: '한 줄 설명과 이 일을 하는 이유를 확인한 뒤 기획으로 보냅니다.',
  }),
  Object.freeze({
    stage: 'A',
    position: 1,
    recommendedArtifactKinds: Object.freeze(['design-brief']),
    requiredRecordFields: Object.freeze([]),
    gateGuidance: '범위·성공 기준·구현 지시가 담긴 기획서 또는 설계의뢰서를 확인합니다.',
  }),
  Object.freeze({
    stage: 'B',
    position: 2,
    recommendedArtifactKinds: Object.freeze([
      'patch',
      'base-commit',
      'sha256',
      'verification',
    ]),
    requiredRecordFields: Object.freeze([]),
    gateGuidance: 'patch, 기준 커밋, SHA-256, 검증 결과를 확인합니다.',
  }),
  Object.freeze({
    stage: 'C',
    position: 3,
    recommendedArtifactKinds: Object.freeze([
      'deployment-record',
      'post-deploy-e2e',
    ]),
    requiredRecordFields: Object.freeze([]),
    gateGuidance: '배포 기록과 배포 후 사용자 실제 확인 결과를 확인합니다.',
  }),
  Object.freeze({
    stage: 'D',
    position: 4,
    recommendedArtifactKinds: Object.freeze([
      'observation-link',
      'status-record',
    ]),
    requiredRecordFields: Object.freeze([]),
    gateGuidance: '운영에 상주할 수 있습니다. 다음 단계로 갈 때는 관측 연결과 상태 기록을 확인합니다.',
  }),
  ...['E', 'F', 'G', 'H'].map((stage, index) => Object.freeze({
    stage,
    position: index + 5,
    recommendedArtifactKinds: Object.freeze([]),
    requiredRecordFields: Object.freeze([]),
    gateGuidance: 'Connector가 연결되기 전까지 자유 형식 기록을 확인하고 수동으로 승인합니다.',
  })),
])

export const WORKSHOP_STAGE_CONTRACT_BY_ID = Object.freeze(
  Object.fromEntries(WORKSHOP_STAGE_CONTRACTS.map((contract) => [contract.stage, contract])),
)

const STAGE_SET = new Set(WORKSHOP_STAGES)
const ASSIGNEE_KIND_SET = new Set(WORKSHOP_ASSIGNEE_KINDS)
const STATUS_SET = new Set(WORKSHOP_STATUSES)
const SECRET_ASSIGNMENT_PATTERN = /(?:api[_ -]?key|access[_ -]?key|service[_ -]?key|token|secret|password|credential)\s*(?:=|:)\s*['"`]?[a-zA-Z0-9_./+=-]{12,}/i
const AUTHORIZATION_VALUE_PATTERN = /\b(?:bearer|basic)\s+[a-zA-Z0-9._~+/=-]{16,}/i
const URL_USERINFO_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^/\s]+@/i
const UNSAFE_EXTERNAL_REF_SCHEME = /^(?:javascript|data|vbscript):/i
const SIGNED_QUERY_KEY = /^(?:x-amz-|x-goog-)?(?:access[_-]?token|api[_-]?key|service[_-]?key|auth(?:orization)?|code|credential|key|passw(?:or)?d|secret|sig|signature|token)$/i
const SIGNED_FRAGMENT_KEY = /(?:^|[?&#])(?:x-(?:amz|goog)-)?(?:access[_-]?token|api[_-]?key|service[_-]?key|auth(?:orization)?|code|credential|key|passw(?:or)?d|secret|sig|signature|token)=/i
const SLACK_WEBHOOK_PATH = /^\/services\/[^/?#]+/i
const DISCORD_WEBHOOK_PATH = /^\/api(?:\/v\d+)?\/webhooks\/[^/]+\/[^/]+/i
const TELEGRAM_BOT_PATH = /^\/bot[^/]{12,}\//i
const SECRET_BEARING_PATH = /\/(?:webhooks?|hooks?|tokens?|secrets?|credentials?|authorization)(?:\/|=)[^/?#\s]{12,}/i

export class WorkshopContractError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'WorkshopContractError'
    this.code = code
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function designateWorkshopControlNode(nodes, targetId) {
  if (!Array.isArray(nodes)) {
    throw new WorkshopContractError('INVALID_NODE_LIST', '관제 노드를 지정할 캔버스 노드 목록이 필요합니다.')
  }
  const target = nodes.find((node) => node?.id === targetId)
  if (!target || target.type !== 'system') {
    throw new WorkshopContractError('INVALID_CONTROL_NODE', '관제 노드는 시스템 노드에만 지정할 수 있습니다.')
  }

  return nodes.map((node) => {
    if (node?.type !== 'system') return node
    const isTarget = node.id === targetId
    const isCurrentControlNode = node.data?.workshopRole === 'control-node'
    if (isTarget === isCurrentControlNode) return node

    const data = plainObject(node.data) ? { ...node.data } : {}
    if (isTarget) data.workshopRole = 'control-node'
    else delete data.workshopRole
    return { ...node, data }
  })
}

function text(value, {
  field,
  maxLength,
  required = false,
  singleLine = false,
  secretSafe = true,
} = {}) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (required && !normalized) {
    throw new WorkshopContractError('REQUIRED_FIELD', `${field} 값이 필요합니다.`)
  }
  if (normalized.length > maxLength) {
    throw new WorkshopContractError('FIELD_TOO_LARGE', `${field} 값이 ${maxLength}자를 넘었습니다.`)
  }
  if (/[\u0000\u007f]/.test(normalized) || (singleLine && /[\r\n]/.test(normalized))) {
    throw new WorkshopContractError('INVALID_TEXT', `${field} 형식이 올바르지 않습니다.`)
  }
  if (secretSafe && workshopContainsSecretValue(normalized)) {
    throw new WorkshopContractError(
      'SECRET_VALUE_BLOCKED',
      `${field}에는 실제 키·토큰·비밀번호 값 대신 참조 이름만 입력할 수 있습니다.`,
    )
  }
  return normalized
}

function identifier(value, field) {
  return text(value, { field, maxLength: 200, required: true, singleLine: true })
}

function stage(value, fallback = 'backlog') {
  const normalized = value || fallback
  if (!STAGE_SET.has(normalized)) {
    throw new WorkshopContractError('INVALID_STAGE', `알 수 없는 작업장 단계입니다: ${normalized}`)
  }
  return normalized
}

export function workshopStageIndex(value) {
  return WORKSHOP_STAGES.indexOf(value)
}

export function nextWorkshopStage(value) {
  const index = workshopStageIndex(value)
  if (index < 0) {
    throw new WorkshopContractError('INVALID_STAGE', `알 수 없는 작업장 단계입니다: ${value}`)
  }
  return WORKSHOP_STAGES[index + 1] ?? null
}

export function workshopContainsSecretValue(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  return systemPartContainsSecretLiteral(value)
    || SECRET_ASSIGNMENT_PATTERN.test(value)
    || AUTHORIZATION_VALUE_PATTERN.test(value)
    || URL_USERINFO_PATTERN.test(value.trim())
}

export function assertWorkshopSecretSafe(value, field = 'value') {
  if (workshopContainsSecretValue(value)) {
    throw new WorkshopContractError(
      'SECRET_VALUE_BLOCKED',
      `${field}에는 실제 키·토큰·비밀번호 값 대신 참조 이름만 입력할 수 있습니다.`,
    )
  }
  return value
}

function decodeWorkshopExternalRefComponent(value) {
  let decoded = value
  for (let attempt = 0; attempt <= value.length; attempt += 1) {
    let next
    try {
      next = decodeURIComponent(decoded)
    } catch {
      throw new WorkshopContractError('UNSAFE_EXTERNAL_REF', 'externalRef URL 인코딩 형식이 올바르지 않습니다.')
    }
    if (next === decoded) return decoded
    decoded = next
  }
  throw new WorkshopContractError('UNSAFE_EXTERNAL_REF', 'externalRef URL 인코딩이 지나치게 중첩되어 있습니다.')
}

export function assertWorkshopExternalRefSafe(value) {
  const reference = typeof value === 'string' ? value.trim() : ''
  if (!reference) return reference
  assertWorkshopSecretSafe(reference, 'externalRef')
  if (UNSAFE_EXTERNAL_REF_SCHEME.test(reference)) {
    throw new WorkshopContractError('UNSAFE_EXTERNAL_REF', 'externalRef에 실행 가능한 URL scheme을 넣을 수 없습니다.')
  }

  const windowsPath = /^[a-zA-Z]:[\\/]/.test(reference)
  let parsed
  try {
    parsed = new URL(reference, windowsPath ? undefined : 'https://workshop.invalid')
  } catch {
    if (windowsPath || !/^[a-z][a-z0-9+.-]*:/i.test(reference)) return reference
    throw new WorkshopContractError('UNSAFE_EXTERNAL_REF', 'externalRef URL 형식이 올바르지 않습니다.')
  }
  if (!windowsPath && /^[a-z][a-z0-9+.-]*:/i.test(reference) && !['http:', 'https:'].includes(parsed.protocol)) {
    throw new WorkshopContractError('UNSAFE_EXTERNAL_REF', 'externalRef URL은 http 또는 https만 사용할 수 있습니다.')
  }
  if (parsed.username || parsed.password) {
    throw new WorkshopContractError('SECRET_VALUE_BLOCKED', 'externalRef URL에는 사용자 정보나 비밀번호를 넣을 수 없습니다.')
  }
  for (const key of parsed.searchParams.keys()) {
    if (SIGNED_QUERY_KEY.test(decodeWorkshopExternalRefComponent(key))) {
      throw new WorkshopContractError('SECRET_VALUE_BLOCKED', '서명 URL 대신 경로·커밋·공개 URL 이름만 입력해 주세요.')
    }
  }
  const decodedHash = decodeWorkshopExternalRefComponent(parsed.hash).slice(1)
  const decodedPath = decodeWorkshopExternalRefComponent(parsed.pathname)
  if (SIGNED_FRAGMENT_KEY.test(decodedHash)) {
    throw new WorkshopContractError('SECRET_VALUE_BLOCKED', 'URL fragment의 비밀값 대신 참조 이름만 입력해 주세요.')
  }
  if (
    (parsed.hostname === 'hooks.slack.com' && SLACK_WEBHOOK_PATH.test(decodedPath))
    || (
      /^(?:canary\.|ptb\.)?discord(?:app)?\.com$/i.test(parsed.hostname)
      && DISCORD_WEBHOOK_PATH.test(decodedPath)
    )
    || (parsed.hostname === 'api.telegram.org' && TELEGRAM_BOT_PATH.test(decodedPath))
    || SECRET_BEARING_PATH.test(decodedPath)
  ) {
    throw new WorkshopContractError('SECRET_VALUE_BLOCKED', 'Webhook 비밀 경로 대신 참조 이름만 입력해 주세요.')
  }
  return reference
}

export function normalizeWorkshopGoalInput(value) {
  if (!plainObject(value)) {
    throw new WorkshopContractError('INVALID_GOAL', `${WORKSHOP_DISPLAY_NAMES.goal} 정보가 올바르지 않습니다.`)
  }
  const terminalStage = stage(value.terminalStage || value.terminal_stage || 'A')
  if (terminalStage === 'backlog') {
    throw new WorkshopContractError('INVALID_TERMINAL_STAGE', '종착 열은 A~H 중 하나여야 합니다.')
  }
  return {
    canvasOwnerId: identifier(value.canvasOwnerId || value.canvas_owner_id, 'canvasOwnerId'),
    canvasId: identifier(value.canvasId || value.canvas_id, 'canvasId'),
    title: text(value.title, {
      field: 'title',
      maxLength: WORKSHOP_LIMITS.title,
      required: true,
      singleLine: true,
    }),
    reason: text(value.reason, {
      field: 'reason',
      maxLength: WORKSHOP_LIMITS.reason,
      required: true,
    }),
    terminalStage,
  }
}

export function normalizeWorkshopTaskInput(value) {
  if (!plainObject(value)) {
    throw new WorkshopContractError('INVALID_TASK', `${WORKSHOP_DISPLAY_NAMES.task} 정보가 올바르지 않습니다.`)
  }
  const assigneeKind = value.assigneeKind || value.assignee_kind || 'manual'
  if (!ASSIGNEE_KIND_SET.has(assigneeKind)) {
    throw new WorkshopContractError('INVALID_ASSIGNEE_KIND', '실행 방식은 manual, yescode, nocode 중 하나여야 합니다.')
  }
  return {
    goalId: identifier(value.goalId || value.goal_id, 'goalId'),
    parentTaskId: value.parentTaskId || value.parent_task_id || null,
    spawnedFromTaskId: value.spawnedFromTaskId || value.spawned_from_task_id || null,
    title: text(value.title, {
      field: 'title',
      maxLength: WORKSHOP_LIMITS.title,
      required: true,
      singleLine: true,
    }),
    stage: stage(value.stage),
    assigneeKind,
    assigneeLabel: text(value.assigneeLabel || value.assignee_label, {
      field: 'assigneeLabel',
      maxLength: WORKSHOP_LIMITS.assigneeLabel,
      singleLine: true,
    }),
  }
}

export function normalizeWorkshopMessageInput(value) {
  if (!plainObject(value)) {
    throw new WorkshopContractError('INVALID_MESSAGE', `${WORKSHOP_DISPLAY_NAMES.thread} 기록이 올바르지 않습니다.`)
  }
  return {
    threadId: identifier(value.threadId || value.thread_id, 'threadId'),
    parentMessageId: value.parentMessageId || value.parent_message_id || null,
    authorLabel: text(value.authorLabel || value.author_label, {
      field: 'authorLabel',
      maxLength: WORKSHOP_LIMITS.authorLabel,
      singleLine: true,
    }),
    body: text(value.body, {
      field: 'body',
      maxLength: WORKSHOP_LIMITS.messageBody,
      required: true,
    }),
  }
}

export function normalizeWorkshopArtifactInput(value) {
  if (!plainObject(value)) {
    throw new WorkshopContractError('INVALID_ARTIFACT', `${WORKSHOP_DISPLAY_NAMES.artifact} 정보가 올바르지 않습니다.`)
  }
  const body = text(value.body, {
    field: 'body',
    maxLength: WORKSHOP_LIMITS.artifactBody,
  })
  const externalRef = text(value.externalRef || value.external_ref, {
    field: 'externalRef',
    maxLength: WORKSHOP_LIMITS.externalRef,
  })
  assertWorkshopExternalRefSafe(externalRef)
  if (!body && !externalRef) {
    throw new WorkshopContractError(
      'ARTIFACT_CONTENT_REQUIRED',
      `${WORKSHOP_DISPLAY_NAMES.artifact} 본문 또는 외부 참조가 필요합니다.`,
    )
  }
  return {
    goalId: identifier(value.goalId || value.goal_id, 'goalId'),
    taskId: value.taskId || value.task_id || null,
    stage: stage(value.stage),
    kind: text(value.kind, {
      field: 'kind',
      maxLength: WORKSHOP_LIMITS.artifactKind,
      required: true,
      singleLine: true,
    }),
    title: text(value.title, {
      field: 'title',
      maxLength: WORKSHOP_LIMITS.title,
      required: true,
      singleLine: true,
    }),
    body,
    externalRef,
  }
}

function rowValue(row, camel, snake) {
  return row?.[camel] ?? row?.[snake] ?? null
}

function taskSort(left, right) {
  const leftTime = String(rowValue(left, 'createdAt', 'created_at') || '')
  const rightTime = String(rowValue(right, 'createdAt', 'created_at') || '')
  return leftTime.localeCompare(rightTime) || String(left.id).localeCompare(String(right.id))
}

function assertPointerAcyclic(nodes, pointerField, code) {
  const complete = new Set()
  for (const start of nodes.values()) {
    if (complete.has(start.id)) continue
    const path = new Set()
    let cursor = start
    while (cursor) {
      if (path.has(cursor.id)) {
        throw new WorkshopContractError(code, `${WORKSHOP_DISPLAY_NAMES.task} 가지에 순환 참조가 있습니다.`)
      }
      if (complete.has(cursor.id)) break
      path.add(cursor.id)
      const pointer = cursor[pointerField]
      cursor = pointer ? nodes.get(pointer) : null
    }
    for (const id of path) complete.add(id)
  }
}

export function buildWorkshopTaskForest(value, { goalId = null } = {}) {
  const rows = Array.isArray(value) ? value : []
  const nodes = new Map()
  for (const row of rows) {
    if (!plainObject(row) || !row.id) {
      throw new WorkshopContractError(
        'INVALID_TASK',
        `${WORKSHOP_DISPLAY_NAMES.task} 트리에 식별자 없는 항목이 있습니다.`,
      )
    }
    if (nodes.has(row.id)) {
      throw new WorkshopContractError(
        'DUPLICATE_TASK',
        `중복 ${WORKSHOP_DISPLAY_NAMES.task} 식별자입니다: ${row.id}`,
      )
    }
    const rowGoalId = rowValue(row, 'goalId', 'goal_id')
    if (goalId && rowGoalId !== goalId) continue
    nodes.set(row.id, {
      ...row,
      goalId: rowGoalId,
      parentTaskId: rowValue(row, 'parentTaskId', 'parent_task_id'),
      spawnedFromTaskId: rowValue(row, 'spawnedFromTaskId', 'spawned_from_task_id'),
      children: [],
      spawnedChildIds: [],
    })
  }

  for (const node of nodes.values()) {
    for (const [field, code] of [
      ['parentTaskId', 'PARENT_TASK_MISSING'],
      ['spawnedFromTaskId', 'SPAWN_TASK_MISSING'],
    ]) {
      const pointer = node[field]
      if (!pointer) continue
      const target = nodes.get(pointer)
      if (!target || target.goalId !== node.goalId) {
        throw new WorkshopContractError(
          code,
          `${WORKSHOP_DISPLAY_NAMES.task} 가지는 같은 ${WORKSHOP_DISPLAY_NAMES.goal} 안의 ${WORKSHOP_DISPLAY_NAMES.task}만 참조할 수 있습니다.`,
        )
      }
    }
  }

  assertPointerAcyclic(nodes, 'parentTaskId', 'TASK_PARENT_CYCLE')
  assertPointerAcyclic(nodes, 'spawnedFromTaskId', 'TASK_SPAWN_CYCLE')

  const roots = []
  for (const node of nodes.values()) {
    if (node.parentTaskId) nodes.get(node.parentTaskId).children.push(node)
    else roots.push(node)
    if (node.spawnedFromTaskId) nodes.get(node.spawnedFromTaskId).spawnedChildIds.push(node.id)
  }
  const sortTree = (items) => {
    items.sort(taskSort)
    for (const item of items) {
      item.spawnedChildIds.sort()
      sortTree(item.children)
    }
  }
  sortTree(roots)
  return roots
}

export function workshopGateReadiness({
  goal,
  stage: requestedStage,
  artifacts,
  contract,
} = {}) {
  const currentStage = stage(requestedStage || goal?.stage)
  const resolvedContract = contract || WORKSHOP_STAGE_CONTRACT_BY_ID[currentStage]
  const presentKinds = new Set(
    (Array.isArray(artifacts) ? artifacts : [])
      .filter((artifact) => (artifact?.stage || currentStage) === currentStage)
      .map((artifact) => String(artifact?.kind || '').trim())
      .filter(Boolean),
  )
  const missingArtifactKinds = (resolvedContract?.recommendedArtifactKinds || [])
    .filter((kind) => !presentKinds.has(kind))
  const missingRecordFields = (resolvedContract?.requiredRecordFields || [])
    .filter((field) => !String(goal?.[field] || '').trim())
  return Object.freeze({
    stage: currentStage,
    contract: resolvedContract,
    missingArtifactKinds: Object.freeze(missingArtifactKinds),
    missingRecordFields: Object.freeze(missingRecordFields),
    forcedRequired: missingArtifactKinds.length > 0 || missingRecordFields.length > 0,
  })
}

export function buildWorkshopContextPack({
  goal,
  contract,
  artifacts,
  messages,
  maxCharacters = WORKSHOP_LIMITS.contextPack,
} = {}) {
  if (!plainObject(goal)) {
    throw new WorkshopContractError(
      'INVALID_GOAL',
      `컨텍스트 팩에 ${WORKSHOP_DISPLAY_NAMES.goal}가 필요합니다.`,
    )
  }
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1000 || maxCharacters > WORKSHOP_LIMITS.contextPack) {
    throw new WorkshopContractError('INVALID_CONTEXT_LIMIT', '컨텍스트 팩 문자 한도가 올바르지 않습니다.')
  }
  const currentStage = stage(goal.stage)
  const resolvedContract = contract || WORKSHOP_STAGE_CONTRACT_BY_ID[currentStage]
  const allArtifacts = Array.isArray(artifacts) ? artifacts : []
  const allMessages = Array.isArray(messages) ? messages : []
  const recentArtifacts = allArtifacts.slice(-12)
  const recentMessages = allMessages.slice(-8)

  const title = String(goal.title || '').trim()
  const reason = String(goal.reason || '').trim()
  const guidance = String(resolvedContract?.gateGuidance || '').trim()
  for (const [field, value] of [
    ['goal.title', title],
    ['goal.reason', reason],
    ['contract.gateGuidance', guidance],
  ]) assertWorkshopSecretSafe(value, field)

  const artifactLines = recentArtifacts.map((artifact) => {
    const kind = String(artifact.kind || 'record').trim()
    const artifactTitle = String(artifact.title || '').trim()
    const reference = String(artifact.externalRef || artifact.external_ref || '').trim()
    assertWorkshopSecretSafe(kind, 'artifact.kind')
    assertWorkshopSecretSafe(artifactTitle, 'artifact.title')
    assertWorkshopExternalRefSafe(reference)
    return `- [${kind}] ${artifactTitle}${reference ? ` — ${reference}` : ''}`
  })
  const messageLines = recentMessages.map((message) => {
    const author = String(
      message.authorLabel
      || message.author_label
      || message.authorUserId
      || message.author_user_id
      || 'user',
    ).trim()
    const body = String(message.body || '').trim()
    assertWorkshopSecretSafe(author, 'message.author')
    assertWorkshopSecretSafe(body, 'message.body')
    return `- ${author}: ${body}`
  })

  const trimToBudget = (value, budget) => {
    if (value.length <= budget) return value
    const marker = '… [일부 생략]'
    if (budget <= marker.length) return marker.slice(0, budget)
    return `${value.slice(0, budget - marker.length)}${marker}`
  }
  const listToBudget = (lines, budget, preOmitted) => {
    const empty = '- 없음'
    if (!lines.length) return empty.slice(0, budget)
    const rendered = []
    let used = 0
    let omitted = preOmitted
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const remainingItems = lines.length - index - 1
      const potentialOmitted = omitted + remainingItems
      const marker = potentialOmitted > 0 ? `- … ${potentialOmitted}개 생략` : ''
      const separator = rendered.length ? 1 : 0
      const reserve = marker ? marker.length + 1 : 0
      const available = budget - used - separator - reserve
      if (line.length <= available) {
        rendered.push(line)
        used += separator + line.length
        continue
      }
      if (!rendered.length) {
        const omittedIfRendered = omitted + lines.length - index - 1
        const finalMarker = `- … ${omittedIfRendered}개 생략`
        const firstBudget = Math.max(0, budget - finalMarker.length - 1)
        if (firstBudget >= 24) {
          rendered.push(trimToBudget(line, firstBudget))
          omitted = omittedIfRendered
        } else {
          omitted += lines.length - index
        }
      } else {
        omitted += lines.length - index
      }
      break
    }
    if (omitted > 0) rendered.push(`- … ${omitted}개 생략`)
    return trimToBudget(rendered.join('\n'), budget)
  }

  const headings = {
    goal: `# ${WORKSHOP_DISPLAY_NAMES.goal}`,
    reason: '## 이유',
    stage: `## 현재 열 — ${WORKSHOP_STAGE_DISPLAY_NAMES[currentStage]}`,
    artifacts: `## 직전 ${WORKSHOP_DISPLAY_NAMES.artifact}`,
    messages: `## 최근 ${WORKSHOP_DISPLAY_NAMES.thread}`,
  }
  const fixedLength = Object.values(headings).reduce((sum, value) => sum + value.length, 0) + 12
  const contentBudget = Math.max(1, maxCharacters - fixedLength)
  const titleBudget = Math.max(40, Math.floor(contentBudget * 0.08))
  const reasonBudget = Math.max(160, Math.floor(contentBudget * 0.27))
  const guidanceBudget = Math.max(120, Math.floor(contentBudget * 0.15))
  const artifactBudget = Math.max(180, Math.floor(contentBudget * 0.25))
  const allocated = titleBudget + reasonBudget + guidanceBudget + artifactBudget
  const messageBudget = Math.max(180, contentBudget - allocated)
  const lines = [
    headings.goal,
    trimToBudget(title, titleBudget),
    '',
    headings.reason,
    trimToBudget(reason, reasonBudget),
    '',
    headings.stage,
    trimToBudget(guidance, guidanceBudget),
    '',
    headings.artifacts,
    listToBudget(artifactLines, artifactBudget, Math.max(0, allArtifacts.length - recentArtifacts.length)),
    '',
    headings.messages,
    listToBudget(messageLines, messageBudget, Math.max(0, allMessages.length - recentMessages.length)),
  ]
  const result = trimToBudget(lines.join('\n').trim(), maxCharacters)
  if (workshopContainsSecretValue(result)) {
    throw new WorkshopContractError('SECRET_VALUE_BLOCKED', '컨텍스트 팩에 실제 비밀값이 포함되어 있습니다.')
  }
  return result
}

export function assertWorkshopStatus(value) {
  if (!STATUS_SET.has(value)) {
    throw new WorkshopContractError(
      'INVALID_STATUS',
      `${WORKSHOP_DISPLAY_NAMES.goal}·${WORKSHOP_DISPLAY_NAMES.task} 상태가 올바르지 않습니다.`,
    )
  }
  return value
}
