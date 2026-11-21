import { lookupImportDepartment, resolveImportRole } from './user-import.js';

describe('import role and department names', () => {
  it('understands role keys and names in every interface language, ignoring case and spaces', () => {
    expect(resolveImportRole(' Mentor ')).toBe('mentor');
    expect(resolveImportRole('Наставник')).toBe('mentor');
    expect(resolveImportRole('Оқытушы')).toBe('instructor');
    expect(resolveImportRole('管理员')).toBe('admin');
    expect(resolveImportRole('Ученик')).toBe('learner');
    expect(resolveImportRole('король')).toBeNull();
  });

  const departments = [
    { id: 'a', name: 'Склад' },
    { id: 'b', name: 'склад ' },
    { id: 'c', name: 'Касса' },
  ];

  it('finds one department by title, case-insensitively', () => {
    expect(lookupImportDepartment('КАССА', departments, null)).toEqual({ kind: 'found', id: 'c' });
  });

  it('refuses unknown, ambiguous and out-of-area titles instead of guessing', () => {
    expect(lookupImportDepartment('Нет', departments, null)).toEqual({ kind: 'missing' });
    expect(lookupImportDepartment('склад', departments, null)).toEqual({ kind: 'ambiguous' });
    expect(lookupImportDepartment('Касса', departments, ['a'])).toEqual({ kind: 'outside' });
  });

  it('is not ambiguous when the second department with the same title is outside the allowed area', () => {
    expect(lookupImportDepartment('Склад', departments, ['b'])).toEqual({ kind: 'found', id: 'b' });
  });
});
