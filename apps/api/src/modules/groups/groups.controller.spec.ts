import { rolePolicies, rolesMetadataKey } from '../auth/roles.js';
import { GroupsController } from './groups.controller.js';

describe('GroupsController authorization', () => {
  it.each([
    ['createGroup', rolePolicies.groupsWrite],
    ['updateGroup', rolePolicies.groupsWrite],
    ['addMember', rolePolicies.groupMembersWrite],
    ['removeMember', rolePolicies.groupMembersWrite],
    ['addManager', rolePolicies.groupManagersWrite],
    ['removeManager', rolePolicies.groupManagersWrite],
  ] as const)('protects %s with its dedicated mutation policy', (handlerName, expectedRoles) => {
    const roles = Reflect.getMetadata(rolesMetadataKey, GroupsController.prototype[handlerName]);

    expect(roles).toEqual(expectedRoles);
  });

  it('never permits managers to mutate a group manager set', () => {
    expect(rolePolicies.groupManagersWrite).toEqual(['admin']);
  });
});
