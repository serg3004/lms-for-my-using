import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useTranslation } from 'react-i18next';

import { ChecklistWorkplaceSettingsDialog } from './ChecklistWorkplaceSettingsDialog.js';

function Wrapper({ open }: { open: boolean }) {
  const { t } = useTranslation();
  return <ChecklistWorkplaceSettingsDialog onClose={vi.fn()} open={open} t={t} />;
}

// Dialog-wrapped components rely on jsdom's HTMLDialogElement.showModal(), which jsdom does not
// implement (see ReassignObserverDialog.spec.tsx for the same constraint) -- only SSR-static
// rendering is exercised here. Because useEffect never runs under renderToStaticMarkup, the
// settings fetch never fires, so the dialog stays in its initial "loading" state regardless of
// `open`; that's the one state these tests can observe.
describe('ChecklistWorkplaceSettingsDialog', () => {
  it('renders a closed dialog shell when not open', () => {
    const html = renderToStaticMarkup(<Wrapper open={false} />);
    expect(html).toContain('<dialog');
    expect(html).not.toContain(' open=""');
  });

  it('renders the loading state before settings have been fetched', () => {
    // The app's default locale is 'ru' (see i18n/index.ts DEFAULT_LOCALE), and this dialog's
    // strings are fully translated there, so the rendered text is Russian, not the English
    // t()-call defaults.
    const html = renderToStaticMarkup(<Wrapper open />);
    expect(html).toContain('Загрузка настроек');
    expect(html).not.toContain('Модуль включён для этой организации');
  });
});
