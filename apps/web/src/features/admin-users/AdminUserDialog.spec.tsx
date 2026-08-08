import { renderToStaticMarkup } from 'react-dom/server';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) };
});

import { AdminUserDialog } from './AdminUserDialog.js';
import { AdminUserForm } from './AdminUserForm.js';
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
  it('keeps the API error visible and disables actions during save', () => {
    const html = renderToStaticMarkup(<AdminUserDialog open mode="edit" form={EMPTY_USER_FORM} errors={{}} message="Unable to save user" isSaving onChange={vi.fn()} onErrorsChange={vi.fn()} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(html).toContain('Edit user');
    expect(html).toContain('Unable to save user');
    expect(html).toContain('role="alert"');
    expect(html).toContain('disabled=""');
  });
});

function visitElements(node: ReactNode, visit: (element: ReactElement<Record<string, unknown>>) => void) {
  Children.forEach(node, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return;
    visit(child);
    visitElements(child.props.children as ReactNode, visit);
  });
}

describe('AdminUserForm interactions', () => {
  it.each(['create', 'edit'] as const)('propagates every editable %s field and clears field errors', (mode) => {
    const onChange = vi.fn();
    const onErrorsChange = vi.fn();
    const tree = AdminUserForm({
      form: EMPTY_USER_FORM,
      mode,
      errors: { firstName: 'Required', lastName: 'Required', email: 'Required', password: 'Required' },
      message: null,
      isSaving: false,
      onChange,
      onErrorsChange,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    });

    visitElements(tree, (element) => {
      const onChangeHandler = element.props.onChange;
      if (typeof onChangeHandler === 'function') {
        onChangeHandler({ target: { value: 'changed' } });
      }
    });

    expect(onChange).toHaveBeenCalled();
    expect(onErrorsChange).toHaveBeenCalled();
  });
});
