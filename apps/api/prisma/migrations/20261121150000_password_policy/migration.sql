ALTER TABLE "organizations"
ADD COLUMN "password_min_length" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "password_history_count" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_password_min_length_check" CHECK ("password_min_length" BETWEEN 5 AND 20),
ADD CONSTRAINT "organizations_password_history_count_check" CHECK ("password_history_count" BETWEEN 0 AND 10);

CREATE TABLE "password_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");

ALTER TABLE "password_history"
ADD CONSTRAINT "password_history_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
