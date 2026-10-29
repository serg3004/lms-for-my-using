import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { allSessionsPath, conductSessionsPath, libraryPath, ObserverSessionsNav } from './ObserverSessionsNav.js';

const roles: { current: string[] } = { current: [] };
vi.mock('../shared/session.js', () => ({ useOptionalSession: () => ({ currentUser: { roles: roles.current } }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));

describe('ObserverSessionsNav (PR 360б)', () => {
  it('points the instructor and the mentor to their own session list, the widest role first', () => {
    expect(allSessionsPath({ roles: ['instructor'] })).toBe('/instructor/checklists/sessions/all');
    expect(allSessionsPath({ roles: ['mentor', 'instructor'] })).toBe('/instructor/checklists/sessions/all');
    expect(allSessionsPath({ roles: ['mentor'] })).toBe('/mentor/sessions');
    expect(allSessionsPath({ roles: ['learner'] })).toBeNull();
    expect(allSessionsPath(null)).toBeNull();
    expect(conductSessionsPath({ roles: ['instructor'] })).toBe('/instructor/checklists/sessions');
    expect(conductSessionsPath({ roles: ['mentor'] })).toBe('/mentor');
  });

  it('points the instructor and the mentor to the checklist library (PR 362)', () => {
    expect(libraryPath({ roles: ['instructor'] })).toBe('/instructor/checklists/library');
    expect(libraryPath({ roles: ['mentor'] })).toBe('/mentor/library');
    expect(libraryPath({ roles: ['manager'] })).toBeNull();
  });

  it('renders all three tabs with the current one marked, and nothing for an employee', () => {
    roles.current = ['mentor'];
    const html = renderToStaticMarkup(<MemoryRouter><ObserverSessionsNav current="all" /></MemoryRouter>);
    expect(html).toContain('To conduct');
    expect(html).toContain('href="/mentor/library"');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/mentor\/sessions"|href="\/mentor\/sessions"[^>]*aria-current="page"/);
    roles.current = ['learner'];
    expect(renderToStaticMarkup(<MemoryRouter><ObserverSessionsNav current="all" /></MemoryRouter>)).toBe('');
  });
});
