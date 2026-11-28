import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../shared/apiClient.js';
import type { DataTableSort } from '../../shared/ui.js';
import { ASSESSMENT_STATUSES, type Assessment, type AssessmentStatus } from './model.js';

export type AssessmentListRow = Assessment & {
  hasUnpublishedChanges?: boolean;
  courseTitle: string | null;
  questionsCount: number;
  attemptsCount: number;
  passRate: number | null;
  lastAttemptAt: string | null;
  /** PR 583: other courses and longread lessons the test is placed in. */
  places?: { kind: 'course' | 'longread'; title: string }[];
};

type AssessmentPage = { items: AssessmentListRow[]; total: number; page: number; pageSize: number };
const sorts = ['createdAt', 'title', 'course', 'status', 'questions', 'attempts', 'passRate', 'lastAttemptAt'];
const emptyPage: AssessmentPage = { items: [], total: 0, page: 1, pageSize: 25 };

export function useAssessmentList(staleFolder: boolean) {
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: AssessmentPage | null } | null>(null);
  const search = (params.get('search') ?? '').slice(0, 200);
  const status = params.get('status') as AssessmentStatus | null;
  const course = params.get('course') ?? '';
  const folder = params.get('folder');
  const mine = params.get('mine') === 'true';
  const attempts = params.get('attempts');
  const rawSort = params.get('sort') ?? '';
  const sort = sorts.includes(rawSort) ? rawSort : 'createdAt';
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';
  const rawPage = Number(params.get('page'));
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 1_000_000 ? rawPage : 1;
  const activeStatus = status && ASSESSMENT_STATUSES.includes(status) ? status : '';
  const activeAttempts = attempts === 'with' || attempts === 'without' ? attempts : '';
  const filtering = Boolean(search.trim() || activeStatus || course || mine || activeAttempts);
  const folderFilter = staleFolder ? 'root' : folder ?? (filtering ? 'all' : 'root');

  const query = new URLSearchParams({ page: String(page), sort, direction });
  if (search.trim()) query.set('search', search.trim());
  if (activeStatus) query.set('status', activeStatus);
  if (course) query.set('courseId', course);
  if (folderFilter !== 'all') query.set('folderId', folderFilter);
  if (mine) query.set('mine', 'true');
  if (activeAttempts) query.set('attempts', activeAttempts);
  const path = `/assessments/library?${query}`;
  const key = `${path}:${revision}`;

  const set = useCallback((changes: Record<string, string>, replace = false) => {
    // BrowserRouter updates history before React commits the corresponding render.
    const next = new URLSearchParams(window.location.search);
    if (!Object.hasOwn(changes, 'page')) next.delete('page');
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    setParams(next, { replace });
  }, [setParams]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void apiRequest<AssessmentPage>(path, { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted) return;
          const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
          if (page > lastPage) set({ page: lastPage === 1 ? '' : String(lastPage) }, true);
          else setLoaded({ key, data });
        })
        .catch(() => { if (!controller.signal.aborted) setLoaded({ key, data: null }); });
    }, search.trim() ? 220 : 0);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [key, page, path, search, set]);

  const current = loaded?.key === key ? loaded : null;
  const tableSort: DataTableSort = { key: sort, direction: direction === 'asc' ? 'ascending' : 'descending' };
  return {
    search, status: activeStatus, course, folder: folderFilter, mine, attempts: activeAttempts, filtering,
    key, set, tableSort, page: current?.data ?? emptyPage, loading: current === null,
    error: current !== null && current.data === null,
    reload: useCallback(() => setRevision((value) => value + 1), []),
  };
}
