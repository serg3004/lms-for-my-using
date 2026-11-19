import type { Page } from '@playwright/test';

/** PR 485: a small in-memory custom roles API for the e2e and visual tests of "Roles and permissions". */

export const orgId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const annaId = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
export const olegId = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';

type Grant = { action: string; scope: string };
type Role = { id: string; name: string; description: string | null; state: 'active' | 'archived'; version: number; permissions: Grant[] };
export type RolesState = { roles: Role[]; assignments: Array<{ roleId: string; userId: string }>; enabled: boolean; calls: string[]; conflictOnce: boolean };

const people = [
  { id: annaId, organizationId: orgId, email: 'anna@example.invalid', firstName: 'Анна', lastName: 'Иванова', middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'ru', timezone: 'UTC', lastLoginAt: null, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', memberships: [{ role: 'learner' }] },
  { id: olegId, organizationId: orgId, email: 'oleg@example.invalid', firstName: 'Олег', lastName: 'Петров', middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'ru', timezone: 'UTC', lastLoginAt: null, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', memberships: [{ role: 'learner' }] },
];

export const registrar: Role = { id: '11111111-1111-4111-8111-111111111111', name: 'Регистратор', description: 'Заводит учеников своего подразделения', state: 'active', version: 2, permissions: [{ action: 'user.read', scope: 'department' }, { action: 'user.create', scope: 'department' }] };
const archivedRole: Role = { id: '22222222-2222-4222-8222-222222222222', name: 'Старый наблюдатель', description: null, state: 'archived', version: 5, permissions: [{ action: 'checklist.session.read', scope: 'team' }] };

export function freshRolesState(options: { seeded?: boolean; enabled?: boolean } = {}): RolesState {
  const seeded = options.seeded ?? true;
  return { roles: seeded ? [structuredClone(registrar), structuredClone(archivedRole)] : [], assignments: seeded ? [{ roleId: registrar.id, userId: olegId }] : [], enabled: options.enabled ?? false, calls: [], conflictOnce: false };
}

const respond = (status: number, message: string) => ({ status, json: { statusCode: status, error: { code: status === 409 ? 'CONFLICT' : 'HTTP_ERROR', message }, path: '/', timestamp: '2026-11-19T10:00:00.000Z', message } });

export async function installCustomRolesMocks(page: Page, state: RolesState) {
  let counter = 100;
  const effective = (userId: string) => {
    const held = state.assignments.filter((item) => item.userId === userId).map((item) => state.roles.find((role) => role.id === item.roleId)).filter((role): role is Role => Boolean(role && role.state === 'active'));
    const scopes = new Map<string, Set<string>>();
    if (state.enabled) for (const role of held) for (const grant of role.permissions) (scopes.get(grant.action) ?? scopes.set(grant.action, new Set()).get(grant.action)!).add(grant.scope);
    return { customRolesEnabled: state.enabled, customRoles: held.map((role) => ({ id: role.id, name: role.name })), permissions: [...scopes.entries()].map(([action, set]) => ({ action, builtIn: false, scopes: [...set] })) };
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    const body = request.postData() ? JSON.parse(request.postData() ?? '{}') as Record<string, unknown> : {};
    if (path === '/auth/me') return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', organizationId: orgId, firstName: 'Админ', lastName: 'Системы', email: 'admin@example.invalid', roles: ['admin'], locale: 'ru', timezone: 'UTC', status: 'active' } });
    if (path.endsWith('/theme')) return route.fulfill({ json: { themeSettings: {} } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === `/organizations/${orgId}/features`) {
      if (method === 'PATCH') { state.calls.push(`features ${JSON.stringify(body)}`); state.enabled = body.customRolesEnabled === true; }
      return route.fulfill({ json: { longreadEnabled: false, customRolesEnabled: state.enabled } });
    }
    if (path === '/users') return route.fulfill({ json: { items: people, total: people.length, page: 1, pageSize: 20 } });
    if (path === '/custom-roles' && method === 'GET') return route.fulfill({ json: state.roles.map((role) => ({ ...role, userCount: state.assignments.filter((item) => item.roleId === role.id).length })) });
    if (path === '/custom-roles' && method === 'POST') {
      state.calls.push(`create ${JSON.stringify(body)}`);
      if (state.roles.some((role) => role.name === body.name)) return route.fulfill(respond(409, 'A role with this name already exists'));
      const based = state.roles.find((role) => role.id === body.basedOnRoleId);
      const role: Role = { id: `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`, name: String(body.name), description: (body.description as string | null) ?? based?.description ?? null, state: 'active', version: 1, permissions: (body.permissions as Grant[] | undefined) ?? based?.permissions ?? [] };
      state.roles.push(role);
      return route.fulfill({ status: 201, json: role });
    }
    const effectiveMatch = /^\/custom-roles\/users\/([^/]+)\/permissions$/.exec(path);
    if (effectiveMatch) return route.fulfill({ json: effective(effectiveMatch[1]!) });
    const assignment = /^\/custom-roles\/([^/]+)\/assignments(?:\/([^/]+))?$/.exec(path);
    if (assignment) {
      const [, roleId, userId] = assignment;
      if (!userId) return route.fulfill({ json: state.assignments.filter((item) => item.roleId === roleId).map((item) => { const user = people.find((person) => person.id === item.userId)!; return { userId: user.id, assignedAt: '2026-11-19T10:00:00.000Z', email: user.email, firstName: user.firstName, lastName: user.lastName }; }) });
      if (method === 'PUT') { state.calls.push(`assign ${roleId} ${userId}`); if (!state.assignments.some((item) => item.roleId === roleId && item.userId === userId)) state.assignments.push({ roleId: roleId!, userId: userId! }); return route.fulfill({ json: { userId, roleId, state: 'active' } }); }
      if (method === 'DELETE') { state.calls.push(`revoke ${roleId} ${userId}`); state.assignments = state.assignments.filter((item) => !(item.roleId === roleId && item.userId === userId)); return route.fulfill({ status: 204, body: '' }); }
    }
    const archive = /^\/custom-roles\/([^/]+)\/archive$/.exec(path);
    if (archive && method === 'POST') {
      const role = state.roles.find((item) => item.id === archive[1]);
      if (!role) return route.fulfill(respond(404, 'Role not found'));
      state.calls.push(`archive ${role.id} v${String(body.version)}`);
      role.state = 'archived'; role.version += 1;
      return route.fulfill({ json: role });
    }
    const one = /^\/custom-roles\/([^/]+)$/.exec(path);
    if (one && method === 'PATCH') {
      const role = state.roles.find((item) => item.id === one[1]);
      if (!role) return route.fulfill(respond(404, 'Role not found'));
      if (state.conflictOnce) { state.conflictOnce = false; role.name = 'Название от коллеги'; role.version += 1; return route.fulfill(respond(409, 'The role was changed by someone else, reload it')); }
      state.calls.push(`update ${role.id} v${String(body.version)}`);
      if (body.version !== role.version) return route.fulfill(respond(409, 'The role was changed by someone else, reload it'));
      if (typeof body.name === 'string') role.name = body.name;
      if ('description' in body) role.description = body.description as string | null;
      if (body.permissions) role.permissions = body.permissions as Grant[];
      role.version += 1;
      return route.fulfill({ json: role });
    }
    return route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100 } });
  });
}
