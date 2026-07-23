// Server-only Workshop persistence for MCP.
//
// The service-role client used by MCP bypasses RLS, so every read and write in
// this module re-checks that the token owner either owns the canvas or is an
// accepted share member. Workshop MVP intentionally grants every accepted
// participant full board access regardless of the canvas grant's region or
// can_edit flag; redaction integration is a later slice.
import {
  WORKSHOP_ASSIGNEE_KINDS,
  WORKSHOP_LIMITS,
  WORKSHOP_STAGES,
  WorkshopContractError,
  assertWorkshopExternalRefSafe,
  normalizeWorkshopArtifactInput,
  normalizeWorkshopGoalInput,
  normalizeWorkshopMessageInput,
  normalizeWorkshopTaskInput,
  workshopContainsSecretValue,
} from '../shared/workshop.js'
import { recordCanvasDataAccess } from './dataAccessAudit.js'
import { admin, mySharesFor } from './shareAccess.js'

export {
  WORKSHOP_ASSIGNEE_KINDS,
  WORKSHOP_LIMITS,
  WORKSHOP_STAGES,
} from '../shared/workshop.js'
export const WORKSHOP_TERMINAL_STAGES = Object.freeze(WORKSHOP_STAGES.filter((stage) => stage !== 'backlog'))

const GOAL_SELECT = [
  'id', 'canvas_owner_id', 'canvas_id', 'title', 'reason', 'stage',
  'terminal_stage', 'status', 'created_by', 'created_at', 'updated_at',
].join(', ')
const TASK_SELECT = [
  'id', 'goal_id', 'parent_task_id', 'spawned_from_task_id', 'title', 'stage',
  'assignee_kind', 'assignee_label', 'status', 'created_by', 'created_at', 'updated_at',
].join(', ')
const THREAD_SELECT = 'id, goal_id, task_id, title, created_by, created_at, updated_at'
const MESSAGE_SELECT = [
  'id', 'thread_id', 'parent_message_id', 'author_user_id', 'author_label',
  'body', 'created_by', 'created_at',
].join(', ')
const ARTIFACT_SELECT = [
  'id', 'goal_id', 'task_id', 'stage', 'kind', 'title', 'body',
  'external_ref', 'created_by', 'created_at', 'updated_at',
].join(', ')
const GATE_EVENT_SELECT = [
  'id', 'goal_id', 'task_id', 'from_stage', 'to_stage',
  'approved_by', 'forced', 'missing_artifact_kinds', 'created_at',
].join(', ')
export const WORKSHOP_READ_PAGE_SIZE = 500
export const ENSURE_WORKSHOP_THREAD_RPC = 'ensure_workshop_thread'

const normalizeInlineText = (value) => (
  typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
)

const normalizeBodyText = (value) => (
  typeof value === 'string'
    ? value
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
      .trim()
    : ''
)

function requiredText(value, label, maxLength) {
  const text = normalizeInlineText(value)
  if (!text) throw new Error(`${label}을(를) 입력해 주세요.`)
  if (text.length > maxLength) throw new Error(`${label} 값이 ${maxLength}자를 넘었습니다.`)
  return text
}

function requiredBody(value) {
  const body = normalizeBodyText(value)
  if (!body) throw new Error('메시지 내용을 입력해 주세요.')
  if (body.length > WORKSHOP_LIMITS.messageBody) {
    throw new Error(`메시지 내용이 ${WORKSHOP_LIMITS.messageBody}자를 넘었습니다.`)
  }
  return body
}

function throwDb(error, fallback) {
  if (error) throw new Error(error.message || fallback)
}

function inaccessible() {
  return new Error('작업장 보드를 찾을 수 없거나 접근 권한이 없습니다.')
}

// Pure access decision used by focused tests. `shares` must come from
// mySharesFor(), which only returns accepted share_members rows.
export function selectWorkshopCanvasAccess({ userId, canvasId, ownCanvas, shares = [] }) {
  if (ownCanvas?.user_id === userId && ownCanvas?.canvas_id === canvasId) {
    return {
      ownerId: userId,
      role: 'owner',
      fullAccess: true,
      redactionApplied: false,
    }
  }

  const ownerIds = [...new Set(
    shares
      .filter((share) => share.canvas_id === canvasId && share.owner_id && share.owner_id !== userId)
      .map((share) => share.owner_id),
  )].sort()
  if (!ownerIds.length) return null
  if (ownerIds.length > 1) {
    throw new Error('같은 canvas_id의 공유 보드가 여러 개여서 대상을 확정할 수 없습니다.')
  }
  return {
    ownerId: ownerIds[0],
    role: 'participant',
    fullAccess: true,
    redactionApplied: false,
  }
}

async function auditWorkshopAccess(db, userId, ownerId, canvasId, operation, auditAccess) {
  await auditAccess(db, {
    actorUserId: userId,
    ownerUserId: ownerId,
    canvasId,
    source: 'mcp',
    purpose: 'mcp_canvas_operation',
    operation,
  })
}

export async function resolveWorkshopCanvasAccess(userId, canvasId, {
  db = admin(),
  listShares = mySharesFor,
  auditAccess = recordCanvasDataAccess,
  operation = 'read',
} = {}) {
  const normalizedCanvasId = requiredText(canvasId, 'canvas_id', 200)
  const ownResult = await db.from('canvases')
    .select('user_id, canvas_id')
    .eq('user_id', userId)
    .eq('canvas_id', normalizedCanvasId)
    .maybeSingle()
  throwDb(ownResult.error, '캔버스를 확인하지 못했습니다.')

  const shares = ownResult.data ? [] : await listShares(userId, normalizedCanvasId)
  const access = selectWorkshopCanvasAccess({
    userId,
    canvasId: normalizedCanvasId,
    ownCanvas: ownResult.data,
    shares,
  })
  if (!access) throw inaccessible()

  if (access.role === 'participant') {
    const sharedResult = await db.from('canvases')
      .select('user_id, canvas_id')
      .eq('user_id', access.ownerId)
      .eq('canvas_id', normalizedCanvasId)
      .maybeSingle()
    throwDb(sharedResult.error, '공유 캔버스를 확인하지 못했습니다.')
    if (!sharedResult.data) throw inaccessible()
  }

  await auditWorkshopAccess(
    db,
    userId,
    access.ownerId,
    normalizedCanvasId,
    operation,
    auditAccess,
  )
  return { ...access, canvasId: normalizedCanvasId }
}

async function assertWorkshopOwnerAccess(userId, ownerId, canvasId, {
  db = admin(),
  listShares = mySharesFor,
  auditAccess = recordCanvasDataAccess,
  operation = 'read_for_write',
} = {}) {
  const canvasResult = await db.from('canvases')
    .select('user_id, canvas_id')
    .eq('user_id', ownerId)
    .eq('canvas_id', canvasId)
    .maybeSingle()
  throwDb(canvasResult.error, '캔버스를 확인하지 못했습니다.')
  if (!canvasResult.data) throw inaccessible()

  let role = 'owner'
  if (userId !== ownerId) {
    const accepted = (await listShares(userId, canvasId))
      .some((share) => share.owner_id === ownerId && share.canvas_id === canvasId)
    if (!accepted) throw inaccessible()
    role = 'participant'
  }

  await auditWorkshopAccess(db, userId, ownerId, canvasId, operation, auditAccess)
  return {
    ownerId,
    canvasId,
    role,
    fullAccess: true,
    redactionApplied: false,
  }
}

async function loadGoalForActor(userId, goalId, dependencies = {}) {
  const db = dependencies.db ?? admin()
  const result = await db.from('workshop_goals').select(GOAL_SELECT).eq('id', goalId).maybeSingle()
  throwDb(result.error, '목표를 확인하지 못했습니다.')
  if (!result.data) throw inaccessible()
  const access = await assertWorkshopOwnerAccess(
    userId,
    result.data.canvas_owner_id,
    result.data.canvas_id,
    { ...dependencies, db },
  )
  return { db, goal: result.data, access }
}

export async function loadWorkshopRowsByIds(
  db,
  table,
  foreignKey,
  ids,
  columns,
  orderBy = 'created_at',
) {
  if (!ids.length) return []
  const rows = []
  for (let offset = 0; offset < ids.length; offset += 150) {
    for (let from = 0; ; from += WORKSHOP_READ_PAGE_SIZE) {
      const result = await db.from(table)
        .select(columns)
        .in(foreignKey, ids.slice(offset, offset + 150))
        .order(orderBy, { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + WORKSHOP_READ_PAGE_SIZE - 1)
      throwDb(result.error, `${table} 데이터를 읽지 못했습니다.`)
      const page = result.data ?? []
      rows.push(...page)
      if (page.length < WORKSHOP_READ_PAGE_SIZE) break
    }
  }
  return rows
}

async function loadWorkshopGoals(db, access) {
  const goals = []
  for (let from = 0; ; from += WORKSHOP_READ_PAGE_SIZE) {
    const result = await db.from('workshop_goals')
      .select(GOAL_SELECT)
      .eq('canvas_owner_id', access.ownerId)
      .eq('canvas_id', access.canvasId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + WORKSHOP_READ_PAGE_SIZE - 1)
    throwDb(result.error, '보드 목표를 읽지 못했습니다.')
    const page = result.data ?? []
    goals.push(...page)
    if (page.length < WORKSHOP_READ_PAGE_SIZE) break
  }
  return goals
}

export function assembleWorkshopBoard({
  access,
  stageContracts,
  goals,
  tasks,
  threads,
  messages,
  artifacts,
  gateEvents,
}) {
  const messagesByThread = new Map()
  for (const message of messages) {
    const rows = messagesByThread.get(message.thread_id) ?? []
    rows.push(message)
    messagesByThread.set(message.thread_id, rows)
  }
  const tasksByGoal = new Map()
  const threadsByGoal = new Map()
  const artifactsByGoal = new Map()
  const gatesByGoal = new Map()
  const append = (map, key, value) => {
    const rows = map.get(key) ?? []
    rows.push(value)
    map.set(key, rows)
  }
  for (const task of tasks) append(tasksByGoal, task.goal_id, task)
  for (const thread of threads) {
    append(threadsByGoal, thread.goal_id, {
      ...thread,
      messages: messagesByThread.get(thread.id) ?? [],
    })
  }
  for (const artifact of artifacts) append(artifactsByGoal, artifact.goal_id, artifact)
  for (const event of gateEvents) append(gatesByGoal, event.goal_id, event)

  return {
    canvas_id: access.canvasId,
    canvas_owner_id: access.ownerId,
    my_access: {
      role: access.role,
      full_access: true,
      redaction_applied: false,
    },
    stage_contracts: stageContracts,
    goals: goals.map((goal) => ({
      ...goal,
      tasks: tasksByGoal.get(goal.id) ?? [],
      threads: threadsByGoal.get(goal.id) ?? [],
      artifacts: artifactsByGoal.get(goal.id) ?? [],
      gate_events: gatesByGoal.get(goal.id) ?? [],
    })),
  }
}

export async function listWorkshopBoard(userId, canvasId, dependencies = {}) {
  const db = dependencies.db ?? admin()
  const access = await resolveWorkshopCanvasAccess(userId, canvasId, {
    ...dependencies,
    db,
    operation: 'read',
  })
  const [contractsResult, goals] = await Promise.all([
    db.from('workshop_stage_contracts')
      .select('stage, position, recommended_artifact_kinds, gate_guidance')
      .order('position', { ascending: true }),
    loadWorkshopGoals(db, access),
  ])
  throwDb(contractsResult.error, '단계 계약을 읽지 못했습니다.')

  const goalIds = goals.map((goal) => goal.id)
  const [tasks, threads, artifacts, gateEvents] = await Promise.all([
    loadWorkshopRowsByIds(db, 'workshop_tasks', 'goal_id', goalIds, TASK_SELECT),
    loadWorkshopRowsByIds(db, 'workshop_threads', 'goal_id', goalIds, THREAD_SELECT),
    loadWorkshopRowsByIds(db, 'workshop_artifacts', 'goal_id', goalIds, ARTIFACT_SELECT),
    loadWorkshopRowsByIds(db, 'workshop_gate_events', 'goal_id', goalIds, GATE_EVENT_SELECT),
  ])
  const messages = await loadWorkshopRowsByIds(
    db,
    'workshop_messages',
    'thread_id',
    threads.map((thread) => thread.id),
    MESSAGE_SELECT,
  )

  return assembleWorkshopBoard({
    access,
    stageContracts: contractsResult.data ?? [],
    goals,
    tasks,
    threads,
    messages,
    artifacts,
    gateEvents,
  })
}

async function insertReturning(db, table, row, columns) {
  const result = await db.from(table).insert(row).select(columns).single()
  throwDb(result.error, `${table} 데이터를 저장하지 못했습니다.`)
  return result.data
}

export async function createWorkshopGoal(userId, canvasId, input, dependencies = {}) {
  const db = dependencies.db ?? admin()
  const access = await resolveWorkshopCanvasAccess(userId, canvasId, {
    ...dependencies,
    db,
    operation: 'read_for_write',
  })
  const normalized = normalizeWorkshopGoalInput({
    canvasOwnerId: access.ownerId,
    canvasId: access.canvasId,
    title: input.title,
    reason: input.reason,
    terminalStage: input.terminal_stage,
  })
  return insertReturning(db, 'workshop_goals', {
    canvas_owner_id: access.ownerId,
    canvas_id: access.canvasId,
    title: normalized.title,
    reason: normalized.reason,
    stage: 'backlog',
    terminal_stage: normalized.terminalStage,
    status: 'active',
    created_by: userId,
  }, GOAL_SELECT)
}

export function assertWorkshopTaskReferences(goalId, references, rows) {
  const requested = [...new Set(
    [references.parent_task_id, references.spawned_from_task_id].filter(Boolean),
  )]
  if (!requested.length) return
  const byId = new Map((rows ?? []).map((row) => [row.id, row]))
  const invalid = requested.filter((id) => byId.get(id)?.goal_id !== goalId)
  if (invalid.length) {
    throw new Error('상위 작업과 파생 원본 작업은 같은 목표에 속해야 합니다.')
  }
}

async function loadTaskReferences(db, goalId, input) {
  const ids = [...new Set([input.parent_task_id, input.spawned_from_task_id].filter(Boolean))]
  if (!ids.length) return
  const result = await db.from('workshop_tasks').select('id, goal_id').in('id', ids)
  throwDb(result.error, '작업 관계를 확인하지 못했습니다.')
  assertWorkshopTaskReferences(goalId, input, result.data ?? [])
}

export async function createWorkshopTask(userId, goalId, input, dependencies = {}) {
  const { db, goal } = await loadGoalForActor(userId, goalId, dependencies)
  await loadTaskReferences(db, goal.id, input)
  const normalized = normalizeWorkshopTaskInput({
    goalId: goal.id,
    parentTaskId: input.parent_task_id,
    spawnedFromTaskId: input.spawned_from_task_id,
    title: input.title,
    stage: goal.stage,
    assigneeKind: input.assignee_kind,
    assigneeLabel: input.assignee_label,
  })
  return insertReturning(db, 'workshop_tasks', {
    goal_id: goal.id,
    parent_task_id: normalized.parentTaskId,
    spawned_from_task_id: normalized.spawnedFromTaskId,
    title: normalized.title,
    stage: normalized.stage,
    assignee_kind: normalized.assigneeKind,
    assignee_label: normalized.assigneeLabel || null,
    status: 'active',
    created_by: userId,
  }, TASK_SELECT)
}

async function loadTaskForGoal(db, goalId, taskId) {
  if (!taskId) return null
  const result = await db.from('workshop_tasks').select(TASK_SELECT).eq('id', taskId).maybeSingle()
  throwDb(result.error, '작업을 확인하지 못했습니다.')
  if (!result.data || result.data.goal_id !== goalId) {
    throw new Error('작업이 목표에 속하지 않습니다.')
  }
  return result.data
}

export async function resolveWorkshopMessageThread(db, goal, task, threadId, userId) {
  if (threadId) {
    const result = await db.from('workshop_threads').select(THREAD_SELECT).eq('id', threadId).maybeSingle()
    throwDb(result.error, '대화를 확인하지 못했습니다.')
    if (!result.data || result.data.goal_id !== goal.id) throw new Error('대화가 목표에 속하지 않습니다.')
    if (task && result.data.task_id !== task.id) throw new Error('대화가 지정한 작업에 속하지 않습니다.')
    return result.data
  }

  const ensured = await db.rpc(ENSURE_WORKSHOP_THREAD_RPC, {
    p_goal_id: goal.id,
    p_task_id: task?.id ?? null,
    p_created_by: userId,
  })
  throwDb(ensured.error, '기본 대화를 확인하지 못했습니다.')
  const thread = Array.isArray(ensured.data) ? ensured.data[0] : ensured.data
  if (
    !thread
    || thread.goal_id !== goal.id
    || (thread.task_id ?? null) !== (task?.id ?? null)
  ) {
    throw new Error('기본 대화를 확인하지 못했습니다.')
  }
  return thread
}

export async function postWorkshopMessage(userId, goalId, input, dependencies = {}) {
  const { db, goal } = await loadGoalForActor(userId, goalId, dependencies)
  const task = await loadTaskForGoal(db, goal.id, input.task_id)
  const thread = await resolveWorkshopMessageThread(db, goal, task, input.thread_id, userId)
  const normalized = normalizeWorkshopMessageInput({
    threadId: thread.id,
    parentMessageId: input.parent_message_id,
    authorLabel: requiredText(input.author_label, '작성자 라벨', WORKSHOP_LIMITS.authorLabel),
    body: requiredBody(input.body),
  })

  if (normalized.parentMessageId) {
    const parent = await db.from('workshop_messages')
      .select('id, thread_id')
      .eq('id', normalized.parentMessageId)
      .maybeSingle()
    throwDb(parent.error, '상위 메시지를 확인하지 못했습니다.')
    if (!parent.data || parent.data.thread_id !== thread.id) {
      throw new Error('상위 메시지가 같은 대화에 속하지 않습니다.')
    }
  }

  const message = await insertReturning(db, 'workshop_messages', {
    thread_id: thread.id,
    parent_message_id: normalized.parentMessageId,
    // The visible author is the reporting agent. `created_by` separately
    // preserves the authenticated MCP token owner for authorization/audit.
    author_user_id: null,
    author_label: normalized.authorLabel,
    body: normalized.body,
    created_by: userId,
  }, MESSAGE_SELECT)
  return { thread, message }
}

function secretRefError() {
  const error = new Error('산출물 외부 참조에는 API 키·토큰·비밀번호 같은 비밀값을 넣을 수 없습니다.')
  error.code = 'SECRET_VALUE_BLOCKED'
  return error
}

export function assertWorkshopExternalUrlSafe(externalRef) {
  try {
    return assertWorkshopExternalRefSafe(externalRef)
  } catch (error) {
    if (error instanceof WorkshopContractError && error.code === 'SECRET_VALUE_BLOCKED') {
      throw secretRefError()
    }
    if (error instanceof WorkshopContractError && error.code === 'UNSAFE_EXTERNAL_REF') {
      const protocolError = new Error('산출물 외부 URL은 http 또는 https만 사용할 수 있습니다.')
      protocolError.code = 'EXTERNAL_REF_PROTOCOL_BLOCKED'
      throw protocolError
    }
    throw error
  }
}

export function normalizeWorkshopArtifactExternalRef(value) {
  const externalRef = normalizeInlineText(value)
  if (!externalRef) return null
  if (externalRef.length > WORKSHOP_LIMITS.externalRef) {
    throw new Error(`산출물 외부 참조가 ${WORKSHOP_LIMITS.externalRef}자를 넘었습니다.`)
  }
  if (workshopContainsSecretValue(externalRef)) throw secretRefError()
  return assertWorkshopExternalUrlSafe(externalRef)
}

export async function attachWorkshopArtifact(userId, goalId, input, dependencies = {}) {
  const { db, goal } = await loadGoalForActor(userId, goalId, dependencies)
  const task = await loadTaskForGoal(db, goal.id, input.task_id)
  const externalRef = normalizeWorkshopArtifactExternalRef(input.external_ref)
  const normalized = normalizeWorkshopArtifactInput({
    goalId: goal.id,
    taskId: task?.id ?? null,
    stage: task?.stage ?? goal.stage,
    kind: input.kind,
    title: input.title,
    body: input.body,
    externalRef,
  })

  return insertReturning(db, 'workshop_artifacts', {
    goal_id: goal.id,
    task_id: normalized.taskId,
    stage: normalized.stage,
    kind: normalized.kind,
    title: normalized.title,
    body: normalized.body || null,
    external_ref: normalized.externalRef || null,
    created_by: userId,
  }, ARTIFACT_SELECT)
}
