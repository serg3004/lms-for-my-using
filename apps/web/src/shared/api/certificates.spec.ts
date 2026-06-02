import { describe, expect, it } from 'vitest';

import { getCertificatePath } from './certificates.js';

describe('certificates api paths', () => {
  it('builds certificate detail path for a regular id', () => {
    expect(getCertificatePath('certificate-1')).toBe('/certificates/certificate-1');
  });

  it('encodes certificate ids before adding them to the path', () => {
    expect(getCertificatePath('certificate 1/2')).toBe('/certificates/certificate%201%2F2');
  });
});
