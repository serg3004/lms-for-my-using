import { z } from 'zod';

const DEFAULT_API_PORT = 3000;

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_API_PORT),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function loadApiEnv(env = process.env): ApiEnv {
  const parsedResult = apiEnvSchema.safeParse(env);

  if (!parsedResult.success) {
    const message = parsedResult.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid API environment: ${message}`);
  }

  return parsedResult.data;
}
