import assert from 'node:assert/strict'

import {
  composeSharePermission,
  invitationAuthorizingGrants,
  permissionCanInviteScope,
} from '../shared/sharePermissions.js'

const nodes = [
  { id: 'group-a', type: 'group' },
  { id: 'group-b', type: 'group' },
  { id: 'node-a', type: 'stage', parentId: 'group-a' },
  { id: 'node-b', type: 'stage', parentId: 'group-b' },
]

const permission = composeSharePermission([
  { id: 'share-a', scope: 'group', target_id: 'group-a', can_edit: true, can_invite: true, restrict_view: true },
  { id: 'share-b', scope: 'node', target_id: 'node-b', can_edit: false, can_invite: false, restrict_view: false },
])

assert.equal(permission.grants.length, 2, '여러 그룹·노드 초대는 하나의 권한 합성에 모두 남아야 합니다.')
assert.equal(permission.canEdit, true)
assert.equal(permission.canInvite, true)
assert.equal(permissionCanInviteScope(permission, 'group', 'group-a', nodes), true)
assert.equal(permissionCanInviteScope(permission, 'node', 'node-a', nodes), true, '그룹 초대권한은 그 그룹의 자식 노드까지 위임할 수 있습니다.')
assert.equal(permissionCanInviteScope(permission, 'node', 'node-b', nodes), false)
assert.equal(permissionCanInviteScope(permission, 'group', 'group-b', nodes), false)
assert.equal(permissionCanInviteScope(permission, 'canvas', null, nodes), false)
assert.equal(invitationAuthorizingGrants(permission, 'node', 'node-a', nodes)[0].restrictView, true)

const canvasPermission = composeSharePermission([
  { id: 'share-canvas', scope: 'canvas', can_edit: false, can_invite: true, restrict_view: false },
])
assert.equal(permissionCanInviteScope(canvasPermission, 'canvas', null, nodes), true)
assert.equal(invitationAuthorizingGrants(canvasPermission, 'group', 'group-b', nodes)[0].canEdit, false)

console.log('Composed sharing and bounded invitation permission checks passed')
