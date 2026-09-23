import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../apiClient.js', () => mocks);

import {
  bulkCreateChecklistSessions,
  createChecklistSession,
  getChecklistSession,
  listChecklistSessionParticipants,
  listChecklistSessions,
  listPublishedChecklists,
  repeatChecklistSession,
  transitionChecklistSession,
  updateChecklistSession,
} from './checklistSessions.js';

describe('checklist sessions api requests', () => {
  it('lists sessions with no filters', () => {
    listChecklistSessions();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions');
  });

  it('lists sessions with filters serialized as a query string', () => {
    listChecklistSessions({ status: 'scheduled', page: 2, pageSize: 20 });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions?status=scheduled&page=2&pageSize=20');
  });

  it('fetches a single session', () => {
    getChecklistSession('session-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions/session-1');
  });

  it('creates a single session', () => {
    createChecklistSession({ instanceId: 'instance-1', observerId: 'observer-1' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions', {
      method: 'POST',
      body: JSON.stringify({ instanceId: 'instance-1', observerId: 'observer-1' }),
    });
  });

  it('bulk-creates sessions', () => {
    bulkCreateChecklistSessions({ checklistId: 'checklist-1', learnerIds: ['learner-1'], observerId: 'observer-1' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions/bulk', {
      method: 'POST',
      body: JSON.stringify({ checklistId: 'checklist-1', learnerIds: ['learner-1'], observerId: 'observer-1' }),
    });
  });

  it('updates a session', () => {
    updateChecklistSession('session-1', { version: 1, observerId: 'observer-2' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions/session-1', {
      method: 'PATCH',
      body: JSON.stringify({ version: 1, observerId: 'observer-2' }),
    });
  });

  it('transitions a session', () => {
    transitionChecklistSession('session-1', 'start', 2);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions/session-1/start', {
      method: 'POST',
      body: JSON.stringify({ version: 2 }),
    });
  });

  it('repeats a session', () => {
    repeatChecklistSession('session-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions/session-1/repeat', { method: 'POST' });
  });

  it('lists participants for a role', () => {
    listChecklistSessionParticipants({ role: 'observer', search: 'ann' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-sessions/participants?role=observer&search=ann');
  });

  it('lists only published checklists', () => {
    listPublishedChecklists();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists?status=published');
  });
});
