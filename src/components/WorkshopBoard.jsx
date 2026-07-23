import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  WORKSHOP_DISPLAY_NAMES,
  WORKSHOP_STAGE_DISPLAY_NAMES,
} from '../../shared/uiConstants.js'
import {
  WORKSHOP_ASSIGNEE_KINDS,
  WORKSHOP_STAGE_CONTRACTS,
  WORKSHOP_STAGES,
  buildWorkshopContextPack,
  buildWorkshopTaskForest,
  workshopGateReadiness,
} from '../../shared/workshop.js'
import {
  advanceWorkshopGoal,
  attachWorkshopArtifact,
  createWorkshopGoal,
  createWorkshopTask,
  ensureWorkshopThread,
  loadWorkshopBoard,
  postWorkshopMessage,
  setWorkshopGoalArchived,
  subscribeWorkshopBoard,
} from '../lib/workshopApi.js'

const EMPTY_BOARD = Object.freeze({
  stageContracts: [],
  goals: [],
  tasks: [],
  threads: [],
  messages: [],
  artifacts: [],
  gateEvents: [],
})

const ASSIGNEE_LABELS = Object.freeze({
  manual: '수동',
  yescode: '예스코드',
  nocode: '노코드',
})

function stageLabel(stage) {
  return WORKSHOP_STAGE_DISPLAY_NAMES[stage] ?? stage
}

function contractForStage(contracts, stage) {
  if (Array.isArray(contracts)) {
    return contracts.find((contract) => contract.stage === stage) ?? null
  }
  return contracts?.[stage] ?? null
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function externalHref(value) {
  if (typeof value !== 'string' || !value) return ''
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : ''
  } catch {
    return ''
  }
}

function sortedByCreated(items) {
  return [...items].sort((left, right) => (
    String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? ''))
    || String(left.id ?? '').localeCompare(String(right.id ?? ''))
  ))
}

function messageForest(messages) {
  const byId = new Map(messages.map((message) => [message.id, { ...message, children: [] }]))
  const roots = []
  for (const message of byId.values()) {
    const parent = byId.get(message.parentMessageId)
    if (parent) parent.children.push(message)
    else roots.push(message)
  }
  const sort = (items) => {
    items.sort((left, right) => (
      String(left.createdAt).localeCompare(String(right.createdAt))
      || String(left.id).localeCompare(String(right.id))
    ))
    items.forEach((item) => sort(item.children))
  }
  sort(roots)
  return roots
}

function workshopThreadGroups(threads, messages, tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const messagesByThread = new Map()
  for (const message of messages) {
    const threadMessages = messagesByThread.get(message.threadId) ?? []
    threadMessages.push(message)
    messagesByThread.set(message.threadId, threadMessages)
  }

  return sortedByCreated(threads)
    .sort((left, right) => Number(Boolean(left.taskId)) - Number(Boolean(right.taskId)))
    .map((thread) => ({
      thread,
      task: thread.taskId ? taskById.get(thread.taskId) ?? null : null,
      messages: messageForest(messagesByThread.get(thread.id) ?? []),
    }))
}

function MessageBranch({ messages, onReply, depth = 0 }) {
  return messages.map((message) => (
    <article
      className="workshop-message"
      key={message.id}
      style={{ '--message-depth': Math.min(depth, 5) }}
    >
      <header>
        <strong>{message.authorLabel || '사용자'}</strong>
        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        <button type="button" onClick={() => onReply(message)}>답장</button>
      </header>
      <p>{message.body}</p>
      {message.children.length > 0 && (
        <div className="workshop-message-children">
          <MessageBranch messages={message.children} onReply={onReply} depth={depth + 1} />
        </div>
      )}
    </article>
  ))
}

function TaskBranch({ tasks, depth = 0 }) {
  return tasks.map((task) => (
    <div className="workshop-task-tree-branch" key={task.id}>
      {task.children?.length > 0
        ? (
            <details className="workshop-task-tree-group" open={depth < 2}>
              <summary>
                <div className="workshop-task-tree-item" style={{ '--task-depth': Math.min(depth, 6) }}>
                  <span aria-hidden="true">{task.spawnedFromTaskId ? '↳' : '▾'}</span>
                  <strong>{task.title}</strong>
                  <small>{stageLabel(task.stage)}</small>
                  <small>{ASSIGNEE_LABELS[task.assigneeKind] ?? task.assigneeKind}</small>
                  {task.assigneeLabel && <em>{task.assigneeLabel}</em>}
                </div>
              </summary>
              <TaskBranch tasks={task.children} depth={depth + 1} />
            </details>
          )
        : (
            <div className="workshop-task-tree-item" style={{ '--task-depth': Math.min(depth, 6) }}>
              <span aria-hidden="true">{task.spawnedFromTaskId ? '↳' : '•'}</span>
              <strong>{task.title}</strong>
              <small>{stageLabel(task.stage)}</small>
              <small>{ASSIGNEE_LABELS[task.assigneeKind] ?? task.assigneeKind}</small>
              {task.assigneeLabel && <em>{task.assigneeLabel}</em>}
            </div>
          )}
    </div>
  ))
}

function GateDialog({
  goal,
  artifacts,
  contract,
  onCancel,
  onConfirm,
  busy,
}) {
  const readiness = workshopGateReadiness({ goal, artifacts, contract })
  const recommendedKinds = readiness.contract?.recommendedArtifactKinds ?? []
  const presentKinds = new Set(
    artifacts
      .filter((artifact) => artifact.stage === goal.stage)
      .map((artifact) => artifact.kind),
  )
  const missingKinds = readiness.missingArtifactKinds
  const forced = readiness.forcedRequired
  const currentIndex = WORKSHOP_STAGES.indexOf(goal.stage)
  const terminal = goal.stage === goal.terminalStage
  const nextStage = terminal
    ? goal.stage
    : WORKSHOP_STAGES[Math.min(currentIndex + 1, WORKSHOP_STAGES.length - 1)]

  return (
    <div className="workshop-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="workshop-gate-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="workshop-gate-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="workshop-eyebrow">{WORKSHOP_DISPLAY_NAMES.gate}</span>
        <h2 id="workshop-gate-title">
          {terminal ? '종착 승인' : `${stageLabel(goal.stage)} → ${stageLabel(nextStage)}`}
        </h2>
        <p>{contract?.gateGuidance ?? '현재 단계의 기록을 확인한 뒤 이동합니다.'}</p>
        <div className="workshop-gate-checks">
          {recommendedKinds.length === 0 && <span>이 단계에는 지정된 권고 형식이 없습니다.</span>}
          {recommendedKinds.map((kind) => (
            <span className={presentKinds.has(kind) ? 'is-ready' : 'is-missing'} key={kind}>
              {presentKinds.has(kind) ? '✓' : '!'} {kind}
            </span>
          ))}
        </div>
        {forced && (
          <p className="workshop-warning">
            권고 기록이 {missingKinds.length}개 없습니다. 이동하면 강행으로 남습니다.
          </p>
        )}
        <footer>
          <button type="button" onClick={onCancel} disabled={busy}>취소</button>
          <button
            className="is-primary"
            type="button"
            onClick={() => onConfirm({ forced })}
            disabled={busy}
          >
            {busy ? '기록 중…' : forced ? '그래도 이동' : terminal ? '완료 처리' : '승인하고 이동'}
          </button>
        </footer>
      </section>
    </div>
  )
}

export function WorkshopBoard({
  canvasOwnerId,
  canvasId,
  currentUserId,
  onClose,
}) {
  const [board, setBoard] = useState(EMPTY_BOARD)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [expandedGoalId, setExpandedGoalId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [gateGoal, setGateGoal] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [goalDraft, setGoalDraft] = useState({
    title: '',
    reason: '',
    terminalStage: 'C',
  })
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    stage: 'backlog',
    parentTaskId: '',
    spawnedFromTaskId: '',
    assigneeKind: 'manual',
    assigneeLabel: '',
  })
  const [messageBody, setMessageBody] = useState('')
  const [artifactDraft, setArtifactDraft] = useState({
    taskId: '',
    kind: '',
    title: '',
    body: '',
    externalRef: '',
  })

  const refresh = useCallback(async () => {
    if (!currentUserId || !canvasOwnerId || !canvasId) {
      setLoading(false)
      return
    }
    try {
      const loaded = await loadWorkshopBoard(canvasOwnerId, canvasId)
      setBoard({ ...EMPTY_BOARD, ...loaded })
      setError('')
    } catch (loadError) {
      setError(loadError.message || '기록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [canvasId, canvasOwnerId, currentUserId])

  useEffect(() => {
    refresh()
    if (!currentUserId || !canvasOwnerId || !canvasId) return undefined
    const unsubscribe = subscribeWorkshopBoard(canvasOwnerId, canvasId, refresh)
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
      else unsubscribe?.unsubscribe?.()
    }
  }, [canvasId, canvasOwnerId, currentUserId, refresh])

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      if (gateGoal) setGateGoal(null)
      else onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [gateGoal, onClose])

  const visibleGoals = useMemo(() => board.goals.filter((goal) => (
    showArchived ? true : !['done', 'archived'].includes(goal.status)
  )), [board.goals, showArchived])
  const stageContracts = useMemo(() => (
    !currentUserId || loading
      ? WORKSHOP_STAGE_CONTRACTS
      : Array.isArray(board.stageContracts) ? board.stageContracts : []
  ), [board.stageContracts, currentUserId, loading])

  const expandedGoal = board.goals.find((goal) => goal.id === expandedGoalId) ?? null
  const expandedTasks = expandedGoal
    ? board.tasks.filter((task) => task.goalId === expandedGoal.id)
    : []
  const expandedArtifacts = expandedGoal
    ? board.artifacts.filter((artifact) => artifact.goalId === expandedGoal.id)
    : []
  const expandedThreads = expandedGoal
    ? board.threads.filter((thread) => thread.goalId === expandedGoal.id)
    : []
  const expandedThreadIds = new Set(expandedThreads.map((thread) => thread.id))
  const expandedMessages = board.messages.filter((message) => expandedThreadIds.has(message.threadId))
  const expandedGateEvents = expandedGoal
    ? board.gateEvents.filter((event) => event.goalId === expandedGoal.id)
    : []
  const expandedTaskForest = useMemo(
    () => buildWorkshopTaskForest(expandedTasks),
    [expandedTasks],
  )
  const expandedThreadGroups = useMemo(
    () => workshopThreadGroups(expandedThreads, expandedMessages, expandedTasks),
    [expandedMessages, expandedTasks, expandedThreads],
  )

  const perform = async (action, successMessage) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await refresh()
      setNotice(successMessage)
      return true
    } catch (actionError) {
      setError(actionError.message || '요청을 처리하지 못했습니다.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const submitGoal = async (event) => {
    event.preventDefault()
    const saved = await perform(
      () => createWorkshopGoal({
        canvasOwnerId,
        canvasId,
        ...goalDraft,
      }),
      `${WORKSHOP_DISPLAY_NAMES.goal}을 기록했습니다.`,
    )
    if (!saved) return
    setGoalDraft({ title: '', reason: '', terminalStage: 'C' })
    setShowGoalForm(false)
  }

  const submitTask = async (event) => {
    event.preventDefault()
    if (!expandedGoal) return
    const saved = await perform(
      () => createWorkshopTask({
        goalId: expandedGoal.id,
        ...taskDraft,
      }),
      `${WORKSHOP_DISPLAY_NAMES.task}을 기록했습니다.`,
    )
    if (!saved) return
    setTaskDraft({
      title: '',
      stage: expandedGoal.stage,
      parentTaskId: '',
      spawnedFromTaskId: '',
      assigneeKind: 'manual',
      assigneeLabel: '',
    })
  }

  const submitMessage = async (event) => {
    event.preventDefault()
    if (!expandedGoal) return
    const saved = await perform(async () => {
      const threadId = replyTo?.threadId || (
        expandedThreads.find((thread) => !thread.taskId)
        ?? await ensureWorkshopThread(expandedGoal.id)
      ).id
      await postWorkshopMessage({
        threadId,
        body: messageBody,
        parentMessageId: replyTo?.id ?? null,
      })
    }, `${WORKSHOP_DISPLAY_NAMES.thread} 기록을 추가했습니다.`)
    if (!saved) return
    setMessageBody('')
    setReplyTo(null)
  }

  const submitArtifact = async (event) => {
    event.preventDefault()
    if (!expandedGoal) return
    const saved = await perform(
      () => attachWorkshopArtifact({
        goalId: expandedGoal.id,
        ...artifactDraft,
        stage: expandedGoal.stage,
      }),
      `${WORKSHOP_DISPLAY_NAMES.artifact}을 기록했습니다.`,
    )
    if (!saved) return
    setArtifactDraft({ taskId: '', kind: '', title: '', body: '', externalRef: '' })
  }

  const copyContextPack = async () => {
    if (!expandedGoal) return
    try {
      const contextPack = buildWorkshopContextPack({
        goal: expandedGoal,
        contract: contractForStage(stageContracts, expandedGoal.stage),
        artifacts: expandedArtifacts,
        messages: expandedMessages,
      })
      await navigator.clipboard.writeText(contextPack)
      setNotice('컨텍스트 팩을 클립보드에 복사했습니다.')
      setError('')
    } catch (copyError) {
      setError(copyError.message || '클립보드에 복사하지 못했습니다.')
    }
  }

  const confirmGate = async ({ forced }) => {
    if (!gateGoal) return
    const completed = await perform(
      () => advanceWorkshopGoal(gateGoal.id, { forced }),
      gateGoal.stage === gateGoal.terminalStage
        ? `${WORKSHOP_DISPLAY_NAMES.goal}을 완료 처리했습니다.`
        : `${WORKSHOP_DISPLAY_NAMES.gate} 승인을 기록했습니다.`,
    )
    if (completed) setGateGoal(null)
  }

  const toggleArchive = async () => {
    if (!expandedGoal || !['done', 'archived'].includes(expandedGoal.status)) return
    const archived = expandedGoal.status !== 'archived'
    await perform(
      () => setWorkshopGoalArchived(expandedGoal.id, archived),
      archived ? '완료 기록을 보관했습니다.' : '완료 기록을 다시 펼쳤습니다.',
    )
  }

  return (
    <section
      className="workshop-board-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workshop-board-title"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="workshop-board-header">
        <div>
          <span className="workshop-eyebrow">canvas · {canvasId}</span>
          <h1 id="workshop-board-title">{WORKSHOP_DISPLAY_NAMES.board}</h1>
          <p>
            병렬 {WORKSHOP_DISPLAY_NAMES.goal}와 기록을 한 화면에서 확인하고,
            단계 이동은 사람이 승인합니다.
          </p>
        </div>
        <div className="workshop-board-actions">
          <label>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            완료 기록 보기
          </label>
          <button
            type="button"
            onClick={() => setShowGoalForm((visible) => !visible)}
            disabled={!currentUserId}
          >
            + {WORKSHOP_DISPLAY_NAMES.goal}
          </button>
          <button type="button" className="is-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
      </header>

      {currentUserId && showGoalForm && (
        <form className="workshop-goal-create" onSubmit={submitGoal}>
          <label>
            <span>{WORKSHOP_DISPLAY_NAMES.goal} 이름</span>
            <input
              required
              maxLength={180}
              value={goalDraft.title}
              onChange={(event) => setGoalDraft((draft) => ({ ...draft, title: event.target.value }))}
            />
          </label>
          <label>
            <span>이유</span>
            <input
              required
              maxLength={5000}
              value={goalDraft.reason}
              onChange={(event) => setGoalDraft((draft) => ({ ...draft, reason: event.target.value }))}
            />
          </label>
          <label>
            <span>종착 열</span>
            <select
              value={goalDraft.terminalStage}
              onChange={(event) => setGoalDraft((draft) => ({ ...draft, terminalStage: event.target.value }))}
            >
              {WORKSHOP_STAGES.filter((stage) => stage !== 'backlog').map((stage) => (
                <option key={stage} value={stage}>{stageLabel(stage)}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy}>기록</button>
        </form>
      )}

      {(error || notice) && (
        <div className={`workshop-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || notice}
        </div>
      )}

      <main className="workshop-board-scroll">
        <div className="workshop-stage-grid workshop-stage-header">
          {WORKSHOP_STAGES.map((stage) => (
            <div key={stage}>
              <strong>{stageLabel(stage)}</strong>
              <span>{contractForStage(stageContracts, stage)?.gateGuidance ?? ''}</span>
            </div>
          ))}
        </div>

        {!currentUserId && (
          <div className="workshop-board-state">
            로그인하면 이 캔버스의 {WORKSHOP_DISPLAY_NAMES.board} 기록을 사용할 수 있습니다.
          </div>
        )}
        {currentUserId && loading && <div className="workshop-board-state">기록을 불러오는 중…</div>}
        {currentUserId && !loading && visibleGoals.length === 0 && (
            <div className="workshop-board-state">
              아직 {WORKSHOP_DISPLAY_NAMES.goal} 기록이 없습니다.
            </div>
        )}

        {currentUserId && !loading && visibleGoals.map((goal) => {
            const goalTasks = board.tasks.filter((task) => task.goalId === goal.id)
            const isExpanded = goal.id === expandedGoalId
            return (
              <section className="workshop-goal-row workshop-stage-grid" key={goal.id}>
                {WORKSHOP_STAGES.map((stage) => {
                  const stageTasks = goalTasks.filter((task) => task.stage === stage)
                  return (
                    <div className="workshop-stage-cell" key={stage}>
                      {goal.stage === stage && (
                        <article className={`workshop-goal-card${goal.status !== 'active' ? ' is-done' : ''}`}>
                          <button
                            type="button"
                            className="workshop-goal-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => {
                              setExpandedGoalId(isExpanded ? '' : goal.id)
                              setReplyTo(null)
                              setTaskDraft((draft) => ({ ...draft, stage: goal.stage }))
                            }}
                          >
                            <span>{isExpanded ? '▾' : '▸'}</span>
                            <strong>{goal.title}</strong>
                          </button>
                          <p>{goal.reason}</p>
                          <footer>
                            <span>종착 {stageLabel(goal.terminalStage)}</span>
                            <button
                              type="button"
                              onClick={() => setGateGoal(goal)}
                              disabled={busy || goal.status !== 'active'}
                            >
                              {goal.stage === goal.terminalStage ? '종착 승인' : '다음 열'}
                            </button>
                          </footer>
                        </article>
                      )}
                      {stageTasks.map((task) => (
                        <article className="workshop-task-chip" key={task.id}>
                          <span>{task.spawnedFromTaskId ? '↳' : '•'}</span>
                          <div>
                            <strong>{task.title}</strong>
                            <small>
                              {ASSIGNEE_LABELS[task.assigneeKind] ?? task.assigneeKind}
                              {task.assigneeLabel ? ` · ${task.assigneeLabel}` : ''}
                            </small>
                          </div>
                        </article>
                      ))}
                    </div>
                  )
                })}

                {isExpanded && expandedGoal && (
                  <div className="workshop-goal-detail">
                    <div className="workshop-detail-heading">
                      <div>
                        <span className="workshop-eyebrow">{stageLabel(expandedGoal.stage)}</span>
                        <h2>{expandedGoal.title}</h2>
                      </div>
                      <div className="workshop-detail-actions">
                        {['done', 'archived'].includes(expandedGoal.status) && (
                          <button type="button" onClick={toggleArchive} disabled={busy}>
                            {expandedGoal.status === 'archived' ? '보관 해제' : '보관'}
                          </button>
                        )}
                        <button type="button" onClick={copyContextPack}>컨텍스트 팩 복사</button>
                      </div>
                    </div>

                    <div className="workshop-detail-grid">
                      <section className="workshop-detail-panel">
                        <h3>{WORKSHOP_DISPLAY_NAMES.task} 트리</h3>
                        {expandedTaskForest.length
                          ? <TaskBranch tasks={expandedTaskForest} />
                          : <p className="workshop-empty">기록 없음</p>}
                        <form className="workshop-stack-form" onSubmit={submitTask}>
                          <input
                            required
                            maxLength={180}
                            placeholder={`${WORKSHOP_DISPLAY_NAMES.task} 이름`}
                            value={taskDraft.title}
                            onChange={(event) => setTaskDraft((draft) => ({ ...draft, title: event.target.value }))}
                          />
                          <div className="workshop-form-row">
                            <select
                              value={taskDraft.stage}
                              onChange={(event) => setTaskDraft((draft) => ({ ...draft, stage: event.target.value }))}
                            >
                              {WORKSHOP_STAGES.map((stage) => (
                                <option key={stage} value={stage}>{stageLabel(stage)}</option>
                              ))}
                            </select>
                            <select
                              value={taskDraft.assigneeKind}
                              onChange={(event) => setTaskDraft((draft) => ({ ...draft, assigneeKind: event.target.value }))}
                            >
                              {WORKSHOP_ASSIGNEE_KINDS.map((kind) => (
                                <option key={kind} value={kind}>{ASSIGNEE_LABELS[kind] ?? kind}</option>
                              ))}
                            </select>
                          </div>
                          <input
                            maxLength={120}
                            placeholder="담당 이름"
                            value={taskDraft.assigneeLabel}
                            onChange={(event) => setTaskDraft((draft) => ({ ...draft, assigneeLabel: event.target.value }))}
                          />
                          <div className="workshop-form-row">
                            <select
                              value={taskDraft.parentTaskId}
                              onChange={(event) => setTaskDraft((draft) => ({ ...draft, parentTaskId: event.target.value }))}
                            >
                              <option value="">상위 없음</option>
                              {expandedTasks.map((task) => (
                                <option key={task.id} value={task.id}>{task.title}</option>
                              ))}
                            </select>
                            <select
                              value={taskDraft.spawnedFromTaskId}
                              onChange={(event) => setTaskDraft((draft) => ({ ...draft, spawnedFromTaskId: event.target.value }))}
                            >
                              <option value="">파생 원점 없음</option>
                              {expandedTasks.map((task) => (
                                <option key={task.id} value={task.id}>{task.title}</option>
                              ))}
                            </select>
                          </div>
                          <button type="submit" disabled={busy}>+ {WORKSHOP_DISPLAY_NAMES.task}</button>
                        </form>
                      </section>

                      <section className="workshop-detail-panel">
                        <h3>{WORKSHOP_DISPLAY_NAMES.thread}</h3>
                        <div className="workshop-message-list">
                          {expandedThreadGroups.length
                            ? expandedThreadGroups.map(({ thread, task, messages }) => (
                                <section
                                  className={`workshop-thread-group${thread.taskId ? ' is-task' : ' is-goal'}`}
                                  key={thread.id}
                                >
                                  <header className="workshop-thread-group-header">
                                    <strong>
                                      {thread.taskId
                                        ? `${WORKSHOP_DISPLAY_NAMES.task} · ${task?.title || '삭제된 작업'}`
                                        : `${WORKSHOP_DISPLAY_NAMES.goal} 전체`}
                                    </strong>
                                    {thread.title && <span>{thread.title}</span>}
                                  </header>
                                  {messages.length
                                    ? <MessageBranch messages={messages} onReply={setReplyTo} />
                                    : <p className="workshop-empty">기록 없음</p>}
                                </section>
                              ))
                            : <p className="workshop-empty">기록 없음</p>}
                        </div>
                        <form className="workshop-stack-form" onSubmit={submitMessage}>
                          {replyTo && (
                            <button
                              className="workshop-reply-target"
                              type="button"
                              onClick={() => setReplyTo(null)}
                            >
                              ↳ {replyTo.authorLabel || '사용자'}에게 답장 ×
                            </button>
                          )}
                          <textarea
                            required
                            maxLength={8000}
                            rows={4}
                            placeholder="결정, 질문, 결과 보고를 남깁니다."
                            value={messageBody}
                            onChange={(event) => setMessageBody(event.target.value)}
                          />
                          <button type="submit" disabled={busy}>기록</button>
                        </form>
                      </section>

                      <section className="workshop-detail-panel">
                        <h3>{WORKSHOP_DISPLAY_NAMES.artifact}</h3>
                        <div className="workshop-artifact-list">
                          {sortedByCreated(expandedArtifacts).map((artifact) => (
                            <article key={artifact.id}>
                              <header>
                                <strong>{artifact.title}</strong>
                                <span>{artifact.kind}</span>
                              </header>
                              {artifact.body && <p>{artifact.body}</p>}
                              {externalHref(artifact.externalRef)
                                ? (
                                    <a
                                      href={externalHref(artifact.externalRef)}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      외부 참조
                                    </a>
                                  )
                                : artifact.externalRef
                                  ? <code>{artifact.externalRef}</code>
                                  : null}
                            </article>
                          ))}
                          {expandedArtifacts.length === 0 && <p className="workshop-empty">기록 없음</p>}
                        </div>
                        <form className="workshop-stack-form" onSubmit={submitArtifact}>
                          <div className="workshop-form-row">
                            <input
                              required
                              maxLength={80}
                              placeholder="형식"
                              value={artifactDraft.kind}
                              onChange={(event) => setArtifactDraft((draft) => ({ ...draft, kind: event.target.value }))}
                            />
                            <select
                              value={artifactDraft.taskId}
                              onChange={(event) => setArtifactDraft((draft) => ({ ...draft, taskId: event.target.value }))}
                            >
                              <option value="">{WORKSHOP_DISPLAY_NAMES.goal} 전체</option>
                              {expandedTasks.map((task) => (
                                <option key={task.id} value={task.id}>{task.title}</option>
                              ))}
                            </select>
                          </div>
                          <input
                            required
                            maxLength={180}
                            placeholder="제목"
                            value={artifactDraft.title}
                            onChange={(event) => setArtifactDraft((draft) => ({ ...draft, title: event.target.value }))}
                          />
                          <textarea
                            maxLength={8000}
                            rows={3}
                            placeholder="본문"
                            value={artifactDraft.body}
                            onChange={(event) => setArtifactDraft((draft) => ({ ...draft, body: event.target.value }))}
                          />
                          <input
                            maxLength={1000}
                            placeholder="경로·커밋 SHA·URL (비밀값 금지)"
                            value={artifactDraft.externalRef}
                            onChange={(event) => setArtifactDraft((draft) => ({ ...draft, externalRef: event.target.value }))}
                          />
                          <button type="submit" disabled={busy}>+ {WORKSHOP_DISPLAY_NAMES.artifact}</button>
                        </form>
                      </section>

                      <section className="workshop-detail-panel">
                        <h3>{WORKSHOP_DISPLAY_NAMES.gate} 이력</h3>
                        <ol className="workshop-gate-history">
                          {sortedByCreated(expandedGateEvents).map((gateEvent) => (
                            <li key={gateEvent.id}>
                              <span className={gateEvent.forced ? 'is-forced' : 'is-approved'}>
                                {gateEvent.forced ? '강행' : '승인'}
                              </span>
                              <strong>
                                {stageLabel(gateEvent.fromStage)} → {stageLabel(gateEvent.toStage)}
                              </strong>
                              <time dateTime={gateEvent.createdAt}>{formatTime(gateEvent.createdAt)}</time>
                            </li>
                          ))}
                        </ol>
                        {expandedGateEvents.length === 0 && <p className="workshop-empty">기록 없음</p>}
                      </section>
                    </div>
                  </div>
                )}
              </section>
            )
        })}
      </main>

      {gateGoal && (
        <GateDialog
          goal={gateGoal}
          artifacts={board.artifacts.filter((artifact) => artifact.goalId === gateGoal.id)}
          contract={contractForStage(stageContracts, gateGoal.stage)}
          onCancel={() => setGateGoal(null)}
          onConfirm={confirmGate}
          busy={busy}
        />
      )}
    </section>
  )
}
