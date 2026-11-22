/**
 * PR 506: what a kiosk session (opened by a badge) may call. Everything else, in particular reports, other people's data,
 * settings, administration and the person's own profile, is closed at the guard, whatever the roles of the person are.
 * The list is deliberately short and lives in one place: a new route is closed to badges until it is added here.
 */
/** Identifiers are UUIDs, so words such as `free` or `analytics` in the same place never match. */
const id = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const routes: Array<[method: string, pattern: RegExp]> = [
  // The person's own assigned work: the home page and assignments.
  ['GET', /^\/learner-dashboard$/],
  ['GET', /^\/assignments$/],
  ['GET', new RegExp(`^/assignments/${id}$`)],
  // Checklists: the person's own instances and sessions to conduct.
  ['GET', /^\/checklist-instances\/mine$/],
  ['GET', new RegExp(`^/checklist-instances/${id}$`)],
  ['PATCH', new RegExp(`^/checklist-instances/${id}/items/${id}$`)],
  ['DELETE', new RegExp(`^/checklist-instances/${id}/items/${id}/answer$`)],
  ['POST', new RegExp(`^/checklist-instances/${id}/items/${id}/skip$`)],
  ['POST', new RegExp(`^/checklist-instances/${id}/items/${id}/photo$`)],
  ['DELETE', new RegExp(`^/checklist-instances/${id}/items/${id}/photo$`)],
  ['GET', new RegExp(`^/checklist-instances/${id}/items/${id}/photo(/file)?$`)],
  ['POST', new RegExp(`^/checklist-instances/${id}/finish$`)],
  ['GET', new RegExp(`^/checklists/${id}$`)],
  ['GET', new RegExp(`^/checklists/${id}/(items|groups)$`)],
  ['GET', new RegExp(`^/checklists/${id}/cover(/file)?$`)],
  ['GET', new RegExp(`^/checklists/${id}/photos/${id}/file$`)],
  ['GET', new RegExp(`^/checklist-scales(/${id})?$`)],
  ['GET', /^\/checklist-sessions\/to-conduct$/],
  ['GET', new RegExp(`^/checklist-sessions/${id}/conduct$`)],
  ['POST', new RegExp(`^/checklist-sessions/${id}/(start|pause|resume|complete|observer-unavailable)$`)],
  ['PATCH', new RegExp(`^/checklist-sessions/${id}/(feedback|context)$`)],
  ['POST', new RegExp(`^/checklist-sessions/${id}/location/[a-z]+$`)],
  // Tests: taking an assigned test and seeing the person's own result.
  ['GET', /^\/assessments$/],
  ['GET', new RegExp(`^/assessments/${id}$`)],
  ['GET', new RegExp(`^/assessments/${id}/(attempts|quiz)$`)],
  ['POST', new RegExp(`^/assessments/${id}/attempts(/start)?$`)],
  ['GET', new RegExp(`^/attempts/${id}(/result)?$`)],
  // Courses: reading a course and its lessons, exercises inside a lesson, progress.
  ['GET', /^\/courses$/],
  ['GET', /^\/courses\/summary$/],
  ['GET', new RegExp(`^/courses/${id}(/completion|/lessons|/materials)?$`)],
  ['GET', new RegExp(`^/lessons/${id}$`)],
  ['GET', new RegExp(`^/lessons/${id}/longread/exercises$`)],
  ['POST', new RegExp(`^/lessons/${id}/longread/exercises/(${id}/attempts|finish)$`)],
  ['GET', new RegExp(`^/lessons/${id}/longread/files/${id}/download$`)],
  ['GET', new RegExp(`^/materials/${id}/download$`)],
  ['GET', new RegExp(`^/progress(/summary|/${id})?$`)],
  ['POST', /^\/progress$/],
];

/** What the API answers to a kiosk session outside the list; `details[0].code` lets the screen tell it from a missing right. */
export function kioskRestrictedBody() {
  return { error: { code: 'FORBIDDEN', message: 'This session opened by a badge cannot use this function', details: [{ code: 'KIOSK_SESSION_RESTRICTED', message: 'This session opened by a badge cannot use this function' }] } };
}

const apiPrefix = /^\/api\/v1(?=\/)/;

/** `urlPath` is the path of the request, with or without the `/api/v1` prefix and without the query. */
export function isKioskRoute(method: string | undefined, urlPath: string | undefined): boolean {
  if (!method || !urlPath) return false;
  const path = urlPath.replace(apiPrefix, '').replace(/\/+$/, '') || '/';
  const verb = method.toUpperCase();
  return routes.some(([allowed, pattern]) => allowed === verb && pattern.test(path));
}

/** The calls that end the work of a kiosk session: after one of them the session is closed and the screen returns to the scan. */
const finishing: Array<[string, RegExp]> = [
  ['POST', new RegExp(`^/checklist-instances/${id}/finish$`)],
  ['POST', new RegExp(`^/checklist-sessions/${id}/complete$`)],
  ['POST', new RegExp(`^/assessments/${id}/attempts$`)],
];

export function endsKioskSession(method: string | undefined, urlPath: string | undefined): boolean {
  if (!method || !urlPath) return false;
  const path = urlPath.replace(apiPrefix, '').replace(/\/+$/, '');
  return finishing.some(([verb, pattern]) => verb === method.toUpperCase() && pattern.test(path));
}
