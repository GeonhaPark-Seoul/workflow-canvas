import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SOURCE_TWIN_PERSPECTIVES,
  sourceTwinCodeUrl,
  sourceTwinEntities,
  sourceTwinEntityMap,
} from '../../shared/sourceTwin.js'
import {
  groupSourceTwinEntitiesByArea,
  groupSourceTwinEntitiesBySubsystem,
  sourceTwinAreaDefinition,
  sourceTwinAreaId,
  sourceTwinSubsystemDefinition,
  sourceTwinSubsystemId,
} from '../../shared/sourceTwinSemantics.js'
import {
  compareLocalAndDeployedManifests,
  localConnectorConnectionState,
  localConnectorShellCommand,
  localGitSyncDecision,
} from '../../shared/localConnector.js'
import {
  applySourceTwinHistoryCapture,
  compareSourceTwinHistory,
  loadSourceTwinCurrent,
  loadSourceTwinHistory,
  previewSourceTwinHistoryCapture,
} from '../lib/sourceTwinApi.js'
import {
  applyLocalGitSync,
  createLocalConnector,
  loadLocalConnectors,
  previewLocalGitSync,
  revokeLocalConnector,
} from '../lib/localConnectorApi.js'

const MIN_PANE_WIDTH = 380
const MIN_CANVAS_WIDTH = 320
const SPLITTER_WIDTH = 6
const KIND_LABELS = {
  file: '파일', function: '함수', dependency: '의존성', 'api-route': 'API',
  'db-table': '테이블', 'db-function': 'DB 함수', 'rls-policy': 'RLS',
  'environment-variable': '환경변수', deployment: '배포', 'npm-script': '명령',
}
const LAYER_LABELS = {
  frontend: '사용자 화면', api: '웹 API', mcp: 'AI 연결', shared: '공통 규칙',
  database: '데이터베이스', test: '검증', deployment: '배포', documentation: '문서',
  security: '보안', code: '외부 의존',
}
const SECURITY_SIGNAL_LABELS = {
  'dynamic-code-eval': '문자열을 코드로 실행하는 지점',
  'dynamic-function-constructor': '실행 중 함수를 만드는 지점',
  'raw-inner-html': 'HTML을 직접 넣는 지점',
  'dangerously-set-inner-html': '검증된 HTML만 넣어야 하는 지점',
  'row-level-security': '사용자별 DB 접근 제한 사용',
  'security-definer-function': 'DB 함수 소유자 권한으로 실행',
  'service-role-grant': '서버 관리자 권한 참조',
}
const OPERATION_SECTION_LABELS = {
  code: '코드 구조', database: 'DB 선언', deployment: '배포 상태',
  operations: '운영 집계', runtime: '런타임 증거', security: '보안 선언',
}
const OPERATION_RESOURCE_LABELS = {
  source_twin_snapshots: '통합 상태 스냅샷',
  system_operation_audit: '조작 감사 기록',
}
const OPERATION_EXCLUSION_LABELS = {
  'source-content': '소스 코드 본문',
  'canvas-body': '사용자 캔버스 본문',
  'user-email': '사용자 이메일',
  'credential-values': '키·토큰 실제 값',
}
const LOCAL_SYNC_ACTION_LABELS = {
  push: 'GitHub로 push',
  pull_ff_only: '로컬로 fast-forward 반영',
  noop: '이미 동기화됨',
  blocked: '자동 동기화 차단',
}
const LOCAL_OPERATION_STATUS_LABELS = {
  queued: '실행 대기', running: '실행 중', succeeded: '완료', failed: '실패',
}
const LOCAL_CONNECTOR_STATE_LABELS = {
  online: '연결됨', waiting: '연결 전', offline: '오프라인',
}

function localConnectorShortId(connector) {
  return String(connector?.id ?? '').slice(0, 8) || '미확인'
}

function localConnectorLastSeenLabel(connector, now = Date.now()) {
  const seenAt = Date.parse(connector?.lastSeenAt)
  if (!Number.isFinite(seenAt)) return '로컬 명령 실행 전'
  const elapsed = Math.max(0, now - seenAt)
  if (elapsed < 60_000) return '방금 응답'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전 응답`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}시간 전 응답`
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}일 전 응답`
  return `${new Date(seenAt).toLocaleDateString()} 응답`
}

function localConnectorOptionLabel(connector) {
  const state = localConnectorConnectionState(connector)
  const name = connector.repositoryLabel || connector.label || '로컬 연결'
  return `${name} · ${LOCAL_CONNECTOR_STATE_LABELS[state]} · ${localConnectorShortId(connector)}`
}

function IconButton({ title, onClick, disabled = false, children }) {
  return (
    <button type="button" className="twin-review-icon-button" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function EntityDetail({ manifest, entity, commitSha, onClose }) {
  if (!entity) return null
  const codeUrl = sourceTwinCodeUrl(manifest, entity, commitSha)
  const area = sourceTwinAreaDefinition(sourceTwinAreaId(entity), manifest)
  const subsystem = sourceTwinSubsystemDefinition(sourceTwinSubsystemId(entity), manifest)
  const details = entity.details ?? {}
  const hasTechnicalFacts = !!entity.technicalSummary
    || (details.apiRoutes?.length ?? 0) > 0
    || (details.dbTables?.length ?? 0) > 0
    || (details.environmentVariables?.length ?? 0) > 0
    || (details.securitySignals?.length ?? 0) > 0
  return (
    <section className="source-twin-detail" aria-label="선택한 코드 실체">
      <div className="source-twin-detail-heading">
        <div>
          <strong>{entity.label}</strong>
          <span>{area.label} › {subsystem.label} · {KIND_LABELS[entity.kind] ?? entity.kind}</span>
        </div>
        <IconButton title="선택 해제" onClick={onClose}>✕</IconButton>
      </div>
      <p className="source-twin-role-summary">{entity.summary}</p>
      {entity.userImpact && (
        <div className="source-twin-user-impact">
          <strong>사용자에게 미치는 영향</strong>
          <p>{entity.userImpact}</p>
        </div>
      )}
      {entity.path && <code>{entity.path}{entity.lineStart ? `:${entity.lineStart}` : ''}</code>}
      {hasTechnicalFacts && (
        <details className="source-twin-technical-details">
          <summary>개발 정보 보기</summary>
          {entity.technicalSummary && <p>{entity.technicalSummary}</p>}
          <div className="source-twin-detail-facts">
            {(details.apiRoutes ?? []).map((value) => <span key={`api:${value}`}>{value}</span>)}
            {(details.dbTables ?? []).map((value) => <span key={`db:${value}`}>DB {value}</span>)}
            {(details.environmentVariables ?? []).map((value) => <span key={`env:${value}`}>{value}</span>)}
            {(details.securitySignals ?? []).map((value) => <span className="is-security" key={`security:${value}`}>{SECURITY_SIGNAL_LABELS[value] ?? value}</span>)}
          </div>
        </details>
      )}
      {codeUrl && <a href={codeUrl} target="_blank" rel="noreferrer">GitHub에서 실제 코드 열기 ↗</a>}
    </section>
  )
}

function EntityRow({ entity, children, expanded, selectedId, onToggle, onSelect }) {
  const hasChildren = children.length > 0
  return (
    <div className="source-twin-tree-block">
      <button type="button" className={`source-twin-entity-row${selectedId === entity.id ? ' is-selected' : ''}`} onClick={() => onSelect(entity)}>
        <span
          className="source-twin-expand"
          onClick={(event) => { event.stopPropagation(); if (hasChildren) onToggle(entity.id) }}
          aria-hidden="true"
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </span>
        <span className="source-twin-entity-main">
          <strong>{entity.label}</strong>
          <small>{entity.summary}</small>
        </span>
        <span className="source-twin-kind">{KIND_LABELS[entity.kind] ?? entity.kind}</span>
      </button>
      {expanded && children.map((child) => (
        <button type="button" className={`source-twin-function-row${selectedId === child.id ? ' is-selected' : ''}`} key={child.id} onClick={() => onSelect(child)}>
          <span>ƒ</span>
          <span><strong>{child.label}</strong><small>{child.summary}</small></span>
          <code>L{child.lineStart}</code>
        </button>
      ))}
    </div>
  )
}

function StructureView({ current, perspective, setPerspective, query, setQuery, selectedId, setSelectedId }) {
  const manifest = current.manifest
  const [expanded, setExpanded] = useState(() => new Set())
  const [expandedSubsystems, setExpandedSubsystems] = useState(() => new Set())
  const entityMap = useMemo(() => sourceTwinEntityMap(manifest), [manifest])
  const filtered = useMemo(
    () => sourceTwinEntities(manifest, { perspective, query, limit: 700 }),
    [manifest, perspective, query],
  )
  const filteredIds = useMemo(() => new Set(filtered.map((entity) => entity.id)), [filtered])
  const childrenByParent = useMemo(() => {
    const result = new Map()
    for (const entity of manifest.entities ?? []) {
      if (!entity.parentId || entity.kind !== 'function') continue
      const list = result.get(entity.parentId) ?? []
      list.push(entity)
      result.set(entity.parentId, list)
    }
    for (const list of result.values()) list.sort((left, right) => left.lineStart - right.lineStart)
    return result
  }, [manifest])
  const roots = useMemo(() => {
    const result = []
    const includedParents = new Set(filtered.filter((entity) => entity.parentId).map((entity) => entity.parentId))
    for (const entity of filtered) {
      if (!entity.parentId || entity.kind !== 'function') result.push(entity)
    }
    for (const parentId of includedParents) {
      if (!result.some((entity) => entity.id === parentId) && entityMap.has(parentId)) result.push(entityMap.get(parentId))
    }
    return result.sort((left, right) => `${left.layer}:${left.path ?? ''}:${left.label}`.localeCompare(`${right.layer}:${right.path ?? ''}:${right.label}`))
  }, [entityMap, filtered])
  const areaGroups = useMemo(() => groupSourceTwinEntitiesByArea(manifest, roots), [manifest, roots])
  const hierarchy = useMemo(() => areaGroups.map((area) => ({
    ...area,
    subsystems: groupSourceTwinEntitiesBySubsystem(manifest, area.entities),
  })), [areaGroups, manifest])
  const selected = entityMap.get(selectedId)
  const toggle = (id) => setExpanded((currentSet) => {
    const next = new Set(currentSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleSubsystem = (id) => setExpandedSubsystems((currentSet) => {
    const next = new Set(currentSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <>
      <div className="source-twin-perspectives" role="tablist" aria-label="코드 트리 관점">
        {Object.entries(SOURCE_TWIN_PERSPECTIVES).map(([value, label]) => (
          <button type="button" key={value} className={perspective === value ? 'is-active' : ''} onClick={() => setPerspective(value)}>{label}</button>
        ))}
      </div>
      <div className="source-twin-search">
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일, 함수, DB, 환경변수 검색" aria-label="소스 트윈 검색" />
      </div>
      <EntityDetail manifest={manifest} entity={selected} commitSha={current.deployment?.commitSha} onClose={() => setSelectedId('')} />
      <div className="source-twin-tree">
        {roots.length === 0 ? <div className="twin-review-empty">일치하는 코드 실체 없음</div> : hierarchy.map((area) => (
          <section className="source-twin-area-section" key={area.id}>
            <header className="source-twin-area-heading">
              <div>
                <strong>{area.label}</strong>
                <span>{area.description}</span>
              </div>
              <em>{area.entities.length}</em>
            </header>
            {area.subsystems.map((subsystem) => {
              const subsystemExpanded = expandedSubsystems.has(subsystem.id) || !!query
              return (
                <section className="source-twin-subsystem-section" key={subsystem.id}>
                  <button type="button" className="source-twin-subsystem-heading" onClick={() => toggleSubsystem(subsystem.id)} aria-expanded={subsystemExpanded}>
                    <span className="source-twin-subsystem-expand" aria-hidden="true">{subsystemExpanded ? '▾' : '▸'}</span>
                    <span>
                      <strong>{subsystem.label}</strong>
                      <small>{subsystem.description}</small>
                    </span>
                    <em>{subsystem.entities.length}</em>
                  </button>
                  {subsystemExpanded && subsystem.entities.map((entity) => {
                    const children = (childrenByParent.get(entity.id) ?? []).filter((child) => filteredIds.has(child.id))
                    return <EntityRow key={entity.id} entity={entity} children={children} expanded={expanded.has(entity.id) || !!query} selectedId={selectedId} onToggle={toggle} onSelect={(value) => setSelectedId(value.id)} />
                  })}
                </section>
              )
            })}
          </section>
        ))}
      </div>
    </>
  )
}

function ChangeEntityList({ title, ids, entityMap, manifest, commitSha }) {
  if (!ids?.length) return null
  return (
    <section className="source-twin-change-section">
      <h3>{title}<span>{ids.length}</span></h3>
      {ids.slice(0, 100).map((id) => {
        const item = entityMap.get(id)
        const codeUrl = sourceTwinCodeUrl(manifest, item, commitSha)
        return (
          <div key={id}>
            {codeUrl
              ? <a href={codeUrl} target="_blank" rel="noreferrer" title="GitHub에서 실제 코드 열기">{item?.label ?? id}</a>
              : <strong>{item?.label ?? id}</strong>}
            <code>{item?.path ?? ''}</code>
          </div>
        )
      })}
      {ids.length > 100 && <p>나머지 {ids.length - 100}개는 검색에서 확인할 수 있습니다.</p>}
    </section>
  )
}

function ChangesView({ current }) {
  const manifest = current.manifest
  const changes = manifest.changeSet
  const entityMap = sourceTwinEntityMap(manifest)
  const pendingEvents = current.events?.events ?? []
  const repositoryUrl = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/i.test(manifest.source?.repositoryUrl ?? '')
    ? manifest.source.repositoryUrl
    : ''
  return (
    <div className="source-twin-change-list">
      {repositoryUrl && <a className="source-twin-repository-link" href={repositoryUrl} target="_blank" rel="noreferrer">GitHub 저장소에서 전체 코드 열기 ↗</a>}
      {changes.initialBaseline ? (
        <div className="source-twin-baseline">첫 소스 기준선입니다. 다음 커밋부터 변경분만 표시됩니다.</div>
      ) : changes.summary.added + changes.summary.changed + changes.summary.removed === 0 ? (
        <div className="twin-review-empty">직전 manifest 이후 소스 변경 없음</div>
      ) : (
        <>
          <ChangeEntityList title="추가" ids={changes.added} entityMap={entityMap} manifest={manifest} commitSha={current.deployment?.commitSha} />
          <ChangeEntityList title="변경" ids={changes.changed} entityMap={entityMap} manifest={manifest} commitSha={current.deployment?.commitSha} />
          <ChangeEntityList title="삭제" ids={changes.removed} entityMap={entityMap} manifest={manifest} commitSha={current.deployment?.commitSha} />
        </>
      )}
      <section className="source-twin-event-section">
        <h3>GitHub push 이벤트</h3>
        {!current.webhookConfigured && <p>Webhook 미연결 · 배포된 manifest 비교만 사용 중</p>}
        {pendingEvents.length === 0 && current.webhookConfigured && <p>수신된 push 없음</p>}
        {pendingEvents.map((event) => (
          <article key={event.delivery_id}>
            <div>
              <strong>{event.ref?.replace('refs/heads/', '') || 'push'}</strong>
              <code>{event.after_sha?.slice(0, 8)}</code>
              <em className={event.after_sha && event.after_sha === current.deployment?.commitSha ? 'is-deployed' : ''}>
                {event.after_sha && event.after_sha === current.deployment?.commitSha ? '현재 배포 반영' : '배포 전 변경'}
              </em>
            </div>
            <span>{new Date(event.received_at).toLocaleString()}</span>
            <p>{(event.changed_paths ?? []).slice(0, 8).join(' · ') || '변경 경로 없음'}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

function LocalSyncPlanPreview({ preview, busy, onApprove, onCancel }) {
  const plan = preview?.plan
  if (!plan) return null
  const action = plan.scope?.action
  return (
    <section className="local-sync-plan" aria-label="Git 동기화 실행 계획">
      <header>
        <div><strong>실행 전 미리보기</strong><span>아직 Git이나 로컬 파일을 바꾸지 않았습니다</span></div>
        <code title={plan.id}>{plan.id.slice(0, 15)}…</code>
      </header>
      <div className="local-sync-plan-direction">
        <strong>{LOCAL_SYNC_ACTION_LABELS[action] ?? action}</strong>
        <span>{plan.scope?.reason}</span>
      </div>
      <dl>
        <div><dt>브랜치</dt><dd>{plan.scope?.branch}</dd></div>
        <div><dt>로컬</dt><dd>{plan.scope?.headSha?.slice(0, 10)}</dd></div>
        <div><dt>GitHub</dt><dd>{plan.scope?.upstreamSha?.slice(0, 10)}</dd></div>
        <div><dt>차이</dt><dd>앞섬 {plan.scope?.ahead ?? 0} · 뒤처짐 {plan.scope?.behind ?? 0}</dd></div>
      </dl>
      <p>{plan.recovery?.note}</p>
      <div className="source-twin-operation-buttons">
        <button type="button" className="is-secondary" onClick={onCancel} disabled={busy}>취소</button>
        <button type="button" onClick={onApprove} disabled={busy || action === 'noop'}>
          {busy ? '요청 중…' : action === 'noop' ? '변경 없음' : '승인하고 동기화 요청'}
        </button>
      </div>
    </section>
  )
}

function LocalRepositoryView({
  current,
  localState,
  selectedConnectorId,
  onSelectConnector,
  setup,
  repositoryPath,
  onRepositoryPathChange,
  allowGitSync,
  onAllowGitSyncChange,
  busy,
  error,
  status,
  syncPlan,
  onCreate,
  onRevoke,
  onPreviewSync,
  onApplySync,
  onCancelSync,
  structureProps,
}) {
  const connectors = localState?.connectors ?? []
  const connector = connectors.find((item) => item.id === selectedConnectorId) ?? connectors[0] ?? null
  const connectionState = connector ? localConnectorConnectionState(connector) : 'offline'
  const online = connectionState === 'online'
  const connectorName = connector?.repositoryLabel || connector?.label || '실제 로컬 프로젝트 연결'
  const manifest = online && connector.manifest ? connector.manifest : current.manifest
  const localCurrent = {
    ...current,
    manifest,
    deployment: {
      ...current.deployment,
      commitSha: online ? connector.git?.headSha : current.deployment?.commitSha,
    },
  }
  const difference = online
    ? compareLocalAndDeployedManifests(current.manifest, connector.manifest)
    : null
  const decision = connector ? localGitSyncDecision(connector.git) : null
  const operations = (localState?.operations ?? []).filter((item) => item.connectorId === connector?.id).slice(0, 5)
  const selectedSetup = setup?.connector?.id === connector?.id ? setup : null
  const setupCommand = selectedSetup ? localConnectorShellCommand({
    token: selectedSetup.token,
    serverUrl: typeof window === 'undefined' ? '' : window.location.origin,
    repositoryPath,
    allowGitSync,
  }) : ''

  return (
    <>
      <section className="local-connector-control" aria-label="로컬 프로젝트 연결">
        <header>
          <div>
            <strong>{connectorName}</strong>
            <span className={`is-${connector ? connectionState : 'offline'}`}>{connector ? LOCAL_CONNECTOR_STATE_LABELS[connectionState] : '미연결'}</span>
          </div>
          <div className="local-connector-header-actions">
            {connectors.length > 1 && (
              <select value={connector?.id ?? ''} onChange={(event) => onSelectConnector(event.target.value)} aria-label="로컬 커넥터 선택">
                {connectors.map((item) => <option key={item.id} value={item.id}>{localConnectorOptionLabel(item)}</option>)}
              </select>
            )}
            <button type="button" onClick={onCreate} disabled={busy} title="다른 Mac 또는 프로젝트 연결">＋</button>
            {connector && <button type="button" onClick={() => onRevoke(connector.id)} disabled={busy} title={`선택한 연결 기록 해제 · ${localConnectorShortId(connector)}`}>×</button>}
          </div>
        </header>

        {connector && (
          <div className="local-connector-registration-meta">
            <span>연결 ID <strong>{localConnectorShortId(connector)}</strong></span>
            <span>{localConnectorLastSeenLabel(connector)}</span>
            {connectors.length > 1 && <span>등록 {connectors.length}개</span>}
          </div>
        )}

        {selectedSetup && (
          <div className="local-connector-setup">
            <strong>이 토큰은 지금 한 번만 표시됩니다</strong>
            <label className="local-connector-path-field">
              <span>프로젝트 폴더</span>
              <input
                type="text"
                value={repositoryPath}
                onChange={(event) => onRepositoryPathChange(event.target.value)}
                placeholder="~/workflow-canvas"
                spellCheck="false"
                autoCapitalize="none"
              />
            </label>
            <label className="local-connector-git-permission">
              <input
                type="checkbox"
                checked={allowGitSync}
                onChange={(event) => onAllowGitSyncChange(event.target.checked)}
              />
              <span>
                <strong>캔버스에서 Git 동기화 허용</strong>
                <small>꺼두면 구조 읽기만 합니다. 켜도 push·pull마다 터미널에서 다시 확인합니다.</small>
              </span>
            </label>
            <p>복사한 명령이 먼저 이 폴더로 이동합니다. 표시된 서버·폴더·권한이 맞을 때만 실행하세요.</p>
            <code>{setupCommand || '프로젝트 폴더와 서버 주소를 확인하세요.'}</code>
            <button type="button" disabled={!setupCommand} onClick={() => navigator.clipboard.writeText(setupCommand)}>명령 복사</button>
          </div>
        )}

        {!connector && !selectedSetup && (
          <div className="local-connector-empty">
            <p>현재 화면은 배포 빌드의 코드 구조를 임시로 보여줍니다. 실제 Mac 프로젝트를 연결하면 로컬 파일 구조와 Git 상태가 자동 갱신됩니다.</p>
            <button type="button" onClick={onCreate} disabled={busy}>{busy ? '만드는 중…' : '로컬 커넥터 만들기'}</button>
          </div>
        )}

        {connector && connector.git && (
          <>
            <div className="local-git-state">
              <span>기준 <strong>{online ? '현재 응답' : '마지막 응답'}</strong></span>
              <span>브랜치 <strong>{connector.git?.branch || '미확인'}</strong></span>
              <span>로컬 변경 <strong>{connector.git?.dirty ?? 0}</strong></span>
              <span>권한 <strong>{connector.git?.syncEnabled ? '읽기 + 승인 동기화' : '읽기 전용'}</strong></span>
              <span>앞섬 <strong>{connector.git?.ahead ?? 0}</strong></span>
              <span>뒤처짐 <strong>{connector.git?.behind ?? 0}</strong></span>
            </div>
            <div className={`local-sync-decision is-${decision?.action ?? 'blocked'}`}>
              <div><strong>{LOCAL_SYNC_ACTION_LABELS[decision?.action] ?? '상태 확인 필요'}</strong><span>{decision?.reason}</span></div>
              <button
                type="button"
                onClick={() => onPreviewSync(connector.id)}
                disabled={busy || !online || decision?.action === 'blocked' || !!syncPlan}
              >
                {busy && !syncPlan ? '확인 중…' : '동기화 계획 보기'}
              </button>
            </div>
            <LocalSyncPlanPreview preview={syncPlan} busy={busy} onApprove={() => onApplySync(connector.id)} onCancel={onCancelSync} />
            {operations.length > 0 && (
              <div className="local-sync-operation-list">
                {operations.map((operation) => (
                  <div key={operation.operationId}>
                    <span>{LOCAL_SYNC_ACTION_LABELS[operation.action] ?? operation.action}</span>
                    <strong className={`is-${operation.status}`}>{LOCAL_OPERATION_STATUS_LABELS[operation.status] ?? operation.status}</strong>
                    <time>{new Date(operation.completedAt || operation.requestedAt).toLocaleString()}</time>
                    {operation.result?.summary && <p>{operation.result.summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {connector && !connector.git && !selectedSetup && (
          <div className="local-connector-pending">
            <strong>아직 이 연결의 로컬 명령이 실행되지 않았습니다.</strong>
            <span>토큰은 다시 표시할 수 없습니다. 사용하지 않을 기록이면 ×로 해제한 뒤 ＋로 새 연결을 만드세요.</span>
          </div>
        )}

        {difference && (
          <div className={`local-twin-difference${difference.inSync ? ' is-synced' : ''}`}>
            <div><strong>배포본과 자동 대조</strong><span>{difference.inSync ? '같은 코드 구조' : '승인 전 로컬 변경 감지'}</span></div>
            <div>
              <span>추가 <b>{difference.summary.added}</b></span>
              <span>수정 <b>{difference.summary.changed}</b></span>
              <span>삭제 <b>{difference.summary.removed}</b></span>
            </div>
          </div>
        )}
        {status && <div className="source-twin-operation-status">{status}</div>}
        {error && <div className="source-twin-error">{error}</div>}
      </section>

      <div className="local-source-mode-label">
        <strong>{online ? '실제 로컬 코드 구조' : '배포 소스 구조 · 대체 표시'}</strong>
        <span>{online ? '커넥터가 10초 간격으로 자동 갱신' : 'Mac 로컬 파일을 읽은 결과가 아님'}</span>
      </div>
      <StructureView current={localCurrent} {...structureProps} />
    </>
  )
}

function OperationPlanPreview({ preview, busy, onApprove, onCancel }) {
  const plan = preview?.plan
  if (!plan) return null
  return (
    <section className="source-twin-operation-plan" aria-label="상태 기록 조작 계획">
      <header>
        <div><strong>실행 전 미리보기</strong><span>아직 DB에 기록하지 않았습니다</span></div>
        <code title={plan.id}>{plan.id.slice(0, 15)}…</code>
      </header>
      <div className="source-twin-operation-scope">
        <strong>{plan.scope?.label}</strong>
        <div>{(plan.scope?.sections ?? []).map((section) => <span key={section}>{OPERATION_SECTION_LABELS[section] ?? section}</span>)}</div>
      </div>
      <div className="source-twin-operation-writes">
        <strong>승인 시 새로 생성</strong>
        {(plan.writeSet ?? []).map((write) => (
          <span key={write.resource}>{OPERATION_RESOURCE_LABELS[write.resource] ?? write.resource} · 최대 {write.maximumRows}건</span>
        ))}
      </div>
      <div className="source-twin-operation-excludes">
        <strong>수집하지 않음</strong>
        <p>{(plan.excludes ?? []).map((item) => OPERATION_EXCLUSION_LABELS[item] ?? item).join(' · ')}</p>
      </div>
      <p className="source-twin-operation-expiry">승인 가능 기한 {new Date(plan.expiresAt).toLocaleString()}</p>
      <p className="source-twin-operation-recovery">{plan.recovery?.note}</p>
      <div className="source-twin-operation-buttons">
        <button type="button" className="is-secondary" onClick={onCancel} disabled={busy}>취소</button>
        <button type="button" onClick={onApprove} disabled={busy}>{busy ? '실행 중…' : '승인하고 기록'}</button>
      </div>
    </section>
  )
}

function HistoryView({
  history,
  historyError,
  captureBusy,
  capturePlan,
  captureStatus,
  onPreviewCapture,
  onApplyCapture,
  onCancelCapture,
  comparison,
  compareBusy,
  onCompare,
}) {
  const snapshots = history?.snapshots ?? []
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  useEffect(() => {
    if (snapshots.length < 2) return
    setFromId((value) => value || snapshots[1].id)
    setToId((value) => value || snapshots[0].id)
  }, [snapshots])
  return (
    <div className="source-twin-history">
      <p className="source-twin-evidence-scope">
        내부 변경 추적 기록입니다. 상태 기록은 아래 이력·감사 행만 새로 만들며 앱 코드, 운영 DB 구조, 배포, 사용자 본문은 바꾸지 않습니다. 외부 공증 기록은 아닙니다.
      </p>
      <div className="source-twin-history-actions">
        <button type="button" onClick={onPreviewCapture} disabled={captureBusy || !!capturePlan}>{captureBusy && !capturePlan ? '계획 생성 중…' : '기록 계획 보기'}</button>
        <span>범위 확인과 승인 뒤에만 기록</span>
      </div>
      <OperationPlanPreview preview={capturePlan} busy={captureBusy} onApprove={onApplyCapture} onCancel={onCancelCapture} />
      {captureStatus && <div className="source-twin-operation-status">{captureStatus}</div>}
      {historyError && <div className="source-twin-error">{historyError}</div>}
      {snapshots.length === 0 ? <div className="twin-review-empty">기록된 상태 없음</div> : (
        <>
          <div className="source-twin-compare-controls">
            <select value={fromId} onChange={(event) => setFromId(event.target.value)} aria-label="이전 상태">
              {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.commitSha?.slice(0, 7) || 'local'}</option>)}
            </select>
            <span>→</span>
            <select value={toId} onChange={(event) => setToId(event.target.value)} aria-label="새 상태">
              {snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{new Date(snapshot.capturedAt).toLocaleString()} · {snapshot.commitSha?.slice(0, 7) || 'local'}</option>)}
            </select>
            <button type="button" disabled={!fromId || !toId || fromId === toId || compareBusy} onClick={() => onCompare(fromId, toId)}>{compareBusy ? '비교 중…' : '비교'}</button>
          </div>
          {comparison && (
            <section className="source-twin-comparison">
              <div className="source-twin-comparison-summary">
                <span>변경 영역 <strong>{comparison.summary.changedSections}</strong></span>
                <span>추가 <strong>{comparison.summary.addedEntities}</strong></span>
                <span>수정 <strong>{comparison.summary.changedEntities}</strong></span>
                <span>삭제 <strong>{comparison.summary.removedEntities}</strong></span>
              </div>
              {[...comparison.entities.added, ...comparison.entities.changed, ...comparison.entities.removed].slice(0, 120).map((entity) => (
                <div key={`${entity.id}:${entity.fingerprint}`}><strong>{entity.label}</strong><code>{entity.path}</code></div>
              ))}
              {comparison.metrics.map((metric) => (
                <div key={`metric:${metric.key}`}><strong>{metric.key}</strong><span>{String(metric.before)} → {String(metric.after)}</span></div>
              ))}
            </section>
          )}
          <div className="source-twin-snapshot-list">
            {snapshots.map((snapshot) => (
              <div key={snapshot.id}>
                <strong>{new Date(snapshot.capturedAt).toLocaleString()}</strong>
                <span>{snapshot.reason === 'deployment' ? '배포 기준' : '승인 기록'} · {snapshot.commitSha?.slice(0, 8) || 'local'}</span>
                <code>{snapshot.manifestId}</code>
                {snapshot.operationId && <code title={snapshot.operationId}>감사 {snapshot.operationId.slice(0, 15)}…</code>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function SourceTwinPanel({
  entry,
  side = 'right',
  onSideChange,
  onClose,
  onLocalGitOperationStateChange,
}) {
  const [paneWidth, setPaneWidth] = useState(500)
  const [perspective, setPerspective] = useState('functionality')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(true)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [capturePlan, setCapturePlan] = useState(null)
  const [captureStatus, setCaptureStatus] = useState('')
  const [compareBusy, setCompareBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [localState, setLocalState] = useState(null)
  const [selectedConnectorId, setSelectedConnectorId] = useState('')
  const [localSetup, setLocalSetup] = useState(null)
  const [localRepositoryPath, setLocalRepositoryPath] = useState('~/workflow-canvas')
  const [localGitSyncEnabled, setLocalGitSyncEnabled] = useState(false)
  const [localBusy, setLocalBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [localStatus, setLocalStatus] = useState('')
  const [localSyncPlan, setLocalSyncPlan] = useState(null)
  const dragRef = useRef(null)
  const view = entry?.view ?? 'structure'

  useEffect(() => {
    setSelectedId('')
    setComparison(null)
    setCapturePlan(null)
    setCaptureStatus('')
    setLocalSyncPlan(null)
    setLocalStatus('')
  }, [view])

  const refreshHistory = useCallback(async () => {
    const next = await loadSourceTwinHistory(40)
    setHistory(next)
    if (!next.available) setHistoryError('통합 상태 이력 SQL이 아직 적용되지 않았습니다.')
    else setHistoryError('')
  }, [])

  const refreshCurrent = useCallback(async () => {
    const next = await loadSourceTwinCurrent()
    setCurrent(next)
    return next
  }, [])

  const refreshLocalConnectors = useCallback(async () => {
    const next = await loadLocalConnectors()
    setLocalState(next)
    setSelectedConnectorId((currentId) => (
      next.connectors.some((connector) => connector.id === currentId)
        ? currentId
        : next.connectors[0]?.id ?? ''
    ))
    setLocalError('')
    return next
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([refreshCurrent(), refreshHistory(), refreshLocalConnectors().catch((localLoadError) => {
      setLocalError(localLoadError.message)
      return null
    })])
      .catch((loadError) => { if (!cancelled) setError(loadError.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    const timer = setInterval(() => {
      refreshCurrent().catch(() => {})
    }, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [refreshCurrent, refreshHistory, refreshLocalConnectors])

  useEffect(() => {
    if (view !== 'structure') return undefined
    const timer = setInterval(() => {
      refreshLocalConnectors().catch((localLoadError) => setLocalError(localLoadError.message))
    }, 10_000)
    return () => clearInterval(timer)
  }, [refreshLocalConnectors, view])

  const createConnector = useCallback(async () => {
    setLocalBusy(true)
    setLocalError('')
    setLocalStatus('')
    try {
      const result = await createLocalConnector('새 로컬 연결')
      setLocalSetup(result)
      await refreshLocalConnectors()
      setSelectedConnectorId(result.connector.id)
    } catch (createError) {
      setLocalError(createError.message)
    } finally {
      setLocalBusy(false)
    }
  }, [refreshLocalConnectors])

  const revokeConnector = useCallback(async (connectorId) => {
    const target = localState?.connectors?.find((connector) => connector.id === connectorId)
    const targetName = target?.repositoryLabel || target?.label || '로컬 연결'
    if (!window.confirm(`“${targetName}” 연결 기록 (${localConnectorShortId(target)})을 해제할까요? 이 ID로 실행 중인 터미널 연결도 즉시 끊깁니다.`)) return
    setLocalBusy(true)
    setLocalError('')
    try {
      await revokeLocalConnector(connectorId)
      setLocalSetup(null)
      setLocalSyncPlan(null)
      await refreshLocalConnectors()
    } catch (revokeError) {
      setLocalError(revokeError.message)
    } finally {
      setLocalBusy(false)
    }
  }, [localState, refreshLocalConnectors])

  const previewGitSync = useCallback(async (connectorId) => {
    setLocalBusy(true)
    setLocalError('')
    setLocalStatus('')
    onLocalGitOperationStateChange?.({ status: 'planning', message: '최신 Git 상태로 동기화 계획을 확인하고 있습니다.' })
    try {
      const preview = await previewLocalGitSync(connectorId)
      setLocalSyncPlan(preview)
      onLocalGitOperationStateChange?.({
        status: preview.decision?.action === 'noop' ? 'succeeded' : 'preview',
        action: preview.decision?.action,
        message: preview.decision?.reason || '동기화 계획을 확인한 뒤 승인할 수 있습니다.',
      })
    } catch (previewError) {
      setLocalError(previewError.message)
      onLocalGitOperationStateChange?.({ status: 'failed', message: previewError.message })
    } finally {
      setLocalBusy(false)
    }
  }, [onLocalGitOperationStateChange])

  const applyGitSync = useCallback(async (connectorId) => {
    if (!localSyncPlan?.plan_token) return
    const action = localSyncPlan.plan?.scope?.action || localSyncPlan.decision?.action
    setLocalBusy(true)
    setLocalError('')
    setLocalStatus('')
    onLocalGitOperationStateChange?.({ status: 'planning', message: '승인된 동기화 요청을 확인하고 있습니다.' })
    try {
      const result = await applyLocalGitSync(
        connectorId,
        localSyncPlan.plan_token,
        localSyncPlan.plan?.confirmation,
      )
      setLocalSyncPlan(null)
      setLocalStatus(result.queued
        ? '승인된 Git 동기화를 로컬 커넥터 실행 대기열에 넣었습니다.'
        : '로컬과 GitHub가 이미 동기화되어 있습니다.')
      onLocalGitOperationStateChange?.({
        status: result.queued ? 'queued' : 'succeeded',
        action,
        operationId: result.operationId,
        message: result.queued
          ? '로컬 터미널 확인을 기다리고 있습니다.'
          : '로컬과 GitHub가 이미 동기화되어 있습니다.',
      })
      await refreshLocalConnectors()
    } catch (applyError) {
      if (['LOCAL_GIT_STATE_CHANGED', 'LOCAL_GIT_DIRECTION_CHANGED', 'OPERATION_PLAN_EXPIRED'].includes(applyError.code)) {
        setLocalSyncPlan(null)
      }
      setLocalError(applyError.message)
      onLocalGitOperationStateChange?.({ status: 'failed', message: applyError.message })
    } finally {
      setLocalBusy(false)
    }
  }, [localSyncPlan, onLocalGitOperationStateChange, refreshLocalConnectors])

  const previewCapture = useCallback(async () => {
    setCaptureBusy(true)
    setHistoryError('')
    setCaptureStatus('')
    try {
      const preview = await previewSourceTwinHistoryCapture()
      setCapturePlan(preview)
    } catch (captureError) {
      setHistoryError(captureError.message)
    } finally {
      setCaptureBusy(false)
    }
  }, [])

  const applyCapture = useCallback(async () => {
    if (!capturePlan?.plan_token) return
    setCaptureBusy(true)
    setHistoryError('')
    setCaptureStatus('')
    try {
      const result = await applySourceTwinHistoryCapture(capturePlan.plan_token)
      setCapturePlan(null)
      setCaptureStatus(`승인된 상태 기록과 감사 로그를 생성했습니다 · ${result.operation_id.slice(0, 15)}…`)
      await refreshHistory()
    } catch (captureError) {
      if (['OPERATION_PLAN_STALE', 'OPERATION_PLAN_EXPIRED', 'OPERATION_ALREADY_APPLIED'].includes(captureError.code)) {
        setCapturePlan(null)
      }
      setHistoryError(captureError.message)
    } finally {
      setCaptureBusy(false)
    }
  }, [capturePlan, refreshHistory])

  const compare = useCallback(async (from, to) => {
    setCompareBusy(true)
    setHistoryError('')
    try {
      const result = await compareSourceTwinHistory(from, to)
      setComparison(result.comparison)
    } catch (compareError) {
      setHistoryError(compareError.message)
    } finally {
      setCompareBusy(false)
    }
  }, [])

  const onSplitterDown = useCallback((event) => {
    dragRef.current = { startX: event.clientX, startWidth: paneWidth }
    event.preventDefault()
    const onMove = (moveEvent) => {
      if (!dragRef.current) return
      const delta = side === 'right' ? dragRef.current.startX - moveEvent.clientX : moveEvent.clientX - dragRef.current.startX
      const maximum = Math.max(MIN_PANE_WIDTH, window.innerWidth - MIN_CANVAS_WIDTH)
      setPaneWidth(Math.min(maximum, Math.max(MIN_PANE_WIDTH, dragRef.current.startWidth + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [paneWidth, side])

  const splitter = <div className="twin-review-splitter source-twin-splitter" title="코드 트리 창 크기 조절" onPointerDown={onSplitterDown} style={{ width: SPLITTER_WIDTH }} />
  const manifest = current?.manifest

  return (
    <aside className="twin-review-pane source-twin-pane" style={{ width: paneWidth, minWidth: MIN_PANE_WIDTH, maxWidth: `calc(100vw - ${MIN_CANVAS_WIDTH}px)`, order: side === 'left' ? 0 : 2 }} onClick={(event) => event.stopPropagation()}>
      {side === 'right' && splitter}
      <div className="twin-review-content">
        <header className="twin-review-header source-twin-header">
          <div className="twin-review-header-title"><strong>{entry?.panelTitle ?? '소스 트윈'}</strong>{manifest && <span>{manifest.summary.files}</span>}</div>
          <div className="twin-review-header-actions">
            <IconButton title="소스 트윈 새로고침" onClick={() => { setLoading(true); Promise.all([refreshCurrent(), refreshHistory()]).catch((loadError) => setError(loadError.message)).finally(() => setLoading(false)) }}>↻</IconButton>
            <IconButton title={side === 'right' ? '코드 트리 창을 왼쪽으로 이동' : '코드 트리 창을 오른쪽으로 이동'} onClick={() => onSideChange(side === 'right' ? 'left' : 'right')}>{side === 'right' ? '←' : '→'}</IconButton>
            <IconButton title="코드 트리 닫기" onClick={onClose}>✕</IconButton>
          </div>
          <div className="twin-review-source-name">{entry?.actionLabel ?? manifest?.source?.label ?? 'Workflow Canvas 소스 코드'}</div>
          {entry?.description && <p className="source-twin-context-description">{entry.description}</p>}
          <code className="twin-review-snapshot" title="소스 manifest ID">{manifest?.id ?? ''}</code>
        </header>
        {manifest && (
          <div className="twin-review-counts source-twin-counts">
            <span>함수 <strong>{manifest.summary.functions}</strong></span>
            <span>API <strong>{manifest.summary.apiRoutes}</strong></span>
            <span>DB <strong>{manifest.summary.dbTables}</strong></span>
            <span>커밋 <strong>{current.deployment?.commitSha?.slice(0, 7) || 'local'}</strong></span>
          </div>
        )}
        {loading && !current ? <div className="twin-review-empty">소스 트윈 불러오는 중…</div> : error ? <div className="source-twin-error">{error}</div> : current && (
          view === 'structure'
            ? <LocalRepositoryView
                current={current}
                localState={localState}
                selectedConnectorId={selectedConnectorId}
                onSelectConnector={(connectorId) => {
                  setSelectedConnectorId(connectorId)
                  setLocalSyncPlan(null)
                  setLocalStatus('')
                  onLocalGitOperationStateChange?.({ status: 'idle' })
                }}
                setup={localSetup}
                repositoryPath={localRepositoryPath}
                onRepositoryPathChange={setLocalRepositoryPath}
                allowGitSync={localGitSyncEnabled}
                onAllowGitSyncChange={setLocalGitSyncEnabled}
                busy={localBusy}
                error={localError}
                status={localStatus}
                syncPlan={localSyncPlan}
                onCreate={createConnector}
                onRevoke={revokeConnector}
                onPreviewSync={previewGitSync}
                onApplySync={applyGitSync}
                onCancelSync={() => {
                  setLocalSyncPlan(null)
                  setLocalError('')
                  onLocalGitOperationStateChange?.({ status: 'idle' })
                }}
                structureProps={{ perspective, setPerspective, query, setQuery, selectedId, setSelectedId }}
              />
            : view === 'github-code'
              ? <>
                  <div className="local-source-mode-label">
                    <strong>배포에 포함된 GitHub 코드</strong>
                    <span>현재 배포 커밋 기준 · 최신 원격 HEAD와 다를 수 있음</span>
                  </div>
                  <StructureView
                    current={current}
                    perspective={perspective}
                    setPerspective={setPerspective}
                    query={query}
                    setQuery={setQuery}
                    selectedId={selectedId}
                    setSelectedId={setSelectedId}
                  />
                </>
            : view === 'changes'
              ? <ChangesView current={current} />
              : <HistoryView
                  history={history}
                  historyError={historyError}
                  captureBusy={captureBusy}
                  capturePlan={capturePlan}
                  captureStatus={captureStatus}
                  onPreviewCapture={previewCapture}
                  onApplyCapture={applyCapture}
                  onCancelCapture={() => { setCapturePlan(null); setHistoryError('') }}
                  comparison={comparison}
                  compareBusy={compareBusy}
                  onCompare={compare}
                />
        )}
      </div>
      {side === 'left' && splitter}
    </aside>
  )
}
