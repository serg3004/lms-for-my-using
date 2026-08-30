import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiClient.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../apiClient.js';
import { archivePosition, createPosition, getPosition, listPositions, restorePosition, updatePosition } from './positions.js';

describe('positions API', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('lists positions with pagination and search/status filters', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    await listPositions({ page: 2, pageSize: 10, search: 'eng', status: 'active' });

    expect(apiRequest).toHaveBeenCalledWith('/positions?page=2&pageSize=10&search=eng&status=active');
  });

  it('lists positions with no query params', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    await listPositions();

    expect(apiRequest).toHaveBeenCalledWith('/positions');
  });

  it('gets a position by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await getPosition('pos-1');

    expect(apiRequest).toHaveBeenCalledWith('/positions/pos-1');
  });

  it('creates a position with the given payload', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await createPosition({ organizationId: 'org-1', code: 'eng-lead', title: 'Engineering Lead' });

    expect(apiRequest).toHaveBeenCalledWith('/positions', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', code: 'eng-lead', title: 'Engineering Lead' }),
    });
  });

  it('updates a position by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await updatePosition('pos-1', { title: 'New title' });

    expect(apiRequest).toHaveBeenCalledWith('/positions/pos-1', { method: 'PATCH', body: JSON.stringify({ title: 'New title' }) });
  });

  it('archives a position by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await archivePosition('pos-1');

    expect(apiRequest).toHaveBeenCalledWith('/positions/pos-1/archive', { method: 'POST' });
  });

  it('restores a position by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await restorePosition('pos-1');

    expect(apiRequest).toHaveBeenCalledWith('/positions/pos-1/restore', { method: 'POST' });
  });
});
