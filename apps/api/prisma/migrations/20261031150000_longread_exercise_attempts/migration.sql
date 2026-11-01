ALTER TABLE "assessment_attempts"
  ADD COLUMN "counts_toward_results" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "longread_revision_id" UUID,
  ADD COLUMN "longread_block_id" UUID,
  ADD COLUMN "longread_sequence" INTEGER,
  ADD COLUMN "longread_request_id" UUID,
  ADD COLUMN "longread_request_hash" TEXT,
  ADD COLUMN "longread_result_key" TEXT,
  ADD COLUMN "longread_metadata" JSONB;
ALTER TABLE "assessment_attempt_answers" ADD COLUMN "frozen_question" JSONB;
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_longread_revision_id_fkey"
  FOREIGN KEY ("longread_revision_id") REFERENCES "longread_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "assessment_lr_sequence_key" ON "assessment_attempts" ("user_id", "longread_revision_id", "longread_block_id", "longread_sequence");
CREATE UNIQUE INDEX "assessment_lr_request_key" ON "assessment_attempts" ("user_id", "longread_revision_id", "longread_block_id", "longread_request_id");
CREATE UNIQUE INDEX "assessment_lr_result_key" ON "assessment_attempts" ("user_id", "longread_revision_id", "assessment_id", "longread_result_key");
CREATE INDEX "assessment_attempts_lr_scope_idx" ON "assessment_attempts" ("longread_revision_id", "user_id", "longread_block_id");
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_lr_context_check" CHECK (
  ("longread_revision_id" IS NULL AND "counts_toward_results" AND "longread_block_id" IS NULL AND "longread_sequence" IS NULL AND "longread_request_id" IS NULL AND "longread_request_hash" IS NULL AND "longread_result_key" IS NULL AND "longread_metadata" IS NULL)
  OR
  ("longread_revision_id" IS NOT NULL AND "longread_metadata" IS NOT NULL AND jsonb_typeof("longread_metadata") = 'object' AND (
    (NOT "counts_toward_results" AND "longread_block_id" IS NOT NULL AND "longread_sequence" IS NOT NULL AND "longread_sequence" > 0 AND "longread_request_id" IS NOT NULL AND "longread_request_hash" IS NOT NULL AND "longread_result_key" IS NULL)
    OR ("counts_toward_results" AND "longread_block_id" IS NULL AND "longread_sequence" IS NULL AND "longread_request_id" IS NULL AND "longread_request_hash" IS NULL AND "longread_result_key" IS NOT NULL)
  ))
);
