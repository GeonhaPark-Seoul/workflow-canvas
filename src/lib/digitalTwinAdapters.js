// Domain adapters translate source-specific observations into one review model.
// Logistics, CRM, finance, health, or other systems can be registered here
// without teaching the review UI their schemas.
export const DIGITAL_TWIN_ADAPTERS = Object.freeze([
  {
    id: 'workflow-system-discovery',
    canInspect(canvas) {
      const ids = new Set((canvas?.nodes ?? []).map((node) => node.id))
      return ['map-web-app', 'map-mcp-api', 'map-postgres', 'map-canvases-table']
        .every((id) => ids.has(id))
    },
    load: () => import('../../shared/workflowSystemTwinAdapter.js')
      .then((module) => module.workflowSystemTwinAdapter),
  },
])

export async function inspectDigitalTwinCanvas(canvas) {
  const registration = DIGITAL_TWIN_ADAPTERS.find((candidate) => candidate.canInspect(canvas))
  if (!registration) return null
  const adapter = await registration.load()
  return adapter.inspect(canvas)
}
