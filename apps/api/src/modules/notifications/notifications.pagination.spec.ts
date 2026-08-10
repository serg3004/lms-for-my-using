import { jest } from '@jest/globals';

import { NotificationsService } from './notifications.service.js';

describe('NotificationsService pagination', () => {
  it('uses a stable bounded keyset query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new NotificationsService({ notification: { findMany } } as never);
    const cursor = 'd9428888-122b-11e1-b85c-61cd3cbb3210';

    await service.listNotifications('user-id', 'organization-id', 25, cursor);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-id', organizationId: 'organization-id' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      cursor: { id: cursor },
      skip: 1,
      take: 25,
    }));
  });
});
