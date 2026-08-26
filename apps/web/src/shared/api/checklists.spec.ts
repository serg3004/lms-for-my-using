import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), uploadChecklistItemPhotoWithProgress: vi.fn() }));

vi.mock('../apiClient.js', () => mocks);

import {
  assignChecklist,
  assignChecklistReviewer,
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  getChecklist,
  getChecklistAnalytics,
  getChecklistInstance,
  getChecklistItemPhotoUrl,
  listChecklistInstanceEvents,
  listChecklists,
  listInstancesForChecklist,
  listMyChecklistInstances,
  reviewChecklistItemResult,
  searchChecklistReviewQueue,
  submitChecklistItemResult,
  updateChecklist,
  updateChecklistItem,
  uploadChecklistItemPhoto,
} from './checklists.js';

describe('checklists api requests', () => {
  it('lists checklists', () => {
    listChecklists();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists');
  });

  it('fetches a single checklist', () => {
    getChecklist('checklist-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/checklist-1');
  });

  it('creates a checklist with the organizationId merged into the body', () => {
    createChecklist('org-1', { title: 'New checklist', scoringMode: 'sum_points', passThreshold: 80, requiresReview: false });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists', {
      method: 'POST',
      body: JSON.stringify({ organizationId: 'org-1', title: 'New checklist', scoringMode: 'sum_points', passThreshold: 80, requiresReview: false }),
    });
  });

  it('updates a checklist', () => {
    updateChecklist('checklist-1', { status: 'published' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/checklist-1', { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
  });

  it('deletes a checklist', () => {
    deleteChecklist('checklist-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/checklist-1', { method: 'DELETE' });
  });

  it('creates a checklist item', () => {
    createChecklistItem('checklist-1', { text: 'Item', points: 10, isRequired: true, photoRequired: false });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/checklist-1/items', {
      method: 'POST',
      body: JSON.stringify({ text: 'Item', points: 10, isRequired: true, photoRequired: false }),
    });
  });

  it('updates a checklist item', () => {
    updateChecklistItem('item-1', { points: 20 });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-items/item-1', { method: 'PATCH', body: JSON.stringify({ points: 20 }) });
  });

  it('deletes a checklist item', () => {
    deleteChecklistItem('item-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-items/item-1', { method: 'DELETE' });
  });

  it('assigns a checklist to a user', () => {
    assignChecklist('checklist-1', 'user-1', '2026-08-20T00:00:00.000Z');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/checklist-1/instances', {
      method: 'POST',
      body: JSON.stringify({ userId: 'user-1', dueAt: '2026-08-20T00:00:00.000Z' }),
    });
  });

  it('lists instances for a checklist', () => {
    listInstancesForChecklist('checklist-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/checklist-1/instances');
  });

  it('bulk assigns mixed checklist targets', async () => {
    const { bulkAssignChecklist } = await import('./checklists.js');
    await bulkAssignChecklist('checklist-1', [
      { type: 'user', id: 'user-1' },
      { type: 'group', id: 'group-1' },
      { type: 'manager_team' },
    ], '2026-09-01T10:00:00.000Z');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/checklist-1/instances/bulk', {
      method: 'POST',
      body: JSON.stringify({
        targets: [{ type: 'user', id: 'user-1' }, { type: 'group', id: 'group-1' }, { type: 'manager_team' }],
        dueAt: '2026-09-01T10:00:00.000Z',
      }),
    });
  });

  it("lists the current user's checklist instances", () => {
    listMyChecklistInstances();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/mine');
  });

  it('searches the review queue with no query when no filters are given', () => {
    searchChecklistReviewQueue();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/review-queue');
  });

  it('encodes only the provided, non-empty review queue filters', () => {
    searchChecklistReviewQueue({ assignment: 'unassigned', page: 2, pageSize: 10, checklistId: '' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/review-queue?assignment=unassigned&page=2&pageSize=10');
  });

  it('assigns a reviewer to a checklist instance', () => {
    assignChecklistReviewer('instance-1', 'user-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/instance-1/reviewer', {
      method: 'PATCH',
      body: JSON.stringify({ reviewerId: 'user-1' }),
    });
  });

  it('unassigns a reviewer by passing null', () => {
    assignChecklistReviewer('instance-1', null);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/instance-1/reviewer', {
      method: 'PATCH',
      body: JSON.stringify({ reviewerId: null }),
    });
  });

  it('lists checklist instance events', () => {
    listChecklistInstanceEvents('instance-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/instance-1/events');
  });

  it('fetches checklist analytics with no query when no filters are given', () => {
    getChecklistAnalytics();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/analytics');
  });

  it('fetches checklist analytics scoped to a checklist and date range', () => {
    getChecklistAnalytics({ checklistId: 'checklist-1', from: '2026-08-01T00:00:00.000Z' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/analytics?checklistId=checklist-1&from=2026-08-01T00%3A00%3A00.000Z');
  });

  it('fetches a single checklist instance', () => {
    getChecklistInstance('instance-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/instance-1');
  });

  it('submits a checklist item result', () => {
    submitChecklistItemResult('instance-1', 'item-1', { checked: true });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/instance-1/items/item-1', {
      method: 'PATCH',
      body: JSON.stringify({ checked: true }),
    });
  });

  it('reviews a checklist item result', () => {
    reviewChecklistItemResult('instance-1', 'item-1', { status: 'approved' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/instance-1/items/item-1/review', {
      method: 'POST',
      body: JSON.stringify({ status: 'approved' }),
    });
  });

  it('encodes ids before adding them to the path', () => {
    getChecklist('checklist 1/2');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklists/checklist%201%2F2');
  });

  it('fetches a presigned download URL for an attached item photo', () => {
    getChecklistItemPhotoUrl('instance-1', 'item-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/instance-1/items/item-1/photo');
  });

  it('uploads a checklist item photo', () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    uploadChecklistItemPhoto('instance-1', 'item-1', file);
    expect(mocks.uploadChecklistItemPhotoWithProgress).toHaveBeenCalledWith('instance-1', 'item-1', file, expect.any(Function));
  });
});
