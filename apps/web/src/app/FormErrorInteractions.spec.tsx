import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AssessmentSettingsForm } from './assessment-builder/AssessmentSettingsForm.js';
import { emptyAssessmentForm } from './assessment-builder/model.js';
import { MaterialMetadataForm } from './materials/MaterialMetadataForm.js';

const t = ((key: string, fallback?: string) => fallback ?? key) as never;

describe('form and error interaction contracts', () => {
  it('links assessment title validation to its input and keeps the submitted error visible', () => {
    const html = renderToStaticMarkup(
      <AssessmentSettingsForm
        form={{ ...emptyAssessmentForm(), title: '' }}
        dispatch={vi.fn()}
        state={{ status: 'error', message: 'Passing score must be between 0 and 100' }}
        onSubmit={vi.fn()}
        t={t}
        titleError="Title is required"
      />,
    );

    expect(html).toContain('Title is required');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('Passing score must be between 0 and 100');
    expect(html).toContain('role="alert"');
  });

  it('disables assessment submission while saving and renders edit controls', () => {
    const html = renderToStaticMarkup(
      <AssessmentSettingsForm
        form={{ ...emptyAssessmentForm(), title: 'Safety', status: 'draft' }}
        dispatch={vi.fn()}
        state={{ status: 'saving' }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        editing
        t={t}
      />,
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('Saving...');
    expect(html).toContain('Cancel');
    expect(html).toContain('admin-form-status-select');
  });

  it('links material title errors without hiding the material kind choice', () => {
    const html = renderToStaticMarkup(
      <MaterialMetadataForm
        form={{ title: '', kind: 'file' }}
        onChange={vi.fn()}
        t={t}
        titleError="Material title is required"
      />,
    );

    expect(html).toContain('Material title is required');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('<option value="file" selected="">File (upload)</option>');
  });
});
