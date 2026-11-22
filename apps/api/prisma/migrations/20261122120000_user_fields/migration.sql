-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "user_fields_seeded_at" TIMESTAMP(3);

-- PR 499: custom user fields (definitions and values). Additive only: two new tables and one enum.
CREATE TYPE "UserFieldType" AS ENUM ('text', 'number', 'date', 'list', 'phone', 'boolean');

CREATE TABLE "user_field_definitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "labels" JSONB NOT NULL,
    "type" "UserFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "is_unique" BOOLEAN NOT NULL DEFAULT false,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "visible_to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editable_by" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "user_field_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_field_definitions_organization_id_key_key" ON "user_field_definitions"("organization_id", "key");
CREATE INDEX "user_field_definitions_organization_id_archived_at_sort_ord_idx" ON "user_field_definitions"("organization_id", "archived_at", "sort_order");

CREATE TABLE "user_field_values" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "unique_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "user_field_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_field_values_user_id_field_id_key" ON "user_field_values"("user_id", "field_id");
-- NULL unique keys never collide, so fields that are not unique are unaffected.
CREATE UNIQUE INDEX "user_field_values_field_id_unique_key_key" ON "user_field_values"("field_id", "unique_key");
CREATE INDEX "user_field_values_organization_id_field_id_normalized_value_idx" ON "user_field_values"("organization_id", "field_id", "normalized_value");

ALTER TABLE "user_field_definitions"
ADD CONSTRAINT "user_field_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_field_values"
ADD CONSTRAINT "user_field_values_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "user_field_values_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "user_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "user_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
