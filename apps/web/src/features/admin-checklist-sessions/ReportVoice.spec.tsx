// @vitest-environment jsdom
import '../../i18n/index.js';

import i18n from 'i18next';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ list: vi.fn(), blob: vi.fn() }));
vi.mock('../../shared/api/checklists.js', () => ({
  listChecklistVoiceNotes: api.list,
  getChecklistVoiceNoteBlob: api.blob,
  removeChecklistVoiceNote: vi.fn(),
  uploadChecklistVoiceNote: vi.fn(),
}));

import { ReportVoicePlayer, ReportVoiceProvider } from './ReportVoice.js';
import { ReportCriteria } from './SessionReportView.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const t = i18n.t.bind(i18n) as never;
const note = (id: string, place: 'answer' | 'reviewer_comment' | 'summary', itemId: string | null, field?: string) => ({ id, itemId, place, field: field ?? null, durationMs: 4000, sizeBytes: 10, createdBy: 'u', createdAt: '2026-11-26T10:00:00.000Z' });

let host: HTMLElement | undefined;
afterEach(() => { host?.remove(); host = undefined; vi.clearAllMocks(); });

async function render(active: boolean) {
  await i18n.changeLanguage('en');
  host = document.createElement('div');
  document.body.append(host);
  await act(async () => {
    createRoot(host!).render(
      <ReportVoiceProvider active={active} instanceId="inst">
        <div id="answer"><ReportVoicePlayer instanceId="inst" itemId="i1" place="answer" t={t} /></div>
        <div id="reviewer"><ReportVoicePlayer instanceId="inst" itemId="i1" place="reviewer_comment" t={t} /></div>
        <div id="strengths"><ReportVoicePlayer field="strengths" instanceId="inst" itemId={null} place="summary" t={t} /></div>
        <div id="other"><ReportVoicePlayer instanceId="inst" itemId="i2" place="answer" t={t} /></div>
      </ReportVoiceProvider>,
    );
  });
}

describe('report voice player (PR 512)', () => {
  it('shows the recordings of each comment in its own place, with a caption for the reviewer', async () => {
    api.list.mockResolvedValue([note('a', 'answer', 'i1'), note('r', 'reviewer_comment', 'i1'), note('s', 'summary', null, 'strengths')]);
    api.blob.mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
    await render(true);
    expect(host!.querySelectorAll('#answer li')).toHaveLength(1);
    expect(host!.querySelector('#reviewer')!.textContent).toContain('Reviewer’s recording');
    expect(host!.querySelectorAll('#strengths li')).toHaveLength(1);
    expect(host!.querySelector('#other')!.children).toHaveLength(0);
  });

  it('does not ask for the list when the report has no recordings, and stays empty when the list cannot be read', async () => {
    await render(false);
    expect(api.list).not.toHaveBeenCalled();
    host!.remove();
    api.list.mockRejectedValue(new Error('403'));
    await render(true);
    expect(host!.querySelectorAll('li')).toHaveLength(0);
  });

  it('the criteria table of a report carries the player next to the comment, and the reviewer’s recording after it', async () => {
    api.list.mockResolvedValue([note('a', 'answer', 'i1'), note('r', 'reviewer_comment', 'i1')]);
    api.blob.mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
    await i18n.changeLanguage('en');
    host = document.createElement('div');
    document.body.append(host);
    const report = {
      visible: true, instanceId: 'inst', sessionId: 'sess', pointsVisible: true, summary: { scoringMode: 'sum_points' }, groups: [],
      checklist: { id: 'c', title: 'Sheet', showNumbering: false },
      criteria: [{ id: 'i1', number: '', groupId: null, text: 'Shelf', state: 'answered', score: 1, maxScore: 1, levelLabel: null, comment: null, photo: null, reviewStatus: null, color: null, voice: { answer: { count: 1, seconds: 4 }, reviewer: { count: 1, seconds: 4 } } }],
    };
    await act(async () => { createRoot(host!).render(<ReportCriteria report={report as never} t={t} />); });
    expect(host.querySelectorAll('td li')).toHaveLength(2);
    expect(host.textContent).toContain('Reviewer’s recording');
  });
});
