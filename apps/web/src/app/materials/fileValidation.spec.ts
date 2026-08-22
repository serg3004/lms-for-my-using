import { describe, expect, it } from 'vitest';

import { MAX_MATERIAL_FILE_SIZE_BYTES, validateMaterialFile } from './fileValidation';

describe('validateMaterialFile', () => {
  it.each([
    ['guide.pdf', 'application/pdf'],
    ['lesson.mp4', 'video/mp4'],
    ['narration.mp3', 'audio/mpeg'],
    ['worksheet.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['results.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ])('accepts supported material %s', (name, type) => {
    expect(validateMaterialFile(new File(['content'], name, { type }))).toBeNull();
  });

  it('rejects unsupported, empty, and oversized files before upload', () => {
    expect(validateMaterialFile(new File(['text'], 'notes.txt', { type: 'text/plain' }))).toBe('unsupported-type');
    expect(validateMaterialFile(new File([], 'empty.pdf', { type: 'application/pdf' }))).toBe('empty');
    const oversized = new File(['x'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { value: MAX_MATERIAL_FILE_SIZE_BYTES + 1 });
    expect(validateMaterialFile(oversized)).toBe('too-large');
  });
});
