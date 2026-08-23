ALTER TABLE "checklist_instances"
  ADD COLUMN "template_snapshot" JSONB,
  ADD COLUMN "snapshot_version" INTEGER DEFAULT 1;

-- Existing instances predate immutable snapshots, so their original template
-- state cannot be reconstructed. Backfill the current template as the safest
-- compatibility baseline; new assignments always persist their own snapshot.
UPDATE "checklist_instances" AS ci
SET
  "template_snapshot" = jsonb_build_object(
    'version', 1,
    'checklist', jsonb_build_object(
      'id', c."id",
      'organizationId', c."organization_id",
      'title', c."title",
      'description', c."description",
      'status', c."status"::text,
      'scoringMode', c."scoring_mode"::text,
      'passThreshold', c."pass_threshold",
      'scaleLevels', c."scale_levels",
      'requiresReview', c."requires_review",
      'items', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', i."id",
              'checklistId', i."checklist_id",
              'order', i."order",
              'text', i."text",
              'points', i."points",
              'isRequired', i."is_required",
              'photoRequired', i."photo_required"
            )
            ORDER BY i."order"
          )
          FROM "checklist_items" AS i
          WHERE i."checklist_id" = c."id"
            AND i."deleted_at" IS NULL
        ),
        '[]'::jsonb
      )
    )
  ),
  "snapshot_version" = 1
FROM "checklists" AS c
WHERE ci."checklist_id" = c."id"
  AND ci."template_snapshot" IS NULL;
