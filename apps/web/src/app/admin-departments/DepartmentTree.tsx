import { useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import type { TFunction } from 'i18next';

import type { Department } from '../../shared/api/departments.js';
import { Badge } from '../../shared/ui.js';
import { formatManagerUserName, managersOfType, nextVisibleId, previousVisibleId, visibleOrder, type TreeState } from './model.js';

type DepartmentTreeProps = {
  rootIds: string[];
  state: TreeState;
  onToggleExpand: (department: Department) => void;
  onSelect: (id: string) => void;
  onRequestManagerDetails: (department: Department) => void;
  typeLabel: (typeId: string | null) => string | null;
  t: TFunction;
};

export function DepartmentTree({ rootIds, state, onToggleExpand, onSelect, onRequestManagerDetails, typeLabel, t }: DepartmentTreeProps) {
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (state.selectedId) nodeRefs.current.get(state.selectedId)?.focus();
  }, [state.selectedId]);

  if (rootIds.length === 0) {
    return <p className="admin-form__hint">{t('admin.departments.treeEmpty', 'No departments yet.')}</p>;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const order = visibleOrder(rootIds, state);
    const current = state.selectedId;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const id = nextVisibleId(order, current);
      if (id) onSelect(id);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const id = previousVisibleId(order, current);
      if (id) onSelect(id);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (order[0]) onSelect(order[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = order[order.length - 1];
      if (last) onSelect(last);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!current) return;
      const node = state.nodesById[current];
      if (!node) return;
      if (!state.expandedIds[current]) {
        onToggleExpand(node);
      } else {
        const children = state.childrenByParentId[current];
        if (children && children[0]) onSelect(children[0]);
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (!current) return;
      if (state.expandedIds[current]) {
        const node = state.nodesById[current];
        if (node) onToggleExpand(node);
      } else {
        const parentId = state.nodesById[current]?.parentId;
        if (parentId) onSelect(parentId);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
    }
  }

  return (
    <div
      aria-label={t('admin.departments.treeLabel', 'Department tree')}
      className="admin-departments-tree"
      onKeyDown={handleKeyDown}
      role="tree"
    >
      {rootIds.map((id) => (
        <DepartmentTreeItem
          key={id}
          id={id}
          level={1}
          nodeRefs={nodeRefs}
          onRequestManagerDetails={onRequestManagerDetails}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          state={state}
          t={t}
          typeLabel={typeLabel}
        />
      ))}
    </div>
  );
}

type DepartmentTreeItemProps = {
  id: string;
  level: number;
  state: TreeState;
  nodeRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  onToggleExpand: (department: Department) => void;
  onSelect: (id: string) => void;
  onRequestManagerDetails: (department: Department) => void;
  typeLabel: (typeId: string | null) => string | null;
  t: TFunction;
};

function DepartmentTreeItem({ id, level, state, nodeRefs, onToggleExpand, onSelect, onRequestManagerDetails, typeLabel, t }: DepartmentTreeItemProps) {
  const [managerPopoverOpen, setManagerPopoverOpen] = useState(false);
  const managerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!managerPopoverOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (managerRef.current && !managerRef.current.contains(event.target as Node)) setManagerPopoverOpen(false);
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setManagerPopoverOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [managerPopoverOpen]);

  const node = state.nodesById[id];
  if (!node) return null;

  const isExpanded = Boolean(state.expandedIds[id]);
  const isSelected = state.selectedId === id;
  const isLoading = Boolean(state.loadingIds[id]);
  const hasChildren = node._count.children > 0;
  const children = state.childrenByParentId[id];
  const type = typeLabel(node.departmentTypeId);
  const managerSummary = state.managerSummaryById[id];
  const managerDetails = state.managerDetailsById[id];

  return (
    <div
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-level={level}
      aria-selected={isSelected}
      className="admin-departments-tree__node"
      ref={(el) => {
        if (el) nodeRefs.current.set(id, el);
        else nodeRefs.current.delete(id);
      }}
      role="treeitem"
      tabIndex={isSelected ? 0 : -1}
    >
      <div
        className={`admin-departments-tree__item${isSelected ? ' admin-departments-tree__item--selected' : ''}${node.status === 'archived' ? ' admin-departments-tree__item--archived' : ''}`}
        onClick={() => onSelect(id)}
      >
        {hasChildren ? (
          <button
            aria-label={isExpanded ? t('admin.departments.collapse', 'Collapse') : t('admin.departments.expand', 'Expand')}
            className="admin-departments-tree__twisty"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand(node);
            }}
            type="button"
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span aria-hidden="true" className="admin-departments-tree__twisty" />
        )}
        <span className="admin-departments-tree__label">{node.name}</span>
        {node.status === 'archived' ? (
          <Badge variant="neutral">{t('admin.departments.archived', 'Archived')}</Badge>
        ) : null}
        {type ? <span className="admin-departments-tree__type">{type}</span> : null}
        {managerSummary ? (
          <span className="admin-departments-tree__manager" ref={managerRef}>
            {/* This badge represents the DepartmentManager relation, not the RBAC "manager" role
                (see admin.roles.options.manager) -- plain neutral Badge, never StatusBadge. */}
            <button
              aria-expanded={managerPopoverOpen}
              className="admin-btn admin-btn--sm admin-btn--secondary"
              onClick={(event) => {
                event.stopPropagation();
                if (!managerPopoverOpen) onRequestManagerDetails(node);
                setManagerPopoverOpen((open) => !open);
              }}
              type="button"
            >
              {managerSummary.primaryName ?? t('admin.departments.managerUnknown', 'Unknown')}
              {managerSummary.additionalCount > 0 ? ` +${managerSummary.additionalCount}` : ''}
            </button>
            <Badge variant="neutral">
              {managerSummary.isInherited
                ? t('admin.departments.managerInherited', 'Inherited')
                : t('admin.departments.managerLocal', 'Local')}
            </Badge>
            {managerPopoverOpen ? (
              <div className="admin-departments-tree__manager-popover" onClick={(event) => event.stopPropagation()} role="group">
                {managerDetails === undefined ? (
                  <p className="admin-form__hint" role="status">{t('admin.departments.childrenLoading', 'Loading…')}</p>
                ) : managerDetails.length === 0 ? (
                  <p className="admin-form__hint">{t('admin.departments.noManagers', 'No managers assigned.')}</p>
                ) : (
                  <ul className="admin-membership-list">
                    {[...managersOfType(managerDetails, 'DIRECT'), ...managersOfType(managerDetails, 'FUNCTIONAL')].map((m) => (
                      <li key={m.id}>
                        <span>
                          {m.user ? formatManagerUserName(m.user) : t('admin.departments.managerUnknown', 'Unknown')}
                          {' — '}
                          {m.type === 'DIRECT' ? t('admin.departments.managerTypeDirect', 'Direct') : t('admin.departments.managerTypeFunctional', 'Functional')}
                          {m.isPrimary ? ` (${t('admin.departments.managerPrimary', 'Primary')})` : ''}
                          {m.source === 'INHERITED' ? ` — ${t('admin.departments.managerInherited', 'Inherited')}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </span>
        ) : null}
      </div>
      {isExpanded && (
        <div role="group">
          {isLoading ? (
            <p className="admin-form__hint" role="status">{t('admin.departments.childrenLoading', 'Loading…')}</p>
          ) : children && children.length === 0 ? (
            <p className="admin-form__hint">{t('admin.departments.noChildren', 'No child departments.')}</p>
          ) : (
            (children ?? []).map((childId) => (
              <DepartmentTreeItem
                id={childId}
                key={childId}
                level={level + 1}
                nodeRefs={nodeRefs}
                onRequestManagerDetails={onRequestManagerDetails}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                state={state}
                t={t}
                typeLabel={typeLabel}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
