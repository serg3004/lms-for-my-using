import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import type { BackgroundJobsService } from '../background-jobs/public.js';
import type { CourseAccessPolicy } from '../course-access/public.js';
import { assessmentExportInput, AssessmentExportsService } from './assessment-exports.service.js';
import type { AssessmentResultsService } from './assessment-results.service.js';

const actor = { id: 'manager', organizationId: 'organization', roles: ['manager' as const] };
const input = assessmentExportInput.parse({ format: 'xlsx', view: 'results', locale: 'en', filters: { place: 'course' } });

function setup() {
  const count = jest.fn<(query: unknown) => Promise<number>>().mockResolvedValue(501);
  const enqueue = jest.fn<(...args: unknown[]) => Promise<{ id: string }>>().mockResolvedValue({ id: 'job' });
  const getResult = jest.fn(async () => ({
    state: 'completed',
    data: { assessmentId: 'test', actor, input },
    result: { file: Buffer.from('file').toString('base64'), assessmentIds: ['test'], attemptIds: ['attempt'] },
  }));
  const analytics = jest.fn(async () => {});
  const service = new AssessmentExportsService(
    { assessmentAttempt: { count }, assessment: { findFirst: async () => ({ title: 'Test' }) } } as unknown as PrismaService,
    { getAssessmentAnalytics: analytics } as unknown as AssessmentResultsService,
    { enqueue, getResult } as unknown as BackgroundJobsService,
    { assertResourceAccess: async () => {} } as unknown as CourseAccessPolicy,
  );
  return { service, count, enqueue, analytics };
}

describe('assessment export jobs', () => {
  it('queues a large export with its exact filters and skips synchronous rendering', async () => {
    const { service, enqueue, analytics } = setup();
    await expect(service.start('test', actor, input)).resolves.toEqual({ id: 'job' });
    expect(enqueue).toHaveBeenCalledWith('assessment.export', expect.objectContaining({ assessmentId: 'test', actor, input }), expect.anything());
    expect(analytics).not.toHaveBeenCalled();
  });

  it('checks the current team scope before releasing a completed file', async () => {
    const { service, count } = setup();
    count.mockResolvedValueOnce(0);
    await expect(service.download('test', 'job', actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: ['attempt'] }, organizationId: actor.organizationId,
        user: { groupMemberships: { some: expect.objectContaining({
          group: expect.objectContaining({ managers: { some: expect.objectContaining({ managerId: actor.id }) } }),
        }) } },
      }),
    });
  });

  it('keeps jobs private to their requester', async () => {
    const { service, count } = setup();
    await expect(service.status('test', 'job', { ...actor, id: 'other-manager' })).rejects.toBeInstanceOf(NotFoundException);
    expect(count).not.toHaveBeenCalled();
  });
});
