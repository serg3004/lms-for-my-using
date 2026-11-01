// @vitest-environment jsdom
import '../i18n/index.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';
import { ApiClientError } from '../shared/apiClient.js';
const mocks = vi.hoisted(() => ({ roles: ['admin'], listChecklistScales: vi.fn(), getChecklistScale: vi.fn(), createChecklistScale: vi.fn(), updateChecklistScale: vi.fn(), copyChecklistScale: vi.fn(), archiveChecklistScale: vi.fn(), deleteChecklistScale: vi.fn() }));
vi.mock('../shared/api/checklists.js', () => mocks);
vi.mock('../shared/session.js', () => ({ useSession: () => ({ currentUser: { id: 'viewer', roles: mocks.roles } }) }));
vi.mock('../shared/adminPage.js', () => ({ AdminPageLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>, AdminPageHeader: ({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) => <header><h1>{title}</h1>{action}</header>, ChecklistsTabs: () => null, ConfirmDialog: () => null }));
import { ChecklistScalesPage } from './ChecklistScalesPage.js';
const scale = { id: 'quality', organizationId: 'org', name: 'Quality', status: 'active', isDefault: false, inUse: true, usageCount: 1, usedByChecklists: [{ id: 'sheet', title: 'Opening' }], creator: { id: 'author', firstName: 'Anna', lastName: 'Author' }, createdAt: '2026-01-15T12:00:00Z', levels: [{ value: 1, label: 'No', score: 0, color: '#C62828' }, { value: 2, label: 'Yes', score: 100, color: '#2E7D32' }] };
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(async () => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); await i18n.changeLanguage('en'); mocks.roles = ['admin']; mocks.listChecklistScales.mockResolvedValue([scale]); mocks.getChecklistScale.mockResolvedValue(scale); container = document.createElement('div'); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount(path: string) { await act(async () => { root.render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/checklists/scales/:scaleId?" element={<ChecklistScalesPage />} /></Routes></MemoryRouter>); }); }
describe('standalone evaluation scales (PR 404)', () => {
  it('lists author, usage, creation date and links to the standalone detail', async () => {
    await mount('/admin/checklists/scales');
    expect(container.textContent).toContain('Anna Author'); expect(container.textContent).toContain('Used in 1 checklists');
    expect(container.querySelector('time')?.dateTime).toBe(scale.createdAt); expect(container.querySelector('a[href="/admin/checklists/scales/quality"]')).not.toBeNull();
  });
  it('reuses the editor with a preview and usage links; an observer cannot mutate', async () => {
    mocks.roles = ['mentor']; await mount('/admin/checklists/scales/quality');
    expect(Array.from(container.querySelectorAll('input')).every((input) => input.disabled)).toBe(true);
    expect(container.querySelector('section[aria-label="Preview"]')?.textContent).toContain('100');
    expect(container.querySelector('a[href="/admin/checklists?checklistId=sheet"]')?.textContent).toBe('Opening');
    expect(Array.from(container.querySelectorAll('button')).some((button) => /Save|copy|Archive|Delete/i.test(button.textContent ?? ''))).toBe(false);
  });
  it('distinguishes a missing scale from an empty library', async () => {
    mocks.getChecklistScale.mockRejectedValueOnce(new ApiClientError('Missing', 404)); await mount('/admin/checklists/scales/missing');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('not found');
    expect(container.querySelector('input[maxlength="255"]')).toBeNull();
  });
});
