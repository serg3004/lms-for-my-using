import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiClient.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../apiClient.js';
import { getLearnerDashboardSummary } from './learnerDashboard.js';

describe('learner dashboard API', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('loads the dedicated learner dashboard aggregate in a single request', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ coursesCount: 3 });

    await getLearnerDashboardSummary();

    expect(apiRequest).toHaveBeenCalledWith('/learner-dashboard');
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
