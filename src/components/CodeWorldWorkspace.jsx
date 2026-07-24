import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  compareLocalAndDeployedManifests,
  localConnectorConnectionState,
} from '../../shared/localConnector.js'
import { createSourceCodeWorldProjection } from '../../shared/sourceCodeWorldProjection.js'
import { loadLocalConnectors } from '../lib/localConnectorApi.js'
import { loadSourceTwinCurrent } from '../lib/sourceTwinApi.js'
import CodeWorldScreen from './CodeWorldScreen.jsx'
import './CodeWorldWorkspace.css'

const SOURCE_REFRESH_MS = 30_000
const LOCAL_REFRESH_MS = 10_000
const COLUMN_WIDTH = 354
const DISTRICT_WIDTH = 320
const DISTRICT_GAP = 42
const DISTRICT_COLUMNS = 3

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function errorMessage(error, fallback) {
  return text(error?.message, fallback)
}

function isPreviewRequest() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('code-world') === '1'
}

function isAuthenticationFailure(error) {
  return error?.code === 'AUTH_REQUIRED'
    || error?.status === 401
    || /로그인이 필요|authentication required/i.test(String(error?.message ?? ''))
}

async function loadDevelopmentPreview(error) {
  if (import.meta.env?.DEV !== true || !isPreviewRequest() || !isAuthenticationFailure(error)) {
    return null
  }
  const previewModule = await import(/* @vite-ignore */ '/shared/sourceTwinManifest.js')
  if (!previewModule?.SOURCE_TWIN_MANIFEST) return null
  return {
    manifest: previewModule.SOURCE_TWIN_MANIFEST,
    deployment: {
      provider: 'local',
      environment: 'development-preview',
      commitSha: '',
      commitRef: '',
      deploymentId: '',
      region: '',
      host: '',
    },
    database: { observation: 'declared-from-source' },
    operations: { available: false, metrics: {} },
    runtime: { available: false, capabilities: {} },
    events: { available: false, events: [] },
    webhookConfigured: false,
  }
}

function connectorWithFreshState(connector) {
  const state = localConnectorConnectionState(connector)
  return {
    ...connector,
    connectionState: state === 'waiting' ? 'unknown' : state,
    online: state === 'online',
  }
}

function selectedConnector(localState) {
  const connectors = safeArray(localState?.connectors)
  return connectors.find((connector) => connector.online) ?? connectors[0] ?? null
}

function shaLabel(value) {
  return text(value) ? value.slice(0, 8) : '미관측'
}

function sourceEventRows(current) {
  const deploymentSha = text(current?.deployment?.commitSha)
  return safeArray(current?.events?.events).slice(0, 3).map((event, index) => {
    const sha = text(event?.after_sha)
    const branch = text(event?.ref).replace(/^refs\/heads\//, '')
    return {
      id: text(event?.delivery_id, `source-event:${index}`),
      label: branch ? `GitHub push · ${branch}` : 'GitHub push 관측',
      detail: [
        sha ? `커밋 ${sha.slice(0, 8)}` : '',
        safeArray(event?.changed_paths).length
          ? `변경 경로 ${event.changed_paths.length}개`
          : '변경 경로 미기록',
        sha && sha === deploymentSha ? '현재 배포 반영' : '배포 반영 미확인',
      ].filter(Boolean).join(' · '),
      status: 'observed',
      observedAt: event?.received_at ?? null,
    }
  })
}

function observationRows({
  current,
  currentObservedAt,
  currentPreview,
  currentError,
  localState,
  localObservedAt,
  localError,
  connector,
  difference,
}) {
  const manifest = current?.manifest
  const deployment = current?.deployment ?? {}
  const git = connector?.git ?? {}
  const rows = []

  if (manifest) {
    rows.push({
      id: 'observation:source-manifest',
      label: currentPreview ? '개발 미리보기 manifest' : 'Source Lens manifest 관측',
      detail: [
        text(manifest.id),
        `${safeArray(manifest.entities).length.toLocaleString()}개 실체`,
        `${safeArray(manifest.relations).length.toLocaleString()}개 관계`,
      ].filter(Boolean).join(' · '),
      status: currentPreview ? 'declared' : (currentError ? 'stale' : 'observed'),
      observedAt: currentObservedAt,
      meta: currentPreview ? '정적 개발 미리보기 · 운영 관측 아님' : undefined,
    })
  } else {
    rows.push({
      id: 'observation:source-manifest-missing',
      label: 'Source Lens manifest 미관측',
      detail: currentError || '아직 분석 결과를 받지 못했습니다.',
      status: 'unknown',
      observedAt: currentObservedAt,
    })
  }

  if (deployment.provider || deployment.environment || deployment.commitSha) {
    rows.push({
      id: 'observation:deployment',
      label: '현재 배포 문맥',
      detail: [
        text(deployment.provider, '제공자 미확인'),
        text(deployment.environment, '환경 미확인'),
        deployment.commitSha ? `커밋 ${shaLabel(deployment.commitSha)}` : '배포 커밋 미관측',
      ].join(' · '),
      status: currentPreview ? 'declared' : 'observed',
      observedAt: currentObservedAt,
    })
  }

  const repositoryUrl = text(manifest?.source?.repositoryUrl)
  if (repositoryUrl && !git.upstreamRef) {
    rows.push({
      id: 'observation:github-repository-declared',
      label: 'GitHub 원격 저장소 선언',
      detail: `${repositoryUrl} · 최신 원격 HEAD는 아직 관측되지 않았습니다.`,
      status: 'declared',
      observedAt: currentObservedAt,
    })
  }

  if (connector) {
    const connectorState = connector.connectionState ?? 'unknown'
    rows.push({
      id: `observation:local:${connector.id}`,
      label: `로컬 커넥터 · ${text(connector.repositoryLabel, text(connector.label, '이름 없음'))}`,
      detail: [
        connectorState === 'online' ? '현재 온라인' : '현재 오프라인',
        text(git.branch) ? `브랜치 ${git.branch}` : '브랜치 미관측',
        Number.isInteger(git.dirty) ? `작업 트리 변경 ${git.dirty}개` : '작업 트리 미관측',
      ].join(' · '),
      status: connectorState === 'online' ? 'observed' : 'stale',
      observedAt: connector.lastSeenAt ?? localObservedAt,
    })
  } else {
    rows.push({
      id: 'observation:local-missing',
      label: '로컬 커넥터 미관측',
      detail: localError || '등록되어 관측 가능한 로컬 커넥터가 없습니다.',
      status: 'unknown',
      observedAt: localObservedAt,
    })
  }

  if (difference) {
    rows.push({
      id: 'observation:local-deployed-difference',
      label: '로컬과 배포 manifest 비교',
      detail: difference.inSync
        ? '파일 지문 차이 없음'
        : `추가 ${difference.summary.added} · 변경 ${difference.summary.changed} · 삭제 ${difference.summary.removed}`,
      status: difference.inSync
        ? (connector?.online ? 'fresh' : 'stale')
        : (connector?.online ? 'pending' : 'stale'),
      observedAt: connector?.lastSeenAt ?? localObservedAt,
      meta: connector?.online ? '현재 로컬 관측 기준' : '마지막 로컬 관측 기준',
    })
  }

  if (git.upstreamRef || git.upstreamSha || git.headSha) {
    rows.push({
      id: 'observation:git-position',
      label: 'Git 원격 위치 관측',
      detail: [
        text(git.upstreamRef, 'upstream 미관측'),
        `로컬 ${shaLabel(git.headSha)}`,
        `원격 ${shaLabel(git.upstreamSha)}`,
        Number.isInteger(git.ahead) ? `앞섬 ${git.ahead}` : '',
        Number.isInteger(git.behind) ? `뒤처짐 ${git.behind}` : '',
      ].filter(Boolean).join(' · '),
      status: connector?.online ? 'observed' : 'stale',
      observedAt: connector?.lastSeenAt ?? localObservedAt,
    })
  }

  rows.push(...sourceEventRows(current))
  return rows.slice(0, 8)
}

function districtHeight(components) {
  return Math.max(230, 86 + components.reduce((total, component) => (
    total + Math.max(106, 70 + Math.min(safeArray(component.parts).length, 5) * 28) + 14
  ), 0))
}

function layoutDistricts(districts) {
  const topRow = districts.slice(0, DISTRICT_COLUMNS)
  const positionedTopRow = topRow.map((district, column) => {
    const height = districtHeight(district.components)
    return {
      ...district,
      position: { x: 42 + column * COLUMN_WIDTH, y: 42 },
      size: { width: DISTRICT_WIDTH, height },
    }
  })
  const topRowBottom = positionedTopRow.reduce(
    (maximum, district) => Math.max(maximum, district.position.y + district.size.height),
    42,
  )
  const deliveryTop = topRowBottom + 56
  const lowerStart = deliveryTop + 220 + 140
  const nextY = Array.from({ length: DISTRICT_COLUMNS }, () => lowerStart)
  let maximumBottom = lowerStart
  const positionedLowerRows = districts.slice(DISTRICT_COLUMNS).map((district) => {
    const column = nextY.indexOf(Math.min(...nextY))
    const height = districtHeight(district.components)
    const positionedDistrict = {
      ...district,
      position: { x: 42 + column * COLUMN_WIDTH, y: nextY[column] },
      size: { width: DISTRICT_WIDTH, height },
    }
    nextY[column] += height + DISTRICT_GAP
    maximumBottom = Math.max(maximumBottom, positionedDistrict.position.y + height)
    return positionedDistrict
  })
  return {
    districts: [...positionedTopRow, ...positionedLowerRows],
    deliveryTop,
    maximumBottom,
  }
}

function changedPartStatus(part, connector, difference, changedPaths) {
  if (!connector) return 'observed'
  const online = connector.connectionState === 'online'
  if (difference?.removed.includes(part.id)) return 'stale'
  if (difference?.changed.includes(part.id) || changedPaths.has(part.path)) {
    return online ? 'pending' : 'stale'
  }
  if (difference?.inSync && online) return 'fresh'
  return online ? 'observed' : 'stale'
}

function screenPart(part, {
  connector,
  difference,
  changedPaths,
  canMaterialize,
}) {
  return {
    ...part,
    kind: part.entityKind,
    kindLabel: part.entityKind === 'file' ? '파일' : '코드 실체',
    status: changedPartStatus(part, connector, difference, changedPaths),
    editable: canMaterialize && part.entityKind === 'file',
    evidence: part.path ? [{
      id: `evidence:${part.id}`,
      label: part.path,
      detail: part.lineStart
        ? `${part.lineStart}${part.lineEnd && part.lineEnd !== part.lineStart ? `–${part.lineEnd}` : ''}행`
        : '',
    }] : [],
  }
}

function deliveryModel({ connector, current, deliveryTop }) {
  const git = connector?.git ?? {}
  const deployment = current?.deployment ?? {}
  const stages = [
    {
      id: 'delivery:working-tree',
      label: '작업 트리 관측',
      summary: Number.isInteger(git.dirty)
        ? `커밋 전 변경 ${git.dirty}개`
        : '로컬 작업 트리 미관측',
      technicalSummary: text(git.branch) ? `branch ${git.branch}` : 'branch unknown',
      editable: false,
      parts: safeArray(git.changedPaths).slice(0, 3).map((path) => ({
        id: `delivery:changed-path:${path}`,
        label: path,
        path,
        editable: false,
      })),
    },
    {
      id: 'delivery:local-head',
      label: '커밋 위치',
      summary: git.headSha ? `로컬 HEAD ${shaLabel(git.headSha)}` : '로컬 커밋 미관측',
      technicalSummary: Number.isInteger(git.ahead)
        ? `ahead ${git.ahead} · behind ${git.behind ?? 0}`
        : '원격 비교 미관측',
      editable: false,
    },
    {
      id: 'delivery:upstream-check',
      label: '원격 비교',
      summary: text(git.upstreamRef, 'upstream 미관측'),
      technicalSummary: text(git.fetchStatus)
        ? `fetch ${git.fetchStatus} · remote ${shaLabel(git.upstreamSha)}`
        : 'fetch 상태 미관측',
      editable: false,
    },
    {
      id: 'delivery:sync-decision',
      label: '전달 판정',
      summary: text(connector?.sync?.reason, '안전한 동기화 방향 미판정'),
      technicalSummary: text(connector?.sync?.action, 'unknown'),
      editable: false,
      parts: deployment.commitSha ? [{
        id: 'delivery:deployed-commit',
        label: `배포 ${shaLabel(deployment.commitSha)}`,
        summary: `${text(deployment.provider, 'provider unknown')} · ${text(deployment.environment, 'environment unknown')}`,
        editable: false,
      }] : [],
    },
  ]
  const position = { x: 42, y: deliveryTop }
  const size = { width: 1_018, height: 220 }
  return {
    delivery: {
      id: 'delivery:git-observation',
      label: 'Git 전달 상태',
      description: '실행 중인 Job이 아니라 Source Lens와 로컬 커넥터가 관측·판정한 전달 상태입니다.',
      position,
      size,
      stages,
      editable: false,
    },
    deliveryBottom: position.y + size.height,
  }
}

function deliveryRelations(stages, githubId) {
  const relations = []
  for (let index = 0; index < stages.length - 1; index += 1) {
    relations.push({
      id: `delivery-relation:${index}`,
      source: stages[index].id,
      target: stages[index + 1].id,
      label: '관측 순서',
      edgeType: 'smoothstep',
    })
  }
  if (githubId && stages.length) {
    relations.push({
      id: 'delivery-relation:github',
      source: stages.at(-1).id,
      target: githubId,
      label: '원격 저장소',
      edgeType: 'smoothstep',
    })
  }
  return relations
}

export function buildCodeWorldModel(projection, {
  current = null,
  currentObservedAt = null,
  currentPreview = false,
  currentError = '',
  localState = null,
  localObservedAt = null,
  localError = '',
  canMaterialize = false,
} = {}) {
  const manifest = current?.manifest ?? null
  const connector = selectedConnector(localState)
  const difference = manifest && connector?.manifest
    ? compareLocalAndDeployedManifests(manifest, connector.manifest)
    : null
  const changedPaths = new Set(safeArray(connector?.git?.changedPaths))
  const visibleParts = safeArray(projection?.parts).map((part) => screenPart(part, {
    connector,
    difference,
    changedPaths,
    canMaterialize,
  }))
  const partById = new Map(visibleParts.map((part) => [part.id, part]))
  const componentCatalog = safeArray(projection?.groups?.components)
  const subsystems = safeArray(projection?.groups?.subsystems)
  const districts = safeArray(projection?.districts).map((district) => ({
    ...district,
    editable: false,
    components: subsystems
      .filter((subsystem) => subsystem.areaId === district.areaId)
      .map((subsystem) => {
        const parts = subsystem.partIds.map((id) => partById.get(id)).filter(Boolean)
        const catalogLabels = componentCatalog
          .filter((component) => component.subsystemId === subsystem.subsystemId)
          .map((component) => component.label)
        return {
          ...subsystem,
          kind: 'subsystem',
          kindLabel: '서브시스템',
          summary: subsystem.description,
          technicalSummary: [
            `Source Lens 실체 ${parts.length}개`,
            catalogLabels.length ? `컴포넌트 ${catalogLabels.join(', ')}` : '',
          ].filter(Boolean).join(' · '),
          parts,
          editable: false,
        }
      }),
  }))
  const layout = layoutDistricts(districts)
  const delivery = deliveryModel({
    connector,
    current,
    deliveryTop: layout.deliveryTop,
  })
  const repositoryUrl = text(projection?.repository?.repositoryUrl)
  const githubId = repositoryUrl ? `github:${projection.repository.owner}/${projection.repository.name}` : ''
  const githubObserved = connector?.git?.fetchStatus === 'ok' && !!connector?.git?.upstreamSha
  const systems = repositoryUrl ? [{
    id: githubId,
    label: 'GitHub 원격 저장소',
    kind: 'remote-repository',
    kindLabel: '지속적인 외부 시스템',
    description: githubObserved
      ? `${repositoryUrl} · 원격 ${shaLabel(connector.git.upstreamSha)} 관측`
      : `${repositoryUrl} · manifest에 선언됨, 최신 원격 HEAD는 미관측`,
    status: githubObserved ? 'observed' : 'declared',
    position: { x: 1_108, y: delivery.deliveryBottom - 154 },
    size: { width: 196, height: 72 },
    editable: false,
  }] : []
  const effectiveMaterialize = canMaterialize && !currentPreview
  const repository = {
    ...projection?.repository,
    label: text(projection?.repository?.label, '연결된 저장소'),
    name: text(projection?.repository?.name, text(projection?.repository?.label)),
    branch: text(connector?.git?.branch, text(projection?.repository?.defaultBranch)),
    observedAt: currentObservedAt,
    summary: projection?.status === 'ready'
      ? `Source Lens가 관측한 코드 실체 ${projection.counts.visibleParts.toLocaleString()}개와 정적 관계 ${projection.counts.visibleEdges.toLocaleString()}개입니다.`
      : text(projection?.emptyState?.description, '표시할 Source Lens 코드 실체가 없습니다.'),
    technicalSummary: [
      text(projection?.sourceManifestId),
      projection?.truncation?.active ? '화면 한도에 맞춰 일부만 표시' : '현재 투영 범위 전체 표시',
    ].filter(Boolean).join(' · '),
    editable: false,
  }
  const observations = observationRows({
    current,
    currentObservedAt,
    currentPreview,
    currentError,
    localState,
    localObservedAt,
    localError,
    connector,
    difference,
  })

  return {
    repository,
    districts: layout.districts,
    initialViewport: { x: 0, y: 0, zoom: 0.78 },
    relations: [
      ...safeArray(projection?.edges),
      ...deliveryRelations(delivery.delivery.stages, githubId),
    ],
    delivery: delivery.delivery,
    systems,
    observations,
    permissions: {
      editPolicyNote: currentPreview
        ? '개발 미리보기 manifest입니다. 실제 소스 수정 제안은 만들지 않습니다.'
        : effectiveMaterialize
          ? '수정 제안은 Source Lens가 식별한 실제 파일만 대상으로 하며, 반영 전 검토가 필요합니다.'
          : '현재 권한에서는 소스 수정 제안을 만들 수 없습니다.',
    },
    sourceProjection: projection,
    localDifference: difference,
  }
}

function initialPartIdForEntry(projection, entry) {
  const preferredSubsystemIds = entry?.view === 'github-code'
    ? ['git-delivery', 'source-browser-history']
    : ['local-connector', 'source-analysis']
  for (const subsystemId of preferredSubsystemIds) {
    const subsystem = safeArray(projection?.groups?.subsystems)
      .find((candidate) => candidate.subsystemId === subsystemId)
    const partId = safeArray(subsystem?.partIds)
      .find((candidateId) => projection.parts.some((part) => part.id === candidateId))
    if (partId) return partId
  }
  return text(projection?.parts?.[0]?.id)
}

export default function CodeWorldWorkspace({
  entry,
  onBack,
  onOpenSourceTwin,
  onMaterializeSourceModule,
  canMaterialize = false,
}) {
  const mountedRef = useRef(false)
  const currentRequestRef = useRef(0)
  const localRequestRef = useRef(0)
  const initializedSelectionEntryRef = useRef('')
  const [currentState, setCurrentState] = useState({
    data: null,
    loading: true,
    refreshing: false,
    error: '',
    observedAt: null,
    preview: false,
  })
  const [localState, setLocalState] = useState({
    data: { connectors: [], operations: [] },
    loading: true,
    refreshing: false,
    error: '',
    observedAt: null,
  })
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [audienceMode, setAudienceMode] = useState('developer')
  const [actionState, setActionState] = useState(null)

  const refreshCurrent = useCallback(async () => {
    const requestId = ++currentRequestRef.current
    setCurrentState((state) => ({
      ...state,
      loading: !state.data,
      refreshing: !!state.data,
      error: '',
    }))
    try {
      const data = await loadSourceTwinCurrent()
      if (!mountedRef.current || requestId !== currentRequestRef.current) return false
      setCurrentState({
        data,
        loading: false,
        refreshing: false,
        error: '',
        observedAt: new Date().toISOString(),
        preview: false,
      })
      return true
    } catch (error) {
      let preview = null
      try {
        preview = await loadDevelopmentPreview(error)
      } catch {
        preview = null
      }
      if (!mountedRef.current || requestId !== currentRequestRef.current) return false
      if (preview) {
        setCurrentState({
          data: preview,
          loading: false,
          refreshing: false,
          error: '',
          observedAt: new Date().toISOString(),
          preview: true,
        })
        return true
      }
      setCurrentState((state) => ({
        ...state,
        loading: false,
        refreshing: false,
        error: errorMessage(error, 'Source Lens 분석 결과를 불러오지 못했습니다.'),
      }))
      return false
    }
  }, [])

  const refreshLocal = useCallback(async () => {
    const requestId = ++localRequestRef.current
    setLocalState((state) => ({
      ...state,
      loading: !state.data,
      refreshing: !!state.data,
      error: '',
    }))
    try {
      const result = await loadLocalConnectors()
      if (!mountedRef.current || requestId !== localRequestRef.current) return false
      const connectors = safeArray(result?.connectors).map(connectorWithFreshState)
      setLocalState({
        data: {
          connectors,
          operations: safeArray(result?.operations),
          selectedConnectorId: selectedConnector({ connectors })?.id ?? '',
        },
        loading: false,
        refreshing: false,
        error: '',
        observedAt: new Date().toISOString(),
      })
      return true
    } catch (error) {
      if (!mountedRef.current || requestId !== localRequestRef.current) return false
      setLocalState((state) => ({
        ...state,
        loading: false,
        refreshing: false,
        error: errorMessage(error, '로컬 커넥터 상태를 불러오지 못했습니다.'),
      }))
      return false
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refreshCurrent()
    refreshLocal()
    const sourceTimer = window.setInterval(refreshCurrent, SOURCE_REFRESH_MS)
    const localTimer = window.setInterval(refreshLocal, LOCAL_REFRESH_MS)
    return () => {
      mountedRef.current = false
      window.clearInterval(sourceTimer)
      window.clearInterval(localTimer)
    }
  }, [refreshCurrent, refreshLocal])

  const projection = useMemo(() => createSourceCodeWorldProjection(
    currentState.data?.manifest,
    {
      perspective: 'code',
      query,
      lod: 'overview',
      selectedId,
    },
  ), [currentState.data?.manifest, query, selectedId])

  useEffect(() => {
    const entryKey = `${text(entry?.nodeId)}:${text(entry?.view)}`
    if (
      !entryKey
      || initializedSelectionEntryRef.current === entryKey
      || projection.status !== 'ready'
    ) return
    initializedSelectionEntryRef.current = entryKey
    setSelectedId(initialPartIdForEntry(projection, entry))
  }, [entry, projection])

  const effectiveCanMaterialize = canMaterialize
    && !currentState.preview
    && typeof onMaterializeSourceModule === 'function'
  const model = useMemo(() => buildCodeWorldModel(projection, {
    current: currentState.data,
    currentObservedAt: currentState.observedAt,
    currentPreview: currentState.preview,
    currentError: currentState.error,
    localState: localState.data,
    localObservedAt: localState.observedAt,
    localError: localState.error,
    canMaterialize: effectiveCanMaterialize,
  }), [
    projection,
    currentState.data,
    currentState.observedAt,
    currentState.preview,
    currentState.error,
    localState.data,
    localState.observedAt,
    localState.error,
    effectiveCanMaterialize,
  ])

  const sourceState = useMemo(() => ({
    status: currentState.loading
      ? 'pending'
      : currentState.preview
        ? 'declared'
        : currentState.error
          ? (currentState.data ? 'stale' : 'error')
          : 'ready',
    loading: currentState.loading,
    refreshing: currentState.refreshing,
    error: currentState.error,
    observedAt: currentState.observedAt,
    autoRefresh: true,
  }), [currentState])

  const handleRefresh = useCallback(async () => {
    setActionState({ busy: true, status: 'running', message: 'Source Lens와 로컬 관측을 갱신하고 있습니다.' })
    const [sourceOk, localOk] = await Promise.all([refreshCurrent(), refreshLocal()])
    if (!mountedRef.current) return
    setActionState({
      busy: false,
      status: sourceOk ? (localOk ? 'succeeded' : 'degraded') : 'error',
      message: sourceOk
        ? (localOk
            ? 'Source Lens와 로컬 관측을 갱신했습니다.'
            : 'Source Lens는 갱신했지만 로컬 커넥터는 관측하지 못했습니다.')
        : 'Source Lens 분석 결과를 갱신하지 못했습니다.',
    })
  }, [refreshCurrent, refreshLocal])

  const handleTrace = useCallback(({ selected } = {}) => {
    setActionState({
      busy: false,
      status: 'succeeded',
      message: selected?.id
        ? 'Source Lens manifest의 정적 관계를 화면에서 강조했습니다.'
        : '관계를 따라갈 실제 코드 실체를 선택해 주세요.',
    })
  }, [])

  const openTwinView = useCallback((view) => {
    if (typeof onOpenSourceTwin !== 'function') return
    if (view === 'changes') {
      onOpenSourceTwin({
        ...entry,
        view: 'changes',
        actionLabel: '커밋 변경',
        panelTitle: 'GitHub 저장소 변경',
        description: '배포 manifest의 변경분과 서명이 확인된 GitHub push 신호입니다.',
      })
      return
    }
    onOpenSourceTwin({
      ...entry,
      view: 'history',
      actionLabel: '상태 이력',
      panelTitle: '소스·배포 상태 이력',
      description: '코드·DB 선언·배포·운영 관측을 같은 시점의 기록으로 확인합니다.',
    })
  }, [entry, onOpenSourceTwin])

  const handleProposeEdit = useCallback(async ({ selected } = {}) => {
    const manifest = currentState.data?.manifest
    const entity = safeArray(manifest?.entities).find((item) => item.id === selected?.id)
    if (
      !effectiveCanMaterialize
      || !manifest?.id
      || !entity
      || entity.kind !== 'file'
    ) {
      setActionState({
        busy: false,
        status: 'error',
        message: 'Source Lens가 식별한 실제 파일을 선택해야 수정 제안을 만들 수 있습니다.',
      })
      return
    }
    setActionState({
      busy: true,
      status: 'running',
      message: '선택한 실제 파일을 수정 제안 검토로 전달하고 있습니다.',
    })
    try {
      await onMaterializeSourceModule({ manifest, entity })
      if (!mountedRef.current) return
      setActionState({
        busy: false,
        status: 'succeeded',
        message: '실제 파일과 Source Lens 근거를 수정 제안 검토로 전달했습니다.',
      })
    } catch (error) {
      if (!mountedRef.current) return
      setActionState({
        busy: false,
        status: 'error',
        message: errorMessage(error, '수정 제안을 전달하지 못했습니다.'),
      })
    }
  }, [currentState.data?.manifest, effectiveCanMaterialize, onMaterializeSourceModule])

  return (
    <div className="code-world-workspace">
      <CodeWorldScreen
        model={model}
        sourceState={sourceState}
        localConnectorState={localState.data}
        selectedId={selectedId}
        query={query}
        audienceMode={audienceMode}
        actionState={actionState}
        onSelectionChange={setSelectedId}
        onQueryChange={setQuery}
        onAudienceModeChange={setAudienceMode}
        onRefresh={handleRefresh}
        onTraceImpact={handleTrace}
        onCompareChanges={typeof onOpenSourceTwin === 'function' ? () => openTwinView('changes') : undefined}
        onProposeEdit={effectiveCanMaterialize ? handleProposeEdit : undefined}
        onViewObservations={typeof onOpenSourceTwin === 'function' ? () => openTwinView('history') : undefined}
        onBack={onBack}
        onClose={onBack}
      />
    </div>
  )
}
