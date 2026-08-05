import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../../shared/apiClient.js', () => mocks);

import { useMaterialMutations } from './useMaterialMutations.js';

describe('useMaterialMutations', () => {
  it('creates a material under a course', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ id: 'material-1' });
    const { create } = useMaterialMutations();

    await create('course 1', { title: 'Handbook' });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/courses/course%201/materials', {
      method: 'POST',
      body: JSON.stringify({ title: 'Handbook' }),
    });
  });

  it('updates a material by id', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ id: 'material-1' });
    const { update } = useMaterialMutations();

    await update('material 1', { title: 'Updated' });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/materials/material%201', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    });
  });

  it('updates a material status by id', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ id: 'material-1' });
    const { updateStatus } = useMaterialMutations();

    await updateStatus('material 1', 'published');

    expect(mocks.apiRequest).toHaveBeenCalledWith('/materials/material%201/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'published' }),
    });
  });
});
