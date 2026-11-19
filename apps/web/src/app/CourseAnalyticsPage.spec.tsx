// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../shared/apiClient.js';

const api = vi.hoisted(() => ({ getCourseAnalytics: vi.fn(), getCourseReport: vi.fn(), getUserReport: vi.fn(), exportCourseAnalytics: vi.fn() }));
vi.mock('../shared/api/courseAnalytics.js', () => api);
const files = vi.hoisted(() => ({ downloadCsvFile: vi.fn(), downloadXlsxFile: vi.fn() }));
vi.mock('../shared/downloadCsv.js', () => files);

import { CourseAnalyticsRoutes, formatDuration } from './CourseAnalyticsPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); });
beforeEach(async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  await i18n.changeLanguage('ru');
});

const Layout = ({ children }: { children: React.ReactNode }) => <main>{children}</main>;
const row = { courseId: 'c1', userId: 'u1', status: 'completed', lessonsTotal: 4, lessonsCompleted: 4, lessonsPercent: 100, testPercent: 90, testScore: 9, attempts: 2, testResult: 'passed', startedAt: '2026-11-01T10:00:00Z', completedAt: '2026-11-03T10:00:00Z', durationMinutes: 2880, dueAt: null, overdue: false, certificate: { status: 'issued', issuedAt: '2026-11-03T10:00:00Z' } };

async function show(path: string) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/x/*" element={<CourseAnalyticsRoutes Layout={Layout} basePath="/x" />} /></Routes></MemoryRouter>));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

describe('course analytics page (PR 474)', () => {
  it('shows totals, the course table with a link to the course report and the calendar-time note', async () => {
    api.getCourseAnalytics.mockResolvedValue({ period: { from: null, to: null }, durationBasis: 'calendar', truncated: false,
      courses: [{ courseId: 'c1', title: 'Охрана труда', assigned: 10, started: 8, completed: 6, completedPercent: 60, passed: 5, failed: 1, overdue: 2, avgPercent: 82, medianPercent: 80, avgDurationMinutes: 2880 }],
      filterOptions: { departments: [{ id: 'd1', name: 'Цех 1' }], groups: [{ id: 'g1', name: 'Смена А' }], managers: [{ id: 'm1', name: 'Петров Олег' }] },
      courseOptions: [{ id: 'c1', title: 'Охрана труда' }] });
    await show('/x');
    const text = host?.textContent ?? '';
    expect(text).toContain('Аналитика курсов');
    expect(text).toContain('Охрана труда');
    expect(text).toContain('6 (60%)');
    expect(text).toContain('2 д 0 ч');
    expect(text).toContain('календарное');
    expect(text).toContain('Цех 1');
    expect(host?.querySelector('a[href="/x/course/c1"]')).not.toBeNull();
  });

  it('shows an empty state when nothing matches', async () => {
    api.getCourseAnalytics.mockResolvedValue({ period: { from: null, to: null }, durationBasis: 'calendar', truncated: true, courses: [], filterOptions: { departments: [], groups: [], managers: [] }, courseOptions: [] });
    await show('/x');
    expect(host?.textContent).toContain('Нет данных');
    expect(host?.textContent).toContain('5000');
  });

  it('does not call the API for a reversed period and says why', async () => {
    await show('/x?from=2026-11-10&to=2026-11-01');
    expect(api.getCourseAnalytics).not.toHaveBeenCalled();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain('не может быть позже');
  });

  it('shows the course report with a pass/fail result and a link to the employee report', async () => {
    api.getCourseReport.mockResolvedValue({ period: { from: null, to: null }, durationBasis: 'calendar', truncated: false, course: { id: 'c1', title: 'Охрана труда' },
      summary: { courseId: 'c1', assigned: 1, started: 1, completed: 1, completedPercent: 100, passed: 1, failed: 0, overdue: 0, avgPercent: 90, medianPercent: 90, avgDurationMinutes: 2880 },
      rows: [{ ...row, user: { id: 'u1', firstName: 'Анна', lastName: 'Иванова', email: 'a@x.kz' } }] });
    await show('/x/course/c1');
    expect(host?.textContent).toContain('Иванова Анна');
    expect(host?.textContent).toContain('Сдал');
    expect(host?.querySelector('a[href="/x/user/u1"]')).not.toBeNull();
  });

  it('shows the employee report with the certificate', async () => {
    api.getUserReport.mockResolvedValue({ period: { from: null, to: null }, durationBasis: 'calendar', truncated: false, user: { id: 'u1', firstName: 'Анна', lastName: 'Иванова', email: 'a@x.kz' },
      summary: { assigned: 1, completed: 1, passed: 1, avgPercent: 90, certificates: 1 }, rows: [{ ...row, courseTitle: 'Охрана труда' }] });
    await show('/x/user/u1');
    expect(host?.textContent).toContain('Отчёт по сотруднику');
    expect(host?.textContent).toContain('Выдан');
  });

  it('says not found on 404 and no access on 403', async () => {
    api.getCourseReport.mockRejectedValueOnce(new ApiClientError('nf', 404));
    await show('/x/course/c9');
    expect(host?.textContent).toContain('не найден');
    act(() => root?.unmount()); host?.remove();
    api.getUserReport.mockRejectedValueOnce(new ApiClientError('no', 403));
    await show('/x/user/u9');
    expect(host?.textContent).toContain('нет доступа');
  });

  it('shows an error on a failed load', async () => {
    api.getCourseAnalytics.mockRejectedValue(new Error('boom'));
    await show('/x');
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain('Не удалось загрузить');
  });

  it('formats durations in minutes, hours and days', () => {
    const t = i18n.t.bind(i18n);
    expect(formatDuration(t, null)).toBe('—');
    expect(formatDuration(t, 45)).toBe('45 мин');
    expect(formatDuration(t, 180)).toBe('3 ч');
    expect(formatDuration(t, 1500)).toBe('1 д 1 ч');
  });

  describe('export (PR 475)', () => {
    const list = { period: { from: null, to: null }, durationBasis: 'calendar', truncated: false,
      courses: [{ courseId: 'c1', title: 'Охрана труда', assigned: 1, started: 1, completed: 1, completedPercent: 100, passed: 1, failed: 0, overdue: 0, avgPercent: 90, medianPercent: 90, avgDurationMinutes: 60 }],
      filterOptions: { departments: [], groups: [], managers: [] }, courseOptions: [] };
    const button = (name: string) => [...(host?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent === name) as HTMLButtonElement;

    it('downloads an Excel file built from the rows of the server with the filters of the screen', async () => {
      api.getCourseAnalytics.mockResolvedValue(list);
      api.exportCourseAnalytics.mockResolvedValue({ filename: 'course-analytics-courses-2026-11-19.csv', sheetName: 'Сводка по курсам', csv: 'x', rows: [['Курс'], ['Охрана труда']], rowCount: 1 });
      await show('/x?departmentId=d1');
      await act(async () => { button('Скачать Excel').click(); await new Promise((resolve) => setTimeout(resolve, 10)); });
      expect(api.exportCourseAnalytics).toHaveBeenCalledWith('courses', {}, expect.objectContaining({ departmentId: 'd1' }), 'xlsx');
      expect(files.downloadXlsxFile).toHaveBeenCalledWith('course-analytics-courses-2026-11-19.csv', [['Курс'], ['Охрана труда']], 'Сводка по курсам', { styled: true });
    });

    it('downloads the CSV as it came from the server', async () => {
      api.getCourseAnalytics.mockResolvedValue(list);
      api.exportCourseAnalytics.mockResolvedValue({ filename: 'a.csv', sheetName: 's', csv: 'csv-text', rows: [], rowCount: 0 });
      await show('/x');
      await act(async () => { button('Скачать CSV').click(); await new Promise((resolve) => setTimeout(resolve, 10)); });
      expect(files.downloadCsvFile).toHaveBeenCalledWith('a.csv', 'csv-text');
    });

    it('says the file is too big on a 400 and a plain error otherwise, and offers no export when there is no data', async () => {
      api.getCourseAnalytics.mockResolvedValue(list);
      api.exportCourseAnalytics.mockRejectedValueOnce(new ApiClientError('big', 400)).mockRejectedValueOnce(new Error('boom'));
      await show('/x');
      await act(async () => { button('Скачать Excel').click(); await new Promise((resolve) => setTimeout(resolve, 10)); });
      expect(host?.textContent).toContain('Слишком много строк');
      await act(async () => { button('Скачать Excel').click(); await new Promise((resolve) => setTimeout(resolve, 10)); });
      expect(host?.textContent).toContain('Не удалось выгрузить');
      expect(files.downloadXlsxFile).not.toHaveBeenCalled();
      act(() => root?.unmount()); host?.remove();
      api.getCourseAnalytics.mockResolvedValue({ ...list, courses: [] });
      await show('/x');
      expect(button('Скачать Excel').disabled).toBe(true);
    });
  });
});
