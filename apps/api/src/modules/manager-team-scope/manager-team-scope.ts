import type { CurrentUser } from '../auth/public.js';

export type TeamScopeActor = Pick<CurrentUser, 'id' | 'organizationId' | 'roles'>;

export function unrestrictedActor(organizationId: string): TeamScopeActor {
  return { id: '', organizationId, roles: ['admin'] };
}

export function normalizeActor(actor: TeamScopeActor | string): TeamScopeActor {
  return typeof actor === 'string' ? unrestrictedActor(actor) : actor;
}

export function isManagerTeamScoped(actor: TeamScopeActor) {
  return actor.roles.includes('manager') && !actor.roles.includes('admin');
}

export class ManagerTeamScope {
  user(actor: TeamScopeActor) {
    if (!isManagerTeamScoped(actor)) return {};
    return {
      groupMemberships: {
        some: {
          organizationId: actor.organizationId,
          group: { managers: { some: { managerId: actor.id, organizationId: actor.organizationId } } },
        },
      },
    };
  }

  group(actor: TeamScopeActor) {
    if (!isManagerTeamScoped(actor)) return {};
    return { managers: { some: { managerId: actor.id, organizationId: actor.organizationId } } };
  }

  assignment(actor: TeamScopeActor) {
    if (!isManagerTeamScoped(actor)) return {};
    return { OR: [{ user: this.user(actor) }, { group: this.group(actor) }] };
  }

  userOwnedResource(actor: TeamScopeActor) {
    if (!isManagerTeamScoped(actor)) return {};
    return { user: this.user(actor) };
  }
}
