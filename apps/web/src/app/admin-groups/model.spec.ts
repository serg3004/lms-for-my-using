import { describe, expect, it } from 'vitest';

import {
  buildCreateGroupPayload,
  buildUpdateGroupPayload,
  computeGroupStats,
  countUniqueLocations,
  countUniqueManagers,
  formatManagerCell,
  formatUserName,
  initialCreateFormState,
  initialEditFormState,
  managerNames,
  resolveGroupSaveErrorMessage,
  usersAvailableToAdd,
  validateGroupName,
} from './model.js';

const managerA = { id: 'user-1', firstName: 'Alex', lastName: 'Ivanov' };
const managerB = { id: 'user-2', firstName: 'Maria', lastName: 'Petrova' };

describe('admin groups model', () => {
  it('joins manager names, comma-separated', () => {
    expect(managerNames({ managers: [] })).toBe('');
    expect(managerNames({ managers: [{ manager: managerA }] })).toBe('Alex Ivanov');
    expect(managerNames({ managers: [{ manager: managerA }, { manager: managerB }] })).toBe('Alex Ivanov, Maria Petrova');
  });

  it('formats the manager cell with a dash placeholder when no manager is assigned', () => {
    expect(formatManagerCell({ managers: [] })).toBe('—');
    expect(formatManagerCell({ managers: [{ manager: managerA }] })).toBe('Alex Ivanov');
  });

  it('resolves the save error message based on the 409 conflict status', () => {
    expect(resolveGroupSaveErrorMessage(409, 'Duplicate slug', 'Save failed')).toBe('Duplicate slug');
    expect(resolveGroupSaveErrorMessage(500, 'Duplicate slug', 'Save failed')).toBe('Save failed');
    expect(resolveGroupSaveErrorMessage(undefined, 'Duplicate slug', 'Save failed')).toBe('Save failed');
  });

  it('counts unique managers across groups, deduplicating shared managers', () => {
    const groups = [
      { location: 'Almaty', managers: [{ manager: managerA }] },
      { location: 'Astana', managers: [{ manager: managerA }, { manager: managerB }] },
      { location: null, managers: [] },
    ];
    expect(countUniqueManagers(groups)).toBe(2);
  });

  it('counts unique non-empty locations', () => {
    const groups = [
      { location: 'Almaty', managers: [] },
      { location: 'Almaty', managers: [] },
      { location: 'Astana', managers: [] },
      { location: null, managers: [] },
      { location: '', managers: [] },
    ];
    expect(countUniqueLocations(groups)).toBe(2);
  });

  it('computes all four group stats from the group list', () => {
    const groups = [
      { location: 'Almaty', managers: [{ manager: managerA }] },
      { location: 'Astana', managers: [{ manager: managerA }, { manager: managerB }] },
    ];
    expect(computeGroupStats(groups, 250)).toEqual({ groups: 2, employees: 250, managers: 2, locations: 2 });
  });

  it('builds the create payload, trimming blank optional fields to undefined', () => {
    expect(buildCreateGroupPayload('org-1', 'sales-team', { name: ' Sales Team ', location: ' Almaty ', description: '' })).toEqual({
      organizationId: 'org-1',
      name: 'Sales Team',
      slug: 'sales-team',
      description: undefined,
      location: 'Almaty',
    });
  });

  it('returns a blank create form state', () => {
    expect(initialCreateFormState()).toEqual({ name: '', location: '', description: '' });
  });

  it('derives the edit form initial state, converting nulls to empty strings', () => {
    expect(initialEditFormState({ name: 'Sales Team', location: null, description: null, status: 'active' })).toEqual({
      name: 'Sales Team',
      location: '',
      description: '',
      status: 'active',
    });
    expect(initialEditFormState({ name: 'Sales Team', location: 'Almaty', description: 'B2B', status: 'archived' })).toEqual({
      name: 'Sales Team',
      location: 'Almaty',
      description: 'B2B',
      status: 'archived',
    });
  });

  it('validates the group name is non-blank', () => {
    expect(validateGroupName('', 'Name is required.')).toEqual({ name: 'Name is required.' });
    expect(validateGroupName('   ', 'Name is required.')).toEqual({ name: 'Name is required.' });
    expect(validateGroupName('Sales Team', 'Name is required.')).toEqual({});
  });

  it('builds the update payload, trimming blank optional fields to null', () => {
    expect(buildUpdateGroupPayload({ name: ' Sales Team ', location: '', description: ' Handles B2B deals ', status: 'archived' })).toEqual({
      name: 'Sales Team',
      description: 'Handles B2B deals',
      location: null,
      status: 'archived',
    });
  });

  it('formats a user name, falling back to email when the last name is missing', () => {
    expect(formatUserName({ id: 'u1', firstName: 'Alex', lastName: 'Ivanov', email: 'alex@example.com' })).toBe('Alex Ivanov');
    expect(formatUserName({ id: 'u1', firstName: 'Alex', lastName: null, email: 'alex@example.com' })).toBe('Alex');
    expect(formatUserName({ id: 'u1', firstName: '', lastName: null, email: 'alex@example.com' })).toBe('alex@example.com');
  });

  it('filters out users already present in the excluded id list', () => {
    const users = [
      { id: 'u1', firstName: 'Alex', lastName: 'Ivanov', email: 'alex@example.com' },
      { id: 'u2', firstName: 'Maria', lastName: 'Petrova', email: 'maria@example.com' },
    ];
    expect(usersAvailableToAdd(users, ['u1'])).toEqual([users[1]]);
    expect(usersAvailableToAdd(users, [])).toEqual(users);
    expect(usersAvailableToAdd(users, ['u1', 'u2'])).toEqual([]);
  });
});
