import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiClient.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../apiClient.js';
import { getAdminDashboardSummary } from './reports.js';

describe('reports API', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('loads the dedicated admin dashboard aggregate without pagination', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ completionRate: 75 });

    await getAdminDashboardSummary();

    expect(apiRequest).toHaveBeenCalledWith('/reports/admin-dashboard');
  });
});
