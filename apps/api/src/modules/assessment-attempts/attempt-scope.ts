import { isOwnOnlyGrant } from '../auth/public.js';
import type { ManagerTeamScope, TeamScopeActor } from '../manager-team-scope/public.js';

/**
 * Which attempts a viewer may read: the manager's team (built-in manager, or a custom team grant carried as one), all of
 * them for the administrator and a custom whole-organization grant, and only the viewer's own when a custom "own" grant
 * alone opened the route (PR 482).
 */
export function attemptScope(teamScope: ManagerTeamScope, actor: TeamScopeActor) {
  return { ...teamScope.userOwnedResource(actor), ...(isOwnOnlyGrant(actor) ? { userId: actor.id } : {}) };
}
