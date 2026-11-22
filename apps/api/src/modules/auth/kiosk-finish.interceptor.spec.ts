import { jest } from '@jest/globals';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';

import type { PrismaService } from '../../database/prisma.service.js';
import { KioskFinishInterceptor } from './kiosk-finish.interceptor.js';

const id = '3f2c1a9e-7b44-4c1d-9a55-0e6d2b1f8c10';

function setup(request: Record<string, unknown>) {
  const updateMany = jest.fn(async () => ({ count: 1 }));
  const interceptor = new KioskFinishInterceptor({ session: { updateMany } } as unknown as PrismaService);
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { updateMany, run: (handler: CallHandler) => lastValueFrom(interceptor.intercept(context, handler) as ReturnType<typeof of>) };
}

describe('KioskFinishInterceptor', () => {
  const kioskUser = { id: 'user', organizationId: 'org', kiosk: true };

  it('closes the kiosk session after the work is handed in, and leaves the answer as it was', async () => {
    const { updateMany, run } = setup({ method: 'POST', originalUrl: `/api/v1/checklist-instances/${id}/finish?x=1`, currentUser: kioskUser });
    expect(await run({ handle: () => of({ done: true }) })).toEqual({ done: true });
    expect(updateMany).toHaveBeenCalledTimes(1);
    const call = (updateMany.mock.calls[0] as unknown as [{ where: Record<string, unknown>; data: { expiresAt: Date; refreshExpiresAt: Date } }])[0];
    expect(call.where).toMatchObject({ userId: 'user', organizationId: 'org', viaBadge: true, revokedAt: null });
    // A short time to read the result, and no renewal.
    expect(call.data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(2 * 60_000);
    expect(call.data.refreshExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('does nothing for a failed call, another call, or an ordinary session', async () => {
    const failing = setup({ method: 'POST', originalUrl: `/api/v1/checklist-instances/${id}/finish`, currentUser: kioskUser });
    await expect(failing.run({ handle: () => throwError(() => new Error('boom')) })).rejects.toThrow('boom');
    expect(failing.updateMany).not.toHaveBeenCalled();

    const other = setup({ method: 'GET', originalUrl: '/api/v1/learner-dashboard', currentUser: kioskUser });
    await other.run({ handle: () => of(1) });
    expect(other.updateMany).not.toHaveBeenCalled();

    const ordinary = setup({ method: 'POST', originalUrl: `/api/v1/checklist-instances/${id}/finish`, currentUser: { id: 'user', organizationId: 'org' } });
    await ordinary.run({ handle: () => of(1) });
    expect(ordinary.updateMany).not.toHaveBeenCalled();
  });
});
