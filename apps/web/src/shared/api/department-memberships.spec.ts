import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiClient.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../apiClient.js';
import {
  bulkTransferDepartmentUsers,
  closeDepartmentMembership,
  createDepartmentMembership,
  listDepartmentUsers,
  listUserDepartmentMemberships,
  transferUserDepartment,
} from './department-memberships.js';

describe('department memberships API', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('lists department users with no query when no params are given', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    await listDepartmentUsers('dept-1');

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/users');
  });

  it('encodes page, pageSize, and a non-empty search term', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], page: 2, pageSize: 10, total: 0 });

    await listDepartmentUsers('dept-1', { page: 2, pageSize: 10, search: 'ada' });

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/users?page=2&pageSize=10&search=ada');
  });

  it('lists a user department membership history', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await listUserDepartmentMemberships('user-1');

    expect(apiRequest).toHaveBeenCalledWith('/users/user-1/department-memberships');
  });

  it('creates a membership with the given payload', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await createDepartmentMembership({ organizationId: 'org-1', departmentId: 'dept-1', userId: 'user-1', isPrimary: true });

    expect(apiRequest).toHaveBeenCalledWith('/department-memberships', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', departmentId: 'dept-1', userId: 'user-1', isPrimary: true }),
    });
  });

  it('closes a membership by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await closeDepartmentMembership('membership-1');

    expect(apiRequest).toHaveBeenCalledWith('/department-memberships/membership-1/close', { method: 'POST' });
  });

  it('transfers a user to a target department', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await transferUserDepartment('user-1', 'dept-2');

    expect(apiRequest).toHaveBeenCalledWith('/users/user-1/department-transfer', {
      method: 'POST',
      body: JSON.stringify({ departmentId: 'dept-2' }),
    });
  });

  it('bulk transfers users to a target department', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await bulkTransferDepartmentUsers('dept-2', ['user-1', 'user-2']);

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-2/users/bulk-transfer', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['user-1', 'user-2'] }),
    });
  });
});
