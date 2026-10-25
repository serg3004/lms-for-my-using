import { CHECKLIST_TEMPLATES, findTemplate, listTemplates, renderTemplate, templateLocale } from './checklist-templates.js';
import { contextFieldSchema, scaleLevelSchema } from './checklists.schemas.js';

describe('checklist templates (PR 341)', () => {
  it('has unique keys', () => {
    const keys = CHECKLIST_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(['ru', 'en', 'kk', 'zh'] as const)('renders every template completely in %s', (locale) => {
    for (const template of CHECKLIST_TEMPLATES) {
      const rendered = renderTemplate(template, locale);
      expect(rendered.title.trim()).not.toBe('');
      expect(rendered.groups.length).toBeGreaterThan(0);
      for (const group of rendered.groups) {
        expect(group.title.trim()).not.toBe('');
        expect(group.items.length).toBeGreaterThan(0);
        for (const entry of group.items) {
          expect(entry.text.trim()).not.toBe('');
          expect(entry.text.length).toBeLessThanOrEqual(500);
        }
      }
      for (const field of rendered.contextFields) {
        expect(contextFieldSchema.safeParse(field).success).toBe(true);
      }
      for (const level of rendered.scaleLevels ?? []) {
        expect(scaleLevelSchema.safeParse(level).success).toBe(true);
      }
      if (rendered.scoringMode === 'scale') {
        expect(rendered.scaleLevels?.length).toBeGreaterThan(1);
      }
    }
  });

  it('localises: every language has its own texts and unknown locales fall back to English', () => {
    for (const template of CHECKLIST_TEMPLATES) {
      const titles = (['ru', 'en', 'kk', 'zh'] as const).map((locale) => renderTemplate(template, locale).title);
      expect(new Set(titles).size).toBe(4);
    }
    expect(templateLocale('kk')).toBe('kk');
    expect(templateLocale('zh')).toBe('zh');
    expect(templateLocale('de')).toBe('en');
    expect(templateLocale('ru')).toBe('ru');
    expect(templateLocale(undefined)).toBe('en');
  });

  it('generates fresh context field ids on every render', () => {
    const template = findTemplate('consultant-assessment')!;
    const first = renderTemplate(template, 'ru').contextFields.map((field) => field.id);
    const second = renderTemplate(template, 'ru').contextFields.map((field) => field.id);
    expect(first.some((id) => second.includes(id))).toBe(false);
  });

  it('lists summaries and returns undefined for unknown keys', () => {
    const items = listTemplates('en');
    expect(items).toHaveLength(CHECKLIST_TEMPLATES.length);
    expect(items[0]).toMatchObject({ key: expect.any(String), groupCount: expect.any(Number), itemCount: expect.any(Number) });
    expect(findTemplate('nope')).toBeUndefined();
  });
});
