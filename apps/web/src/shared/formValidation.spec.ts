import { describe, expect, it } from 'vitest';

import { clearFieldError, hasValidationErrors, validateRequiredFields } from './formValidation.js';

describe('formValidation', () => {
  it('returns required field errors for blank values', () => {
    const errors = validateRequiredFields([
      { name: 'email', value: ' ', message: 'Email is required' },
      { name: 'password', value: 'secret', message: 'Password is required' },
    ]);

    expect(errors).toEqual({ email: 'Email is required' });
  });

  it('treats filled values as valid', () => {
    const errors = validateRequiredFields([
      { name: 'organizationId', value: 'org-1', message: 'Organization is required' },
    ]);

    expect(hasValidationErrors(errors)).toBe(false);
  });
});

describe('clearFieldError', () => {
  it('removes the specified field error', () => {
    const errors = { firstName: 'Required', email: 'Required' };
    const result = clearFieldError(errors, 'firstName');
    expect(result).toEqual({ email: 'Required' });
  });

  it('returns the same object reference when field has no error', () => {
    const errors = { email: 'Required' };
    const result = clearFieldError(errors, 'firstName' as 'email');
    expect(result).toBe(errors);
  });
});
