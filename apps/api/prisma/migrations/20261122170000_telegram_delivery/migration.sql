-- PR 503: sending invitations and passwords through the Telegram bot.
ALTER TABLE "organizations" ADD COLUMN "telegram_delivery_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "user_telegram_links" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "chat_id" TEXT NOT NULL,
  "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_telegram_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_telegram_links_user_id_key" ON "user_telegram_links"("user_id");
CREATE INDEX "user_telegram_links_organization_id_idx" ON "user_telegram_links"("organization_id");
ALTER TABLE "user_telegram_links" ADD CONSTRAINT "user_telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "telegram_link_codes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "created_by_id" UUID,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telegram_link_codes_code_hash_key" ON "telegram_link_codes"("code_hash");
CREATE INDEX "telegram_link_codes_user_id_organization_id_idx" ON "telegram_link_codes"("user_id", "organization_id");
CREATE INDEX "telegram_link_codes_expires_at_idx" ON "telegram_link_codes"("expires_at");
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "message_deliveries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error_code" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_deliveries_organization_id_created_at_idx" ON "message_deliveries"("organization_id", "created_at");
CREATE INDEX "message_deliveries_user_id_created_at_idx" ON "message_deliveries"("user_id", "created_at");
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
