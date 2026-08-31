import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apiClient.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../apiClient.js';
import {
  archivePositionCourse,
  createPositionCourse,
  getPositionCourse,
  listPositionCourses,
  restorePositionCourse,
  updatePositionCourse,
} from './position-courses.js';

describe('position courses API', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it('lists position courses with filters', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await listPositionCourses({ positionId: 'pos-1', courseId: 'course-1', status: 'active' });

    expect(apiRequest).toHaveBeenCalledWith('/position-courses?positionId=pos-1&courseId=course-1&status=active');
  });

  it('lists position courses with no filters', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await listPositionCourses();

    expect(apiRequest).toHaveBeenCalledWith('/position-courses');
  });

  it('gets a position course by id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await getPositionCourse('pc-1');

    expect(apiRequest).toHaveBeenCalledWith('/position-courses/pc-1');
  });

  it('creates a position course', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await createPositionCourse({ organizationId: 'org-1', positionId: 'pos-1', courseId: 'course-1', requirement: 'REQUIRED', dueDays: 30 });

    expect(apiRequest).toHaveBeenCalledWith('/position-courses', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', positionId: 'pos-1', courseId: 'course-1', requirement: 'REQUIRED', dueDays: 30 }),
    });
  });

  it('updates a position course', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await updatePositionCourse('pc-1', { requirement: 'OPTIONAL' });

    expect(apiRequest).toHaveBeenCalledWith('/position-courses/pc-1', { method: 'PATCH', body: JSON.stringify({ requirement: 'OPTIONAL' }) });
  });

  it('archives a position course', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await archivePositionCourse('pc-1');

    expect(apiRequest).toHaveBeenCalledWith('/position-courses/pc-1/archive', { method: 'POST' });
  });

  it('restores a position course', async () => {
    vi.mocked(apiRequest).mockResolvedValue({});

    await restorePositionCourse('pc-1');

    expect(apiRequest).toHaveBeenCalledWith('/position-courses/pc-1/restore', { method: 'POST' });
  });
});
