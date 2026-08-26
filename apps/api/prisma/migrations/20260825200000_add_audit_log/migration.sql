CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_organization_id_created_at_idx"
ON "audit_logs"("organization_id", "created_at");

CREATE INDEX "audit_logs_organization_id_action_idx"
ON "audit_logs"("organization_id", "action");

CREATE INDEX "audit_logs_organization_id_target_type_target_id_idx"
ON "audit_logs"("organization_id", "target_type", "target_id");

CREATE INDEX "audit_logs_organization_id_actor_id_idx"
ON "audit_logs"("organization_id", "actor_id");

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
