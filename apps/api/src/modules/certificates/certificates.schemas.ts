import { z } from 'zod';

export const issueCertificateSchema = z.object({
  organizationId: z.string().uuid(),
  courseId: z.string().uuid(),
  userId: z.string().uuid(),
  assessmentAttemptId: z.string().uuid().optional(),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;
