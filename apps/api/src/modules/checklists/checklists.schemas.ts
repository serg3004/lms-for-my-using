import { z } from 'zod';

export const checklistStatusSchema = z.enum(['draft', 'published', 'archived']);
export const checklistScoringModeSchema = z.enum(['sum_points', 'all_required', 'scale']);
export const checklistInstanceStatusSchema = z.enum(['assigned', 'in_progress', 'submitted', 'completed', 'expired']);
export const checklistReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']);
// Also used below by the PR 296 checklist-level defaultLocationCapturePolicy field, not just the
// workplace-session settings section further down this file.
export const checklistGeolocationPolicySchema = z.enum(['off', 'optional', 'required']);

// ---- PR 296: observation-sheet builder (context fields, item groups, sheet-level settings) ----

export const checklistPreSessionVisibilitySchema = z.enum(['full', 'structure_only', 'none']);
export const checklistContextFieldTypeSchema = z.enum(['text', 'textarea', 'date']);

export const contextFieldSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(120),
  type: checklistContextFieldTypeSchema,
  required: z.boolean(),
  order: z.number().int().min(0),
});
export type ContextField = z.infer<typeof contextFieldSchema>;

export const scaleLevelSchema = z.object({
  level: z.number().int().min(1),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  points: z.number().int().min(0),
});
export type ScaleLevel = z.infer<typeof scaleLevelSchema>;

export const checklistListQuerySchema = z.object({
  status: checklistStatusSchema.optional(),
});
export type ChecklistListQuery = z.infer<typeof checklistListQuerySchema>;

export const createChecklistSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  scoringMode: checklistScoringModeSchema.default('sum_points'),
  passThreshold: z.number().int().min(0).max(100).default(80),
  scaleLevels: z.array(scaleLevelSchema).max(20).optional(),
  requiresReview: z.boolean().default(false),
  contextFields: z.array(contextFieldSchema).max(20).optional(),
  defaultLocationCapturePolicy: checklistGeolocationPolicySchema.optional(),
  preSessionVisibility: checklistPreSessionVisibilitySchema.default('structure_only'),
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
    contextFields: z.array(contextFieldSchema).max(20).nullable(),
    defaultLocationCapturePolicy: checklistGeolocationPolicySchema.nullable(),
    preSessionVisibility: checklistPreSessionVisibilitySchema,
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
    // Optional reusable evaluation scale (PR 293) -- independent of scoringMode='scale'/
    // Checklist.scaleLevels above. Validity (exists in org, not archived) is checked in the
    // service, not here (needs a DB lookup this schema can't do).
    scaleId: z.string().uuid().optional(),
    // Optional ChecklistItemGroup (PR 296 observation-sheet builder). Validity (exists in org,
    // belongs to the same checklist) is checked in the service.
    groupId: z.string().uuid().optional(),
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
    scaleId: z.string().uuid().nullable(),
    groupId: z.string().uuid().nullable(),
  })
  .partial();
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

// ---- PR 296: item groups ("Группы и критерии") ----

export const createChecklistItemGroupSchema = z.object({
  title: z.string().trim().min(1).max(120).default('Новая группа'),
});
export type CreateChecklistItemGroupInput = z.infer<typeof createChecklistItemGroupSchema>;

export const updateChecklistItemGroupSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    order: z.number().int().min(0),
  })
  .partial();
export type UpdateChecklistItemGroupInput = z.infer<typeof updateChecklistItemGroupSchema>;

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

// ---- PR 299: manager checklist analytics ----
export const checklistManagerAnalyticsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  checklistId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
export type ChecklistManagerAnalyticsQuery = z.infer<typeof checklistManagerAnalyticsQuerySchema>;

// ---- Workplace-training session settings (docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md) ----
// checklistGeolocationPolicySchema itself is declared near the top of this file (reused by the
// PR 296 checklist-level defaultLocationCapturePolicy field above).

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

// PR 301: an optional client-generated key (kept identical across a network retry of the exact
// same request) that lets create/transition/recalculate detect "this is my own retry" and replay
// the first call's stored response instead of risking a duplicate mutation. Never required --
// omitting it just means no replay protection beyond the DB-level guards that already exist
// (the instance-scoped unique constraint, optimistic-concurrency version checks).
const idempotencyKeySchema = z.string().trim().min(1).max(200).optional();

export const createChecklistSessionSchema = z
  .object({
    instanceId: z.string().uuid(),
    observerId: z.string().uuid(),
    scheduledAt: z.string().datetime().nullable().optional(),
    locationCapturePolicy: checklistGeolocationPolicySchema.optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    idempotencyKey: idempotencyKeySchema,
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
export const checklistSessionTransitionSchema = z
  .object({ version: z.number().int().min(1), idempotencyKey: idempotencyKeySchema })
  .strict();
export type ChecklistSessionTransitionInput = z.infer<typeof checklistSessionTransitionSchema>;

// ---- PR 302: observer unavailable -- an orthogonal business flag, not a lifecycle transition ----
export const markChecklistSessionObserverUnavailableSchema = z
  .object({ reason: z.string().trim().min(1).max(500), version: z.number().int().min(1) })
  .strict();
export type MarkChecklistSessionObserverUnavailableInput = z.infer<typeof markChecklistSessionObserverUnavailableSchema>;

// Structured feedback (PR 297 observer conduct screen): session-level, saved during/after the
// observation. Every field optional so the observer can save partial progress (autosave) --
// `version` is still required, matching the rest of the session mutation endpoints' optimistic-
// concurrency contract.
export const submitChecklistSessionFeedbackSchema = z
  .object({
    strengths: z.string().trim().max(4000).nullable().optional(),
    developmentAreas: z.string().trim().max(4000).nullable().optional(),
    nextSteps: z.string().trim().max(4000).nullable().optional(),
    version: z.number().int().min(1),
  })
  .strict();
export type SubmitChecklistSessionFeedbackInput = z.infer<typeof submitChecklistSessionFeedbackSchema>;

// ---- PR 300: admin-only score recalculation, audited via ChecklistScoreRevision ----
// `reason` is required (not merely encouraged) -- the plan explicitly calls for a required
// reason on every recalculation, since it's an admin overriding a learner/observer-facing result.
export const recalculateChecklistScoreSchema = z
  .object({ reason: z.string().trim().min(1).max(500), idempotencyKey: idempotencyKeySchema })
  .strict();
export type RecalculateChecklistScoreInput = z.infer<typeof recalculateChecklistScoreSchema>;

export const checklistSessionQuerySchema = z.object({
  status: checklistSessionStatusSchema.optional(),
  observerId: z.string().uuid().optional(),
  checklistId: z.string().uuid().optional(),
  learnerId: z.string().uuid().optional(),
  // Matches the admin sessions list screen's "Период" filter -- against scheduledAt.
  scheduledFrom: z.string().datetime().optional(),
  scheduledTo: z.string().datetime().optional(),
  // Matches the admin sessions list screen's free-text search -- employee name or checklist title.
  search: z.string().trim().min(1).max(120).optional(),
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

// ---- Admin API: bulk create, repeat, participant/checklist lookup (PR 292) ----

export const MAX_BULK_CHECKLIST_SESSION_RECIPIENTS = 100;

// Bulk create is intentionally NOT a variant of the single-create schema: each recipient becomes
// an independent (ChecklistInstance, ChecklistSession) pair, so this always takes checklistId +
// learnerIds, never a pre-existing instanceId (single create still requires one).
export const bulkCreateChecklistSessionSchema = z
  .object({
    checklistId: z.string().uuid(),
    learnerIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_CHECKLIST_SESSION_RECIPIENTS),
    observerId: z.string().uuid(),
    scheduledAt: z.string().datetime().nullable().optional(),
    locationCapturePolicy: checklistGeolocationPolicySchema.optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
export type BulkCreateChecklistSessionInput = z.infer<typeof bulkCreateChecklistSessionSchema>;

export const checklistSessionParticipantRoleSchema = z.enum(['learner', 'observer']);
export const checklistSessionParticipantsQuerySchema = z.object({
  role: checklistSessionParticipantRoleSchema,
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ChecklistSessionParticipantsQuery = z.infer<typeof checklistSessionParticipantsQuerySchema>;

// ---- Evaluation scales (PR 293) ----
//
// Tenant-scoped, reusable evaluation scale library, referenced per-criterion via
// ChecklistItem.scaleId. Coexists with (does not replace) the checklist-level
// scoringMode='scale' + Checklist.scaleLevels mechanism above -- see ADR_CHECKLIST_SESSION_OVERLAY.md.

export const checklistScaleStatusSchema = z.enum(['active', 'archived']);

export const checklistScaleLevelInputSchema = z.object({
  value: z.number().int().min(1),
  label: z.string().trim().min(1).max(80),
  score: z.number().int().min(0).max(1000),
});
export type ChecklistScaleLevelInput = z.infer<typeof checklistScaleLevelInputSchema>;

const hasUniqueLevelValues = (levels: ChecklistScaleLevelInput[]) => new Set(levels.map((level) => level.value)).size === levels.length;
const UNIQUE_LEVEL_VALUES_ISSUE = { message: 'level values must be unique within a scale', path: ['levels'] };

// Levels are always a full, ordered replacement, never a partial patch -- a scale is small enough
// (max 20 levels, mirroring scaleLevelSchema above) that there is no meaningful "just add one
// level" operation distinct from "here is the complete level set now".
export const createChecklistScaleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    levels: z.array(checklistScaleLevelInputSchema).min(2).max(20),
  })
  .strict()
  .refine((input) => hasUniqueLevelValues(input.levels), UNIQUE_LEVEL_VALUES_ISSUE);
export type CreateChecklistScaleInput = z.infer<typeof createChecklistScaleSchema>;

// Update replaces name and/or the full level set -- never partial-patches individual levels. Only
// permitted while the scale is not yet used by any assigned checklist (ChecklistScaleService
// enforces this; it needs a DB lookup this schema can't do). Archiving (the only lifecycle
// transition allowed on a used scale) is a separate endpoint, not part of this schema.
export const updateChecklistScaleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    levels: z.array(checklistScaleLevelInputSchema).min(2).max(20),
  })
  .partial()
  .strict()
  .refine((input) => !input.levels || hasUniqueLevelValues(input.levels), UNIQUE_LEVEL_VALUES_ISSUE);
export type UpdateChecklistScaleInput = z.infer<typeof updateChecklistScaleSchema>;
