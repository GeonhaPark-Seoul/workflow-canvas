import {
  WORKSHOP_ASSIGNEE_KINDS,
  WORKSHOP_STAGES,
  WORKSHOP_STATUSES,
  assertWorkshopSecretSafe,
  buildWorkshopTaskForest,
  normalizeWorkshopArtifactInput,
  normalizeWorkshopGoalInput,
  normalizeWorkshopMessageInput,
  normalizeWorkshopTaskInput,
  workshopStageIndex,
} from '../../shared/workshop.js'
import { WORKSHOP_DISPLAY_NAMES } from '../../shared/uiConstants.js'
import { supabase } from './supabase'

const WORKSHOP_BROWSER_PAGE_SIZE = 500
const WORKSHOP_IDENTIFIER_CHUNK_SIZE = 100

export class WorkshopApiError extends Error {
  constructor(code, message, causeCode = '') {
    super(message)
    this.name = 'WorkshopApiError'
    this.code = code
    this.causeCode = causeCode
  }
}

function apiError(operation, error) {
  const message = String(error?.message || '')
  if (message.includes('workshop_gate_artifacts_missing')) {
    return new WorkshopApiError(
      'GATE_ARTIFACTS_MISSING',
      `권고 ${WORKSHOP_DISPLAY_NAMES.artifact}이 없습니다. 강행하려면 경고를 확인해 주세요.`,
      error?.code,
    )
  }
  if (message.includes('workshop_goal_not_active')) {
    return new WorkshopApiError(
      'GOAL_NOT_ACTIVE',
      `진행 중인 ${WORKSHOP_DISPLAY_NAMES.goal}만 다음 ${WORKSHOP_DISPLAY_NAMES.gate}로 보낼 수 있습니다.`,
      error?.code,
    )
  }
  if (message.includes('workshop_canvas_access_denied')) {
    return new WorkshopApiError('CANVAS_ACCESS_DENIED', '이 작업장의 캔버스 참여 권한이 없습니다.', error?.code)
  }
  return new WorkshopApiError('WORKSHOP_API_ERROR', `${operation}에 실패했습니다.`, error?.code)
}

function resultData(operation, result) {
  if (result?.error) throw apiError(operation, result.error)
  return result?.data
}

function goalRow(row) {
  if (!row) return null
  return {
    id: row.id,
    canvasOwnerId: row.canvas_owner_id,
    canvasId: row.canvas_id,
    title: row.title,
    reason: row.reason,
    stage: row.stage,
    terminalStage: row.terminal_stage,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function taskRow(row) {
  if (!row) return null
  return {
    id: row.id,
    goalId: row.goal_id,
    parentTaskId: row.parent_task_id,
    spawnedFromTaskId: row.spawned_from_task_id,
    title: row.title,
    stage: row.stage,
    assigneeKind: row.assignee_kind,
    assigneeLabel: row.assignee_label || '',
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function threadRow(row) {
  if (!row) return null
  return {
    id: row.id,
    goalId: row.goal_id,
    taskId: row.task_id,
    title: row.title || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function messageRow(row) {
  if (!row) return null
  return {
    id: row.id,
    threadId: row.thread_id,
    parentMessageId: row.parent_message_id,
    authorUserId: row.author_user_id,
    authorLabel: row.author_label || '',
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function artifactRow(row) {
  if (!row) return null
  return {
    id: row.id,
    goalId: row.goal_id,
    taskId: row.task_id,
    stage: row.stage,
    kind: row.kind,
    title: row.title,
    body: row.body || '',
    externalRef: row.external_ref || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function gateEventRow(row) {
  if (!row) return null
  return {
    id: row.id,
    goalId: row.goal_id,
    taskId: row.task_id,
    fromStage: row.from_stage,
    toStage: row.to_stage,
    approvedBy: row.approved_by,
    forced: row.forced === true,
    missingArtifactKinds: row.missing_artifact_kinds || [],
    createdAt: row.created_at,
  }
}

function stageContractRow(row) {
  return {
    stage: row.stage,
    position: row.position,
    recommendedArtifactKinds: row.recommended_artifact_kinds || [],
    gateGuidance: row.gate_guidance,
  }
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user?.id) {
    throw new WorkshopApiError('AUTH_REQUIRED', '로그인이 필요합니다.', error?.code)
  }
  return data.user.id
}

function requiredId(value, field) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id || id.length > 200) {
    throw new WorkshopApiError('INVALID_INPUT', `${field} 값이 올바르지 않습니다.`)
  }
  return id
}

function safePatchText(value, field, maxLength, { required = false } = {}) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (required && !normalized) throw new WorkshopApiError('INVALID_INPUT', `${field} 값이 필요합니다.`)
  if (normalized.length > maxLength) throw new WorkshopApiError('INVALID_INPUT', `${field} 값이 너무 깁니다.`)
  assertWorkshopSecretSafe(normalized, field)
  return normalized
}

function compareWorkshopRows(left, right, orderColumns) {
  for (const column of orderColumns) {
    const comparison = String(left?.[column] ?? '').localeCompare(String(right?.[column] ?? ''))
    if (comparison !== 0) return comparison
  }
  return 0
}

async function loadWorkshopRows({
  table,
  columns,
  operation,
  configure = (query) => query,
  orderColumns = ['created_at', 'id'],
}) {
  const rows = []
  for (let from = 0; ; from += WORKSHOP_BROWSER_PAGE_SIZE) {
    let query = configure(supabase.from(table).select(columns))
    for (const column of orderColumns) {
      query = query.order(column, { ascending: true })
    }
    const page = resultData(
      operation,
      await query.range(from, from + WORKSHOP_BROWSER_PAGE_SIZE - 1),
    )
    const pageRows = Array.isArray(page) ? page : []
    rows.push(...pageRows)
    if (pageRows.length < WORKSHOP_BROWSER_PAGE_SIZE) break
  }
  return rows
}

async function loadWorkshopRowsByIdentifiers({
  table,
  columns,
  operation,
  identifierColumn,
  identifiers,
  orderColumns = ['created_at', 'id'],
}) {
  const uniqueIdentifiers = [...new Set(identifiers.filter(Boolean))]
  const rows = []
  for (let offset = 0; offset < uniqueIdentifiers.length; offset += WORKSHOP_IDENTIFIER_CHUNK_SIZE) {
    const identifierChunk = uniqueIdentifiers.slice(offset, offset + WORKSHOP_IDENTIFIER_CHUNK_SIZE)
    rows.push(...await loadWorkshopRows({
      table,
      columns,
      operation,
      orderColumns,
      configure: (query) => query.in(identifierColumn, identifierChunk),
    }))
  }
  return rows.sort((left, right) => compareWorkshopRows(left, right, orderColumns))
}

export async function loadWorkshopBoard(canvasOwnerId, canvasId) {
  const ownerId = requiredId(canvasOwnerId, 'canvasOwnerId')
  const boundedCanvasId = requiredId(canvasId, 'canvasId')
  const [contractRows, goalRows] = await Promise.all([
    loadWorkshopRows({
      table: 'workshop_stage_contracts',
      columns: 'stage, position, recommended_artifact_kinds, gate_guidance',
      operation: '단계 계약 조회',
      // Stage contracts are fixed reference rows and do not have created_at/id.
      orderColumns: ['position', 'stage'],
    }),
    loadWorkshopRows({
      table: 'workshop_goals',
      columns: 'id, canvas_owner_id, canvas_id, title, reason, stage, terminal_stage, status, created_by, created_at, updated_at',
      operation: `${WORKSHOP_DISPLAY_NAMES.goal} 조회`,
      configure: (query) => query
        .eq('canvas_owner_id', ownerId)
        .eq('canvas_id', boundedCanvasId),
    }),
  ])
  const stageContracts = contractRows.map(stageContractRow)
  const goals = goalRows.map(goalRow)
  const goalIds = goals.map((goal) => goal.id)
  if (goalIds.length === 0) {
    return {
      canvasOwnerId: ownerId,
      canvasId: boundedCanvasId,
      stageContracts,
      goals: [],
      tasks: [],
      taskForestByGoal: {},
      threads: [],
      messages: [],
      artifacts: [],
      gateEvents: [],
    }
  }

  const [taskRows, threadRows, artifactRows, gateRows] = await Promise.all([
    loadWorkshopRowsByIdentifiers({
      table: 'workshop_tasks',
      columns: 'id, goal_id, parent_task_id, spawned_from_task_id, title, stage, assignee_kind, assignee_label, status, created_by, created_at, updated_at',
      operation: `${WORKSHOP_DISPLAY_NAMES.task} 조회`,
      identifierColumn: 'goal_id',
      identifiers: goalIds,
    }),
    loadWorkshopRowsByIdentifiers({
      table: 'workshop_threads',
      columns: 'id, goal_id, task_id, title, created_by, created_at, updated_at',
      operation: `${WORKSHOP_DISPLAY_NAMES.thread} 조회`,
      identifierColumn: 'goal_id',
      identifiers: goalIds,
    }),
    loadWorkshopRowsByIdentifiers({
      table: 'workshop_artifacts',
      columns: 'id, goal_id, task_id, stage, kind, title, body, external_ref, created_by, created_at, updated_at',
      operation: `${WORKSHOP_DISPLAY_NAMES.artifact} 조회`,
      identifierColumn: 'goal_id',
      identifiers: goalIds,
    }),
    loadWorkshopRowsByIdentifiers({
      table: 'workshop_gate_events',
      columns: 'id, goal_id, task_id, from_stage, to_stage, approved_by, forced, missing_artifact_kinds, created_at',
      operation: `${WORKSHOP_DISPLAY_NAMES.gate} 이력 조회`,
      identifierColumn: 'goal_id',
      identifiers: goalIds,
    }),
  ])
  const tasks = taskRows.map(taskRow)
  const threads = threadRows.map(threadRow)
  const artifacts = artifactRows.map(artifactRow)
  const gateEvents = gateRows.map(gateEventRow)
  const threadIds = threads.map((thread) => thread.id)
  const messages = threadIds.length
    ? (await loadWorkshopRowsByIdentifiers({
        table: 'workshop_messages',
        columns: 'id, thread_id, parent_message_id, author_user_id, author_label, body, created_by, created_at',
        operation: '메시지 조회',
        identifierColumn: 'thread_id',
        identifiers: threadIds,
      })).map(messageRow)
    : []
  const taskForestByGoal = Object.fromEntries(
    goals.map((goal) => [goal.id, buildWorkshopTaskForest(tasks, { goalId: goal.id })]),
  )
  return {
    canvasOwnerId: ownerId,
    canvasId: boundedCanvasId,
    stageContracts,
    goals,
    tasks,
    taskForestByGoal,
    threads,
    messages,
    artifacts,
    gateEvents,
  }
}

export async function createWorkshopGoal(input) {
  const normalized = normalizeWorkshopGoalInput(input)
  const row = {
    canvas_owner_id: normalized.canvasOwnerId,
    canvas_id: normalized.canvasId,
    title: normalized.title,
    reason: normalized.reason,
    stage: 'backlog',
    terminal_stage: normalized.terminalStage,
    status: 'active',
  }
  const data = resultData(`${WORKSHOP_DISPLAY_NAMES.goal} 생성`, await supabase
    .from('workshop_goals')
    .insert(row)
    .select('id, canvas_owner_id, canvas_id, title, reason, stage, terminal_stage, status, created_by, created_at, updated_at')
    .single())
  return goalRow(data)
}

export async function updateWorkshopGoal(goalId, patch = {}) {
  const id = requiredId(goalId, 'goalId')
  const row = {}
  if (Object.hasOwn(patch, 'title')) row.title = safePatchText(patch.title, 'title', 240, { required: true })
  if (Object.hasOwn(patch, 'reason')) row.reason = safePatchText(patch.reason, 'reason', 5000, { required: true })
  if (Object.hasOwn(patch, 'terminalStage')) {
    if (patch.terminalStage === 'backlog' || workshopStageIndex(patch.terminalStage) < 0) {
      throw new WorkshopApiError('INVALID_INPUT', 'terminalStage는 A~H 중 하나여야 합니다.')
    }
    row.terminal_stage = patch.terminalStage
  }
  if (Object.keys(row).length === 0) {
    throw new WorkshopApiError('INVALID_INPUT', `변경할 ${WORKSHOP_DISPLAY_NAMES.goal} 필드가 없습니다.`)
  }
  const data = resultData(`${WORKSHOP_DISPLAY_NAMES.goal} 수정`, await supabase
    .from('workshop_goals')
    .update(row)
    .eq('id', id)
    .select('id, canvas_owner_id, canvas_id, title, reason, stage, terminal_stage, status, created_by, created_at, updated_at')
    .single())
  return goalRow(data)
}

export async function createWorkshopTask(input) {
  const normalized = normalizeWorkshopTaskInput(input)
  const row = {
    goal_id: normalized.goalId,
    parent_task_id: normalized.parentTaskId,
    spawned_from_task_id: normalized.spawnedFromTaskId,
    title: normalized.title,
    stage: normalized.stage,
    assignee_kind: normalized.assigneeKind,
    assignee_label: normalized.assigneeLabel || null,
    status: 'active',
  }
  const data = resultData(`${WORKSHOP_DISPLAY_NAMES.task} 생성`, await supabase
    .from('workshop_tasks')
    .insert(row)
    .select('id, goal_id, parent_task_id, spawned_from_task_id, title, stage, assignee_kind, assignee_label, status, created_by, created_at, updated_at')
    .single())
  return taskRow(data)
}

export async function updateWorkshopTask(taskId, patch = {}) {
  const id = requiredId(taskId, 'taskId')
  const row = {}
  if (Object.hasOwn(patch, 'title')) row.title = safePatchText(patch.title, 'title', 240, { required: true })
  if (Object.hasOwn(patch, 'stage')) {
    if (!WORKSHOP_STAGES.includes(patch.stage)) throw new WorkshopApiError('INVALID_INPUT', 'stage 값이 올바르지 않습니다.')
    row.stage = patch.stage
  }
  if (Object.hasOwn(patch, 'assigneeKind')) {
    if (!WORKSHOP_ASSIGNEE_KINDS.includes(patch.assigneeKind)) {
      throw new WorkshopApiError('INVALID_INPUT', 'assigneeKind 값이 올바르지 않습니다.')
    }
    row.assignee_kind = patch.assigneeKind
  }
  if (Object.hasOwn(patch, 'assigneeLabel')) {
    row.assignee_label = safePatchText(patch.assigneeLabel, 'assigneeLabel', 160) || null
  }
  if (Object.hasOwn(patch, 'parentTaskId')) row.parent_task_id = patch.parentTaskId || null
  if (Object.hasOwn(patch, 'spawnedFromTaskId')) row.spawned_from_task_id = patch.spawnedFromTaskId || null
  if (Object.hasOwn(patch, 'status')) {
    if (!WORKSHOP_STATUSES.includes(patch.status)) throw new WorkshopApiError('INVALID_INPUT', 'status 값이 올바르지 않습니다.')
    row.status = patch.status
  }
  if (Object.keys(row).length === 0) {
    throw new WorkshopApiError('INVALID_INPUT', `변경할 ${WORKSHOP_DISPLAY_NAMES.task} 필드가 없습니다.`)
  }
  const data = resultData(`${WORKSHOP_DISPLAY_NAMES.task} 수정`, await supabase
    .from('workshop_tasks')
    .update(row)
    .eq('id', id)
    .select('id, goal_id, parent_task_id, spawned_from_task_id, title, stage, assignee_kind, assignee_label, status, created_by, created_at, updated_at')
    .single())
  return taskRow(data)
}

export async function ensureWorkshopThread(goalId, taskId = null) {
  const data = resultData(`${WORKSHOP_DISPLAY_NAMES.thread} 준비`, await supabase.rpc('ensure_workshop_thread', {
    p_goal_id: requiredId(goalId, 'goalId'),
    p_task_id: taskId ? requiredId(taskId, 'taskId') : null,
  }))
  return threadRow(Array.isArray(data) ? data[0] : data)
}

export async function postWorkshopMessage(input) {
  const normalized = normalizeWorkshopMessageInput(input)
  const authorUserId = normalized.authorLabel ? null : await currentUserId()
  const data = resultData('메시지 기록', await supabase
    .from('workshop_messages')
    .insert({
      thread_id: normalized.threadId,
      parent_message_id: normalized.parentMessageId,
      author_user_id: authorUserId,
      author_label: normalized.authorLabel || null,
      body: normalized.body,
    })
    .select('id, thread_id, parent_message_id, author_user_id, author_label, body, created_by, created_at')
    .single())
  return messageRow(data)
}

export async function attachWorkshopArtifact(input) {
  const normalized = normalizeWorkshopArtifactInput(input)
  const data = resultData(`${WORKSHOP_DISPLAY_NAMES.artifact} 첨부`, await supabase
    .from('workshop_artifacts')
    .insert({
      goal_id: normalized.goalId,
      task_id: normalized.taskId,
      stage: normalized.stage,
      kind: normalized.kind,
      title: normalized.title,
      body: normalized.body || null,
      external_ref: normalized.externalRef || null,
    })
    .select('id, goal_id, task_id, stage, kind, title, body, external_ref, created_by, created_at, updated_at')
    .single())
  return artifactRow(data)
}

export async function advanceWorkshopGoal(goalId, { forced = false } = {}) {
  const data = resultData(`${WORKSHOP_DISPLAY_NAMES.gate} 승인`, await supabase.rpc('advance_workshop_goal', {
    p_goal_id: requiredId(goalId, 'goalId'),
    // This is only confirmation that the user accepted the warning. The RPC
    // recalculates missing artifacts and the persisted forced value itself.
    p_forced: forced === true,
  }))
  return {
    goal: goalRow(data?.goal),
    gateEvent: gateEventRow(data?.gateEvent),
    missingArtifactKinds: data?.missingArtifactKinds || [],
  }
}

export async function setWorkshopGoalArchived(goalId, archived = true) {
  const data = resultData(`${WORKSHOP_DISPLAY_NAMES.goal} 보관 상태 변경`, await supabase.rpc('set_workshop_goal_archived', {
    p_goal_id: requiredId(goalId, 'goalId'),
    p_archived: archived === true,
  }))
  return goalRow(Array.isArray(data) ? data[0] : data)
}

function channelKey(ownerId, canvasId) {
  let hash = 2166136261
  for (const character of `${ownerId}:${canvasId}`) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `workshop-${(hash >>> 0).toString(16)}`
}

export function subscribeWorkshopBoard(canvasOwnerId, canvasId, onChange) {
  const ownerId = requiredId(canvasOwnerId, 'canvasOwnerId')
  const boundedCanvasId = requiredId(canvasId, 'canvasId')
  if (typeof onChange !== 'function') {
    throw new WorkshopApiError('INVALID_INPUT', 'onChange 콜백이 필요합니다.')
  }
  const channel = supabase.channel(channelKey(ownerId, boundedCanvasId))
  for (const table of [
    'workshop_goals',
    'workshop_tasks',
    'workshop_threads',
    'workshop_messages',
    'workshop_artifacts',
    'workshop_gate_events',
  ]) {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
    }, (payload) => {
      if (table === 'workshop_goals') {
        const row = payload.new?.id ? payload.new : payload.old
        const hasCanvasScope = Boolean(row?.canvas_owner_id && row?.canvas_id)
        // A DELETE payload may contain only the primary key when the deployed
        // table has not yet picked up REPLICA IDENTITY FULL. Refreshing is a
        // safe broad invalidation; dropping the event can leave a deleted goal
        // visible indefinitely.
        if (payload.eventType !== 'DELETE' || hasCanvasScope) {
          if (row?.canvas_owner_id !== ownerId || row?.canvas_id !== boundedCanvasId) return
        }
      }
      onChange({ table, eventType: payload.eventType, payload })
    })
  }
  channel.subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
