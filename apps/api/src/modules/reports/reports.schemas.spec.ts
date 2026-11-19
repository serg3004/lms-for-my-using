import { courseAnalyticsExportQuerySchema, courseAnalyticsQuerySchema } from './reports.schemas.js';

const id = '11111111-1111-4111-8111-111111111111';

describe('course analytics query schemas', () => {
  it('rejects a reversed period', () => {
    expect(courseAnalyticsQuerySchema.safeParse({ from: '2026-11-10', to: '2026-11-01' }).success).toBe(false);
    expect(courseAnalyticsExportQuerySchema.safeParse({ view: 'courses', from: '2026-11-10', to: '2026-11-01' }).success).toBe(false);
  });

  it('splits and validates the course list', () => {
    expect(courseAnalyticsQuerySchema.parse({ courseIds: `${id},${id}` }).courseIds).toEqual([id, id]);
    expect(courseAnalyticsQuerySchema.safeParse({ courseIds: 'not-an-id' }).success).toBe(false);
  });

  it('defaults the export format to xlsx and requires the id of the course or user for those views', () => {
    expect(courseAnalyticsExportQuerySchema.parse({ view: 'courses' }).format).toBe('xlsx');
    expect(courseAnalyticsExportQuerySchema.safeParse({ view: 'course' }).success).toBe(false);
    expect(courseAnalyticsExportQuerySchema.safeParse({ view: 'user' }).success).toBe(false);
    expect(courseAnalyticsExportQuerySchema.parse({ view: 'course', courseId: id, format: 'csv' }).courseId).toBe(id);
    expect(courseAnalyticsExportQuerySchema.safeParse({ view: 'other' }).success).toBe(false);
  });
});
