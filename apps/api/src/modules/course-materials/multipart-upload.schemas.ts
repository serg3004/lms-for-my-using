import { z } from 'zod';

export const initiateMultipartUploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export const completeMultipartUploadSchema = z.object({
  parts: z.array(z.object({
    partNumber: z.number().int().min(1).max(10_000),
    etag: z.string().min(1).max(256),
  })).min(1).max(10_000),
});

export type InitiateMultipartUploadInput = z.infer<typeof initiateMultipartUploadSchema>;
export type CompleteMultipartUploadInput = z.infer<typeof completeMultipartUploadSchema>;
