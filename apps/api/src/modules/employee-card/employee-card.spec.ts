import { assertInspectorTerm, clearanceOf, datedStatus, hasDetail, visibleBlocks, visibleFields } from './employee-card.js';

describe('employee card rules', () => {
  const now = new Date('2026-11-22T12:00:00Z');

  it('gives detail only to the person, the administrator and the manager of the team', () => {
    expect(['self', 'admin', 'manager', 'peer', 'inspector'].map((level) => hasDetail(level as never))).toEqual([true, true, true, false, false]);
  });

  it('shows everything to those with detail, the chosen blocks to a colleague and the listed ones to an inspector', () => {
    expect(visibleBlocks('admin', [], undefined)).toEqual(['courses', 'certificates', 'checklists', 'clearance']);
    expect(visibleBlocks('peer', ['clearance', 'courses'], undefined)).toEqual(['courses', 'clearance']);
    expect(visibleBlocks('inspector', ['courses', 'clearance'], ['clearance', 'photo'])).toEqual(['clearance']);
    expect(visibleBlocks('inspector', ['courses'], undefined)).toEqual([]);
  });

  it('limits the header facts of an inspector to the listed ones', () => {
    expect(visibleFields('peer', undefined)).toEqual(['photo', 'position', 'department', 'employeeNumber']);
    expect(visibleFields('inspector', ['photo', 'clearance'])).toEqual(['photo']);
    expect(visibleFields('inspector', undefined)).toEqual([]);
  });

  it('tells done, overdue and open', () => {
    expect(datedStatus(true, new Date('2020-01-01'), now)).toBe('done');
    expect(datedStatus(false, new Date('2026-11-21'), now)).toBe('overdue');
    expect(datedStatus(false, new Date('2026-11-23'), now)).toBe('open');
    expect(datedStatus(false, null, now)).toBe('open');
  });

  it('admits only when nothing is overdue or withdrawn', () => {
    expect(clearanceOf({ overdueCourses: 0, overdueChecklists: 0, revokedCertificates: 0 }).ok).toBe(true);
    expect(clearanceOf({ overdueCourses: 0, overdueChecklists: 1, revokedCertificates: 0 }).ok).toBe(false);
    expect(clearanceOf({ overdueCourses: 0, overdueChecklists: 0, revokedCertificates: 2 }).ok).toBe(false);
  });

  it('keeps the access of an inspector in the future and within 90 days', () => {
    expect(() => assertInspectorTerm(new Date('2026-11-22T11:00:00Z'), now)).toThrow('future');
    expect(() => assertInspectorTerm(new Date('2027-03-01T00:00:00Z'), now)).toThrow('90 days');
    expect(() => assertInspectorTerm(new Date('2026-12-22T00:00:00Z'), now)).not.toThrow();
  });
});
