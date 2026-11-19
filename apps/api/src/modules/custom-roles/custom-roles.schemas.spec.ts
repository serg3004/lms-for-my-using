import { diffGrants } from './custom-roles.service.js';
import { archiveCustomRoleSchema, createCustomRoleSchema, updateCustomRoleSchema } from './custom-roles.schemas.js';

describe('custom role request schemas', () => {
  it('accepts a role with a name, grants and a source role', () => {
    const parsed = createCustomRoleSchema.parse({ name: '  Регистратор ', permissions: [{ action: 'user.read', scope: 'organization' }], basedOnRoleId: '2f6c1d1e-4b4e-4f4e-8a55-0f0a5d1d9c11' });
    expect(parsed.name).toBe('Регистратор');
  });

  it('refuses an empty name, an unknown scope and a bad source id', () => {
    expect(createCustomRoleSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(createCustomRoleSchema.safeParse({ name: 'x', permissions: [{ action: 'user.read', scope: 'galaxy' }] }).success).toBe(false);
    expect(createCustomRoleSchema.safeParse({ name: 'x', basedOnRoleId: 'nope' }).success).toBe(false);
  });

  it('requires the version for an update and for archiving, and refuses unknown fields', () => {
    expect(updateCustomRoleSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(updateCustomRoleSchema.safeParse({ version: 1, name: 'x', role: 'admin' }).success).toBe(false);
    expect(updateCustomRoleSchema.safeParse({ version: 2, description: null }).success).toBe(true);
    expect(archiveCustomRoleSchema.safeParse({}).success).toBe(false);
    expect(archiveCustomRoleSchema.safeParse({ version: 3 }).success).toBe(true);
  });
});

describe('diffGrants', () => {
  it('lists added and removed grants by action and scope', () => {
    const before = [{ action: 'user.read', scope: 'department' as const }, { action: 'user.create', scope: 'department' as const }];
    const after = [{ action: 'user.read', scope: 'organization' as const }, { action: 'user.create', scope: 'department' as const }];
    expect(diffGrants(before, after)).toEqual({ added: ['user.read:organization'], removed: ['user.read:department'] });
    expect(diffGrants(after, after)).toEqual({ added: [], removed: [] });
  });
});
