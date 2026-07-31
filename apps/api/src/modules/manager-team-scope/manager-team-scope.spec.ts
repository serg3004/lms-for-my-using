import { ManagerTeamScope, isManagerTeamScoped } from './manager-team-scope';

const organizationId = '11111111-1111-4111-8111-111111111111';
const manager = { id: '22222222-2222-4222-8222-222222222222', organizationId, roles: ['manager'] };

describe('ManagerTeamScope', () => {
  const scope = new ManagerTeamScope();

  it('scopes users through every group managed by the manager and the current tenant', () => {
    expect(scope.user(manager)).toEqual({
      groupMemberships: { some: {
        organizationId,
        group: { managers: { some: { managerId: manager.id, organizationId } } },
      } },
    });
  });

  it('includes direct team users and managed-group assignments', () => {
    expect(scope.assignment(manager)).toEqual({
      OR: [{ user: scope.user(manager) }, { group: scope.group(manager) }],
    });
  });

  it('applies team ownership to progress, results, reports, and certificates', () => {
    expect(scope.userOwnedResource(manager)).toEqual({ user: scope.user(manager) });
  });

  it('keeps admins unrestricted, including users who also have manager role', () => {
    const admin = { ...manager, roles: ['manager', 'admin'] };
    expect(isManagerTeamScoped(admin)).toBe(false);
    expect(scope.user(admin)).toEqual({});
    expect(scope.assignment(admin)).toEqual({});
  });

  it('does not apply manager scope to other roles', () => {
    expect(scope.user({ ...manager, roles: ['instructor'] })).toEqual({});
  });
});
