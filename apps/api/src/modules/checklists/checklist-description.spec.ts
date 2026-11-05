import { randomUUID } from 'node:crypto';
import { createChecklistSchema, updateChecklistSchema, updateChecklistItemSchema, scaleLevelSchema } from './checklists.schemas.js';

describe('checklist rich descriptions at the API boundary', () => {
  it('cleans all description inputs, including script and injected CSS', () => {
    const raw = '<p onclick="bad()"><b>Good</b><script>bad()</script><span style="color:#166534;position:fixed;font-size:999px">Safe</span></p>';
    for (const parsed of [
      createChecklistSchema.parse({ organizationId: randomUUID(), title: 'Sheet', description: raw }),
      updateChecklistSchema.parse({ description: raw }), updateChecklistItemSchema.parse({ description: raw }),
      scaleLevelSchema.parse({ level: 1, label: 'One', points: 1, description: raw }),
    ]) {
      expect(parsed.description).toContain('<strong>Good</strong>');
      expect(parsed.description).toContain('color:#166534');
      expect(parsed.description).not.toMatch(/script|onclick|position|999/);
    }
  });
  it('limits visible text separately from markup and bounds the raw request', () => {
    expect(updateChecklistSchema.safeParse({ description: `<strong>${'a'.repeat(2000)}</strong>` }).success).toBe(true);
    expect(updateChecklistSchema.safeParse({ description: `<strong>${'a'.repeat(2001)}</strong>` }).success).toBe(false);
    expect(scaleLevelSchema.safeParse({ level: 1, label: 'One', points: 1, description: 'a'.repeat(501) }).success).toBe(false);
    expect(updateChecklistSchema.safeParse({ description: '<b>'.repeat(9000) }).success).toBe(false);
  });
});
