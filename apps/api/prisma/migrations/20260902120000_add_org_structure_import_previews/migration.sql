CREATE TABLE "org_structure_import_previews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "row_count" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_structure_import_previews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_structure_import_previews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "org_structure_import_previews_token_hash_key" ON "org_structure_import_previews"("token_hash");
CREATE INDEX "org_structure_import_previews_org_actor_expiry_idx" ON "org_structure_import_previews"("organization_id", "actor_id", "expires_at");
