import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), uploadChecklistItemPhotoWithProgress: vi.fn() }));

vi.mock('../apiClient.js', () => mocks);

import {
  assignChecklist,
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  getChecklist,
  getChecklistInstance,
  getChecklistItemPhotoUrl,
  listChecklists,
  listInstancesForChecklist,
  listMyChecklistInstances,
  listPendingChecklistReviews,
  reviewChecklistItemResult,
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

  it("lists the current user's checklist instances", () => {
    listMyChecklistInstances();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/mine');
  });

  it('lists checklist instances pending review', () => {
    listPendingChecklistReviews();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/checklist-instances/pending-review');
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
