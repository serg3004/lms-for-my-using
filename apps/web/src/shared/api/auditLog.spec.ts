import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiClient.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../apiClient.js';
import { getAuditLogFilterOptions, listAuditLog } from './auditLog.js';

describe('audit log API', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('lists audit log entries with no query when no filters are given', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    await listAuditLog();

    expect(apiRequest).toHaveBeenCalledWith('/audit-log');
  });

  it('encodes only the provided, non-empty filters', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    await listAuditLog({ page: 2, pageSize: 10, action: 'course.created', targetType: '' });

    expect(apiRequest).toHaveBeenCalledWith('/audit-log?page=2&pageSize=10&action=course.created');
  });

  it('loads filter options', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ actions: ['course.created'], targetTypes: ['course'] });

    await getAuditLogFilterOptions();

    expect(apiRequest).toHaveBeenCalledWith('/audit-log/filter-options');
  });
});
