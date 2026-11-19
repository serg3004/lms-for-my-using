/**
 * PR 482: what `RolesGuard` decided about the width of one request that a custom role opened or widened.
 * It is stored beside the request's user object (never in the token or the database) and read by the few places that
 * size a request by role: the learner view, the attempt filters and the course analytics.
 */
export type RequestScopeFlags = {
  /** A custom grant of the whole organization applies: the request is not narrowed to own courses, a team or the learner view. */
  readonly orgWide: boolean;
  /** Only a custom grant of "own" opened the route: rows are narrowed to the user's own. */
  readonly ownOnly: boolean;
};

const flagsByUser = new WeakMap<object, RequestScopeFlags>();

export function markRequestScope(user: object, flags: RequestScopeFlags): void {
  flagsByUser.set(user, flags);
}

/** True when a custom role widened this request to the whole organization. */
export function isOrgWideGrant(user: object): boolean {
  return flagsByUser.get(user)?.orgWide === true;
}

/** True when only a custom "own" grant opened this request. */
export function isOwnOnlyGrant(user: object): boolean {
  return flagsByUser.get(user)?.ownOnly === true;
}
