import type { z } from 'zod';

import type { initialUserRoleSchema } from './users.schemas.js';

export type ImportRole = z.infer<typeof initialUserRoleSchema>;

/** Names of the built-in roles as the interface shows them, so a file made from the template in any language is understood. */
const roleNames: Record<ImportRole, string[]> = {
  learner: ['learner', 'ученик', 'оқушы', '学员'],
  instructor: ['instructor', 'инструктор', 'оқытушы', '讲师'],
  mentor: ['mentor', 'наставник', 'тәлімгер', '导师'],
  manager: ['manager', 'менеджер', '经理'],
  admin: ['admin', 'administrator', 'администратор', 'әкімші', '管理员'],
};

const byName = new Map<string, ImportRole>(
  (Object.entries(roleNames) as Array<[ImportRole, string[]]>).flatMap(([role, names]) => names.map((name) => [name, role] as const)),
);

/** The role named in an import row, or null when the name is not a built-in role. */
export function resolveImportRole(value: string): ImportRole | null {
  return byName.get(value.trim().toLowerCase()) ?? null;
}

export type ImportDepartment = { id: string; name: string };

export type DepartmentLookup =
  | { kind: 'found'; id: string }
  | { kind: 'missing' | 'outside' | 'ambiguous' };

/**
 * A department named in an import row. `allowedIds` limits a registrar to the own tree (null: no limit). Two departments with
 * the same title inside the allowed area are ambiguous, so the row is refused instead of guessing.
 */
export function lookupImportDepartment(name: string, departments: ImportDepartment[], allowedIds: string[] | null): DepartmentLookup {
  const wanted = name.trim().toLowerCase();
  const named = departments.filter((department) => department.name.trim().toLowerCase() === wanted);
  if (named.length === 0) return { kind: 'missing' };
  const inside = allowedIds === null ? named : named.filter((department) => allowedIds.includes(department.id));
  if (inside.length === 0) return { kind: 'outside' };
  const first = inside[0]!;
  return inside.length > 1 ? { kind: 'ambiguous' } : { kind: 'found', id: first.id };
}
