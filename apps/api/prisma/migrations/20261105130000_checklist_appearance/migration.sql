-- PR 422: block appearance of a sheet (nullable JSON, additive).
ALTER TABLE "checklists" ADD COLUMN "appearance" JSONB;
