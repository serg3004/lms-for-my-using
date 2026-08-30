import { describe, expect, it } from 'vitest';

import type { Department } from '../../shared/api/departments.js';
import type { EffectiveDepartmentManager } from '../../shared/api/department-managers.js';
import {
  ancestorIdsToExpand,
  buildCreateDepartmentPayload,
  buildUpdateDepartmentPayload,
  collectLoadedDescendantIds,
  formatManagerUserName,
  initialTreeState,
  managerCandidatesAvailableToAdd,
  managersOfType,
  nextVisibleId,
  previousVisibleId,
  resolveDepartmentMoveErrorMessage,
  resolveDepartmentSaveErrorMessage,
  resolveManagerModeErrorMessage,
  resolveManagerSaveErrorMessage,
  sortManagersForDisplay,
  summarizeDirectManagers,
  treeReducer,
  validateDepartmentName,
  validateDepartmentTypeFields,
  visibleOrder,
  type TreeState,
} from './model.js';

function department(overrides: Partial<Department> & { id: string }): Department {
  return {
    organizationId: 'org-1',
    parentId: null,
    departmentTypeId: null,
    name: overrides.id,
    code: null,
    description: null,
    sortOrder: 0,
    status: 'active',
    directManagerMode: 'LOCAL',
    functionalManagerMode: 'LOCAL',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    _count: { children: 0 },
    ...overrides,
  };
}

describe('treeReducer', () => {
  it('mergeNodes adds nodes without touching tree shape', () => {
    const state = treeReducer(initialTreeState(), { type: 'mergeNodes', nodes: [department({ id: 'a' }), department({ id: 'b' })] });
    expect(state.nodesById.a?.id).toBe('a');
    expect(state.nodesById.b?.id).toBe('b');
  });

  it('tracks a loading id and clears it once children load', () => {
    let state = treeReducer(initialTreeState(), { type: 'childrenLoading', id: 'a' });
    expect(state.loadingIds.a).toBe(true);

    state = treeReducer(state, { type: 'childrenLoaded', id: 'a', children: [department({ id: 'a1', parentId: 'a' })] });
    expect(state.loadingIds.a).toBeUndefined();
    expect(state.childrenByParentId.a).toEqual(['a1']);
    expect(state.expandedIds.a).toBe(true);
  });

  it('toggles expand on and off', () => {
    let state = treeReducer(initialTreeState(), { type: 'toggleExpand', id: 'a' });
    expect(state.expandedIds.a).toBe(true);
    state = treeReducer(state, { type: 'toggleExpand', id: 'a' });
    expect(state.expandedIds.a).toBeUndefined();
  });

  it('collapse is a no-op when already collapsed, and clears when expanded', () => {
    const collapsedState = initialTreeState();
    expect(treeReducer(collapsedState, { type: 'collapse', id: 'a' })).toBe(collapsedState);

    const expandedState = treeReducer(collapsedState, { type: 'toggleExpand', id: 'a' });
    const collapsed = treeReducer(expandedState, { type: 'collapse', id: 'a' });
    expect(collapsed.expandedIds.a).toBeUndefined();
  });

  it('expandIds marks every given id expanded without touching others', () => {
    const state = treeReducer(initialTreeState(), { type: 'expandIds', ids: ['a', 'b'] });
    expect(state.expandedIds).toEqual({ a: true, b: true });
  });

  it('select stores the selected id', () => {
    const state = treeReducer(initialTreeState(), { type: 'select', id: 'a' });
    expect(state.selectedId).toBe('a');
  });

  it('upsertNode replaces a single node in place', () => {
    let state = treeReducer(initialTreeState(), { type: 'mergeNodes', nodes: [department({ id: 'a', name: 'Old' })] });
    state = treeReducer(state, { type: 'upsertNode', node: department({ id: 'a', name: 'New' }) });
    expect(state.nodesById.a?.name).toBe('New');
  });

  it('managerSummaryLoaded stores the summary (or null) for a single node', () => {
    let state = treeReducer(initialTreeState(), {
      type: 'managerSummaryLoaded',
      id: 'a',
      summary: { primaryName: 'Ada Lovelace', additionalCount: 1, isInherited: false },
    });
    expect(state.managerSummaryById.a).toEqual({ primaryName: 'Ada Lovelace', additionalCount: 1, isInherited: false });
    state = treeReducer(state, { type: 'managerSummaryLoaded', id: 'a', summary: null });
    expect(state.managerSummaryById.a).toBeNull();
  });

  it('managerCacheInvalidated clears both caches for a node so a later request retries', () => {
    let state = treeReducer(initialTreeState(), {
      type: 'managerSummaryLoaded',
      id: 'a',
      summary: { primaryName: 'Ada Lovelace', additionalCount: 0, isInherited: false },
    });
    state = treeReducer(state, { type: 'managerDetailsLoaded', id: 'a', managers: [] });
    expect(state.managerSummaryById.a).not.toBeUndefined();
    expect(state.managerDetailsById.a).not.toBeUndefined();

    state = treeReducer(state, { type: 'managerCacheInvalidated', id: 'a' });
    expect(state.managerSummaryById.a).toBeUndefined();
    expect(state.managerDetailsById.a).toBeUndefined();
  });
});

describe('visibleOrder / nextVisibleId / previousVisibleId', () => {
  function buildTwoLevelTree(): TreeState {
    return treeReducer(initialTreeState(), {
      type: 'childrenLoaded',
      id: 'a',
      children: [department({ id: 'a1', parentId: 'a' }), department({ id: 'a2', parentId: 'a' })],
    });
  }

  const rootIds = ['a', 'b'];

  it('includes only expanded branches in DFS order', () => {
    const state = buildTwoLevelTree();
    expect(visibleOrder(rootIds, state)).toEqual(['a', 'a1', 'a2', 'b']);
  });

  it('excludes unexpanded children even if loaded', () => {
    let state = buildTwoLevelTree();
    state = treeReducer(state, { type: 'collapse', id: 'a' });
    expect(visibleOrder(rootIds, state)).toEqual(['a', 'b']);
  });

  it('nextVisibleId advances and clamps at the end', () => {
    const order = ['a', 'a1', 'a2', 'b'];
    expect(nextVisibleId(order, null)).toBe('a');
    expect(nextVisibleId(order, 'a')).toBe('a1');
    expect(nextVisibleId(order, 'b')).toBe('b');
  });

  it('previousVisibleId retreats and clamps at the start', () => {
    const order = ['a', 'a1', 'a2', 'b'];
    expect(previousVisibleId(order, null)).toBe('a');
    expect(previousVisibleId(order, 'a2')).toBe('a1');
    expect(previousVisibleId(order, 'a')).toBe('a');
  });

  it('returns null for an empty order', () => {
    expect(nextVisibleId([], 'a')).toBeNull();
    expect(previousVisibleId([], 'a')).toBeNull();
  });
});

describe('ancestorIdsToExpand', () => {
  it('returns the path root-first, excluding the target itself', () => {
    const path = [department({ id: 'root' }), department({ id: 'mid', parentId: 'root' }), department({ id: 'leaf', parentId: 'mid' })];
    expect(ancestorIdsToExpand(path, 'leaf')).toEqual(['root', 'mid']);
  });
});

describe('form helpers', () => {
  it('validateDepartmentName rejects blank/whitespace-only names', () => {
    expect(validateDepartmentName('  ', 'required')).toEqual({ name: 'required' });
    expect(validateDepartmentName('Engineering', 'required')).toEqual({});
  });

  it('buildCreateDepartmentPayload trims fields and omits blanks', () => {
    const payload = buildCreateDepartmentPayload('org-1', 'parent-1', {
      name: '  Engineering  ',
      code: '  ',
      description: '  ',
      departmentTypeId: '',
    });
    expect(payload).toEqual({
      organizationId: 'org-1',
      parentId: 'parent-1',
      name: 'Engineering',
      code: undefined,
      description: undefined,
      departmentTypeId: undefined,
    });
  });

  it('buildCreateDepartmentPayload omits parentId for a root department', () => {
    const payload = buildCreateDepartmentPayload('org-1', null, { name: 'Root', code: '', description: '', departmentTypeId: '' });
    expect(payload.parentId).toBeUndefined();
  });

  it('buildUpdateDepartmentPayload nulls out cleared optional fields', () => {
    const payload = buildUpdateDepartmentPayload({ name: 'Engineering', code: '', description: '', departmentTypeId: '' });
    expect(payload).toEqual({ name: 'Engineering', code: null, description: null, departmentTypeId: null });
  });

  it('resolveDepartmentSaveErrorMessage maps 409 to the code-exists message', () => {
    expect(resolveDepartmentSaveErrorMessage(409, 'exists', 'generic')).toBe('exists');
    expect(resolveDepartmentSaveErrorMessage(500, 'exists', 'generic')).toBe('generic');
    expect(resolveDepartmentSaveErrorMessage(undefined, 'exists', 'generic')).toBe('generic');
  });

  it('resolveDepartmentMoveErrorMessage maps 400 to depth and 409 to conflict', () => {
    expect(resolveDepartmentMoveErrorMessage(400, 'depth', 'conflict', 'generic')).toBe('depth');
    expect(resolveDepartmentMoveErrorMessage(409, 'depth', 'conflict', 'generic')).toBe('conflict');
    expect(resolveDepartmentMoveErrorMessage(500, 'depth', 'conflict', 'generic')).toBe('generic');
  });

  it('validateDepartmentTypeFields flags each missing field independently', () => {
    const messages = { codeRequired: 'code required', nameRequired: 'name required' };
    expect(validateDepartmentTypeFields('', '', messages)).toEqual({ code: 'code required', name: 'name required' });
    expect(validateDepartmentTypeFields('team', '', messages)).toEqual({ name: 'name required' });
    expect(validateDepartmentTypeFields('team', 'Team', messages)).toEqual({});
  });
});

describe('manager helpers', () => {
  function manager(overrides: Partial<EffectiveDepartmentManager> & { userId: string }): EffectiveDepartmentManager {
    return {
      id: `manager-${overrides.userId}`,
      type: 'DIRECT',
      isPrimary: false,
      source: 'LOCAL',
      sourceDepartmentId: 'dept-1',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      user: { id: overrides.userId, firstName: 'First', lastName: 'Last', email: `${overrides.userId}@example.test`, status: 'active' },
      ...overrides,
    };
  }

  it('formatManagerUserName joins first/last, falling back to email', () => {
    expect(formatManagerUserName({ id: 'u1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' })).toBe('Ada Lovelace');
    expect(formatManagerUserName({ id: 'u1', firstName: 'Ada', lastName: null, email: 'ada@example.test' })).toBe('Ada');
    expect(formatManagerUserName({ id: 'u1', firstName: '', lastName: null, email: 'ada@example.test' })).toBe('ada@example.test');
  });

  it('managerCandidatesAvailableToAdd excludes already-assigned users', () => {
    const users = [{ id: 'u1', firstName: 'A', lastName: null, email: 'a@x.test' }, { id: 'u2', firstName: 'B', lastName: null, email: 'b@x.test' }];
    expect(managerCandidatesAvailableToAdd(users, ['u1']).map((u) => u.id)).toEqual(['u2']);
  });

  it('managersOfType filters by DIRECT/FUNCTIONAL', () => {
    const managers = [manager({ userId: 'u1', type: 'DIRECT' }), manager({ userId: 'u2', type: 'FUNCTIONAL' })];
    expect(managersOfType(managers, 'DIRECT').map((m) => m.userId)).toEqual(['u1']);
    expect(managersOfType(managers, 'FUNCTIONAL').map((m) => m.userId)).toEqual(['u2']);
  });

  it('sortManagersForDisplay puts the primary manager first', () => {
    const managers = [manager({ userId: 'u1', isPrimary: false }), manager({ userId: 'u2', isPrimary: true })];
    expect(sortManagersForDisplay(managers).map((m) => m.userId)).toEqual(['u2', 'u1']);
  });

  it('summarizeDirectManagers returns null when there are no DIRECT managers', () => {
    expect(summarizeDirectManagers([manager({ userId: 'u1', type: 'FUNCTIONAL' })])).toBeNull();
  });

  it('summarizeDirectManagers prefers the primary manager and counts the rest', () => {
    const managers = [
      manager({ userId: 'u1', type: 'DIRECT', isPrimary: false }),
      manager({ userId: 'u2', type: 'DIRECT', isPrimary: true }),
      manager({ userId: 'u3', type: 'DIRECT', isPrimary: false }),
    ];
    const summary = summarizeDirectManagers(managers);
    expect(summary?.primaryName).toBe('First Last');
    expect(summary?.additionalCount).toBe(2);
    expect(summary?.isInherited).toBe(false);
  });

  it('summarizeDirectManagers marks the badge inherited when the primary source is INHERITED', () => {
    const managers = [manager({ userId: 'u1', type: 'DIRECT', isPrimary: true, source: 'INHERITED', sourceDepartmentId: 'ancestor-1' })];
    expect(summarizeDirectManagers(managers)?.isInherited).toBe(true);
  });

  it('resolveManagerSaveErrorMessage and resolveManagerModeErrorMessage map 409 to conflict', () => {
    expect(resolveManagerSaveErrorMessage(409, 'conflict', 'generic')).toBe('conflict');
    expect(resolveManagerSaveErrorMessage(500, 'conflict', 'generic')).toBe('generic');
    expect(resolveManagerModeErrorMessage(409, 'conflict', 'generic')).toBe('conflict');
    expect(resolveManagerModeErrorMessage(undefined, 'conflict', 'generic')).toBe('generic');
  });

  it('collectLoadedDescendantIds walks only already-loaded branches', () => {
    const childrenByParentId = {
      root: ['child-a', 'child-b'],
      'child-a': ['grandchild-a1'],
      // child-b's children were never fetched, so it has no entry here.
    };
    expect(collectLoadedDescendantIds(childrenByParentId, 'root').sort()).toEqual(['child-a', 'child-b', 'grandchild-a1'].sort());
    expect(collectLoadedDescendantIds(childrenByParentId, 'child-b')).toEqual([]);
    expect(collectLoadedDescendantIds(childrenByParentId, 'unknown')).toEqual([]);
  });
});
