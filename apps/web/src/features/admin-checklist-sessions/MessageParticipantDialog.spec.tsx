import '../../i18n/index.js';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useTranslation } from 'react-i18next';

import { MessageParticipantDialog, SESSION_MESSAGE_MAX_LENGTH } from './MessageParticipantDialog.js';
import type { ChecklistSessionSummary } from '../../shared/api/types.js';

const session = {
  id: 'session-1', status: 'scheduled', version: 1,
  learner: { id: 'learner-1', firstName: 'Leo', lastName: 'Learner', email: 'learner@example.invalid' },
} as unknown as ChecklistSessionSummary;

function Wrapper({ target }: { target: ChecklistSessionSummary | null }) {
  const { t } = useTranslation();
  return <MessageParticipantDialog onClose={vi.fn()} onSent={vi.fn()} session={target} t={t} />;
}

describe('MessageParticipantDialog (PR 333)', () => {
  it('shows the recipient, a length-limited field and the privacy note', () => {
    const html = renderToStaticMarkup(<Wrapper target={session} />);
    expect(html).toContain('Leo Learner');
    expect(html).toContain(`maxLength="${SESSION_MESSAGE_MAX_LENGTH}"`);
    expect(html).toContain('Обратная связь и геолокация');
  });

  it('renders a closed shell without a target', () => {
    expect(renderToStaticMarkup(<Wrapper target={null} />)).toContain('ds-wizard-dialog');
  });
});
