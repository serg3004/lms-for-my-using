import { createOrgExternalReferenceSchema, externalIdSchema, sourceSystemSchema } from './org-external-references.schemas.js';

const organizationId = '11111111-1111-1111-1111-111111111111';
const entityId = '22222222-2222-2222-2222-222222222222';

describe('org external reference schemas', () => {
  describe('sourceSystemSchema', () => {
    it('normalizes to a lowercase slug', () => {
      expect(sourceSystemSchema.parse('Workday')).toBe('workday');
      expect(sourceSystemSchema.parse('  BambooHR  ')).toBe('bamboohr');
    });

    it('accepts hyphenated slugs and rejects invalid characters', () => {
      expect(sourceSystemSchema.parse('hris-system-1')).toBe('hris-system-1');
      expect(() => sourceSystemSchema.parse('hris system')).toThrow();
      expect(() => sourceSystemSchema.parse('hris_system')).toThrow();
      expect(() => sourceSystemSchema.parse('-leading-hyphen')).toThrow();
    });

    it('rejects empty or over-length values', () => {
      expect(() => sourceSystemSchema.parse('')).toThrow();
      expect(() => sourceSystemSchema.parse('a'.repeat(65))).toThrow();
    });
  });

  describe('externalIdSchema', () => {
    it('preserves case exactly', () => {
      expect(externalIdSchema.parse('ENG-001')).toBe('ENG-001');
    });

    it('rejects empty or over-length values', () => {
      expect(() => externalIdSchema.parse('')).toThrow();
      expect(() => externalIdSchema.parse('a'.repeat(256))).toThrow();
    });
  });

  describe('createOrgExternalReferenceSchema', () => {
    it('normalizes sourceSystem while validating the full payload', () => {
      const parsed = createOrgExternalReferenceSchema.parse({
        organizationId,
        entityType: 'DEPARTMENT',
        entityId,
        sourceSystem: 'Workday',
        externalId: 'ENG-001',
      });
      expect(parsed).toEqual({ organizationId, entityType: 'DEPARTMENT', entityId, sourceSystem: 'workday', externalId: 'ENG-001' });
    });

    it('rejects an unknown entityType', () => {
      expect(() =>
        createOrgExternalReferenceSchema.parse({ organizationId, entityType: 'USER', entityId, sourceSystem: 'workday', externalId: 'ENG-001' }),
      ).toThrow();
    });
  });
});
