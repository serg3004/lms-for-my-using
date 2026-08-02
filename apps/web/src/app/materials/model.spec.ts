import { describe, expect, it } from 'vitest';
import { EMPTY_MATERIAL_FORM, uploadReducer, validateMaterialForm } from './model.js';

describe('material form model', () => {
  it('validates title and URL independently', () => {
    expect(validateMaterialForm(EMPTY_MATERIAL_FORM)).toEqual({ title: 'invalid', fileUrl: 'required' });
    expect(validateMaterialForm({ ...EMPTY_MATERIAL_FORM, title: 'Guide', fileUrl: 'https://example.test/guide' })).toEqual({});
  });

  it('rejects titles that cannot produce a slug', () => {
    expect(validateMaterialForm({ ...EMPTY_MATERIAL_FORM, title: '---', fileUrl: '/guide.pdf' })).toEqual({ title: 'invalid' });
  });
});

describe('upload state machine', () => {
  it('tracks bounded progress and completion', () => {
    const started = uploadReducer({ status: 'idle' }, { type: 'start' });
    expect(uploadReducer(started, { type: 'progress', progress: 120 })).toEqual({ status: 'uploading', progress: 100 });
    expect(uploadReducer(started, { type: 'success' })).toEqual({ status: 'success' });
  });

  it('preserves an error for retry feedback and can reset it', () => {
    const failed = uploadReducer({ status: 'uploading', progress: 40 }, { type: 'error', message: 'Upload failed' });
    expect(failed).toEqual({ status: 'error', message: 'Upload failed' });
    expect(uploadReducer(failed, { type: 'reset' })).toEqual({ status: 'idle' });
  });
});

