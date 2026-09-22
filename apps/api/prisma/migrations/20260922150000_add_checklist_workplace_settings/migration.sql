-- CreateEnum
CREATE TYPE "ChecklistGeolocationPolicy" AS ENUM ('off', 'optional', 'required');

-- CreateEnum
CREATE TYPE "ChecklistFeedbackVisibility" AS ENUM ('after_completion', 'live');

-- CreateTable
CREATE TABLE "checklist_workplace_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "module_enabled" BOOLEAN NOT NULL DEFAULT false,
    "high_performance_threshold" INTEGER NOT NULL DEFAULT 90,
    "critical_threshold" INTEGER,
    "low_threshold" INTEGER,
    "default_geolocation_policy" "ChecklistGeolocationPolicy" NOT NULL DEFAULT 'off',
    "feedback_visibility" "ChecklistFeedbackVisibility" NOT NULL DEFAULT 'after_completion',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_workplace_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One settings row per tenant, mirroring the organization_themes 1:1 pattern.
CREATE UNIQUE INDEX "checklist_workplace_settings_organization_id_key" ON "checklist_workplace_settings"("organization_id");

-- AddForeignKey
ALTER TABLE "checklist_workplace_settings" ADD CONSTRAINT "checklist_workplace_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
