import { defineSourceProfile, resolveSourceProfile, SOURCE_PROFILE_CONTRACT_VERSION } from '../../shared/sourceProfileContract.js'
import { FASTAPI_ORDER_SERVICE_SOURCE_PROFILE } from './fastapi-order-service.mjs'
import { WORKFLOW_CANVAS_SOURCE_PROFILE } from './workflow-canvas.mjs'

export const GENERIC_SOURCE_PROFILE = defineSourceProfile({
  contractVersion: SOURCE_PROFILE_CONTRACT_VERSION,
  id: 'generic-web-application',
  version: '0.1.0',
  sourceId: 'software:source',
  label: 'Generic Web Application Source Profile',
  projectLabel: '소프트웨어',
  priority: -1_000,
  match: { fallback: true },
  capabilities: ['file-structure', 'javascript-ast', 'sql-declarations', 'deterministic-explanations'],
  languageSupport: [
    { language: 'javascript', level: 'parsed', note: 'Babel AST 기반 구조 분석' },
    { language: 'jsx', level: 'parsed', note: 'Babel AST 기반 구조 분석' },
    { language: 'sql', level: 'parsed', note: '제한된 선언 구조 분석' },
  ],
  fileRoles: {},
})

export const DEFAULT_SOURCE_PROFILES = Object.freeze([
  WORKFLOW_CANVAS_SOURCE_PROFILE,
  FASTAPI_ORDER_SERVICE_SOURCE_PROFILE,
  GENERIC_SOURCE_PROFILE,
])

export function registeredSourceProfile(context, profiles = DEFAULT_SOURCE_PROFILES) {
  return resolveSourceProfile(profiles, context)
}
