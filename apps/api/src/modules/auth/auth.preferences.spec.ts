import { updatePreferencesSchema } from './auth.schemas';
import { AuthService } from './auth.service';
import { jest } from '@jest/globals';

describe('learner preferences', () => {
  it.each(['ru', 'en', 'kk', 'zh'])('accepts supported locale %s', (locale) => {
    expect(updatePreferencesSchema.parse({ locale })).toEqual({ locale });
  });

  it('rejects unsupported locales and extra writable fields', () => {
    expect(() => updatePreferencesSchema.parse({ locale: 'fr' })).toThrow();
    expect(() => updatePreferencesSchema.parse({ locale: 'en', firstName: 'Changed' })).toThrow();
  });

  it('updates only the scoped user locale and returns the current-user contract', async () => {
    const record = {
      id: 'user-1', organizationId: 'org-1', email: 'learner@example.com', firstName: 'Ada', lastName: 'Lovelace',
      middleName: null, position: null, shift: null, phone: null, status: 'active', locale: 'en', timezone: 'UTC',
    };
    const prisma = {
      user: { update: jest.fn().mockResolvedValue(record) },
      membership: { findMany: jest.fn().mockResolvedValue([{ role: 'learner' }]) },
    };
    const service = new AuthService(prisma as never);

    await expect(service.updatePreferences('user-1', 'org-1', { locale: 'en' })).resolves.toEqual({ ...record, roles: ['learner'] });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1', organizationId: 'org-1' }, data: { locale: 'en' },
    }));
  });
});
