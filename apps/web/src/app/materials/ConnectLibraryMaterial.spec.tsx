// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ list: vi.fn(), connect: vi.fn() }));
vi.mock('../../shared/api/materialLibrary.js', () => ({ listMaterialLibrary: api.list, connectMaterial: api.connect }));

import { ConnectLibraryMaterial } from './ConnectLibraryMaterial.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const t = ((_: string, fallback?: string) => fallback ?? '') as unknown as TFunction;
const item = (id: string, title: string, courseId: string | null = null) => ({ id, title, kind: 'link', fileUrl: null, fileName: null, sizeBytes: null, status: 'active', courseId, folderId: null, usedIn: [] });
const flush = () => act(async () => { await Promise.resolve(); });

describe('ConnectLibraryMaterial (PR 582)', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

  it('offers only materials that are not in the course yet and connects the chosen one to the chosen lesson', async () => {
    api.list.mockResolvedValue([item('m1', 'Policy'), item('m2', 'Already here'), item('m3', 'Own', 'course-1')]);
    api.connect.mockResolvedValue({});
    const onConnected = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    await act(async () => createRoot(host).render(<ConnectLibraryMaterial courseId="course-1" lessons={[{ id: 'l1', title: 'Intro', order: 1 }]} connectedIds={['m2']} onConnected={onConnected} t={t} />));
    await flush();

    const selects = host.querySelectorAll('select');
    expect(Array.from(selects[0]!.querySelectorAll('option')).map((option) => option.textContent)).toEqual(['Choose a material', 'Policy']);
    const change = (select: HTMLSelectElement, value: string) => act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    change(selects[0]!, 'm1');
    change(selects[1]!, 'l1');
    await act(async () => { host.querySelector<HTMLButtonElement>('button')!.click(); });
    await flush();

    expect(api.connect).toHaveBeenCalledWith('course-1', 'm1', 'l1');
    expect(onConnected).toHaveBeenCalled();
  });

  it('says so when the library has nothing to connect', async () => {
    api.list.mockResolvedValue([]);
    const host = document.createElement('div');
    document.body.append(host);
    await act(async () => createRoot(host).render(<ConnectLibraryMaterial courseId="course-1" lessons={[]} connectedIds={[]} onConnected={vi.fn()} t={t} />));
    await flush();
    expect(host.textContent).toContain('There are no library materials to connect.');
    expect(host.querySelector('select')).toBeNull();
  });
});
