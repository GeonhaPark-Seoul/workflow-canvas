const VALID_SCOPES = new Set(['canvas', 'group', 'node'])

export function normalizeShareGrant(grant = {}) {
  const scope = VALID_SCOPES.has(grant.scope) ? grant.scope : 'node'
  const targetId = scope === 'canvas' ? null : (grant.targetId ?? grant.target_id ?? null)
  return {
    shareId: grant.shareId ?? grant.id ?? null,
    scope,
    targetId,
    canEdit: (grant.canEdit ?? grant.can_edit) !== false,
    canInvite: !!(grant.canInvite ?? grant.can_invite),
    restrictView: !!(grant.restrictView ?? grant.restrict_view),
  }
}

export function composeSharePermission(grants = []) {
  const normalized = grants.map(normalizeShareGrant)
  const canEditCanvas = normalized.some((grant) => grant.scope === 'canvas' && grant.canEdit)
  const canEdit = normalized.some((grant) => grant.canEdit)
  const canInvite = normalized.some((grant) => grant.canInvite)
  const restrictView = normalized.length > 0 && !normalized.some((grant) => (
    grant.scope === 'canvas' || !grant.restrictView
  ))
  const single = normalized.length === 1 ? normalized[0] : null
  return {
    role: 'invitee',
    scope: single?.scope ?? 'composed',
    targetId: single?.targetId ?? null,
    canEdit,
    canEditCanvas,
    canInvite,
    restrictView,
    grants: normalized,
  }
}

export function permissionFromAccess(access = {}) {
  if (access.role === 'owner') {
    return {
      role: 'owner', scope: 'canvas', targetId: null, canEdit: true,
      canEditCanvas: true, canInvite: true, restrictView: false, grants: [],
    }
  }
  if (Array.isArray(access.grants) && access.grants.length) return composeSharePermission(access.grants)
  if (!access.scope) return composeSharePermission([])
  return composeSharePermission([access])
}

function grantCoversInvitation(grant, scope, targetId, nodes) {
  if (!grant.canInvite) return false
  if (grant.scope === 'canvas') return true
  if (scope === 'canvas') return false
  if (grant.scope === 'node') return scope === 'node' && grant.targetId === targetId
  if (scope === 'group') return grant.targetId === targetId
  const target = (nodes ?? []).find((node) => node.id === targetId)
  return target?.parentId === grant.targetId
}

export function invitationAuthorizingGrants(permission, scope, targetId, nodes = []) {
  const resolved = permissionFromAccess(permission)
  if (resolved.role === 'owner') return [{
    scope: 'canvas', targetId: null, canEdit: true, canInvite: true, restrictView: false,
  }]
  return resolved.grants.filter((grant) => grantCoversInvitation(grant, scope, targetId, nodes))
}

export function permissionCanInviteScope(permission, scope, targetId, nodes = []) {
  return invitationAuthorizingGrants(permission, scope, targetId, nodes).length > 0
}

export function editableGroupIdSet(permission) {
  const resolved = permissionFromAccess(permission)
  return new Set(resolved.grants
    .filter((grant) => grant.scope === 'group' && grant.canEdit && grant.targetId)
    .map((grant) => grant.targetId))
}

export function editableNodeIdSetForPermission(permission, nodes = []) {
  const resolved = permissionFromAccess(permission)
  if (resolved.role === 'owner' || resolved.canEditCanvas) return null
  const groupIds = editableGroupIdSet(resolved)
  const editable = new Set(resolved.grants
    .filter((grant) => grant.scope === 'node' && grant.canEdit && grant.targetId)
    .map((grant) => grant.targetId))
  for (const node of nodes) {
    if (groupIds.has(node.parentId)) editable.add(node.id)
  }
  return editable
}

export function visibleNodeIdSetForPermission(permission, nodes = []) {
  const resolved = permissionFromAccess(permission)
  if (resolved.role === 'owner' || !resolved.restrictView) return null
  const visible = new Set()
  const groupIds = new Set()
  for (const grant of resolved.grants) {
    if (!grant.targetId) continue
    visible.add(grant.targetId)
    if (grant.scope === 'group') groupIds.add(grant.targetId)
  }
  for (const node of nodes) {
    if (groupIds.has(node.parentId)) visible.add(node.id)
  }
  return visible
}

export function permissionCanEditNodeStructure(permission, node) {
  const resolved = permissionFromAccess(permission)
  if (resolved.role === 'owner' || resolved.canEditCanvas) return true
  return editableGroupIdSet(resolved).has(node?.parentId)
}

export function permissionCanCreateInGroup(permission, groupId) {
  const resolved = permissionFromAccess(permission)
  if (resolved.role === 'owner' || resolved.canEditCanvas) return true
  return editableGroupIdSet(resolved).has(groupId)
}

export function permissionCanEditEdge(permission, sourceNode, targetNode) {
  const resolved = permissionFromAccess(permission)
  if (resolved.role === 'owner' || resolved.canEditCanvas) return true
  const groupIds = editableGroupIdSet(resolved)
  return groupIds.has(sourceNode?.parentId) && groupIds.has(targetNode?.parentId)
}
