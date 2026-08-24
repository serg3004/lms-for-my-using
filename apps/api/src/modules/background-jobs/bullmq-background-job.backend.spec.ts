import { jest } from '@jest/globals';
import { queueDepth } from '../../common/observability/metrics.js';

import { BullMqBackgroundJobBackend } from './bullmq-background-job.backend.js';
import { DisabledBackgroundJobBackend } from './disabled-background-job.backend.js';

describe('BullMqBackgroundJobBackend operational checks', () => {
  it('reports queue and dead-letter counts and refreshes their metrics', async () => {
    const backend = Object.create(BullMqBackgroundJobBackend.prototype) as BullMqBackgroundJobBackend;
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 3, active: 2, delayed: 1, failed: 4 }),
    };
    const deadLetterQueue = {
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 2, active: 1, delayed: 0, failed: 3, completed: 4 }),
    };
    Object.assign(backend, { queue, deadLetterQueue });

    await expect(backend.getOperationalStatus()).resolves.toEqual({
      status: 'ok',
      waiting: 3,
      active: 2,
      delayed: 1,
      failed: 4,
      deadLetter: 10,
    });
    expect(queue.getJobCounts).toHaveBeenCalledWith('waiting', 'active', 'delayed', 'failed');
    expect(deadLetterQueue.getJobCounts).toHaveBeenCalledWith('waiting', 'active', 'delayed', 'failed', 'completed');

    const samples = (await queueDepth.get()).values;
    expect(samples.find(({ labels }) => labels.queue === 'background' && labels.state === 'active')?.value).toBe(2);
    expect(samples.find(({ labels }) => labels.queue === 'dead_letter' && labels.state === 'total')?.value).toBe(10);
  });

  it('treats omitted BullMQ count fields as zero', async () => {
    const backend = Object.create(BullMqBackgroundJobBackend.prototype) as BullMqBackgroundJobBackend;
    Object.assign(backend, {
      queue: { getJobCounts: jest.fn().mockResolvedValue({}) },
      deadLetterQueue: { getJobCounts: jest.fn().mockResolvedValue({}) },
    });

    await expect(backend.getOperationalStatus()).resolves.toMatchObject({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      deadLetter: 0,
    });
  });
});

describe('DisabledBackgroundJobBackend operational checks', () => {
  it('reports a safe disabled status without contacting Redis', async () => {
    const backend = new DisabledBackgroundJobBackend();

    await expect(backend.getOperationalStatus()).resolves.toEqual({
      status: 'disabled',
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      deadLetter: 0,
    });
  });
});
