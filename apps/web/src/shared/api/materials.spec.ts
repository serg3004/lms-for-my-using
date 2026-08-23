import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../apiClient.js', () => mocks);

import { getCourseMaterialsPath, getMaterialDownloadUrl } from './materials.js';

describe('materials api paths', () => {
  it('builds course materials path for a regular id', () => {
    expect(getCourseMaterialsPath('course-1')).toBe('/courses/course-1/materials');
  });

  it('encodes course ids before adding them to the path', () => {
    expect(getCourseMaterialsPath('course 1/2')).toBe('/courses/course%201%2F2/materials');
  });
});

describe('getMaterialDownloadUrl', () => {
  it('requests a presigned download URL for the given material', () => {
    getMaterialDownloadUrl('material-1');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/materials/material-1/download');
  });

  it('encodes the material id before adding it to the path', () => {
    getMaterialDownloadUrl('material 1/2');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/materials/material%201%2F2/download');
  });
});
