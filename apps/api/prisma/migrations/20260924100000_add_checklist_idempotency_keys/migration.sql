-- CreateTable
CREATE TABLE "checklist_idempotency_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_idempotency_keys_organization_id_scope_key_key" ON "checklist_idempotency_keys"("organization_id", "scope", "key");

-- CreateIndex
CREATE INDEX "checklist_idempotency_keys_organization_id_created_at_idx" ON "checklist_idempotency_keys"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "checklist_idempotency_keys" ADD CONSTRAINT "checklist_idempotency_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
