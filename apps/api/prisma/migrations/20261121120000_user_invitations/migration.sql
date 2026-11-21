CREATE TABLE "user_invitations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_invitations_token_hash_key" ON "user_invitations"("token_hash");
CREATE INDEX "user_invitations_user_id_organization_id_idx" ON "user_invitations"("user_id", "organization_id");
CREATE INDEX "user_invitations_expires_at_idx" ON "user_invitations"("expires_at");

ALTER TABLE "user_invitations"
ADD CONSTRAINT "user_invitations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
