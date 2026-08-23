import { certificateVerificationCode, renderCertificatePdf } from './certificate-pdf.js';

describe('certificate PDF', () => {
  it('uses the same stable verification code as the certificate UI', () => {
    expect(certificateVerificationCode('123e4567-e89b-12d3-a456-426614174000')).toBe('LMS-123E4567E8');
  });

  it('renders a downloadable PDF with Unicode learner and course names', async () => {
    const pdf = await renderCertificatePdf({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'issued',
      issuedAt: new Date('2026-08-23T00:00:00.000Z'),
      organization: { name: 'Академия' },
      course: { title: 'Основы безопасности' },
      user: { firstName: 'Анна', lastName: 'Иванова', email: 'anna@example.com' },
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3_000);
  });
});
