import { createOrganizationSchema } from './organizations.schemas.js';

describe('Organizations validation', () => {
  it('accepts valid organization input', () => {
    const input = createOrganizationSchema.parse({
      name: 'Acme Academy',
      slug: 'acme-academy',
    });

    expect(input).toEqual({
      name: 'Acme Academy',
      slug: 'acme-academy',
      status: 'active',
      plan: 'trial',
    });
  });

  it('rejects invalid organization slug', () => {
    expect(() =>
      createOrganizationSchema.parse({
        name: 'Acme Academy',
        slug: 'Acme Academy',
      }),
    ).toThrow();
  });
});
