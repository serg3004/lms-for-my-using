import {
  bulkCreateChecklistSessionSchema,
  createChecklistSessionSchema,
  updateChecklistSessionSchema,
} from './checklists.schemas.js';

const learnerA = '11111111-1111-4111-8111-111111111111';
const learnerB = '22222222-2222-4222-8222-222222222222';
const base = {
  checklistId: '33333333-3333-4333-8333-333333333333',
  observerId: '44444444-4444-4444-8444-444444444444',
  learnerIds: [learnerA, learnerB],
};
const scheduledAt = '2026-03-08T07:30:00.000Z';

describe('checklist session scheduling request contract', () => {
  it('keeps the legacy bulk request valid without adding required fields', () => {
    expect(bulkCreateChecklistSessionSchema.parse(base)).toEqual(base);
    expect(bulkCreateChecklistSessionSchema.parse({ ...base, scheduledAt: null })).toEqual({ ...base, scheduledAt: null });
  });

  it('accepts shared duration and independent schedules keyed by recipient', () => {
    const input = {
      ...base, durationMinutes: 30, timezone: 'America/New_York',
      schedules: [
        { learnerId: learnerB, scheduledAt, durationMinutes: null },
        { learnerId: learnerA, scheduledAt, durationMinutes: 60, timezone: 'Europe/Berlin' },
      ],
    };
    expect(bulkCreateChecklistSessionSchema.parse(input)).toEqual(input);
  });

  it.each([
    [],
    [{ learnerId: learnerA, scheduledAt }],
    [{ learnerId: learnerA, scheduledAt }, { learnerId: learnerA, scheduledAt }],
    [{ learnerId: learnerA, scheduledAt }, { learnerId: base.observerId, scheduledAt }],
    [{ learnerId: learnerA, scheduledAt }, { learnerId: learnerB, scheduledAt: 'not-a-date' }],
  ].map((schedules) => ({ schedules })))('rejects missing, duplicate, unknown or invalid recipient schedules ($schedules)', ({ schedules }) => {
    expect(bulkCreateChecklistSessionSchema.safeParse({ ...base, schedules }).success).toBe(false);
  });

  it.each([0, -1, 1.5, 1441, '30'])('rejects invalid duration %j in both shared and individual formats', (durationMinutes) => {
    expect(bulkCreateChecklistSessionSchema.safeParse({ ...base, durationMinutes }).success).toBe(false);
    expect(bulkCreateChecklistSessionSchema.safeParse({
      ...base,
      schedules: [{ learnerId: learnerA, scheduledAt, durationMinutes }, { learnerId: learnerB, scheduledAt }],
    }).success).toBe(false);
  });

  it('supports null duration and both duration bounds for single creation and versioned editing', () => {
    for (const durationMinutes of [null, 1, 1440]) {
      expect(createChecklistSessionSchema.parse({ instanceId: learnerA, observerId: base.observerId, durationMinutes }).durationMinutes).toBe(durationMinutes);
      expect(updateChecklistSessionSchema.parse({ version: 1, durationMinutes }).durationMinutes).toBe(durationMinutes);
    }
  });
});
