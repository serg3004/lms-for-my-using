import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../apiClient.js', () => mocks);

import { sendManagerOverdueReminders } from './manager.js';

describe('manager reminders api', () => {
  beforeEach(() => mocks.apiRequest.mockReset());

  it('posts selected assignment ids', async () => {
    mocks.apiRequest.mockResolvedValue({ sent: 1, failed: 0, results: [] });
    await sendManagerOverdueReminders(['assignment-1']);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/manager/overdue-reminders', {
      method: 'POST',
      body: JSON.stringify({ assignmentIds: ['assignment-1'] }),
    });
  });
});
