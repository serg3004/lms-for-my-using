import { describe, expect, it } from 'vitest';

import {
  delegablePermissionActions,
  findPermissionAction,
  isPermissionActionKey,
  missingPermissionDependencies,
  NON_DELEGABLE_CAPABILITIES,
  PERMISSION_ACTIONS,
  validatePermissionGrants,
} from './permission-catalog.js';

describe('permission catalog', () => {
  it('knows an action by its key and rejects an arbitrary string', () => {
    expect(isPermissionActionKey('checklist.author')).toBe(true);
    expect(isPermissionActionKey('admin')).toBe(false);
    expect(findPermissionAction('nope')).toBeUndefined();
  });

  it('offers only delegable actions for custom roles', () => {
    const keys = delegablePermissionActions().map((item) => item.key);
    const builtInOnly = ['checklist.access.settings', 'user.invitation.manage'];
    expect(keys).toEqual(PERMISSION_ACTIONS.map((item) => item.key).filter((key) => !builtInOnly.includes(key)));
    for (const capability of NON_DELEGABLE_CAPABILITIES) expect(keys).not.toContain(capability);
  });

  it('refuses to hold "conduct" without reading the library, and says what is missing', () => {
    expect(missingPermissionDependencies(['checklist.session.conduct'])).toEqual([{ action: 'checklist.session.conduct', missing: ['checklist.library.read'] }]);
    expect(missingPermissionDependencies(['checklist.session.conduct', 'checklist.library.read'])).toEqual([]);
  });

  it('refuses a chain with a gap: import needs manage, manage needs read', () => {
    expect(missingPermissionDependencies(['checklist.session.import', 'checklist.session.manage'])).toEqual([
      { action: 'checklist.session.manage', missing: ['checklist.session.read'] },
    ]);
    expect(missingPermissionDependencies(['checklist.session.import'])).toEqual([{ action: 'checklist.session.import', missing: ['checklist.session.manage'] }]);
  });

  it('validates a grant set: unknown action, not delegable, scope outside the allowed list, missing dependency', () => {
    expect(validatePermissionGrants([{ action: 'made.up', scope: 'organization' }])).toEqual([{ code: 'unknown_action', action: 'made.up' }]);
    expect(validatePermissionGrants([{ action: 'checklist.access.settings', scope: 'organization' }])).toEqual([{ code: 'not_delegable', action: 'checklist.access.settings' }]);
    expect(validatePermissionGrants([{ action: 'user.invitation.manage', scope: 'organization' }])).toEqual([{ code: 'not_delegable', action: 'user.invitation.manage' }]);
    expect(validatePermissionGrants([{ action: 'checklist.library.read', scope: 'own' }])).toEqual([{ code: 'scope_not_allowed', action: 'checklist.library.read', scope: 'own' }]);
    expect(validatePermissionGrants([{ action: 'user.create', scope: 'department' }])).toEqual([{ code: 'missing_dependency', action: 'user.create', missing: ['user.read'] }]);
  });

  it('accepts a complete, in-scope set', () => {
    expect(
      validatePermissionGrants([
        { action: 'checklist.library.read', scope: 'organization' },
        { action: 'checklist.author', scope: 'organization' },
        { action: 'user.read', scope: 'department' },
        { action: 'user.create', scope: 'department' },
      ]),
    ).toEqual([]);
  });
});
