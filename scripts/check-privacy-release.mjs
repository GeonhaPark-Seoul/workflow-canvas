import { assertPrivacyReleaseGate, CANVAS_PRIVACY_CAPABILITIES } from '../shared/privacyCapabilities.js'

assertPrivacyReleaseGate(process.env)
console.log(`Privacy release gate: ${CANVAS_PRIVACY_CAPABILITIES.publicReleaseGate}`)
