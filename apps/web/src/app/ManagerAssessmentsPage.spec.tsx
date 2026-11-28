import '../i18n/index.js';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({ useEffect: vi.fn(), useState: vi.fn() }));
vi.mock('react', async () => ({ ...(await vi.importActual<typeof import('react')>('react')), ...reactMocks }));
import { ManagerAssessmentsPage } from './ManagerAssessmentsPage';
import { StandaloneAssessmentDialog } from './assessment-builder/StandaloneAssessmentDialog';

afterEach(() => { reactMocks.useEffect.mockReset(); reactMocks.useState.mockReset(); });

const loaded = (data: unknown[]) => reactMocks.useState.mockImplementation((initial: unknown) =>
  [(initial as { status?: string } | null)?.status === 'loading' ? { status: 'loaded', data } : initial, vi.fn()]);

describe('ManagerAssessmentsPage (PR 585)', () => {
  it('lists standalone tests with an assign button', () => {
    loaded([{ id: 't1', title: 'Fire safety' }]);
    const html = renderToStaticMarkup(<ManagerAssessmentsPage />);
    expect(html).toContain('Fire safety');
    expect(html).toContain('Назначить');
  });

  it('shows an empty state', () => {
    loaded([]);
    expect(renderToStaticMarkup(<ManagerAssessmentsPage />)).toContain('Нет опубликованных самостоятельных тестов.');
  });
});

describe('StandaloneAssessmentDialog for a manager (PR 585)', () => {
  const render = (manager: boolean) => {
    reactMocks.useState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
    return renderToStaticMarkup(<StandaloneAssessmentDialog assessment={{ id: 't1', title: 'Fire safety' }} dialog={createRef()} manager={manager} />);
  };

  it('offers only people and groups and hides results', () => {
    const html = render(true);
    expect(html).toContain('value="user"'); expect(html).toContain('value="group"');
    expect(html).not.toContain('value="department"');
    expect(html).not.toContain('<details');
  });

  it('keeps departments and results for the administrator', () => {
    const html = render(false);
    expect(html).toContain('value="department"'); expect(html).toContain('<details');
  });
});
