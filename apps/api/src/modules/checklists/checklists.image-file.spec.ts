import { jest } from '@jest/globals';

import type { AuthenticatedRequest } from '../auth/public.js';
import { ChecklistsController } from './checklists.controller.js';
import type { ChecklistsService } from './checklists.service.js';

const learner = { currentUser: { id: 'u1', organizationId: 'org', roles: ['learner'] } } as unknown as AuthenticatedRequest;

function makeResponse() {
  const response = { headers: {} as Record<string, string>, code: 200, body: undefined as Buffer | undefined, set: jest.fn(), status: jest.fn(), send: jest.fn() };
  response.set.mockImplementation((headers) => { Object.assign(response.headers, headers); return response; });
  response.status.mockImplementation((code) => { response.code = code as number; return response; });
  response.send.mockImplementation((body) => { response.body = body as Buffer | undefined; return response; });
  return response;
}

// PR 400: the picture is served by the API as bytes with a private cache and an ETag.
describe('ChecklistsController image files', () => {
  const bytes = Buffer.from([1, 2, 3]);
  const service = {
    getCoverFile: jest.fn(async () => ({ bytes, mimeType: 'image/png', version: 42 })),
    getItemPhotoFile: jest.fn(async () => ({ bytes, mimeType: 'image/jpeg', version: 'organizations/org/photo' })),
  };
  const controller = new ChecklistsController(service as unknown as ChecklistsService, {} as never, { isAssignedObserver: async () => false } as never, {} as never);

  it('sends the cover bytes with a type, a private cache and an ETag', async () => {
    const response = makeResponse();
    await controller.getCoverFile('c1', undefined, learner, response);
    expect(service.getCoverFile).toHaveBeenCalledWith('c1', 'org', 'u1', false);
    expect(response.code).toBe(200);
    expect(response.body).toBe(bytes);
    expect(response.headers).toMatchObject({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-cache', ETag: '"42"', 'X-Content-Type-Options': 'nosniff', 'Content-Length': '3' });
  });

  it('answers 304 without a body when the ETag matches', async () => {
    const response = makeResponse();
    await controller.getCoverFile('c1', '"42"', learner, response);
    expect(response.code).toBe(304);
    expect(response.body).toBeUndefined();
  });

  it('sends the photo bytes for the learner own assignment', async () => {
    const response = makeResponse();
    await controller.getItemPhotoFile('i1', 'it1', undefined, learner, response);
    expect(service.getItemPhotoFile).toHaveBeenCalledWith('i1', 'it1', 'org', 'u1', false);
    expect(response.headers['Content-Type']).toBe('image/jpeg');
  });
});
