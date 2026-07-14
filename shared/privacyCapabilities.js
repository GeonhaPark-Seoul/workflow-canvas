export const CANVAS_PRIVACY_CAPABILITIES = Object.freeze({
  storageMode: 'server-readable-json',
  operatorBlind: false,
  endToEndEncryption: false,
  serverAccessAudit: 'database-append-only',
  auditCoversDirectDatabaseOwnerAccess: false,
  publicReleaseGate: 'blocked-pending-operator-blind-storage',
})

export const CANVAS_ENCRYPTION_TRANSITION = Object.freeze({
  targetEnvelope: 'canvas-content-v1',
  encryptedFields: Object.freeze(['name', 'nodes', 'edges', 'notes', 'views', 'stage_types']),
  serverReadableRoutingFields: Object.freeze(['user_id', 'canvas_id', 'updated_at']),
  compatibilityGates: Object.freeze([
    'participant-key-wrapping',
    'client-side-scope-redaction',
    'ciphertext-conflict-resolution',
    'explicit-mcp-key-delegation',
    'recovery-key-flow',
  ]),
})

export function assertPrivacyReleaseGate(env = process.env) {
  if (env.WORKFLOW_CANVAS_PUBLIC_RELEASE !== 'true') return CANVAS_PRIVACY_CAPABILITIES
  if (!CANVAS_PRIVACY_CAPABILITIES.operatorBlind || !CANVAS_PRIVACY_CAPABILITIES.endToEndEncryption) {
    throw new Error(
      '공개 출시 게이트 차단: 현재 캔버스 본문은 서버에서 읽을 수 있습니다. ' +
      '클라이언트 암호화와 참여자 키 공유를 완료하기 전 operator-blind라고 표시할 수 없습니다.',
    )
  }
  return CANVAS_PRIVACY_CAPABILITIES
}
