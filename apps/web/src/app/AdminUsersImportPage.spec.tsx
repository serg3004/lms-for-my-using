// @vitest-environment jsdom
import '../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../shared/apiClient.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../shared/apiClient.js')>()), apiRequest: client.apiRequest }));
vi.mock('../shared/session.js', () => ({ useSession: () => ({ currentUser: { id: 'a1', organizationId: 'org1', roles: ['admin'] } }), useOptionalSession: () => null }));
const downloads = vi.hoisted(() => ({ downloadCsvFile: vi.fn(), downloadXlsxFile: vi.fn() }));
vi.mock('../shared/downloadCsv.js', () => downloads);

import { AdminUsersImportPage } from './AdminUsersImportPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); vi.clearAllMocks(); fieldViews = []; });
beforeEach(async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })));
  await i18n.changeLanguage('ru');
  client.apiRequest.mockReset().mockImplementation(async (path: string) => (path === '/user-fields/for-users' ? { items: fieldViews } : undefined));
});
let fieldViews: unknown[] = [];
const importCalls = () => client.apiRequest.mock.calls.filter((call) => call[0] === '/users/import');

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const button = (name: string) => [...(host?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim().startsWith(name)) as HTMLButtonElement | undefined;
async function show() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root?.render(<MemoryRouter><AdminUsersImportPage /></MemoryRouter>));
}
async function upload(name: string, content: string) {
  const input = host?.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name);
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await flush();
}

const csv = 'Почта,Фамилия,Имя,Подразделение\na@x.kz,Ли,Анна,Склад\nb@x.kz,Ким,Бек,Нет такого\nbroken,,Вера,\n';

describe('user import page (PR 492)', () => {
  it('offers the template in both formats', async () => {
    await show();
    await act(async () => button('Скачать шаблон (.csv)')?.click());
    expect(downloads.downloadCsvFile).toHaveBeenCalledWith('шаблон-пользователей.csv', expect.stringContaining('Почта,Фамилия,Имя'));
    await act(async () => button('Скачать шаблон (.xlsx)')?.click());
    expect(downloads.downloadXlsxFile).toHaveBeenCalledWith('шаблон-пользователей.xlsx', expect.any(Array), 'шаблон-пользователей', { styled: true });
  });

  it('refuses a wrong file type without calling the server', async () => {
    await show();
    await upload('people.pdf', 'x');
    expect(host?.textContent).toContain('Поддерживаются только файлы .xlsx и .csv.');
    expect(importCalls()).toHaveLength(0);
  });

  it('checks the file, lists the problems per row, creates the valid rows and offers the report', async () => {
    await show();
    await upload('people.csv', csv);
    expect(host?.textContent).toContain('Строк в файле: 3.');
    expect(host?.textContent).toContain('Заполните: Фамилия.');

    client.apiRequest.mockResolvedValueOnce({ rows: [
      { index: 0, status: 'valid', errors: [] },
      { index: 1, status: 'skipped', errors: ['Department not found'] },
    ] });
    await act(async () => button('Проверить')?.click());
    await flush();
    expect(JSON.parse(importCalls()[0]?.[1].body)).toMatchObject({ organizationId: 'org1', mode: 'validateOnly' });
    expect(JSON.parse(importCalls()[0]?.[1].body).users).toEqual([
      { email: 'a@x.kz', lastName: 'Ли', firstName: 'Анна', department: 'Склад' },
      { email: 'b@x.kz', lastName: 'Ким', firstName: 'Бек', department: 'Нет такого' },
    ]);
    expect(host?.textContent).toContain('Готово к созданию: 1. С проблемами: 2.');
    expect(host?.textContent).toContain('Подразделение не найдено.');

    client.apiRequest.mockResolvedValueOnce({ rows: [{ index: 0, status: 'created', errors: [], invited: true, invitationDelivered: false }] });
    await act(async () => button('Создать 1')?.click());
    await flush();
    expect(JSON.parse(importCalls()[1]?.[1].body)).toMatchObject({ mode: 'create' });
    expect(host?.textContent).toContain('Создано: 1. Не создано: 2.');
    expect(host?.textContent).toContain('Приглашения не отправлены 1 людям');

    await act(async () => button('Скачать отчёт')?.click());
    expect(downloads.downloadCsvFile.mock.calls.at(-1)?.[1]).toContain('a@x.kz,создан');
  });

  it('reads custom field columns by title, turns list and yes/no cells into API values and puts the fields into the template', async () => {
    const labels = (ru: string) => ({ ru, en: ru, kk: ru, zh: ru });
    fieldViews = [
      { key: 'employee_number', labels: labels('Табельный номер'), type: 'text', required: true, unique: true, searchable: true, options: null, sortOrder: 10 },
      { key: 'work_schedule', labels: labels('График работы'), type: 'list', required: false, unique: false, searchable: false, options: [{ key: '5-2', labels: labels('5/2') }], sortOrder: 20 },
      { key: 'union', labels: labels('Профсоюз'), type: 'boolean', required: false, unique: false, searchable: false, options: null, sortOrder: 30 },
      { key: 'hire_date', labels: labels('Дата приёма'), type: 'date', required: false, unique: false, searchable: false, options: null, sortOrder: 40, editable: false },
    ];
    await show();
    await flush();
    expect(host?.textContent).toContain('Табельный номер, График работы, Профсоюз');
    await act(async () => button('Скачать шаблон (.csv)')?.click());
    expect(downloads.downloadCsvFile).toHaveBeenCalledWith('шаблон-пользователей.csv', expect.stringContaining('Роль,Табельный номер,График работы,Профсоюз'));
    await upload('people.csv', 'Почта,Фамилия,Имя,Табельный номер,График работы,Профсоюз\na@x.kz,Ли,Анна,Т-1,5/2,да\n');
    client.apiRequest.mockResolvedValueOnce({ rows: [{ index: 0, status: 'skipped', errors: ['The value of "employee_number" is already used by another person'] }] });
    await act(async () => button('Проверить')?.click());
    await flush();
    expect(JSON.parse(importCalls()[0]?.[1].body).users).toEqual([
      { email: 'a@x.kz', lastName: 'Ли', firstName: 'Анна', customFields: { employee_number: 'Т-1', work_schedule: '5-2', union: 'true' } },
    ]);
    expect(host?.textContent).toContain('Значение поля «Табельный номер» уже есть у другого человека.');
  });

  it('shows a forbidden message when the server refuses the check', async () => {
    const { ApiClientError } = await import('../shared/apiClient.js');
    await show();
    await upload('people.csv', 'Почта,Фамилия,Имя\na@x.kz,Ли,Анна\n');
    client.apiRequest.mockRejectedValueOnce(new ApiClientError('Forbidden', 403));
    await act(async () => button('Проверить')?.click());
    await flush();
    expect(host?.textContent).toContain('У вас нет права импортировать пользователей.');
  });
});
