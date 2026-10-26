-- PR 344: one protected "Yes/No" scale per organization. Additive: existing scales stay non-default.
ALTER TABLE "checklist_scales" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- At most one default scale per organization (Prisma's schema DSL has no WHERE-clause index syntax).
CREATE UNIQUE INDEX "checklist_scales_one_default_per_organization"
ON "checklist_scales" ("organization_id")
WHERE "is_default" = TRUE;
