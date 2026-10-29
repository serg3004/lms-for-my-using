import type { rolePolicies, UserRole } from '../auth/public.js';

/**
 * PR 359: machine-readable copy of `docs/product/future/CHECKLIST_ROLE_PERMISSIONS_TABLE.md`, the owner's
 * table of rights for the checklist module (22 actions x 5 roles). The parity spec
 * (`checklist-role-permissions.parity.spec.ts`) keeps three things equal: this file, the markdown table
 * and `rolePolicies`. Nothing here changes API behaviour; fixing a row that differs from the code is the
 * job of the PR named in `prs` (PR 360-367, `CHECKLIST_ROLE_PERMISSIONS_PLAN.md`).
 */

/** `none` no access; `yes` allowed ("Да"); `all` whole organization; `team` own team; `own` only own rows; `assigned` only sessions assigned to the user. */
export type PermissionAccess = 'none' | 'yes' | 'all' | 'team' | 'own' | 'assigned';

export type ChecklistPermissionRole = Extract<UserRole, 'admin' | 'manager' | 'instructor' | 'mentor' | 'learner'>;

export const PERMISSION_ROLES: readonly ChecklistPermissionRole[] = ['admin', 'manager', 'instructor', 'mentor', 'learner'];

type PolicyName = keyof typeof rolePolicies;

export type ChecklistPermissionRow = {
  /** Row number in the owner's table (1-based, stable). */
  number: number;
  /** Stable action key. */
  key: string;
  /** Access per role, in `PERMISSION_ROLES` order: admin, manager, instructor / observer, mentor, employee. */
  access: readonly [PermissionAccess, PermissionAccess, PermissionAccess, PermissionAccess, PermissionAccess];
  /** `implemented`: the roles of `policies` equal the roles with access. `planned`: the code differs or has no such action yet. */
  status: 'implemented' | 'planned';
  /** PRs that bring the code to the row (required for `planned`). */
  prs?: readonly number[];
  /** `rolePolicies` entries that grant the action today; their union is compared with the table. Omitted when the code has no such action. */
  policies?: readonly PolicyName[];
  /** The role sets are equal, but the scope (organization / team / own) still differs from the row; the row stays `planned`. */
  scopeGap?: string;
};

const row = (
  number: number,
  key: string,
  access: ChecklistPermissionRow['access'],
  rest: Omit<ChecklistPermissionRow, 'number' | 'key' | 'access'>,
): ChecklistPermissionRow => ({ number, key, access, ...rest });

export const CHECKLIST_ROLE_PERMISSIONS: readonly ChecklistPermissionRow[] = [
  row(1, 'settings.write', ['yes', 'yes', 'yes', 'yes', 'none'], { status: 'implemented', policies: ['checklistWorkplaceSettingsWrite'] }),
  row(2, 'checklists.edit', ['yes', 'yes', 'yes', 'yes', 'none'], { status: 'implemented', policies: ['checklistsCreate'] }),
  row(3, 'instructor-role.grant', ['yes', 'none', 'none', 'none', 'none'], { status: 'implemented', policies: ['membershipsCreate'] }),
  row(4, 'sessions.create', ['all', 'team', 'own', 'yes', 'none'], { status: 'implemented', policies: ['checklistSessionsManage', 'checklistSessionsCreateOwn'] }),
  row(5, 'sessions.manage', ['all', 'team', 'all', 'all', 'none'], { status: 'implemented', policies: ['checklistSessionsManage'] }),
  row(6, 'sessions.conduct', ['assigned', 'assigned', 'assigned', 'assigned', 'assigned'], { status: 'implemented', policies: ['checklistSessionsRunOwn'] }),
  row(7, 'sessions.location', ['yes', 'assigned', 'assigned', 'assigned', 'assigned'], { status: 'implemented', policies: ['checklistSessionsRunOwn'] }),
  row(8, 'sessions.read', ['all', 'team', 'all', 'all', 'own'], { status: 'implemented', policies: ['checklistSessionsRead'] }),
  row(9, 'sessions.export', ['all', 'team', 'all', 'all', 'none'], { status: 'implemented', policies: ['checklistSessionsManage'] }),
  row(10, 'sessions.analytics', ['all', 'team', 'all', 'all', 'none'], { status: 'implemented', policies: ['checklistManagerAnalyticsRead'] }),
  row(11, 'review.analytics', ['all', 'team', 'all', 'all', 'none'], { status: 'implemented', policies: ['checklistReviewWrite'] }),
  row(12, 'results.recalculate', ['yes', 'yes', 'yes', 'yes', 'none'], { status: 'implemented', policies: ['checklistScoreRecalculate'] }),
  row(13, 'sessions.import', ['all', 'team', 'all', 'all', 'none'], { status: 'planned', prs: [364] }),
  row(14, 'reports.export', ['all', 'team', 'all', 'all', 'none'], { status: 'implemented', policies: ['checklistManagerAnalyticsRead'] }),
  row(15, 'access.settings', ['yes', 'none', 'none', 'none', 'none'], { status: 'planned', prs: [365] }),
  row(16, 'checklists.appearance', ['yes', 'yes', 'yes', 'yes', 'none'], { status: 'implemented', policies: ['checklistsCreate'] }),
  row(17, 'free.create', ['yes', 'none', 'none', 'none', 'none'], { status: 'planned', prs: [366], policies: ['checklistsCreate'] }),
  row(18, 'free.fill', ['yes', 'yes', 'yes', 'yes', 'yes'], { status: 'implemented', policies: ['checklistsStartFree'] }),
  row(19, 'free.analytics', ['all', 'team', 'all', 'all', 'none'], { status: 'planned', prs: [366] }),
  row(20, 'free.view', ['yes', 'yes', 'yes', 'yes', 'yes'], { status: 'planned', prs: [366] }),
  row(21, 'results.delete', ['yes', 'none', 'none', 'none', 'none'], { status: 'planned', prs: [367] }),
  row(22, 'templates.manage', ['yes', 'none', 'none', 'none', 'none'], { status: 'planned', prs: [367] }),
];

/** The roles that have any access in a row. */
export function rolesWithAccess(entry: ChecklistPermissionRow): ChecklistPermissionRole[] {
  return PERMISSION_ROLES.filter((_, index) => entry.access[index] !== 'none');
}
