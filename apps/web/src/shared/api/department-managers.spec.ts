import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiClient.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../apiClient.js';
import {
  closeDepartmentManager,
  createDepartmentManager,
  getEffectiveDepartmentManagers,
  updateDepartmentManagerModes,
} from './department-managers.js';

describe('department managers API', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('gets the effective manager set for a department', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await getEffectiveDepartmentManagers('dept-1');

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/managers');
  });

  it('creates a manager with the given payload', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await createDepartmentManager({ organizationId: 'org-1', departmentId: 'dept-1', userId: 'user-1', type: 'DIRECT', isPrimary: true });

    expect(apiRequest).toHaveBeenCalledWith('/department-managers', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', departmentId: 'dept-1', userId: 'user-1', type: 'DIRECT', isPrimary: true }),
    });
  });

  it('closes a manager by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await closeDepartmentManager('manager-1');

    expect(apiRequest).toHaveBeenCalledWith('/department-managers/manager-1/close', { method: 'POST' });
  });

  it('updates manager modes for a department', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await updateDepartmentManagerModes('dept-1', { directManagerMode: 'INHERIT' });

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/manager-modes', {
      method: 'PATCH',
      body: JSON.stringify({ directManagerMode: 'INHERIT' }),
    });
  });
});
