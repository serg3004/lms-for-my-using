ALTER TABLE "sessions"
ADD COLUMN "refresh_token_hash" TEXT,
ADD COLUMN "refresh_expires_at" TIMESTAMPTZ;

CREATE UNIQUE INDEX "sessions_refresh_token_hash_key"
ON "sessions"("refresh_token_hash");

CREATE INDEX "sessions_refresh_expires_at_idx"
ON "sessions"("refresh_expires_at");
