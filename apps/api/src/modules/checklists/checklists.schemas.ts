import { z } from 'zod';

export const checklistStatusSchema = z.enum(['draft', 'published', 'archived']);
export const checklistScoringModeSchema = z.enum(['sum_points', 'all_required', 'scale']);
export const checklistInstanceStatusSchema = z.enum(['assigned', 'in_progress', 'submitted', 'completed', 'expired']);
export const checklistReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const scaleLevelSchema = z.object({
  level: z.number().int().min(1),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  points: z.number().int().min(0),
});
export type ScaleLevel = z.infer<typeof scaleLevelSchema>;

export const createChecklistSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  scoringMode: checklistScoringModeSchema.default('sum_points'),
  passThreshold: z.number().int().min(0).max(100).default(80),
  scaleLevels: z.array(scaleLevelSchema).max(20).optional(),
  requiresReview: z.boolean().default(false),
});
export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;

export const updateChecklistSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    status: checklistStatusSchema,
    scoringMode: checklistScoringModeSchema,
    passThreshold: z.number().int().min(0).max(100),
    scaleLevels: z.array(scaleLevelSchema).max(20).nullable(),
    requiresReview: z.boolean(),
  })
  .partial();
export type UpdateChecklistInput = z.infer<typeof updateChecklistSchema>;

// autoSkipUnanswered only makes sense for an item that's actually allowed to be skipped — an item
// that isn't skippable can't be *auto*-skipped either (PR 290 "required validation").
const requiresAllowSkipForAutoSkip = (input: { allowSkip?: boolean; autoSkipUnanswered?: boolean }) =>
  !input.autoSkipUnanswered || input.allowSkip === true;
const AUTO_SKIP_REQUIRES_ALLOW_SKIP_ISSUE = {
  message: 'autoSkipUnanswered requires allowSkip to also be true',
  path: ['autoSkipUnanswered'],
};

export const createChecklistItemSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    points: z.number().int().min(0).max(1000).default(0),
    isRequired: z.boolean().default(true),
    photoRequired: z.boolean().default(false),
    weight: z.number().int().min(1).max(100).default(1),
    allowSkip: z.boolean().default(false),
    autoSkipUnanswered: z.boolean().default(false),
  })
  .refine(requiresAllowSkipForAutoSkip, AUTO_SKIP_REQUIRES_ALLOW_SKIP_ISSUE);
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;

// Note: the allowSkip/autoSkipUnanswered invariant above is intentionally NOT enforced here — a
// partial update may set only one of the two fields while the other keeps its current DB value,
// which this schema can't see. ChecklistsService.updateItem() checks the invariant against the
// merged (current + incoming) state instead.
export const updateChecklistItemSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    points: z.number().int().min(0).max(1000),
    isRequired: z.boolean(),
    photoRequired: z.boolean(),
    order: z.number().int().min(0),
    weight: z.number().int().min(1).max(100),
    allowSkip: z.boolean(),
    autoSkipUnanswered: z.boolean(),
  })
  .partial();
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

export const assignChecklistSchema = z.object({
  userId: z.string().uuid(),
  dueAt: z.string().datetime().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
});
export type AssignChecklistInput = z.infer<typeof assignChecklistSchema>;

export const MAX_BULK_CHECKLIST_TARGETS = 100;
export const MAX_BULK_CHECKLIST_RECIPIENTS = 1_000;

const bulkChecklistTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('group'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('manager_team') }).strict(),
]);

export const bulkAssignChecklistSchema = z.object({
  targets: z.array(bulkChecklistTargetSchema).min(1).max(MAX_BULK_CHECKLIST_TARGETS),
  dueAt: z.string().datetime().optional(),
}).strict();
export type BulkAssignChecklistInput = z.infer<typeof bulkAssignChecklistSchema>;

export const submitChecklistItemResultSchema = z
  .object({
    checked: z.boolean(),
    scaleLevel: z.number().int().min(1),
    photoUrl: z.string().trim().url().max(2000),
    comment: z.string().trim().max(1000),
  })
  .partial();
export type SubmitChecklistItemResultInput = z.infer<typeof submitChecklistItemResultSchema>;

export const reviewChecklistItemResultSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  comment: z.string().trim().max(1000).optional(),
});
export type ReviewChecklistItemResultInput = z.infer<typeof reviewChecklistItemResultSchema>;

export const skipChecklistItemSchema = z.object({ comment: z.string().trim().max(1000).optional() }).strict();
export type SkipChecklistItemInput = z.infer<typeof skipChecklistItemSchema>;

export const assignChecklistReviewerSchema = z.object({ reviewerId: z.string().uuid().nullable() }).strict();
export const checklistQueueQuerySchema = z.object({
  assignment: z.enum(['mine', 'unassigned', 'all']).default('mine'),
  checklistId: z.string().uuid().optional(), learnerId: z.string().uuid().optional(),
  status: checklistInstanceStatusSchema.optional(), passed: z.enum(['true', 'false']).optional(),
  from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ChecklistQueueQuery = z.infer<typeof checklistQueueQuerySchema>;
export const checklistAnalyticsQuerySchema = z.object({
  checklistId: z.string().uuid().optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional(),
});
export type ChecklistAnalyticsQuery = z.infer<typeof checklistAnalyticsQuerySchema>;

// ---- Workplace-training session settings (docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md) ----

export const checklistGeolocationPolicySchema = z.enum(['off', 'optional', 'required']);
export const checklistFeedbackVisibilitySchema = z.enum(['after_completion', 'live']);

export const updateChecklistWorkplaceSettingsSchema = z
  .object({
    moduleEnabled: z.boolean(),
    highPerformanceThreshold: z.number().int().min(0).max(100),
    // Nullable, not just optional: an admin must be able to explicitly clear a threshold they
    // previously set, not just leave it unspecified in the request body.
    criticalThreshold: z.number().int().min(0).max(100).nullable(),
    lowThreshold: z.number().int().min(0).max(100).nullable(),
    defaultGeolocationPolicy: checklistGeolocationPolicySchema,
    feedbackVisibility: checklistFeedbackVisibilitySchema,
  })
  .partial()
  .strict()
  .refine(
    (input) =>
      input.criticalThreshold === undefined ||
      input.lowThreshold === undefined ||
      input.criticalThreshold === null ||
      input.lowThreshold === null ||
      input.criticalThreshold >= input.lowThreshold,
    { message: 'criticalThreshold must be greater than or equal to lowThreshold', path: ['criticalThreshold'] },
  );
export type UpdateChecklistWorkplaceSettingsInput = z.infer<typeof updateChecklistWorkplaceSettingsSchema>;

// ---- Sessions (docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md, PR 289 lifecycle) ----

export const checklistSessionStatusSchema = z.enum(['scheduled', 'in_progress', 'paused', 'completed', 'cancelled']);

export const createChecklistSessionSchema = z
  .object({
    instanceId: z.string().uuid(),
    observerId: z.string().uuid(),
    scheduledAt: z.string().datetime().nullable().optional(),
    locationCapturePolicy: checklistGeolocationPolicySchema.optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
export type CreateChecklistSessionInput = z.infer<typeof createChecklistSessionSchema>;

// Allowed only while the session is still `scheduled` — enforces "no participant changes after start".
export const updateChecklistSessionSchema = z
  .object({
    observerId: z.string().uuid().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    locationCapturePolicy: checklistGeolocationPolicySchema.optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    version: z.number().int().min(1),
  })
  .strict();
export type UpdateChecklistSessionInput = z.infer<typeof updateChecklistSessionSchema>;

// `version` is the client's expected current version — a mismatch means someone else already
// transitioned this session and the caller must reload before retrying (409).
export const checklistSessionTransitionSchema = z.object({ version: z.number().int().min(1) }).strict();
export type ChecklistSessionTransitionInput = z.infer<typeof checklistSessionTransitionSchema>;

export const checklistSessionQuerySchema = z.object({
  status: checklistSessionStatusSchema.optional(),
  observerId: z.string().uuid().optional(),
  overdueOnly: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ChecklistSessionQuery = z.infer<typeof checklistSessionQuerySchema>;

// ---- Criteria/skip/scoring v1 + geolocation (PR 290) ----

export const checklistLocationCapturePointSchema = z.enum(['start', 'end']);
export const checklistLocationCaptureStatusSchema = z.enum(['captured', 'denied', 'unavailable']);

// `getCurrentPosition` (never `watchPosition`) is a client-side constraint this schema can't
// enforce directly -- what it does enforce is the server-observable half of "start/end only, no
// continuous tracking": exactly one report per capture point (@@unique on the table), and
// coordinates present if and only if the browser actually produced a position.
export const submitChecklistLocationCaptureSchema = z
  .object({
    status: checklistLocationCaptureStatusSchema,
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    accuracyMeters: z.number().min(0).optional(),
    // Required only when an admin submits on behalf of the observer under a `required` policy --
    // ChecklistSessionService enforces exactly when this is mandatory (it depends on who the
    // caller is and the session's policy, neither of which this schema can see).
    overrideReason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine(
    (input) => (input.status === 'captured' ? input.latitude !== undefined && input.longitude !== undefined : input.latitude === undefined && input.longitude === undefined),
    {
      message: 'latitude/longitude are required when status is "captured" and must be omitted otherwise',
      path: ['latitude'],
    },
  );
export type SubmitChecklistLocationCaptureInput = z.infer<typeof submitChecklistLocationCaptureSchema>;
