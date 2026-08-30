import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiClient.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../apiClient.js';
import {
  archiveDepartment,
  archiveDepartmentType,
  createDepartment,
  createDepartmentType,
  getDepartment,
  getDepartmentChildren,
  getDepartmentPath,
  getDepartmentTree,
  listDepartments,
  listDepartmentTypes,
  moveDepartment,
  restoreDepartment,
  restoreDepartmentType,
  updateDepartment,
  updateDepartmentType,
} from './departments.js';

describe('departments API', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('gets the department tree, optionally scoped by status', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await getDepartmentTree();
    expect(apiRequest).toHaveBeenCalledWith('/departments/tree');

    await getDepartmentTree('archived');
    expect(apiRequest).toHaveBeenCalledWith('/departments/tree?status=archived');
  });

  it('lists departments with only the defined query params', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    await listDepartments({ search: 'eng', status: 'active' });

    expect(apiRequest).toHaveBeenCalledWith('/departments?search=eng&status=active');
  });

  it('lists departments with no query string when no params are given', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    await listDepartments({});

    expect(apiRequest).toHaveBeenCalledWith('/departments');
  });

  it('gets a single department by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await getDepartment('dept-1');

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1');
  });

  it('gets a department\'s children, optionally scoped by status', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await getDepartmentChildren('dept-1', 'active');

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/children?status=active');
  });

  it('gets a department\'s ancestor path', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await getDepartmentPath('dept-1');

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/path');
  });

  it('creates a department with the given payload', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await createDepartment({ organizationId: 'org-1', name: 'Engineering' });

    expect(apiRequest).toHaveBeenCalledWith('/departments', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', name: 'Engineering' }),
    });
  });

  it('updates a department by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await updateDepartment('dept-1', { name: 'New name' });

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New name' }),
    });
  });

  it('moves a department to a new parent (or root, when null)', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await moveDepartment('dept-1', 'dept-2');

    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/move', {
      method: 'POST',
      body: JSON.stringify({ parentId: 'dept-2' }),
    });
  });

  it('archives and restores a department', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await archiveDepartment('dept-1');
    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/archive', { method: 'POST' });

    await restoreDepartment('dept-1');
    expect(apiRequest).toHaveBeenCalledWith('/departments/dept-1/restore', { method: 'POST' });
  });

  it('lists department types', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await listDepartmentTypes();

    expect(apiRequest).toHaveBeenCalledWith('/department-types');
  });

  it('creates, updates, archives and restores a department type', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await createDepartmentType({ organizationId: 'org-1', code: 'eng', name: 'Engineering' });
    expect(apiRequest).toHaveBeenCalledWith('/department-types', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', code: 'eng', name: 'Engineering' }),
    });

    await updateDepartmentType('type-1', { name: 'New name' });
    expect(apiRequest).toHaveBeenCalledWith('/department-types/type-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New name' }),
    });

    await archiveDepartmentType('type-1');
    expect(apiRequest).toHaveBeenCalledWith('/department-types/type-1/archive', { method: 'POST' });

    await restoreDepartmentType('type-1');
    expect(apiRequest).toHaveBeenCalledWith('/department-types/type-1/restore', { method: 'POST' });
  });
});
