import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * zod 4 applies `.default()` inside `.partial()`. An update (PATCH) schema must not invent values, otherwise sending
 * only a title would silently reset status or flags. Every exported `update*` schema must parse `{}` to nothing.
 */
describe('update schemas', () => {
  const base = join(process.cwd(), 'src/modules');
  const files = readdirSync(base, { recursive: true }).map(String).filter((file) => file.endsWith('.schemas.ts'));

  it('finds schema files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)('%s: update* schemas add no values to an empty body', async (file) => {
    const exported = (await import(join(base, file))) as Record<string, { safeParse?: (value: unknown) => { success: boolean; data?: unknown } }>;
    for (const [name, schema] of Object.entries(exported)) {
      if (!/^update/.test(name) || typeof schema?.safeParse !== 'function') continue;
      const result = schema.safeParse({});
      if (result.success) expect({ name, data: result.data }).toEqual({ name, data: {} });
    }
  });
});
