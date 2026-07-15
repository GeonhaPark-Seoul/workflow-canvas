export const TRUST_TOPOLOGY_SCHEMA_VERSION = 1

export const TRUST_ZONE_KIND_DEFS = Object.freeze([
  { id: 'unknown', label: '영역 미확인' },
  { id: 'local-device', label: '로컬 기기' },
  { id: 'local-network', label: '로컬 네트워크' },
  { id: 'intranet', label: '인트라넷' },
  { id: 'private-datacenter', label: '사설 데이터센터' },
  { id: 'private-cloud', label: '사설 클라우드' },
  { id: 'public-cloud', label: '공개 클라우드' },
  { id: 'public-internet', label: '공개 인터넷' },
  { id: 'external-saas', label: '외부 SaaS' },
  { id: 'physical-site', label: '물리 공간' },
])

export const TRUST_GATEWAY_KIND_DEFS = Object.freeze([
  { id: 'unknown', label: '통로 미확인' },
  { id: 'browser-api', label: '브라우저 API' },
  { id: 'api-gateway', label: 'API 게이트웨이' },
  { id: 'local-connector', label: '로컬 커넥터' },
  { id: 'reverse-proxy', label: '리버스 프록시' },
  { id: 'vpn', label: 'VPN' },
  { id: 'firewall-rule', label: '방화벽 규칙' },
  { id: 'webhook', label: '웹훅' },
  { id: 'database-gateway', label: '데이터베이스 게이트웨이' },
  { id: 'message-broker', label: '메시지 브로커' },
  { id: 'human-transfer', label: '사람의 수동 전달' },
])

export const TRUST_GATEWAY_EXPOSURE_DEFS = Object.freeze([
  { id: 'unknown', label: '노출 미확인' },
  { id: 'closed', label: '차단됨' },
  { id: 'restricted', label: '제한 공개' },
  { id: 'public', label: '외부 공개' },
])

export const TRUST_GATEWAY_DIRECTION_DEFS = Object.freeze([
  { id: 'unknown', label: '방향 미확인' },
  { id: 'source-to-target', label: '시작에서 도착' },
  { id: 'target-to-source', label: '도착에서 시작' },
  { id: 'bidirectional', label: '양방향' },
])

const ZONE_KIND_IDS = new Set(TRUST_ZONE_KIND_DEFS.map(({ id }) => id))
const GATEWAY_KIND_IDS = new Set(TRUST_GATEWAY_KIND_DEFS.map(({ id }) => id))
const EXPOSURE_IDS = new Set(TRUST_GATEWAY_EXPOSURE_DEFS.map(({ id }) => id))
const DIRECTION_IDS = new Set(TRUST_GATEWAY_DIRECTION_DEFS.map(({ id }) => id))
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function plainText(value, maximum = 240) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

function safeId(value) {
  const id = plainText(value, 160)
  return SAFE_ID.test(id) ? id : ''
}

function uniqueTextList(value, maximumItems = 24, maximumLength = 80) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .slice(0, maximumItems)
    .map((item) => plainText(item, maximumLength))
    .filter(Boolean))]
}

export function normalizeTrustZone(value) {
  if (!plainObject(value)) return null
  const id = safeId(value.id)
  if (!id) return null
  return {
    schemaVersion: TRUST_TOPOLOGY_SCHEMA_VERSION,
    id,
    kind: ZONE_KIND_IDS.has(value.kind) ? value.kind : 'unknown',
    label: plainText(value.label, 120),
    controlOwner: plainText(value.controlOwner, 120),
    evidenceRef: plainText(value.evidenceRef, 500),
  }
}

export function normalizeTrustGateway(value) {
  if (!plainObject(value)) return null
  const id = safeId(value.id)
  const sourceZoneId = safeId(value.sourceZoneId)
  const targetZoneId = safeId(value.targetZoneId)
  if (!id || !sourceZoneId || !targetZoneId || sourceZoneId === targetZoneId) return null
  return {
    schemaVersion: TRUST_TOPOLOGY_SCHEMA_VERSION,
    id,
    kind: GATEWAY_KIND_IDS.has(value.kind) ? value.kind : 'unknown',
    sourceZoneId,
    targetZoneId,
    direction: DIRECTION_IDS.has(value.direction) ? value.direction : 'unknown',
    exposure: EXPOSURE_IDS.has(value.exposure) ? value.exposure : 'unknown',
    protocol: plainText(value.protocol, 80),
    route: plainText(value.route, 240),
    dataClasses: uniqueTextList(value.dataClasses),
    authentication: plainText(value.authentication, 120),
    authorization: plainText(value.authorization, 120),
    encryption: plainText(value.encryption, 120),
    initiator: plainText(value.initiator, 120),
    evidenceRef: plainText(value.evidenceRef, 500),
  }
}

export function analyzeTrustBoundary({ sourceZone, targetZone, gateway } = {}) {
  const source = normalizeTrustZone(sourceZone)
  const target = normalizeTrustZone(targetZone)
  if (!source || !target || source.kind === 'unknown' || target.kind === 'unknown') {
    return {
      status: 'unknown',
      valid: false,
      crossesBoundary: null,
      requiresGateway: true,
      reason: '연결 양쪽의 신뢰영역을 먼저 확인해야 합니다.',
    }
  }
  if (source.id === target.id) {
    return {
      status: 'inside-zone',
      valid: true,
      crossesBoundary: false,
      requiresGateway: false,
      reason: '같은 신뢰영역 안의 연결입니다.',
    }
  }
  const normalizedGateway = normalizeTrustGateway(gateway)
  if (!normalizedGateway) {
    return {
      status: 'unknown-gap',
      valid: false,
      crossesBoundary: true,
      requiresGateway: true,
      reason: '서로 다른 신뢰영역을 잇지만 통과 지점이 모델링되지 않았습니다.',
    }
  }
  const zonesMatch = normalizedGateway.sourceZoneId === source.id
    && normalizedGateway.targetZoneId === target.id
  if (!zonesMatch) {
    return {
      status: 'gateway-mismatch',
      valid: false,
      crossesBoundary: true,
      requiresGateway: true,
      gateway: normalizedGateway,
      reason: '게이트웨이가 연결선 양쪽의 신뢰영역과 일치하지 않습니다.',
    }
  }
  return {
    status: 'through-gateway',
    valid: true,
    crossesBoundary: true,
    requiresGateway: true,
    gateway: normalizedGateway,
    reason: '명시된 게이트웨이를 통해 신뢰영역 경계를 통과합니다.',
  }
}
