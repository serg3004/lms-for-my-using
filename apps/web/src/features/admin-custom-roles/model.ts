import {
  PERMISSION_ACTIONS,
  PERMISSION_GROUPS,
  findPermissionAction,
  validatePermissionGrants,
  type PermissionAction,
  type PermissionGroup,
  type PermissionLabels,
  type PermissionScope,
} from '@lms/shared/permission-catalog';

import type { RoleGrant } from '../../shared/api/customRoles.js';

/** PR 485: pure rules of the role editor. The server checks the same catalog again on every save. */

export type RoleForm = { name: string; description: string; grants: RoleGrant[] };
export type RoleFormErrors = { name?: 'required' | 'tooLong'; grants?: 'empty' | 'invalid' };

export const EMPTY_ROLE_FORM: RoleForm = { name: '', description: '', grants: [] };

/** The actions an administrator may hand out, by area, in catalog order. */
export function delegableByGroup(): Array<{ group: PermissionGroup; actions: PermissionAction[] }> {
  return PERMISSION_GROUPS.map((group) => ({ group, actions: PERMISSION_ACTIONS.filter((item) => item.group === group && item.delegable) })).filter((entry) => entry.actions.length > 0);
}

export function labelFor(labels: PermissionLabels, language: string): string {
  const key = language.slice(0, 2) as keyof PermissionLabels;
  return labels[key] ?? labels.en;
}

/** Everything the action needs, directly and through other actions (not the action itself). */
export function requiredActions(key: string, seen = new Set<string>()): string[] {
  for (const required of findPermissionAction(key)?.requires ?? []) {
    if (!seen.has(required)) {
      seen.add(required);
      requiredActions(required, seen);
    }
  }
  return [...seen];
}

/** Actions that need `key`, directly or through others. */
export function dependentActions(key: string): string[] {
  return PERMISSION_ACTIONS.filter((item) => requiredActions(item.key).includes(key)).map((item) => item.key);
}

/** Narrowest scope first: a new grant starts as small as the action allows. */
export function defaultScope(key: string): PermissionScope {
  return findPermissionAction(key)?.scopes[0] ?? 'organization';
}

/** Ticks an action together with what it needs, or unticks it together with what needs it. */
export function toggleAction(grants: readonly RoleGrant[], key: string, on: boolean): { grants: RoleGrant[]; changed: string[] } {
  const held = new Map(grants.map((grant) => [grant.action, grant]));
  const changed: string[] = [];
  if (on) {
    const own = held.get(key)?.scope ?? defaultScope(key);
    for (const action of [key, ...requiredActions(key)]) {
      if (!held.has(action)) {
        // What an action needs starts at the same scope as the action itself when that scope is allowed for it.
        const scope = action === key || !findPermissionAction(action)?.scopes.includes(own) ? defaultScope(action) : own;
        held.set(action, { action, scope });
        if (action !== key) changed.push(action);
      }
    }
  } else {
    for (const action of [key, ...dependentActions(key)]) {
      if (held.delete(action) && action !== key) changed.push(action);
    }
  }
  return { grants: sortGrants([...held.values()]), changed };
}

export function setScope(grants: readonly RoleGrant[], key: string, scope: PermissionScope): RoleGrant[] {
  return grants.map((grant) => (grant.action === key ? { ...grant, scope } : grant));
}

export function sortGrants(grants: readonly RoleGrant[]): RoleGrant[] {
  const order = new Map(PERMISSION_ACTIONS.map((item, index) => [item.key as string, index]));
  return [...grants].sort((a, b) => (order.get(a.action) ?? 0) - (order.get(b.action) ?? 0));
}

export function formFromRole(role: { name: string; description: string | null; permissions: RoleGrant[] }): RoleForm {
  return { name: role.name, description: role.description ?? '', grants: sortGrants(role.permissions) };
}

export function formsEqual(a: RoleForm, b: RoleForm): boolean {
  return a.name.trim() === b.name.trim() && a.description.trim() === b.description.trim()
    && JSON.stringify(sortGrants(a.grants)) === JSON.stringify(sortGrants(b.grants));
}

export function validateRoleForm(form: RoleForm): RoleFormErrors {
  const errors: RoleFormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'required';
  else if (name.length > 80) errors.name = 'tooLong';
  if (form.grants.length === 0) errors.grants = 'empty';
  else if (validatePermissionGrants(form.grants).length > 0) errors.grants = 'invalid';
  return errors;
}

export const hasRoleFormErrors = (errors: RoleFormErrors) => Object.keys(errors).length > 0;
