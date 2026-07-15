import {
  createTwinAdapterRegistration,
  createTwinAdapterRegistry,
} from '../../shared/twinAdapterContract.js'
import {
  canInspectWorkflowSystemCanvas,
  WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR,
} from '../../shared/workflowSystemTwinAdapterDescriptor.js'

// Product-specific modules stay behind registrations. The registry validates
// one adapter contract and one review schema regardless of the source system.
export const DIGITAL_TWIN_ADAPTERS = Object.freeze([
  createTwinAdapterRegistration({
    descriptor: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR,
    canInspect: canInspectWorkflowSystemCanvas,
    load: () => import('../../shared/workflowSystemTwinAdapter.js')
      .then((module) => module.workflowSystemTwinAdapter),
  }),
])

export const DIGITAL_TWIN_ADAPTER_REGISTRY = createTwinAdapterRegistry(DIGITAL_TWIN_ADAPTERS)
export const DIGITAL_TWIN_ADAPTER_DESCRIPTORS = DIGITAL_TWIN_ADAPTER_REGISTRY.descriptors

export async function inspectDigitalTwinCanvas(canvas) {
  return DIGITAL_TWIN_ADAPTER_REGISTRY.inspect(canvas)
}
