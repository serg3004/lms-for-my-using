import type { Department } from '../../shared/api/departments.js';
import type { DepartmentManagerType, EffectiveDepartmentManager } from '../../shared/api/department-managers.js';

/**
 * Owns only client-side tree UI state (lazy children, expand/collapse, selection). The root
 * list itself is NOT reducer state -- it comes straight from the page's `useAsyncData` load,
 * same as every other admin list page, so the tree needs no async-load-to-reducer hand-off.
 */
export type TreeState = {
  nodesById: Record<string, Department>;
  childrenByParentId: Record<string, string[] | undefined>;
  expandedIds: Record<string, true>;
  loadingIds: Record<string, true>;
  selectedId: string | null;
  /** Effective DIRECT-manager summary per node, fetched lazily for currently-visible nodes only
   *  (same lazy-per-visible-node cost as children/type data already paid by this tree). */
  managerSummaryById: Record<string, ManagerTreeSummary | null | undefined>;
  /** Full effective manager list per node, fetched on demand only when its badge popover opens. */
  managerDetailsById: Record<string, EffectiveDepartmentManager[] | undefined>;
};

export function initialTreeState(): TreeState {
  return {
    nodesById: {},
    childrenByParentId: {},
    expandedIds: {},
    loadingIds: {},
    selectedId: null,
    managerSummaryById: {},
    managerDetailsById: {},
  };
}

export type TreeAction =
  | { type: 'mergeNodes'; nodes: Department[] }
  | { type: 'childrenLoading'; id: string }
  | { type: 'childrenLoaded'; id: string; children: Department[] }
  | { type: 'toggleExpand'; id: string }
  | { type: 'expandIds'; ids: string[] }
  | { type: 'collapse'; id: string }
  | { type: 'select'; id: string | null }
  | { type: 'upsertNode'; node: Department }
  | { type: 'managerSummaryLoaded'; id: string; summary: ManagerTreeSummary | null }
  | { type: 'managerDetailsLoaded'; id: string; managers: EffectiveDepartmentManager[] };

function withNodes(state: TreeState, nodes: Department[]): Record<string, Department> {
  const next = { ...state.nodesById };
  for (const node of nodes) next[node.id] = node;
  return next;
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** All department ids currently loaded as descendants of `rootId` via childrenByParentId.
 *  Only walks branches that have actually been fetched -- a lazy child not yet expanded is
 *  not descended into, since it holds no cached manager data to invalidate. */
export function collectLoadedDescendantIds(childrenByParentId: TreeState['childrenByParentId'], rootId: string): string[] {
  const result: string[] = [];
  const stack = [...(childrenByParentId[rootId] ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    result.push(id);
    const children = childrenByParentId[id];
    if (children) stack.push(...children);
  }
  return result;
}

export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case 'mergeNodes':
      return { ...state, nodesById: withNodes(state, action.nodes) };
    case 'childrenLoading':
      return { ...state, loadingIds: { ...state.loadingIds, [action.id]: true } };
    case 'childrenLoaded': {
      return {
        ...state,
        loadingIds: withoutKey(state.loadingIds, action.id),
        nodesById: withNodes(state, action.children),
        childrenByParentId: { ...state.childrenByParentId, [action.id]: action.children.map((c) => c.id) },
        expandedIds: { ...state.expandedIds, [action.id]: true },
      };
    }
    case 'toggleExpand': {
      const isExpanded = Boolean(state.expandedIds[action.id]);
      if (!isExpanded) return { ...state, expandedIds: { ...state.expandedIds, [action.id]: true } };
      return { ...state, expandedIds: withoutKey(state.expandedIds, action.id) };
    }
    case 'collapse': {
      if (!state.expandedIds[action.id]) return state;
      return { ...state, expandedIds: withoutKey(state.expandedIds, action.id) };
    }
    case 'expandIds': {
      const expandedIds = { ...state.expandedIds };
      for (const id of action.ids) expandedIds[id] = true;
      return { ...state, expandedIds };
    }
    case 'select':
      return { ...state, selectedId: action.id };
    case 'upsertNode':
      return { ...state, nodesById: { ...state.nodesById, [action.node.id]: action.node } };
    case 'managerSummaryLoaded':
      return { ...state, managerSummaryById: { ...state.managerSummaryById, [action.id]: action.summary } };
    case 'managerDetailsLoaded':
      return { ...state, managerDetailsById: { ...state.managerDetailsById, [action.id]: action.managers } };
    default:
      return state;
  }
}

/** DFS order of currently visible tree items (loaded + expanded ancestors only). */
export function visibleOrder(rootIds: string[], state: TreeState): string[] {
  const order: string[] = [];
  function walk(ids: string[] | undefined) {
    if (!ids) return;
    for (const id of ids) {
      order.push(id);
      if (state.expandedIds[id]) walk(state.childrenByParentId[id]);
    }
  }
  walk(rootIds);
  return order;
}

export function nextVisibleId(order: string[], currentId: string | null): string | null {
  if (order.length === 0) return null;
  if (currentId === null) return order[0] ?? null;
  const index = order.indexOf(currentId);
  if (index === -1) return order[0] ?? null;
  return order[Math.min(index + 1, order.length - 1)] ?? null;
}

export function previousVisibleId(order: string[], currentId: string | null): string | null {
  if (order.length === 0) return null;
  if (currentId === null) return order[0] ?? null;
  const index = order.indexOf(currentId);
  if (index <= 0) return order[0] ?? null;
  return order[index - 1] ?? null;
}

/** Ancestor ids to expand so `targetId` becomes visible (root-first, excluding the target itself). */
export function ancestorIdsToExpand(path: Department[], targetId: string): string[] {
  return path.filter((d) => d.id !== targetId).map((d) => d.id);
}

// ── Form/validation helpers ─────────────────────────────────────────────────

export function validateDepartmentName(name: string, message: string): { name?: string } {
  return name.trim() ? {} : { name: message };
}

export function buildCreateDepartmentPayload(
  organizationId: string,
  parentId: string | null,
  form: { name: string; code: string; description: string; departmentTypeId: string },
) {
  return {
    organizationId,
    parentId: parentId ?? undefined,
    name: form.name.trim(),
    code: form.code.trim() || undefined,
    description: form.description.trim() || undefined,
    departmentTypeId: form.departmentTypeId || undefined,
  };
}

export function buildUpdateDepartmentPayload(form: { name: string; code: string; description: string; departmentTypeId: string }) {
  return {
    name: form.name.trim(),
    code: form.code.trim() || null,
    description: form.description.trim() || null,
    departmentTypeId: form.departmentTypeId || null,
  };
}

export function initialDepartmentFormState() {
  return { name: '', code: '', description: '', departmentTypeId: '' };
}

export function editDepartmentFormState(department: Department) {
  return {
    name: department.name,
    code: department.code ?? '',
    description: department.description ?? '',
    departmentTypeId: department.departmentTypeId ?? '',
  };
}

export function resolveDepartmentSaveErrorMessage(status: number | undefined, codeExistsMessage: string, genericMessage: string) {
  return status === 409 ? codeExistsMessage : genericMessage;
}

export function resolveDepartmentMoveErrorMessage(
  status: number | undefined,
  depthMessage: string,
  conflictMessage: string,
  genericMessage: string,
) {
  if (status === 400) return depthMessage;
  if (status === 409) return conflictMessage;
  return genericMessage;
}

export function validateDepartmentTypeFields(
  code: string,
  name: string,
  messages: { codeRequired: string; nameRequired: string },
): { code?: string; name?: string } {
  const errors: { code?: string; name?: string } = {};
  if (!code.trim()) errors.code = messages.codeRequired;
  if (!name.trim()) errors.name = messages.nameRequired;
  return errors;
}

// ── Manager helpers (PR 273) ────────────────────────────────────────────────
//
// A `DepartmentManager` relation is deliberately never rendered with the RBAC-role badge or
// wording used for `admin.roles.options.*` (see AdminRolesPage) -- it is a department-scoped
// assignment, not the org-wide RBAC `manager` role, and the two must stay visually distinct.

export type ManagerCandidate = { id: string; firstName: string; lastName: string | null; email: string };

export function formatManagerUserName(user: ManagerCandidate): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

export function managerCandidatesAvailableToAdd(allUsers: ManagerCandidate[], excludeIds: string[]): ManagerCandidate[] {
  const excluded = new Set(excludeIds);
  return allUsers.filter((user) => !excluded.has(user.id));
}

export function managersOfType(managers: EffectiveDepartmentManager[], type: DepartmentManagerType): EffectiveDepartmentManager[] {
  return managers.filter((manager) => manager.type === type);
}

/** Primary first, for both the editor's per-type list and the tree badge summary. */
export function sortManagersForDisplay(managers: EffectiveDepartmentManager[]): EffectiveDepartmentManager[] {
  return [...managers].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

export type ManagerTreeSummary = {
  primaryName: string | null;
  additionalCount: number;
  isInherited: boolean;
};

/** Tree badge summary for DIRECT managers, per plan: primary name + "N more", local/inherited marker. */
export function summarizeDirectManagers(managers: EffectiveDepartmentManager[]): ManagerTreeSummary | null {
  const direct = managersOfType(managers, 'DIRECT');
  if (direct.length === 0) return null;

  const [primary] = sortManagersForDisplay(direct);
  if (!primary) return null;

  return {
    primaryName: primary.user ? formatManagerUserName(primary.user) : null,
    additionalCount: direct.length - 1,
    isInherited: primary.source === 'INHERITED',
  };
}

export function resolveManagerSaveErrorMessage(status: number | undefined, conflictMessage: string, genericMessage: string): string {
  return status === 409 ? conflictMessage : genericMessage;
}

export function resolveManagerModeErrorMessage(status: number | undefined, conflictMessage: string, genericMessage: string): string {
  return status === 409 ? conflictMessage : genericMessage;
}
