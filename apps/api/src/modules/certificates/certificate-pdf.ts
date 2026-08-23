import { createRequire } from 'node:module';

import PDFDocument from 'pdfkit';

type PdfCertificate = {
  id: string;
  status: string;
  issuedAt: Date;
  organization?: { name: string };
  course?: { title: string };
  user?: { firstName: string; lastName: string; email: string };
};

const require = createRequire(import.meta.url);
const regularFont = require.resolve('@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff');
const boldFont = require.resolve('@fontsource/noto-sans/files/noto-sans-cyrillic-ext-700-normal.woff');

export function certificateVerificationCode(certificateId: string) {
  return `LMS-${certificateId.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
}

export function renderCertificatePdf(certificate: PdfCertificate): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: {
      Title: `Certificate ${certificateVerificationCode(certificate.id)}`,
      Author: certificate.organization?.name ?? 'LMS',
    } });
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    document.registerFont('NotoSans', regularFont);
    document.registerFont('NotoSansBold', boldFont);

    const width = document.page.width;
    const organization = certificate.organization?.name ?? 'Organization';
    const course = certificate.course?.title ?? 'Course';
    const learner = [certificate.user?.firstName, certificate.user?.lastName].filter(Boolean).join(' ')
      || certificate.user?.email
      || 'Learner';
    const issuedAt = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(certificate.issuedAt);

    document.rect(0, 0, width, document.page.height).fill('#f8fafc');
    document.lineWidth(3).strokeColor('#4f46e5').roundedRect(28, 28, width - 56, document.page.height - 56, 8).stroke();
    document.font('NotoSansBold').fillColor('#4f46e5').fontSize(15).text(organization.toUpperCase(), 70, 72, { width: width - 140, align: 'center' });
    document.fillColor('#172033').fontSize(34).text('CERTIFICATE OF COMPLETION', 70, 132, { width: width - 140, align: 'center' });
    document.font('NotoSans').fillColor('#64748b').fontSize(14).text('This certificate is presented to', 70, 206, { width: width - 140, align: 'center' });
    document.font('NotoSansBold').fillColor('#172033').fontSize(28).text(learner, 70, 242, { width: width - 140, align: 'center' });
    document.font('NotoSans').fillColor('#64748b').fontSize(14).text('for successfully completing', 70, 301, { width: width - 140, align: 'center' });
    document.font('NotoSansBold').fillColor('#4f46e5').fontSize(23).text(course, 90, 337, { width: width - 180, align: 'center' });
    document.font('NotoSans').fillColor('#475569').fontSize(11).text(`Issued ${issuedAt}`, 70, 442, { width: width - 140, align: 'center' });
    document.font('NotoSansBold').fontSize(10).text(certificateVerificationCode(certificate.id), 70, 469, { width: width - 140, align: 'center' });

    if (certificate.status !== 'issued') {
      document.save().rotate(-25, { origin: [width / 2, 300] });
      document.font('NotoSansBold').fillColor('#dc2626').opacity(0.25).fontSize(72).text('REVOKED', 160, 250, { width: width - 320, align: 'center' });
      document.restore();
    }

    document.end();
  });
}
