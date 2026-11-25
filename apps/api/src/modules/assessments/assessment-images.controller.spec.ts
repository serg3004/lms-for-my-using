import { jest } from '@jest/globals';
import { AssessmentImagesController } from './assessment-images.controller.js';
import type { AuthenticatedRequest } from '../auth/public.js';
import type { UploadService } from '../upload/public.js';

const id = '073d86d6-60cb-4a58-9a7a-e0a73f38a843.png';
const user = (organizationId: string) => ({ currentUser: { organizationId } }) as AuthenticatedRequest;

describe('assessment images', () => {
  const uploadAssessmentImage = jest.fn(async () => id);
  const getInlinePresignedUrl = jest.fn(async () => 'https://files.example.org/image');
  const controller = new AssessmentImagesController({ uploadAssessmentImage, getInlinePresignedUrl } as unknown as UploadService);

  beforeEach(() => jest.clearAllMocks());

  it('uploads only validated images', async () => {
    const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII=', 'base64');
    const file = { originalname: 'question.png', mimetype: 'image/png', size: buffer.length, buffer } as Express.Multer.File;
    await expect(controller.upload({ ...file, mimetype: 'video/mp4' }, user('org-a'))).rejects.toThrow('Only JPEG, PNG, GIF and WebP');
    await expect(controller.upload({ ...file, buffer: Buffer.from('not an image') }, user('org-a'))).rejects.toThrow('File content');
    expect(uploadAssessmentImage).not.toHaveBeenCalled();
    await expect(controller.upload(file, user('org-a'))).resolves.toEqual({ id });
    expect(uploadAssessmentImage).toHaveBeenCalledWith(file, 'org-a', 'png');
  });

  it('signs only within the authenticated organization', async () => {
    await expect(controller.read('../' + id, user('org-a'))).rejects.toThrow();
    expect(getInlinePresignedUrl).not.toHaveBeenCalled();
    await controller.read(id, user('org-b'));
    expect(getInlinePresignedUrl).toHaveBeenCalledWith(`organizations/org-b/assessment-images/${id}`, 'image/png');
  });
});
