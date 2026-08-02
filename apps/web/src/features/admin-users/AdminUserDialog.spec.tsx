import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AdminUserDialog } from './AdminUserDialog.js';
import { EMPTY_USER_FORM } from './model.js';

describe('AdminUserDialog', () => {
  it('exposes an accessible dialog name, close control, and password autocomplete contract', () => {
    const html = renderToStaticMarkup(<AdminUserDialog open mode="create" form={{ ...EMPTY_USER_FORM, password: 'Secret123!' }} errors={{}} message={null} isSaving={false} onChange={vi.fn()} onErrorsChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain('<dialog aria-labelledby=');
    expect(html).toContain('aria-label="Close user dialog"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('value="Secret123!"');
  });
  it('renders duplicate email as a field error linked to the input', () => {
    const html = renderToStaticMarkup(<AdminUserDialog open mode="create" form={EMPTY_USER_FORM} errors={{ email: 'A user with this email already exists' }} message={null} isSaving={false} onChange={vi.fn()} onErrorsChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain('A user with this email already exists');
    expect(html).toContain('aria-describedby="user-email-error"');
    expect(html).toContain('aria-invalid="true"');
  });
});
