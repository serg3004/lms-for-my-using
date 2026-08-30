import { jest } from '@jest/globals';

import { computeEffectiveDepartmentManagers } from './effective-managers.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const grandparentId = '22222222-2222-2222-2222-222222222222';
const parentId = '33333333-3333-3333-3333-333333333333';
const departmentId = '44444444-4444-4444-4444-444444444444';
const userA = '55555555-5555-5555-5555-555555555555';
const userB = '66666666-6666-6666-6666-666666666666';
const userC = '77777777-7777-7777-7777-777777777777';

type DepartmentRow = { id: string; directManagerMode: string; functionalManagerMode: string };
type ManagerRow = { id: string; departmentId: string; userId: string; type: string; isPrimary: boolean; effectiveFrom: Date };

/** Ancestor chain root-first including self, per department-tree-queries.getAncestorIdChain. */
function createClient(chain: string[], departments: DepartmentRow[], managers: ManagerRow[]) {
  return {
    $queryRaw: jest.fn(async () => chain.map((id, index) => ({ id, lvl: chain.length - 1 - index }))),
    department: { findMany: jest.fn(async () => departments) },
    departmentManager: { findMany: jest.fn(async () => managers) },
  } as never;
}

const now = new Date('2026-01-01T00:00:00Z');

describe('computeEffectiveDepartmentManagers', () => {
  it('returns the local set unmodified under LOCAL mode', async () => {
    const client = createClient(
      [departmentId],
      [{ id: departmentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' }],
      [{ id: 'm1', departmentId, userId: userA, type: 'DIRECT', isPrimary: true, effectiveFrom: now }],
    );

    const result = await computeEffectiveDepartmentManagers(client, departmentId, organizationId);

    expect(result).toEqual([
      { id: 'm1', type: 'DIRECT', userId: userA, isPrimary: true, source: 'LOCAL', sourceDepartmentId: departmentId, effectiveFrom: now },
    ]);
  });

  it('returns nothing under LOCAL mode with no local managers, even if ancestors have some', async () => {
    const client = createClient(
      [parentId, departmentId],
      [
        { id: parentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
        { id: departmentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
      ],
      [{ id: 'm1', departmentId: parentId, userId: userA, type: 'DIRECT', isPrimary: true, effectiveFrom: now }],
    );

    const result = await computeEffectiveDepartmentManagers(client, departmentId, organizationId);

    expect(result).toEqual([]);
  });

  it('inherits from the nearest ancestor with a non-empty effective set, three levels up', async () => {
    const client = createClient(
      [grandparentId, parentId, departmentId],
      [
        { id: grandparentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
        { id: parentId, directManagerMode: 'INHERIT', functionalManagerMode: 'LOCAL' },
        { id: departmentId, directManagerMode: 'INHERIT', functionalManagerMode: 'LOCAL' },
      ],
      [{ id: 'm1', departmentId: grandparentId, userId: userA, type: 'DIRECT', isPrimary: true, effectiveFrom: now }],
    );

    const result = await computeEffectiveDepartmentManagers(client, departmentId, organizationId);

    expect(result).toEqual([
      { id: 'm1', type: 'DIRECT', userId: userA, isPrimary: true, source: 'INHERITED', sourceDepartmentId: grandparentId, effectiveFrom: now },
    ]);
  });

  it('skips an intermediate ancestor whose own effective set is empty', async () => {
    const client = createClient(
      [grandparentId, parentId, departmentId],
      [
        { id: grandparentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
        { id: parentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' }, // LOCAL, but no local managers -> empty
        { id: departmentId, directManagerMode: 'INHERIT', functionalManagerMode: 'LOCAL' },
      ],
      [{ id: 'm1', departmentId: grandparentId, userId: userA, type: 'DIRECT', isPrimary: true, effectiveFrom: now }],
    );

    const result = await computeEffectiveDepartmentManagers(client, departmentId, organizationId);

    // parent's effective is [] (LOCAL with nothing local), so department's INHERIT sees [] too,
    // per the plan wording this reads as "no ancestor found" rather than reaching past parent.
    expect(result).toEqual([]);
  });

  it('merges local and nearest-inherited managers, deduping by user with local winning', async () => {
    const client = createClient(
      [parentId, departmentId],
      [
        { id: parentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
        { id: departmentId, directManagerMode: 'MERGE', functionalManagerMode: 'LOCAL' },
      ],
      [
        { id: 'parent-a', departmentId: parentId, userId: userA, type: 'DIRECT', isPrimary: false, effectiveFrom: now },
        { id: 'parent-b', departmentId: parentId, userId: userB, type: 'DIRECT', isPrimary: false, effectiveFrom: now },
        { id: 'local-b', departmentId, userId: userB, type: 'DIRECT', isPrimary: false, effectiveFrom: now },
        { id: 'local-c', departmentId, userId: userC, type: 'DIRECT', isPrimary: false, effectiveFrom: now },
      ],
    );

    const result = await computeEffectiveDepartmentManagers(client, departmentId, organizationId);

    expect(result).toHaveLength(3);
    expect(result.filter((manager) => manager.userId === userB)).toEqual([
      { id: 'local-b', type: 'DIRECT', userId: userB, isPrimary: false, source: 'LOCAL', sourceDepartmentId: departmentId, effectiveFrom: now },
    ]);
    expect(result.find((manager) => manager.userId === userA)).toMatchObject({ source: 'INHERITED', sourceDepartmentId: parentId });
    expect(result.find((manager) => manager.userId === userC)).toMatchObject({ source: 'LOCAL', sourceDepartmentId: departmentId });
  });

  it('gives local primary priority over an inherited primary under MERGE', async () => {
    const client = createClient(
      [parentId, departmentId],
      [
        { id: parentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
        { id: departmentId, directManagerMode: 'MERGE', functionalManagerMode: 'LOCAL' },
      ],
      [
        { id: 'parent-a', departmentId: parentId, userId: userA, type: 'DIRECT', isPrimary: true, effectiveFrom: now },
        { id: 'local-b', departmentId, userId: userB, type: 'DIRECT', isPrimary: true, effectiveFrom: now },
      ],
    );

    const result = await computeEffectiveDepartmentManagers(client, departmentId, organizationId);

    const local = result.find((manager) => manager.userId === userB);
    const inherited = result.find((manager) => manager.userId === userA);
    expect(local?.isPrimary).toBe(true);
    expect(inherited?.isPrimary).toBe(false);
  });

  it('lets the inherited primary stand when there is no local primary under MERGE', async () => {
    const client = createClient(
      [parentId, departmentId],
      [
        { id: parentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' },
        { id: departmentId, directManagerMode: 'MERGE', functionalManagerMode: 'LOCAL' },
      ],
      [
        { id: 'parent-a', departmentId: parentId, userId: userA, type: 'DIRECT', isPrimary: true, effectiveFrom: now },
        { id: 'local-b', departmentId, userId: userB, type: 'DIRECT', isPrimary: false, effectiveFrom: now },
      ],
    );

    const result = await computeEffectiveDepartmentManagers(client, departmentId, organizationId);

    expect(result.find((manager) => manager.userId === userA)?.isPrimary).toBe(true);
  });

  it('computes DIRECT and FUNCTIONAL independently', async () => {
    const client = createClient(
      [departmentId],
      [{ id: departmentId, directManagerMode: 'LOCAL', functionalManagerMode: 'LOCAL' }],
      [
        { id: 'm1', departmentId, userId: userA, type: 'DIRECT', isPrimary: true, effectiveFrom: now },
        { id: 'm2', departmentId, userId: userB, type: 'FUNCTIONAL', isPrimary: true, effectiveFrom: now },
      ],
    );

    const result = await computeEffectiveDepartmentManagers(client, departmentId, organizationId);

    expect(result).toHaveLength(2);
    expect(result.map((manager) => manager.type).sort()).toEqual(['DIRECT', 'FUNCTIONAL']);
  });
});
