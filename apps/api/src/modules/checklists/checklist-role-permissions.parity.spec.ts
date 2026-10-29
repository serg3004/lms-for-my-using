import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { rolePolicies, type UserRole } from '../auth/roles.js';
import {
  CHECKLIST_ROLE_PERMISSIONS,
  PERMISSION_ROLES,
  rolesWithAccess,
  type ChecklistPermissionRow,
  type PermissionAccess,
} from './checklist-role-permissions.table.js';

// PR 359: the owner's table of rights is the single reference. It exists as
// docs/product/future/CHECKLIST_ROLE_PERMISSIONS_TABLE.md and as the machine-readable copy next to this
// spec; this spec pins the two to each other and to `rolePolicies`. It never changes API behaviour: a row
// whose code differs stays "planned" with the PR that will fix it.
const TABLE_DOC = fileURLToPath(new URL('../../../../../docs/product/future/CHECKLIST_ROLE_PERMISSIONS_TABLE.md', import.meta.url));

const sorted = (roles: readonly UserRole[]) => [...roles].sort();
const policyRoles = (entry: ChecklistPermissionRow): UserRole[] =>
  [...new Set((entry.policies ?? []).flatMap((policy) => rolePolicies[policy] as readonly UserRole[]))];

function accessFromCell(cell: string): PermissionAccess {
  const text = cell.replace(/[²¹³]/g, '').trim();
  if (text.startsWith('Да')) return 'yes';
  if (text === 'Нет') return 'none';
  if (text === 'Вся организация') return 'all';
  if (text === 'Своя команда') return 'team';
  if (text.startsWith('Только свои') || text === 'Только с собой как наблюдателем') return 'own';
  if (text.startsWith('Только назначенные')) return 'assigned';
  throw new Error(`Unknown access wording in the rights table: "${cell}"`);
}

type DocRow = { number: number; access: PermissionAccess[]; status: 'implemented' | 'planned'; prs: number[] };

function readDocRows(): DocRow[] {
  return readFileSync(TABLE_DOC, 'utf8')
    .split('\n')
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      // number | action | 5 roles | status
      expect(cells).toHaveLength(8);
      const status = cells[7] ?? '';
      const planned = /^план: PR ([\d, ]+)/.exec(status);
      if (!planned && !/^реализовано/.test(status)) throw new Error(`Row ${cells[0]}: status must be "реализовано" or "план: PR N", got "${status}"`);
      return {
        number: Number(cells[0]),
        access: cells.slice(2, 7).map(accessFromCell),
        status: planned ? 'planned' : 'implemented',
        prs: planned ? (planned[1] ?? '').split(',').map((value) => Number(value.trim())) : [],
      };
    });
}

describe('checklist role permissions table (PR 359)', () => {
  it('has 22 rows in order, one key per row, for the five fixed roles', () => {
    expect(CHECKLIST_ROLE_PERMISSIONS.map((entry) => entry.number)).toEqual(Array.from({ length: 22 }, (_, index) => index + 1));
    expect(new Set(CHECKLIST_ROLE_PERMISSIONS.map((entry) => entry.key)).size).toBe(22);
    expect(PERMISSION_ROLES).toEqual(['admin', 'manager', 'instructor', 'mentor', 'learner']);
  });

  it('keeps the markdown table and the machine-readable table equal, row by row', () => {
    const doc = readDocRows();
    expect(doc.map((entry) => entry.number)).toEqual(CHECKLIST_ROLE_PERMISSIONS.map((entry) => entry.number));
    for (const entry of CHECKLIST_ROLE_PERMISSIONS) {
      const docRow = doc.find((candidate) => candidate.number === entry.number);
      expect({ row: entry.number, access: docRow?.access }).toEqual({ row: entry.number, access: [...entry.access] });
      expect({ row: entry.number, status: docRow?.status }).toEqual({ row: entry.number, status: entry.status });
      expect({ row: entry.number, prs: docRow?.prs }).toEqual({ row: entry.number, prs: [...(entry.prs ?? [])] });
    }
  });

  describe.each(CHECKLIST_ROLE_PERMISSIONS.filter((entry) => entry.status === 'implemented'))('implemented row $number ($key)', (entry) => {
    it('is granted to exactly the roles of the table', () => {
      expect(entry.policies?.length ?? 0).toBeGreaterThan(0);
      expect({ row: entry.number, roles: sorted(policyRoles(entry)) }).toEqual({ row: entry.number, roles: sorted(rolesWithAccess(entry)) });
    });
  });

  // PR 367: every row is implemented now, so the planned-row checks are a loop (describe.each throws on an empty table).
  for (const entry of CHECKLIST_ROLE_PERMISSIONS.filter((candidate) => candidate.status === 'planned')) describe(`planned row ${entry.number} (${entry.key})`, () => {
    it('names the PR that brings the code to the table', () => {
      expect(entry.prs?.length ?? 0).toBeGreaterThan(0);
      expect(entry.prs?.every((pr) => pr >= 359 && pr <= 367)).toBe(true);
    });

    it('still differs from the code, so the status is not stale', () => {
      if (!entry.policies) return;
      const same = JSON.stringify(sorted(policyRoles(entry))) === JSON.stringify(sorted(rolesWithAccess(entry)));
      if (entry.scopeGap) {
        // Equal roles with a different scope: the note must say what differs.
        expect({ row: entry.number, sameRoles: same }).toEqual({ row: entry.number, sameRoles: true });
      } else {
        // The code already grants the table's roles: mark the row "реализовано" (or describe the scope gap).
        expect({ row: entry.number, sameRoles: same }).toEqual({ row: entry.number, sameRoles: false });
      }
    });
  });
});
