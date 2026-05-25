import { hashPassword, verifyPassword } from './passwords';

describe('Passwords', () => {
  it('hashes and verifies a valid password', async () => {
    const passwordHash = await hashPassword('secret-password');

    expect(passwordHash).not.toBe('secret-password');
    await expect(verifyPassword('secret-password', passwordHash)).resolves.toBe(true);
  });

  it('rejects an invalid password', async () => {
    const passwordHash = await hashPassword('secret-password');

    await expect(verifyPassword('wrong-password', passwordHash)).resolves.toBe(false);
  });
});
