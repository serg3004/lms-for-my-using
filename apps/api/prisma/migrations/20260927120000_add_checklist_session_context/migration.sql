-- PR 323: additive nullable storage; existing sessions remain valid and unchanged.
ALTER TABLE "checklist_sessions"
  ADD COLUMN "context_fields_snapshot" JSONB,
  ADD COLUMN "context_values" JSONB;
