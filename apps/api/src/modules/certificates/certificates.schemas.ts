import { z } from 'zod';

export const issueCertificateSchema = z.object({
  organizationId: z.guid(),
  courseId: z.guid(),
  userId: z.guid(),
  assessmentAttemptId: z.guid().optional(),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;
