// Focused MCP boundary tests for the Workshop MVP.
// Run: node scripts/test-workshop-mcp.mjs
import assert from 'node:assert/strict'
import {
  WORKSHOP_AGENT_TOOL_NAMES,
  buildServer,
} from '../mcp/server.js'
import {
  ENSURE_WORKSHOP_THREAD_RPC,
  assembleWorkshopBoard,
  assertWorkshopTaskReferences,
  attachWorkshopArtifact,
  createWorkshopGoal,
  createWorkshopTask,
  loadWorkshopRowsByIds,
  normalizeWorkshopArtifactExternalRef,
  postWorkshopMessage,
  resolveWorkshopMessageThread,
  selectWorkshopCanvasAccess,
} from '../mcp/workshopStore.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

test('Workshop registers exactly the five reporting tools and no transition authority', () => {
  const server = buildServer(() => 'actor-1')
  const registered = Object.keys(server._registeredTools)
  const workshopTools = registered.filter((name) => name.includes('workshop'))
  assert.deepEqual(workshopTools, [...WORKSHOP_AGENT_TOOL_NAMES])

  const prohibitedAuthority = [
    /(?:approve|gate|move|transition|advance|complete|finish|archive).*workshop|workshop.*(?:approve|gate|move|transition|advance|complete|finish|archive)/i,
    /(?:move|transition|advance|complete|finish|archive).*(?:goal|task|card)|(?:goal|task|card).*(?:move|transition|advance|complete|finish|archive)/i,
    /approve.*gate|gate.*approve/i,
  ]
  for (const name of registered) {
    for (const pattern of prohibitedAuthority) assert.doesNotMatch(name, pattern)
  }

  for (const name of WORKSHOP_AGENT_TOOL_NAMES) {
    const fields = Object.keys(server._registeredTools[name].inputSchema.def.shape)
    assert.equal(fields.includes('forced'), false, `${name} must not expose forced`)
    assert.equal(fields.includes('from_stage'), false, `${name} must not expose from_stage`)
    assert.equal(fields.includes('to_stage'), false, `${name} must not expose to_stage`)
    assert.equal(fields.includes('status'), false, `${name} must not expose status`)
  }
  assert.equal(
    Object.keys(server._registeredTools.create_workshop_goal.inputSchema.def.shape).includes('stage'),
    false,
    'agents must not create a goal directly in an advanced stage',
  )
  assert.equal(
    Object.keys(server._registeredTools.create_workshop_task.inputSchema.def.shape).includes('stage'),
    false,
    'agents must not create a task directly in an advanced stage',
  )
})

test('Workshop tools keep the existing MCP token guard and forward only the resolved user id', async () => {
  const calls = []
  const fakeStore = {
    async listWorkshopBoard(userId, canvasId) {
      calls.push(['list', userId, canvasId])
      return { canvas_id: canvasId }
    },
    async createWorkshopGoal(userId, canvasId, input) {
      calls.push(['goal', userId, canvasId, input.title])
      return { id: 'goal-1' }
    },
    async createWorkshopTask(userId, goalId, input) {
      calls.push(['task', userId, goalId, input.title])
      return { id: 'task-1' }
    },
    async postWorkshopMessage(userId, goalId, input) {
      calls.push(['message', userId, goalId, input.author_label])
      return { message: { id: 'message-1' } }
    },
    async attachWorkshopArtifact(userId, goalId, input) {
      calls.push(['artifact', userId, goalId, input.kind])
      return { id: 'artifact-1' }
    },
  }
  const actor = 'resolved-token-user'
  const server = buildServer(() => actor, { workshopStore: fakeStore })
  const uuid = '00000000-0000-4000-8000-000000000001'

  await server._registeredTools.list_workshop_board.handler({ canvas_id: 'canvas-1' })
  await server._registeredTools.create_workshop_goal.handler({
    canvas_id: 'canvas-1',
    title: '목표',
    reason: '이유',
    terminal_stage: 'B',
  })
  await server._registeredTools.create_workshop_task.handler({ goal_id: uuid, title: '작업' })
  await server._registeredTools.post_workshop_message.handler({
    goal_id: uuid,
    author_label: 'Codex',
    body: '보고',
  })
  await server._registeredTools.attach_workshop_artifact.handler({
    goal_id: uuid,
    kind: 'patch',
    title: '변경',
    body: '검증됨',
  })

  assert.deepEqual(calls, [
    ['list', actor, 'canvas-1'],
    ['goal', actor, 'canvas-1', '목표'],
    ['task', actor, uuid, '작업'],
    ['message', actor, uuid, 'Codex'],
    ['artifact', actor, uuid, 'patch'],
  ])

  let unauthenticatedCall = false
  const unauthenticated = buildServer(() => null, {
    workshopStore: {
      ...fakeStore,
      async listWorkshopBoard() {
        unauthenticatedCall = true
        return {}
      },
    },
  })
  const rejected = await unauthenticated._registeredTools.list_workshop_board.handler({ canvas_id: 'canvas-1' })
  assert.equal(rejected.isError, true)
  assert.equal(unauthenticatedCall, false)
})

test('every accepted canvas participant gets full board access regardless of region grant flags', () => {
  const participant = selectWorkshopCanvasAccess({
    userId: 'member-1',
    canvasId: 'canvas-1',
    ownCanvas: null,
    shares: [{
      owner_id: 'owner-1',
      canvas_id: 'canvas-1',
      scope: 'node',
      target_id: 'node-1',
      can_edit: false,
      restrict_view: true,
    }],
  })
  assert.deepEqual(participant, {
    ownerId: 'owner-1',
    role: 'participant',
    fullAccess: true,
    redactionApplied: false,
  })

  const owner = selectWorkshopCanvasAccess({
    userId: 'owner-1',
    canvasId: 'canvas-1',
    ownCanvas: { user_id: 'owner-1', canvas_id: 'canvas-1' },
    shares: [],
  })
  assert.equal(owner.role, 'owner')
  assert.equal(owner.fullAccess, true)

  assert.equal(selectWorkshopCanvasAccess({
    userId: 'outsider',
    canvasId: 'canvas-1',
    ownCanvas: null,
    shares: [],
  }), null)
})

test('ambiguous cross-owner canvas ids fail closed', () => {
  assert.throws(() => selectWorkshopCanvasAccess({
    userId: 'member-1',
    canvasId: 'same-id',
    ownCanvas: null,
    shares: [
      { owner_id: 'owner-a', canvas_id: 'same-id' },
      { owner_id: 'owner-b', canvas_id: 'same-id' },
    ],
  }), /여러 개/)
})

test('MCP goal creation always writes backlog and active even when forged fields are supplied', async () => {
  const inserted = []
  const db = {
    from(table) {
      if (table === 'canvases') {
        const query = {
          select() { return query },
          eq() { return query },
          maybeSingle() {
            return Promise.resolve({
              data: { user_id: 'owner-1', canvas_id: 'canvas-1' },
              error: null,
            })
          },
        }
        return query
      }
      if (table === 'workshop_goals') {
        return {
          insert(row) {
            inserted.push(row)
            return {
              select() {
                return {
                  single: () => Promise.resolve({ data: { id: 'goal-1', ...row }, error: null }),
                }
              },
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  const goal = await createWorkshopGoal('owner-1', 'canvas-1', {
    title: ' 기록할 목표 ',
    reason: ' 검증 이유 ',
    terminal_stage: 'C',
    stage: 'H',
    status: 'done',
    forced: true,
  }, {
    db,
    listShares: async () => [],
    auditAccess: async () => ({ recorded: true }),
  })
  assert.equal(goal.stage, 'backlog')
  assert.equal(goal.status, 'active')
  assert.equal(Object.hasOwn(inserted[0], 'forced'), false)
})

test('accepted read-only scoped participants can write the owner board while outsiders cannot', async () => {
  const inserted = []
  const db = {
    from(table) {
      if (table === 'canvases') {
        const filters = {}
        const query = {
          select() { return query },
          eq(field, value) { filters[field] = value; return query },
          maybeSingle() {
            const found = filters.user_id === 'owner-1' && filters.canvas_id === 'canvas-1'
            return Promise.resolve({
              data: found ? { user_id: 'owner-1', canvas_id: 'canvas-1' } : null,
              error: null,
            })
          },
        }
        return query
      }
      if (table === 'workshop_goals') {
        return {
          insert(row) {
            inserted.push(row)
            return {
              select() {
                return {
                  single: () => Promise.resolve({ data: { id: 'goal-1', ...row }, error: null }),
                }
              },
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  const acceptedShare = {
    owner_id: 'owner-1',
    canvas_id: 'canvas-1',
    scope: 'node',
    target_id: 'node-1',
    can_edit: false,
    restrict_view: true,
  }
  await createWorkshopGoal('member-1', 'canvas-1', {
    title: '참여자 목표',
    reason: '공유 보드 기록',
    terminal_stage: 'A',
  }, {
    db,
    listShares: async () => [acceptedShare],
    auditAccess: async () => ({ recorded: true }),
  })
  assert.equal(inserted[0].canvas_owner_id, 'owner-1')
  assert.equal(inserted[0].created_by, 'member-1')

  await assert.rejects(() => createWorkshopGoal('outsider-1', 'canvas-1', {
    title: '차단 목표',
    reason: '권한 없음',
    terminal_stage: 'A',
  }, {
    db,
    listShares: async () => [],
    auditAccess: async () => ({ recorded: true }),
  }), /접근 권한/)
  assert.equal(inserted.length, 1)
})

test('MCP task creation is pinned to the goal stage even when a forged stage is supplied', async () => {
  const inserted = []
  const db = {
    from(table) {
      if (table === 'workshop_goals') {
        const query = {
          select() { return query },
          eq() { return query },
          maybeSingle: () => Promise.resolve({
            data: {
              id: 'goal-1',
              canvas_owner_id: 'owner-1',
              canvas_id: 'canvas-1',
              stage: 'B',
              status: 'active',
            },
            error: null,
          }),
        }
        return query
      }
      if (table === 'canvases') {
        const query = {
          select() { return query },
          eq() { return query },
          maybeSingle: () => Promise.resolve({
            data: { user_id: 'owner-1', canvas_id: 'canvas-1' },
            error: null,
          }),
        }
        return query
      }
      if (table === 'workshop_tasks') {
        return {
          insert(row) {
            inserted.push(row)
            return {
              select() {
                return {
                  single: () => Promise.resolve({ data: { id: 'task-1', ...row }, error: null }),
                }
              },
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  const task = await createWorkshopTask('owner-1', 'goal-1', {
    title: '구현',
    stage: 'H',
    status: 'done',
  }, {
    db,
    listShares: async () => [],
    auditAccess: async () => ({ recorded: true }),
  })
  assert.equal(task.stage, 'B')
  assert.equal(task.status, 'active')
  assert.equal(Object.hasOwn(inserted[0], 'forced'), false)
})

test('task parent and spawned-from relations cannot cross goal boundaries', () => {
  assert.doesNotThrow(() => assertWorkshopTaskReferences('goal-1', {
    parent_task_id: 'task-1',
    spawned_from_task_id: 'task-2',
  }, [
    { id: 'task-1', goal_id: 'goal-1' },
    { id: 'task-2', goal_id: 'goal-1' },
  ]))
  assert.throws(() => assertWorkshopTaskReferences('goal-1', {
    parent_task_id: 'task-1',
    spawned_from_task_id: 'task-other',
  }, [
    { id: 'task-1', goal_id: 'goal-1' },
    { id: 'task-other', goal_id: 'goal-2' },
  ]), /같은 목표/)
})

test('artifact external refs allow identifiers and reject credential values', () => {
  for (const safe of [
    'src/App.jsx',
    'C:\\workspace\\patch.diff',
    'abc123def4567890',
    'https://example.com/builds/123',
    'https://example.com/builds/123?sha=0123456789abcdef0123456789abcdef01234567',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) assert.equal(normalizeWorkshopArtifactExternalRef(safe), safe)

  for (const secret of [
    `Bearer ${'a'.repeat(32)}`,
    `sk-${'a'.repeat(32)}`,
    `eyJ${'a'.repeat(20)}.${'b'.repeat(16)}.${'c'.repeat(16)}`,
    'https://user:actual-password@example.com/database',
    'https://example.com/result?access_token=actual-secret-value',
    `https://example.com/result?sig=${'a'.repeat(32)}`,
    `https://example.com/result?X-Goog-Signature=${'a'.repeat(64)}`,
    `https://example.com/callback?code=${'a'.repeat(32)}`,
    `https://example.com/result#access_token=${'a'.repeat(32)}`,
    `https://hooks.slack.com/services/${'a'.repeat(24)}`,
    `https://discord.com/api/webhooks/123/${'a'.repeat(32)}`,
    `https://api.telegram.org/bot${'a'.repeat(32)}/sendMessage`,
    `https://example.com/webhooks/${'a'.repeat(32)}`,
    'password=actual-secret-value',
  ]) {
    assert.throws(
      () => normalizeWorkshopArtifactExternalRef(secret),
      (error) => error.code === 'SECRET_VALUE_BLOCKED',
    )
  }
  for (const unsafeProtocol of [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///private/tmp/report.txt',
  ]) {
    assert.throws(
      () => normalizeWorkshopArtifactExternalRef(unsafeProtocol),
      (error) => error.code === 'EXTERNAL_REF_PROTOCOL_BLOCKED',
    )
  }
})

test('artifact persistence invokes the shared secret boundary before any insert', async () => {
  let artifactInsertAttempted = false
  const db = {
    from(table) {
      if (table === 'workshop_goals') {
        const query = {
          select() { return query },
          eq() { return query },
          maybeSingle: () => Promise.resolve({
            data: {
              id: 'goal-1',
              canvas_owner_id: 'owner-1',
              canvas_id: 'canvas-1',
              stage: 'B',
            },
            error: null,
          }),
        }
        return query
      }
      if (table === 'canvases') {
        const query = {
          select() { return query },
          eq() { return query },
          maybeSingle: () => Promise.resolve({
            data: { user_id: 'owner-1', canvas_id: 'canvas-1' },
            error: null,
          }),
        }
        return query
      }
      if (table === 'workshop_artifacts') {
        return {
          insert() {
            artifactInsertAttempted = true
            throw new Error('unsafe insert reached')
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  await assert.rejects(() => attachWorkshopArtifact('owner-1', 'goal-1', {
    kind: 'deployment-record',
    title: '배포',
    external_ref: `Bearer ${'a'.repeat(32)}`,
  }, {
    db,
    listShares: async () => [],
    auditAccess: async () => ({ recorded: true }),
  }), (error) => error.code === 'SECRET_VALUE_BLOCKED')
  assert.equal(artifactInsertAttempted, false)
})

test('board collection reads paginate past the PostgREST row cap', async () => {
  const sourceRows = Array.from({ length: 1_205 }, (_, index) => ({
    id: `message-${String(index).padStart(4, '0')}`,
    thread_id: 'thread-1',
    created_at: `2026-07-20T00:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:00.000Z`,
  }))
  const ranges = []
  const db = {
    from(table) {
      assert.equal(table, 'workshop_messages')
      const query = {
        select() { return query },
        in() { return query },
        order() { return query },
        range(from, to) {
          ranges.push([from, to])
          return Promise.resolve({ data: sourceRows.slice(from, to + 1), error: null })
        },
      }
      return query
    },
  }
  const rows = await loadWorkshopRowsByIds(
    db,
    'workshop_messages',
    'thread_id',
    ['thread-1'],
    'id, thread_id, created_at',
  )
  assert.equal(rows.length, 1_205)
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]])
})

test('concurrent default-thread resolution delegates to the atomic participant-aware RPC', async () => {
  const calls = []
  const thread = {
    id: 'thread-1',
    goal_id: 'goal-1',
    task_id: 'task-1',
    title: '작업',
    created_by: 'member-1',
  }
  const db = {
    rpc(name, args) {
      calls.push([name, args])
      return Promise.resolve({ data: [thread], error: null })
    },
  }
  const goal = { id: 'goal-1', title: '목표' }
  const task = { id: 'task-1', title: '작업' }
  const [first, second] = await Promise.all([
    resolveWorkshopMessageThread(db, goal, task, null, 'member-1'),
    resolveWorkshopMessageThread(db, goal, task, null, 'member-1'),
  ])
  assert.deepEqual(first, thread)
  assert.deepEqual(second, thread)
  assert.deepEqual(calls, [
    [ENSURE_WORKSHOP_THREAD_RPC, {
      p_goal_id: 'goal-1',
      p_task_id: 'task-1',
      p_created_by: 'member-1',
    }],
    [ENSURE_WORKSHOP_THREAD_RPC, {
      p_goal_id: 'goal-1',
      p_task_id: 'task-1',
      p_created_by: 'member-1',
    }],
  ])
})

test('agent messages separate the visible agent label from the authenticated creator', async () => {
  const inserted = []
  const db = {
    from(table) {
      if (table === 'workshop_goals') {
        const query = {
          select() { return query },
          eq() { return query },
          maybeSingle: () => Promise.resolve({
            data: {
              id: 'goal-1',
              canvas_owner_id: 'owner-1',
              canvas_id: 'canvas-1',
              title: '목표',
              stage: 'B',
            },
            error: null,
          }),
        }
        return query
      }
      if (table === 'canvases') {
        const query = {
          select() { return query },
          eq() { return query },
          maybeSingle: () => Promise.resolve({
            data: { user_id: 'owner-1', canvas_id: 'canvas-1' },
            error: null,
          }),
        }
        return query
      }
      if (table === 'workshop_messages') {
        return {
          insert(row) {
            inserted.push(row)
            return {
              select() {
                return {
                  single: () => Promise.resolve({ data: { id: 'message-1', ...row }, error: null }),
                }
              },
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
    rpc(name, args) {
      assert.equal(name, ENSURE_WORKSHOP_THREAD_RPC)
      assert.equal(args.p_created_by, 'owner-1')
      return Promise.resolve({
        data: [{
          id: 'thread-1',
          goal_id: 'goal-1',
          task_id: null,
          title: '목표',
          created_by: 'owner-1',
        }],
        error: null,
      })
    },
  }
  await postWorkshopMessage('owner-1', 'goal-1', {
    author_label: 'Codex',
    body: '검증 통과',
  }, {
    db,
    listShares: async () => [],
    auditAccess: async () => ({ recorded: true }),
  })
  assert.equal(inserted[0].author_user_id, null)
  assert.equal(inserted[0].author_label, 'Codex')
  assert.equal(inserted[0].created_by, 'owner-1')
})

test('board listing preserves task/message branches and human gate history as read-only data', () => {
  const board = assembleWorkshopBoard({
    access: { canvasId: 'canvas-1', ownerId: 'owner-1', role: 'participant' },
    stageContracts: [{ stage: 'A', recommended_artifact_kinds: ['brief'] }],
    goals: [{ id: 'goal-1', title: '목표' }],
    tasks: [{
      id: 'task-1',
      goal_id: 'goal-1',
      parent_task_id: null,
      spawned_from_task_id: null,
    }],
    threads: [{ id: 'thread-1', goal_id: 'goal-1', task_id: 'task-1' }],
    messages: [{
      id: 'message-1',
      thread_id: 'thread-1',
      parent_message_id: null,
    }],
    artifacts: [{ id: 'artifact-1', goal_id: 'goal-1', task_id: 'task-1' }],
    gateEvents: [{ id: 'gate-1', goal_id: 'goal-1', forced: true }],
  })
  assert.equal(board.my_access.full_access, true)
  assert.equal(board.my_access.redaction_applied, false)
  assert.equal(board.goals[0].tasks[0].id, 'task-1')
  assert.equal(board.goals[0].threads[0].messages[0].id, 'message-1')
  assert.equal(board.goals[0].artifacts[0].id, 'artifact-1')
  assert.equal(board.goals[0].gate_events[0].forced, true)
})

let failures = 0
for (const { name, fn } of tests) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failures += 1
    console.error(`✗ ${name}`)
    console.error(error)
  }
}
if (failures) process.exitCode = 1
else console.log(`\n${tests.length} Workshop MCP tests passed.`)
