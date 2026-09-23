import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useTranslation } from 'react-i18next';

import { ChecklistSessionWizard } from './ChecklistSessionWizard.js';

function Wrapper() {
  const { t } = useTranslation();
  return <ChecklistSessionWizard onClose={vi.fn()} onCreated={vi.fn()} open={false} t={t} />;
}

describe('ChecklistSessionWizard', () => {
  it('renders a closed wizard dialog with a numbered step tracker', () => {
    const html = renderToStaticMarkup(<Wrapper />);
    expect(html).toContain('<dialog');
    expect(html).toContain('ds-wizard-dialog');
    expect(html).toContain('aria-current="step"');
  });
});
