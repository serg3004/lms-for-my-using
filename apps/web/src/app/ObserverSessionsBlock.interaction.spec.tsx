// @vitest-environment jsdom
import '../i18n/index.js';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ObserverSessionsBlock } from './ObserverSessionsBlock.js';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../shared/api/checklistSessions.js', () => ({ listOwnChecklistSessions: mocks.list, markChecklistSessionObserverUnavailable: vi.fn() }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });
function Destination() { return <div data-destination>{useLocation().pathname}</div>; }
async function render() {
  await act(async () => root.render(<MemoryRouter initialEntries={['/learn/checklists']}><Routes>
    <Route path="/learn/checklists" element={<ObserverSessionsBlock />} />
    <Route path="/instructor/checklists/sessions/:id" element={<Destination />} />
  </Routes></MemoryRouter>));
}
const session = {
  id: 'assigned-session', status: 'in_progress', checklist: { title: 'Observed checklist' },
  learner: { firstName: 'Employee', lastName: 'One' }, scheduledAt: null,
};
it('hides the block without assignments', async () => {
  mocks.list.mockResolvedValue({ items: [], total: 0 }); await render();
  expect(host.querySelector('section')).toBeNull();
});
it('opens the shared conduct route from the assigned card', async () => {
  mocks.list.mockResolvedValue({ items: [session], total: 1 }); await render();
  expect(mocks.list).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
  const card = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Observed checklist'));
  expect(card).toBeDefined(); await act(async () => card!.click());
  expect(host.querySelector('[data-destination]')?.textContent).toBe('/instructor/checklists/sessions/assigned-session');
});
it('loads later pages rather than silently omitting assigned sessions', async () => {
  mocks.list.mockResolvedValueOnce({ items: [session], total: 2 }).mockResolvedValueOnce({ items: [{ ...session, id: 'later', checklist: { title: 'Later page' } }], total: 2 });
  await render(); expect(host.textContent).toContain('Later page');
  expect(mocks.list).toHaveBeenLastCalledWith({ page: 2, pageSize: 100 });
});
it('shows a load error and retries without leaving the page', async () => {
  mocks.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [session], total: 1 });
  await render(); expect(host.querySelector('[role=alert]')).not.toBeNull();
  const retry = host.querySelector('button'); expect(retry).not.toBeNull();
  await act(async () => retry!.click()); expect(host.textContent).toContain('Observed checklist');
});
