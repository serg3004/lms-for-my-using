import { useEffect, useMemo, useState } from 'react';

import { countMatching, loadBulkImpact, runBulkAction, type BulkActionName, type BulkFilter, type BulkImpact, type BulkReport, type BulkTarget } from './bulkActions.js';
import type { AdminUsersFilters, AdminUserSummary } from './model.js';
import { userName } from './model.js';

/** PR 497: the selection, the dialogs and the calls behind the bulk bar of the users list. */
export function useBulkUserActions({ users, filters, resetKey, reload }: { users: AdminUserSummary[]; filters: AdminUsersFilters; resetKey: string; reload: () => Promise<void> }) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [matching, setMatching] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<{ count: number; impact: BulkImpact | null } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [report, setReport] = useState<BulkReport | null>(null);

  const filter: BulkFilter = useMemo(() => ({ ...(filters.query.trim() ? { search: filters.query.trim() } : {}), ...(filters.status ? { status: filters.status } : {}) }), [filters.query, filters.status]);
  /** Everyone-matching works on the server's filters (search, status); the role and custom field filters are applied on the page only. */
  const canSelectAll = !filters.role && !filters.fieldKey;
  const names = useMemo(() => new Map(users.map((user) => [user.id, userName(user)])), [users]);

  function clear() { setSelectedKeys(new Set()); setAllMatching(false); setError(false); }
  useEffect(clear, [resetKey]);

  const selectedCount = selectedKeys.size;
  const hasSelection = selectedCount > 0;
  useEffect(() => {
    if (!hasSelection || !canSelectAll) { setMatching(null); return undefined; }
    let active = true;
    countMatching(filter).then((total) => { if (active) setMatching(total); }).catch(() => { if (active) setMatching(null); });
    return () => { active = false; };
  }, [hasSelection, canSelectAll, filter]);

  const target = (): BulkTarget => (allMatching ? { filter } : { userIds: [...selectedKeys] });
  const count = allMatching ? (matching ?? selectedCount) : selectedCount;

  async function execute(action: BulkActionName, extra: { departmentId?: string; confirm?: boolean } = {}): Promise<boolean> {
    setBusy(true); setError(false);
    try {
      const result = await runBulkAction(action, target(), extra);
      await reload();
      clear();
      setReport(result);
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function start(action: BulkActionName) {
    if (action === 'move') { setError(false); setMoveOpen(true); return; }
    if (action === 'archive') {
      setError(false);
      setPendingArchive({ count, impact: null });
      try { setPendingArchive({ count, impact: await loadBulkImpact(target()) }); } catch { setPendingArchive({ count, impact: null }); }
      return;
    }
    await execute(action);
  }

  async function confirmArchive() {
    if (await execute('archive', { confirm: true })) setPendingArchive(null);
  }

  async function confirmMove(departmentId: string) {
    if (await execute('move', { departmentId })) setMoveOpen(false);
  }

  return {
    selectedKeys, setSelectedKeys: (next: Set<string>) => { setSelectedKeys(next); setAllMatching(false); },
    scope: allMatching ? { mode: 'filter' as const, count } : { mode: 'rows' as const, count: selectedCount },
    canSelectAll, matching, busy, error, count,
    selectAllMatching: () => setAllMatching(true), clear, start,
    pendingArchive, cancelArchive: () => setPendingArchive(null), confirmArchive,
    moveOpen, cancelMove: () => setMoveOpen(false), confirmMove,
    report, closeReport: () => setReport(null), names,
  };
}
