import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './CodeWorldScreen.css'

const EMPTY_ARRAY = Object.freeze([])

const AUDIENCE_LABELS = Object.freeze({
  easy: '쉬운 설명',
  developer: '개발자 정보',
})

const STATUS_LABELS = Object.freeze({
  online: '온라인',
  ready: '관측됨',
  observed: '관측됨',
  succeeded: '완료',
  healthy: '정상',
  fresh: '최신',
  pending: '대기',
  queued: '대기',
  running: '진행 중',
  declared: '선언됨',
  stale: '오래됨',
  degraded: '확인 필요',
  offline: '오프라인',
  failed: '실패',
  error: '오류',
  unknown: '미확인',
})

function safeArray(value) {
  return Array.isArray(value) ? value : EMPTY_ARRAY
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function idOf(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && (typeof value.id === 'string' || typeof value.id === 'number')) return String(value.id)
  return ''
}

function statusId(value, fallback = 'unknown') {
  const normalized = safeText(value, fallback).toLowerCase()
  return Object.hasOwn(STATUS_LABELS, normalized) ? normalized : fallback
}

function statusLabel(value) {
  const normalized = statusId(value)
  return STATUS_LABELS[normalized] ?? safeText(value, STATUS_LABELS.unknown)
}

function formatRelativeTime(value, now = Date.now()) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 5) return '방금 전'
  if (seconds < 60) return `${seconds}초 전`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return new Date(timestamp).toLocaleDateString('ko-KR')
}

function moduleItems(component) {
  const candidates = component?.parts
    ?? component?.modules
    ?? component?.items
    ?? component?.files
  return safeArray(candidates)
}

function districtComponents(district) {
  return safeArray(district?.components ?? district?.groups)
}

function itemDescription(item, audienceMode) {
  if (audienceMode === 'developer') {
    return safeText(
      item?.technicalSummary,
      safeText(item?.path, safeText(item?.summary, item?.description)),
    )
  }
  return safeText(
    item?.userImpact,
    safeText(item?.summary, safeText(item?.description, item?.technicalSummary)),
  )
}

function evidenceRows(item) {
  const explicit = safeArray(item?.evidence ?? item?.codeEvidence)
    .map((evidence) => {
      if (typeof evidence === 'string') return { id: evidence, label: evidence, detail: '' }
      const label = safeText(evidence?.label, safeText(evidence?.path, safeText(evidence?.ref)))
      if (!label) return null
      return {
        id: idOf(evidence) || `${label}:${safeText(evidence?.detail)}`,
        label,
        detail: safeText(evidence?.detail, safeText(evidence?.range)),
      }
    })
    .filter(Boolean)

  if (explicit.length) return explicit
  if (!item?.path) return EMPTY_ARRAY

  const start = Number.isInteger(item.lineStart) ? item.lineStart : null
  const end = Number.isInteger(item.lineEnd) ? item.lineEnd : start
  return [{
    id: `${item.path}:${start ?? ''}:${end ?? ''}`,
    label: item.path,
    detail: start ? `${start}${end && end !== start ? `–${end}` : ''}행` : '',
  }]
}

function normalizedPosition(value, fallback) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return fallback
  return { x: value.x, y: value.y }
}

function normalizedSize(value, fallback) {
  const width = Number(value?.width)
  const height = Number(value?.height)
  return {
    width: Number.isFinite(width) && width > 0 ? width : fallback.width,
    height: Number.isFinite(height) && height > 0 ? height : fallback.height,
  }
}

function selectedConnector(localConnectorState) {
  if (localConnectorState?.connector) return localConnectorState.connector
  const connectors = safeArray(localConnectorState?.connectors)
  const selectedId = safeText(localConnectorState?.selectedConnectorId)
  return connectors.find((connector) => idOf(connector) === selectedId) ?? connectors[0] ?? null
}

function connectionView(sourceState, localConnectorState, repository) {
  const connector = selectedConnector(localConnectorState)
  const rawStatus = connector?.connectionState
    || connector?.status
    || (connector?.online === true ? 'online' : connector?.online === false ? 'offline' : '')
    || sourceState?.status
  const status = statusId(rawStatus, connector ? 'unknown' : statusId(sourceState?.status, 'unknown'))
  const observedAt = connector?.lastSeenAt
    ?? sourceState?.observedAt
    ?? sourceState?.updatedAt
    ?? repository?.observedAt
  return {
    connector,
    status,
    observedAt,
    label: safeText(
      connector?.repositoryLabel,
      safeText(connector?.label, safeText(repository?.label, repository?.name)),
    ),
    branch: safeText(connector?.git?.branch, safeText(repository?.branch)),
  }
}

function DistrictNode({ data }) {
  const district = data.district
  return (
    <section className={`code-world-district${data.isDimmed ? ' is-dimmed' : ''}`}>
      <header>
        <div>
          <strong>{safeText(district.label, '코드 영역')}</strong>
          {district.description && <span>{district.description}</span>}
        </div>
        <span className="code-world-count">{districtComponents(district).length}</span>
      </header>
    </section>
  )
}

const MemoDistrictNode = memo(DistrictNode)

function ComponentNode({ data }) {
  const component = data.component
  const items = moduleItems(component)
  const visibleItems = items.slice(0, data.maximumVisibleItems)
  const selectedInside = data.selectedId === idOf(component)
    || items.some((item) => idOf(item) === data.selectedId)
  const description = itemDescription(component, data.audienceMode)

  return (
    <article
      className={[
        'code-world-component',
        selectedInside ? 'is-selected' : '',
        data.isTraceAffected ? 'is-trace-affected' : '',
        data.isDimmed ? 'is-dimmed' : '',
      ].filter(Boolean).join(' ')}
    >
      <Handle type="target" position={Position.Left} className="code-world-handle" />
      <button
        type="button"
        className="code-world-component-heading nodrag nopan"
        onClick={() => data.onSelect(idOf(component))}
      >
        <span>
          <strong>{safeText(component.label, '이름 없는 컴포넌트')}</strong>
          {description && <small>{description}</small>}
        </span>
        {component.kind && <em>{component.kindLabel ?? component.kind}</em>}
      </button>
      <div className="code-world-part-list">
        {visibleItems.map((item) => {
          const itemId = idOf(item)
          const itemStatus = statusId(item.status, '')
          const detail = data.audienceMode === 'developer'
            ? safeText(item.path, itemDescription(item, data.audienceMode))
            : itemDescription(item, data.audienceMode)
          return (
            <button
              type="button"
              className={`code-world-part nodrag nopan${data.selectedId === itemId ? ' is-selected' : ''}`}
              key={itemId || `${component.id}:${item.label}`}
              onClick={() => data.onSelect(itemId || idOf(component))}
              title={detail}
            >
              <span className="code-world-part-label">
                {itemStatus && <span className={`code-world-status-dot is-${itemStatus}`} aria-label={statusLabel(itemStatus)} />}
                <strong>{safeText(item.label, safeText(item.name, safeText(item.path, '코드 파트')))}</strong>
              </span>
              {data.audienceMode === 'developer' && item.lineStart && <small>L{item.lineStart}</small>}
            </button>
          )
        })}
        {items.length > visibleItems.length && (
          <button
            type="button"
            className="code-world-more-parts nodrag nopan"
            onClick={() => data.onSelect(idOf(component))}
          >
            나머지 {items.length - visibleItems.length}개 보기
          </button>
        )}
        {items.length === 0 && (
          <p className="code-world-empty-parts">연결된 코드 파트 없음</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="code-world-handle" />
    </article>
  )
}

const MemoComponentNode = memo(ComponentNode)

function DeliveryFrameNode({ data }) {
  const delivery = data.delivery
  return (
    <section className="code-world-delivery-frame">
      <header>
        <div>
          <strong>{safeText(delivery.label, 'Git 전달')}</strong>
          <span>{safeText(delivery.description, '변경이 원격 저장소와 운영 환경으로 전달되는 흐름')}</span>
        </div>
        <span className="code-world-count">{safeArray(delivery.stages).length}</span>
      </header>
    </section>
  )
}

const MemoDeliveryFrameNode = memo(DeliveryFrameNode)

function DeliveryStageNode({ data }) {
  const stage = data.stage
  const items = moduleItems(stage).slice(0, 3)
  return (
    <article
      className={[
        'code-world-delivery-stage',
        data.selectedId === idOf(stage) ? 'is-selected' : '',
        data.isTraceAffected ? 'is-trace-affected' : '',
        data.isDimmed ? 'is-dimmed' : '',
      ].filter(Boolean).join(' ')}
    >
      <Handle type="target" position={Position.Left} className="code-world-handle" />
      <button
        type="button"
        className="code-world-stage-heading nodrag nopan"
        onClick={() => data.onSelect(idOf(stage))}
      >
        <strong>{safeText(stage.label, '전달 단계')}</strong>
        {itemDescription(stage, data.audienceMode) && (
          <small>{itemDescription(stage, data.audienceMode)}</small>
        )}
      </button>
      {items.length > 0 && (
        <div className="code-world-stage-items">
          {items.map((item) => (
            <button
              type="button"
              className={`nodrag nopan${data.selectedId === idOf(item) ? ' is-selected' : ''}`}
              key={idOf(item) || `${stage.id}:${item.label}`}
              onClick={() => data.onSelect(idOf(item) || idOf(stage))}
            >
              {safeText(item.label, safeText(item.path, '단계 파트'))}
            </button>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="code-world-handle" />
    </article>
  )
}

const MemoDeliveryStageNode = memo(DeliveryStageNode)

function ExternalSystemNode({ data }) {
  const system = data.system
  const systemStatus = statusId(system.status, '')
  return (
    <button
      type="button"
      className={[
        'code-world-external-system',
        data.selectedId === idOf(system) ? 'is-selected' : '',
        data.isTraceAffected ? 'is-trace-affected' : '',
        data.isDimmed ? 'is-dimmed' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => data.onSelect(idOf(system))}
    >
      <Handle type="target" position={Position.Left} className="code-world-handle" />
      <span>
        <strong>{safeText(system.label, '외부 시스템')}</strong>
        <small>{safeText(system.kindLabel, safeText(system.kind, system.description))}</small>
      </span>
      {systemStatus && <span className={`code-world-status-dot is-${systemStatus}`} aria-label={statusLabel(systemStatus)} />}
      <Handle type="source" position={Position.Right} className="code-world-handle" />
    </button>
  )
}

const MemoExternalSystemNode = memo(ExternalSystemNode)

const NODE_TYPES = Object.freeze({
  codeWorldDistrict: MemoDistrictNode,
  codeWorldComponent: MemoComponentNode,
  codeWorldDelivery: MemoDeliveryFrameNode,
  codeWorldStage: MemoDeliveryStageNode,
  codeWorldExternal: MemoExternalSystemNode,
})

function graphProjection(model, {
  audienceMode,
  query,
  selectedId,
  traceActive,
  onSelect,
}) {
  const districts = safeArray(model?.districts ?? model?.areas)
  const delivery = model?.delivery ?? null
  const systems = safeArray(model?.systems ?? model?.remoteSystems)
  const relations = safeArray(model?.relations ?? model?.edges)
  const normalizedQuery = safeText(query).toLocaleLowerCase()
  const nodes = []
  const assetById = new Map()
  const nodeIdByAssetId = new Map()
  const componentAssetIds = new Set()

  const registerAsset = (asset, nodeId) => {
    const assetId = idOf(asset)
    if (!assetId) return
    assetById.set(assetId, asset)
    nodeIdByAssetId.set(assetId, nodeId)
  }

  districts.forEach((district, districtIndex) => {
    const components = districtComponents(district)
    const componentHeights = components.map((component) => (
      Math.max(106, 70 + Math.min(moduleItems(component).length, 5) * 28)
    ))
    const defaultHeight = Math.max(
      210,
      86 + componentHeights.reduce((sum, height) => sum + height + 14, 0),
    )
    const size = normalizedSize(district.size ?? district, { width: 314, height: defaultHeight })
    const position = normalizedPosition(district.position, {
      x: 42 + districtIndex * 354,
      y: 46,
    })
    const districtNodeId = `district:${idOf(district) || districtIndex}`
    const districtMatches = !normalizedQuery || [
      district.label,
      district.description,
      ...components.flatMap((component) => [
        component.label,
        component.summary,
        component.technicalSummary,
        ...moduleItems(component).flatMap((item) => [item.label, item.name, item.path, item.summary]),
      ]),
    ].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))

    nodes.push({
      id: districtNodeId,
      type: 'codeWorldDistrict',
      position,
      data: { district, isDimmed: !districtMatches },
      selectable: false,
      draggable: false,
      style: size,
    })
    registerAsset(district, districtNodeId)

    let nextY = 78
    components.forEach((component, componentIndex) => {
      const componentId = idOf(component) || `${idOf(district) || districtIndex}:component:${componentIndex}`
      const componentNodeId = `component:${componentId}`
      const items = moduleItems(component)
      const height = componentHeights[componentIndex]
      const componentPosition = normalizedPosition(component.position, { x: 17, y: nextY })
      const searchable = [
        component.label,
        component.description,
        component.summary,
        component.technicalSummary,
        ...items.flatMap((item) => [item.label, item.name, item.path, item.summary, item.technicalSummary]),
      ]
      const matches = !normalizedQuery
        || searchable.filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))

      componentAssetIds.add(componentId)
      registerAsset(component, componentNodeId)
      items.forEach((item) => registerAsset(item, componentNodeId))
      nodes.push({
        id: componentNodeId,
        type: 'codeWorldComponent',
        parentId: districtNodeId,
        extent: 'parent',
        position: componentPosition,
        data: {
          component,
          audienceMode,
          selectedId,
          maximumVisibleItems: 5,
          isDimmed: !matches,
          isTraceAffected: false,
          onSelect,
        },
        selectable: false,
        draggable: false,
        style: { width: size.width - 34, height },
      })
      nextY = Math.max(nextY + height + 14, componentPosition.y + height + 14)
    })
  })

  const rightMostDistrict = districts.reduce((maximum, district, index) => {
    const position = normalizedPosition(district.position, { x: 42 + index * 354, y: 46 })
    const size = normalizedSize(district.size ?? district, { width: 314, height: 400 })
    return Math.max(maximum, position.x + size.width)
  }, 0)
  const lowestDistrict = districts.reduce((maximum, district, index) => {
    const components = districtComponents(district)
    const fallbackHeight = Math.max(210, 86 + components.reduce((sum, component) => (
      sum + Math.max(106, 70 + Math.min(moduleItems(component).length, 5) * 28) + 14
    ), 0))
    const position = normalizedPosition(district.position, { x: 42 + index * 354, y: 46 })
    const size = normalizedSize(district.size ?? district, { width: 314, height: fallbackHeight })
    return Math.max(maximum, position.y + size.height)
  }, 0)

  if (delivery) {
    const stages = safeArray(delivery.stages)
    const deliverySize = normalizedSize(delivery.size ?? delivery, {
      width: Math.max(760, stages.length * 218 + 34),
      height: 210,
    })
    const deliveryPosition = normalizedPosition(delivery.position, {
      x: 42,
      y: Math.max(470, lowestDistrict + 48),
    })
    const deliveryNodeId = `delivery:${idOf(delivery) || 'primary'}`
    nodes.push({
      id: deliveryNodeId,
      type: 'codeWorldDelivery',
      position: deliveryPosition,
      data: { delivery },
      selectable: false,
      draggable: false,
      style: deliverySize,
    })
    registerAsset(delivery, deliveryNodeId)

    stages.forEach((stage, index) => {
      const stageId = idOf(stage) || `${idOf(delivery) || 'delivery'}:stage:${index}`
      const stageNodeId = `stage:${stageId}`
      const items = moduleItems(stage)
      const stagePosition = normalizedPosition(stage.position, { x: 17 + index * 212, y: 82 })
      const searchable = [
        stage.label,
        stage.description,
        stage.summary,
        stage.technicalSummary,
        ...items.flatMap((item) => [item.label, item.path, item.summary]),
      ]
      const matches = !normalizedQuery
        || searchable.filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
      registerAsset(stage, stageNodeId)
      items.forEach((item) => registerAsset(item, stageNodeId))
      nodes.push({
        id: stageNodeId,
        type: 'codeWorldStage',
        parentId: deliveryNodeId,
        extent: 'parent',
        position: stagePosition,
        data: {
          stage,
          audienceMode,
          selectedId,
          isDimmed: !matches,
          isTraceAffected: false,
          onSelect,
        },
        selectable: false,
        draggable: false,
        style: { width: 190, height: 110 },
      })
    })
  }

  systems.forEach((system, index) => {
    const systemId = idOf(system) || `external:${index}`
    const nodeId = `system:${systemId}`
    const matches = !normalizedQuery || [
      system.label,
      system.kind,
      system.description,
    ].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
    registerAsset(system, nodeId)
    nodes.push({
      id: nodeId,
      type: 'codeWorldExternal',
      position: normalizedPosition(system.position, {
        x: Math.max(1120, rightMostDistrict + 48),
        y: Math.max(150, lowestDistrict + index * 96),
      }),
      data: {
        system,
        selectedId,
        isDimmed: !matches,
        isTraceAffected: false,
        onSelect,
      },
      selectable: false,
      draggable: false,
      style: normalizedSize(system.size ?? system, { width: 176, height: 68 }),
    })
  })

  const endpointNode = (rawId) => {
    const assetId = idOf(rawId)
    if (!assetId) return ''
    return nodeIdByAssetId.get(assetId)
      ?? (componentAssetIds.has(assetId) ? `component:${assetId}` : '')
  }
  const selectedNodeId = endpointNode(selectedId)
  const affectedNodeIds = new Set(selectedNodeId ? [selectedNodeId] : [])
  const relatedRelationIds = new Set()

  const edges = relations.map((relation, index) => {
    const sourceAssetId = idOf(relation.sourceId ?? relation.source)
    const targetAssetId = idOf(relation.targetId ?? relation.target)
    const source = endpointNode(sourceAssetId)
    const target = endpointNode(targetAssetId)
    if (!source || !target || source === target) return null
    const relationId = idOf(relation) || `${sourceAssetId}:${targetAssetId}:${index}`
    const directlyRelated = !!selectedId && (
      sourceAssetId === selectedId
      || targetAssetId === selectedId
      || source === selectedNodeId
      || target === selectedNodeId
    )
    if (directlyRelated) {
      affectedNodeIds.add(source)
      affectedNodeIds.add(target)
      relatedRelationIds.add(relationId)
    }
    const traced = traceActive && directlyRelated
    return {
      id: `relation:${relationId}`,
      source,
      target,
      label: safeText(relation.label),
      className: [
        'code-world-relation',
        traced ? 'is-traced' : '',
        traceActive && !traced ? 'is-muted' : '',
      ].filter(Boolean).join(' '),
      type: safeText(relation.edgeType, 'smoothstep'),
      animated: traced && relation.animated === true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: traced ? '#0aa6a6' : '#66717e',
      },
      style: {
        stroke: traced ? '#0aa6a6' : '#66717e',
        strokeWidth: traced ? 2.6 : 1.4,
      },
      data: { relation, relationId, directlyRelated },
    }
  }).filter(Boolean)

  for (const node of nodes) {
    if (!node.data || !Object.hasOwn(node.data, 'isTraceAffected')) continue
    node.data = {
      ...node.data,
      isTraceAffected: traceActive && affectedNodeIds.has(node.id),
    }
  }

  return {
    nodes,
    edges,
    assetById,
    nodeIdByAssetId,
    relatedRelations: relations.filter((relation, index) => {
      const relationId = idOf(relation)
        || `${idOf(relation.sourceId ?? relation.source)}:${idOf(relation.targetId ?? relation.target)}:${index}`
      return relatedRelationIds.has(relationId)
    }),
  }
}

function observationRows(model, sourceState, localConnectorState) {
  const explicit = safeArray(model?.observations)
  if (explicit.length) return explicit
  if (safeArray(sourceState?.observations).length) return sourceState.observations
  return safeArray(localConnectorState?.operations).map((operation) => ({
    id: operation.id ?? operation.operationId,
    label: operation.label ?? operation.summary ?? operation.action,
    detail: operation.detail ?? operation.result?.summary,
    status: operation.status,
    observedAt: operation.completedAt ?? operation.requestedAt,
    meta: operation.meta,
  }))
}

function actionCallback(explicitCallback, onAction, actionId, payload) {
  if (typeof explicitCallback === 'function') return explicitCallback(payload)
  if (typeof onAction === 'function') return onAction(actionId, payload)
  return undefined
}

/**
 * Projection-only Code World screen.
 *
 * `model` is expected to be produced by the Source Lens adapter:
 * {
 *   repository: { id, label, path, branch, observedAt },
 *   districts: [{
 *     id, label, description, position?, size?,
 *     components: [{
 *       id, label, summary, technicalSummary, kind,
 *       position?, parts|modules|items|files: [{
 *         id, label, path, summary, technicalSummary, lineStart, lineEnd,
 *         evidence?, status?
 *       }]
 *     }]
 *   }],
 *   relations: [{ id, source|sourceId, target|targetId, label?, edgeType? }],
 *   delivery?: { id, label, description, position?, size?, stages: [...] },
 *   systems?: [{ id, label, kind, description, position?, size?, status? }],
 *   observations?: [{ id, label, detail, status, observedAt, meta? }],
 *   initialViewport?: { x, y, zoom },
 *   initialSelectionId?: string,
 *   permissions?: { editPolicyNote?: string }
 * }
 */
export default function CodeWorldScreen({
  model,
  sourceState = null,
  localConnectorState = null,
  selectedId: controlledSelectedId,
  query: controlledQuery,
  audienceMode: controlledAudienceMode,
  actionState = null,
  onSelectionChange,
  onQueryChange,
  onAudienceModeChange,
  onRefresh,
  onTraceImpact,
  onCompareChanges,
  onProposeEdit,
  onViewObservations,
  onToolbarAction,
  onAction,
  onBack,
  onClose,
}) {
  const repository = model?.repository ?? null
  const [internalSelectedId, setInternalSelectedId] = useState(
    safeText(model?.initialSelectionId),
  )
  const [internalQuery, setInternalQuery] = useState('')
  const [internalAudienceMode, setInternalAudienceMode] = useState('developer')
  const [traceActive, setTraceActive] = useState(false)
  const [flowInstance, setFlowInstance] = useState(null)
  const selectedId = controlledSelectedId !== undefined ? safeText(controlledSelectedId) : internalSelectedId
  const query = controlledQuery !== undefined ? safeText(controlledQuery) : internalQuery
  const audienceMode = controlledAudienceMode !== undefined
    ? safeText(controlledAudienceMode, 'developer')
    : internalAudienceMode
  const connection = useMemo(
    () => connectionView(sourceState, localConnectorState, repository),
    [sourceState, localConnectorState, repository],
  )

  const selectAsset = useCallback((nextId) => {
    const normalized = safeText(nextId)
    if (controlledSelectedId === undefined) setInternalSelectedId(normalized)
    setTraceActive(!!normalized)
    onSelectionChange?.(normalized)
  }, [controlledSelectedId, onSelectionChange])

  const changeQuery = useCallback((event) => {
    const nextQuery = event.target.value
    if (controlledQuery === undefined) setInternalQuery(nextQuery)
    onQueryChange?.(nextQuery)
  }, [controlledQuery, onQueryChange])

  const changeAudienceMode = useCallback((nextMode) => {
    if (!Object.hasOwn(AUDIENCE_LABELS, nextMode)) return
    if (controlledAudienceMode === undefined) setInternalAudienceMode(nextMode)
    onAudienceModeChange?.(nextMode)
  }, [controlledAudienceMode, onAudienceModeChange])

  const projection = useMemo(() => graphProjection(model, {
    audienceMode,
    query,
    selectedId,
    traceActive,
    onSelect: selectAsset,
  }), [model, audienceMode, query, selectedId, traceActive, selectAsset])

  useEffect(() => {
    if (!selectedId || projection.assetById.has(selectedId)) return
    if (controlledSelectedId === undefined) setInternalSelectedId('')
    setTraceActive(false)
  }, [controlledSelectedId, projection.assetById, selectedId])

  const selected = projection.assetById.get(selectedId) ?? repository
  const selectedIsRepository = selected === repository
  const selectedEvidence = evidenceRows(selected)
  const selectedNodeId = projection.nodeIdByAssetId.get(selectedId)
  const impacted = useMemo(() => {
    const result = new Map()
    for (const relation of projection.relatedRelations) {
      const sourceId = idOf(relation.sourceId ?? relation.source)
      const targetId = idOf(relation.targetId ?? relation.target)
      const sourceNodeId = projection.nodeIdByAssetId.get(sourceId)
      const targetNodeId = projection.nodeIdByAssetId.get(targetId)
      const otherId = sourceNodeId === selectedNodeId ? targetId : sourceId
      const otherRelationNodeId = sourceNodeId === selectedNodeId ? targetNodeId : sourceNodeId
      if (!otherRelationNodeId || otherRelationNodeId === selectedNodeId) continue
      const otherNodeId = projection.nodeIdByAssetId.get(otherId)
      if (!otherNodeId || otherNodeId === selectedNodeId) continue
      const asset = projection.assetById.get(otherId)
        ?? [...projection.assetById.entries()].find(([, candidate]) => (
          projection.nodeIdByAssetId.get(idOf(candidate)) === otherNodeId
        ))?.[1]
      if (asset) result.set(idOf(asset), asset)
    }
    return [...result.values()]
  }, [projection, selectedId, selectedNodeId])
  const observations = useMemo(
    () => observationRows(model, sourceState, localConnectorState),
    [model, sourceState, localConnectorState],
  )
  const actionPayload = useMemo(() => ({
    selected,
    selectedId,
    relations: projection.relatedRelations,
    repository,
    model,
  }), [selected, selectedId, projection.relatedRelations, repository, model])
  const canRefresh = typeof onRefresh === 'function' || typeof onAction === 'function'
  const canTrace = !!selectedId && (typeof onTraceImpact === 'function' || typeof onAction === 'function')
  const canCompare = !!selectedId && (typeof onCompareChanges === 'function' || typeof onAction === 'function')
  const canPropose = !!selectedId
    && selected?.editable !== false
    && (typeof onProposeEdit === 'function' || typeof onAction === 'function')
  const busy = !!actionState?.busy

  const fitGraph = useCallback(() => {
    flowInstance?.fitView({ padding: 0.1, minZoom: 0.12, maxZoom: 1.15, duration: 280 })
    onToolbarAction?.('fit-view', { model })
  }, [flowInstance, model, onToolbarAction])

  const toggleTrace = useCallback(() => {
    const next = !traceActive
    setTraceActive(next)
    if (next) actionCallback(onTraceImpact, onAction, 'trace-impact', actionPayload)
  }, [traceActive, onTraceImpact, onAction, actionPayload])

  const repositoryLabel = safeText(
    repository?.label,
    safeText(repository?.name, safeText(connection.label, '연결된 저장소')),
  )
  const sourceStatus = statusId(sourceState?.status, connection.status)
  const sourceStatusText = sourceState?.loading
    ? '분석 중'
    : sourceState?.error
      ? '분석 오류'
      : statusLabel(sourceStatus)

  return (
    <section className="code-world-screen" aria-label={`${repositoryLabel} 코드 세계`}>
      <header className="code-world-breadcrumb-bar">
        <nav aria-label="코드 세계 경로">
          <span>시스템 지도</span>
          <span>{repositoryLabel}</span>
          <strong>코드 세계</strong>
        </nav>
        <div className="code-world-source-status" aria-live="polite">
          <span className={`code-world-status-dot is-${sourceStatus}`} />
          <strong>Source Lens</strong>
          <span>{sourceStatusText}</span>
          {connection.observedAt && <time>{formatRelativeTime(connection.observedAt)}</time>}
        </div>
      </header>

      <div className="code-world-context-bar">
        <button type="button" className="code-world-back-button" onClick={onBack} disabled={!onBack}>
          상위로
        </button>
        <div className="code-world-title">
          <h1>코드 세계</h1>
          <span>{repositoryLabel}</span>
          {connection.branch && <code>{connection.branch}</code>}
        </div>
        <label className="code-world-search">
          <span>검색</span>
          <input
            type="search"
            value={query}
            onChange={changeQuery}
            placeholder="컴포넌트, 파일 검색"
            aria-label="코드 세계 검색"
          />
        </label>
        <div className="code-world-audience-toggle" role="group" aria-label="설명 수준">
          {Object.entries(AUDIENCE_LABELS).map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              className={audienceMode === mode ? 'is-active' : ''}
              aria-pressed={audienceMode === mode}
              onClick={() => changeAudienceMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        {onClose && (
          <button type="button" className="code-world-close-button" onClick={onClose}>
            닫기
          </button>
        )}
      </div>

      <div className="code-world-main">
        <div className="code-world-canvas">
          <div className="code-world-floating-toolbar" role="toolbar" aria-label="코드 세계 도구">
            <button
              type="button"
              onClick={() => onToolbarAction?.('add-node', { model })}
              disabled={!onToolbarAction}
            >
              노드
            </button>
            <button type="button" onClick={fitGraph}>전체 보기</button>
            <button
              type="button"
              className={traceActive ? 'is-active' : ''}
              onClick={toggleTrace}
              disabled={!selectedId}
            >
              관계 보기
            </button>
            <button type="button" onClick={onBack} disabled={!onBack}>돌아가기</button>
          </div>

          {projection.nodes.length > 0 ? (
            <ReactFlow
              nodes={projection.nodes}
              edges={projection.edges}
              nodeTypes={NODE_TYPES}
              onInit={setFlowInstance}
              onPaneClick={() => selectAsset('')}
              fitView={!model?.initialViewport}
              fitViewOptions={{ padding: 0.1, minZoom: 0.12, maxZoom: 1.15 }}
              defaultViewport={model?.initialViewport}
              minZoom={0.1}
              maxZoom={1.8}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesReconnectable={false}
              elementsSelectable={false}
              deleteKeyCode={null}
              panOnScroll
              selectionOnDrag={false}
              defaultEdgeOptions={{ type: 'smoothstep' }}
            >
              <Background
                variant={BackgroundVariant.Lines}
                color="#e8ecef"
                gap={24}
                size={1}
              />
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          ) : (
            <div className="code-world-empty-state">
              <strong>표시할 코드 구조가 없습니다.</strong>
              <span>Source Lens 분석 결과가 준비되면 영역과 컴포넌트가 여기에 나타납니다.</span>
              {canRefresh && (
                <button
                  type="button"
                  onClick={() => actionCallback(onRefresh, onAction, 'refresh', actionPayload)}
                  disabled={busy}
                >
                  다시 분석
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="code-world-inspector" aria-label="선택한 코드 상세">
          <header>
            <div>
              <span>{selectedIsRepository ? '저장소' : safeText(selected?.kindLabel, safeText(selected?.kind, '코드 파트'))}</span>
              <h2>{safeText(selected?.label, safeText(selected?.name, '선택한 코드'))}</h2>
            </div>
            {selectedId && (
              <button type="button" onClick={() => selectAsset('')}>선택 해제</button>
            )}
          </header>

          <div className="code-world-connection-state">
            <span className={`code-world-status-dot is-${connection.status}`} />
            <strong>{statusLabel(connection.status)}</strong>
            {connection.observedAt && <span>{formatRelativeTime(connection.observedAt)} 관측</span>}
          </div>

          <section className="code-world-inspector-section">
            <h3>무엇을 하는가</h3>
            <p>
              {itemDescription(selected, audienceMode)
                || (selectedIsRepository
                  ? '이 저장소에서 Source Lens가 발견한 코드 구조와 관계를 보여줍니다.'
                  : '설명 근거가 아직 연결되지 않았습니다.')}
            </p>
            {audienceMode === 'developer' && selected?.path && (
              <code className="code-world-path">{selected.path}</code>
            )}
          </section>

          <section className="code-world-inspector-section">
            <h3>코드 근거</h3>
            {selectedEvidence.length > 0 ? (
              <div className="code-world-evidence-list">
                {selectedEvidence.slice(0, 5).map((evidence) => (
                  <div key={evidence.id}>
                    <code>{evidence.label}</code>
                    {evidence.detail && <span>{evidence.detail}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="code-world-inspector-empty">연결된 코드 근거 없음</p>
            )}
          </section>

          <section className="code-world-inspector-section">
            <h3>영향 받는 컴포넌트 <span>{impacted.length}</span></h3>
            {impacted.length > 0 ? (
              <div className="code-world-impact-list">
                {impacted.slice(0, 7).map((item) => (
                  <button type="button" key={idOf(item)} onClick={() => selectAsset(idOf(item))}>
                    <span>{safeText(item.label, safeText(item.name, '연결 대상'))}</span>
                    <small>{safeText(item.path, safeText(item.kindLabel, item.kind))}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="code-world-inspector-empty">
                {selectedId ? '현재 분석 결과에서 직접 연결된 영향 대상 없음' : '코드 파트를 선택하면 영향 관계를 표시합니다.'}
              </p>
            )}
          </section>

          <section className="code-world-inspector-section code-world-actions">
            <h3>작업</h3>
            <button
              type="button"
              onClick={() => actionCallback(onRefresh, onAction, 'refresh', actionPayload)}
              disabled={!canRefresh || busy}
            >
              다시 관측
              <span>현재 Source Lens 결과를 갱신합니다.</span>
            </button>
            <button type="button" onClick={toggleTrace} disabled={!canTrace || busy}>
              {traceActive ? '영향 강조 해제' : '영향 관계 따라가기'}
              <span>직접 연결된 관계를 코드에서 추적합니다.</span>
            </button>
            <button
              type="button"
              onClick={() => actionCallback(onCompareChanges, onAction, 'compare-changes', actionPayload)}
              disabled={!canCompare || busy}
            >
              변경 비교
              <span>이전 관측과 현재 구조를 비교합니다.</span>
            </button>
            <button
              type="button"
              onClick={() => actionCallback(onProposeEdit, onAction, 'propose-edit', actionPayload)}
              disabled={!canPropose || busy}
            >
              수정 제안
              <span>실행 전에 변경 계획과 근거를 확인합니다.</span>
            </button>
          </section>

          <p className="code-world-approval-note">
            {safeText(
              model?.permissions?.editPolicyNote,
              '실제 반영은 연결 권한과 승인 정책을 따릅니다.',
            )}
          </p>
          {actionState?.message && (
            <div className={`code-world-action-message is-${statusId(actionState.status, 'pending')}`}>
              {actionState.message}
            </div>
          )}
        </aside>
      </div>

      <footer className="code-world-observation-timeline">
        <header>
          <div>
            <h2>관측 기록</h2>
            <span className={`code-world-status-dot is-${connection.status}`} />
            <span>{statusLabel(connection.status)}</span>
          </div>
          <div>
            {sourceState?.autoRefresh !== false && <span>자동 갱신 켜짐</span>}
            <button type="button" onClick={onViewObservations} disabled={!onViewObservations}>
              기록 모두 보기
            </button>
          </div>
        </header>
        {observations.length > 0 ? (
          <ol>
            {observations.slice(0, 6).map((observation, index) => {
              const observationStatus = statusId(observation.status, 'declared')
              return (
                <li key={idOf(observation) || `${observation.label}:${index}`} className={`is-${observationStatus}`}>
                  <span className={`code-world-status-dot is-${observationStatus}`} />
                  <div>
                    <strong>{safeText(observation.label, '관측 기록')}</strong>
                    {observation.observedAt && <time>{formatRelativeTime(observation.observedAt)}</time>}
                    {observation.detail && <p>{observation.detail}</p>}
                    {observation.meta && (
                      <small>
                        {typeof observation.meta === 'string'
                          ? observation.meta
                          : Object.entries(observation.meta).map(([key, value]) => `${key} ${value}`).join(' · ')}
                      </small>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="code-world-empty-observations">
            아직 관측 기록이 없습니다. Source Lens 또는 로컬 커넥터가 새 상태를 보내면 여기에 쌓입니다.
          </p>
        )}
      </footer>
    </section>
  )
}
