import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TFunction } from 'i18next';

import { listAssessmentFolders } from '../../shared/api/assessmentFolders.js';
import { ApiClientError } from '../../shared/apiClient.js';
import { resolveSelectedFolder } from '../../shared/folders/folderTree.js';

const COLLAPSED_KEY = 'admin.assessment-folders.collapsed';
type FolderData = Awaited<ReturnType<typeof listAssessmentFolders>>;
type FolderState = { status: 'loading' | 'error' | 'forbidden' } | { status: 'loaded'; data: FolderData };

function storedCollapsed(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    if (Array.isArray(ids)) return new Set(ids.filter((id): id is string => typeof id === 'string'));
  } catch { /* Storage can be unavailable. */ }
  return new Set();
}

export function useAssessmentFolders(t: TFunction) {
  const [state, setState] = useState<FolderState>({ status: 'loading' });
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  const [params, setParams] = useSearchParams();
  const requested = params.get('folder');
  const data = state.status === 'loaded' ? state.data : null;
  const id = data ? resolveSelectedFolder(data.folders, requested) : null;
  const stale = data !== null && requested !== null && id === null;

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await listAssessmentFolders(signal);
      if (!signal?.aborted) setState({ status: 'loaded', data: response });
    } catch (error) {
      if (!signal?.aborted) setState({ status: error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error' });
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  function select(id: string | null, replace = false) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (id) next.set('folder', id);
      else next.delete('folder');
      return next;
    }, { replace });
  }

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed])); }
    catch { /* Storage can be unavailable. */ }
  }, [collapsed]);

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return {
    status: state.status, data, id, stale, reload, select, toggle,
    expanded: new Set(data?.folders.filter((folder) => !collapsed.has(folder.id)).map((folder) => folder.id)),
    rootLabel: t('admin.assessmentBuilder.folders.root'),
  };
}
