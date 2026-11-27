import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { listLibraryFolders, type LibraryFolderScope } from '../api/libraryFolders.js';
import { ApiClientError } from '../apiClient.js';
import { resolveSelectedFolder } from './folderTree.js';

type FolderData = Awaited<ReturnType<typeof listLibraryFolders>>;
type FolderState = { status: 'loading' | 'error' | 'forbidden' } | { status: 'loaded'; data: FolderData };

function storedCollapsed(key: string): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(ids)) return new Set(ids.filter((id): id is string => typeof id === 'string'));
  } catch { /* Storage can be unavailable. */ }
  return new Set();
}

/**
 * PR 581: the folder tree of a section (courses, assignments): loads it, keeps the open folder in the address
 * (`?folder=`), and remembers which folders are collapsed. A person without access gets the `forbidden` status
 * and the page shows its plain list.
 */
export function useLibraryFolders(scope: LibraryFolderScope) {
  const collapsedKey = `admin.library-folders.${scope}.collapsed`;
  const [state, setState] = useState<FolderState>({ status: 'loading' });
  const [collapsed, setCollapsed] = useState(() => storedCollapsed(collapsedKey));
  const [params, setParams] = useSearchParams();
  const requested = params.get('folder');
  const data = state.status === 'loaded' ? state.data : null;
  const id = data ? resolveSelectedFolder(data.folders, requested) : null;
  const stale = data !== null && requested !== null && requested !== 'root' && id === null;

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await listLibraryFolders(scope, signal);
      if (!signal?.aborted) setState({ status: 'loaded', data: response });
    } catch (error) {
      if (!signal?.aborted) setState({ status: error instanceof ApiClientError && error.status === 403 ? 'forbidden' : 'error' });
    }
  }, [scope]);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    try { localStorage.setItem(collapsedKey, JSON.stringify([...collapsed])); }
    catch { /* Storage can be unavailable. */ }
  }, [collapsed, collapsedKey]);

  function select(folderId: string | null, replace = false) {
    const next = new URLSearchParams(window.location.search);
    next.set('folder', folderId ?? 'root');
    next.delete('page');
    setParams(next, { replace });
  }
  function toggle(folderId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  return {
    scope, status: state.status, data, id, stale, reload, select, toggle,
    expanded: new Set(data?.folders.filter((folder) => !collapsed.has(folder.id)).map((folder) => folder.id)),
  };
}
export type LibraryFolders = ReturnType<typeof useLibraryFolders>;
