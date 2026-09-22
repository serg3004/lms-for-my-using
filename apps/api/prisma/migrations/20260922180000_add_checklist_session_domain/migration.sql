-- CreateEnum
CREATE TYPE "ChecklistSessionStatus" AS ENUM ('scheduled', 'in_progress', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ChecklistSessionEventType" AS ENUM ('created', 'rescheduled', 'started', 'paused', 'resumed', 'completed', 'cancelled', 'observer_reassigned', 'reminder_sent');

-- CreateEnum
CREATE TYPE "ChecklistSessionReminderType" AS ENUM ('pre_start', 'incomplete_after_start');

-- CreateEnum
CREATE TYPE "ChecklistSessionReminderStatus" AS ENUM ('pending', 'sent', 'suppressed', 'failed');

-- CreateEnum
CREATE TYPE "ChecklistLocationCapturePoint" AS ENUM ('start', 'end');

-- CreateEnum
CREATE TYPE "ChecklistLocationCaptureStatus" AS ENUM ('captured', 'denied', 'unavailable');

-- CreateEnum
CREATE TYPE "ChecklistScaleStatus" AS ENUM ('active', 'archived');

-- AlterTable: per-item session criteria config (weight/skip), additive with safe defaults.
ALTER TABLE "checklist_items"
  ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "allow_skip" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "auto_skip_unanswered" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "checklist_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "observer_id" UUID NOT NULL,
    "status" "ChecklistSessionStatus" NOT NULL DEFAULT 'scheduled',
    "version" INTEGER NOT NULL DEFAULT 1,
    "scheduled_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "paused_at" TIMESTAMPTZ,
    "location_capture_policy" "ChecklistGeolocationPolicy" NOT NULL DEFAULT 'off',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_session_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "event_type" "ChecklistSessionEventType" NOT NULL,
    "actor_user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_score_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "previous_percentage" INTEGER NOT NULL,
    "new_percentage" INTEGER NOT NULL,
    "previous_passed" BOOLEAN NOT NULL,
    "new_passed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_score_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_session_reminders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "reminder_type" "ChecklistSessionReminderType" NOT NULL,
    "status" "ChecklistSessionReminderStatus" NOT NULL DEFAULT 'pending',
    "scheduled_for" TIMESTAMPTZ NOT NULL,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_session_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_location_captures" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "capture_point" "ChecklistLocationCapturePoint" NOT NULL,
    "status" "ChecklistLocationCaptureStatus" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "captured_by" UUID,
    "captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_location_captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_scales" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ChecklistScaleStatus" NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_scale_levels" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_scale_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_sessions_instance_id_key" ON "checklist_sessions"("instance_id");

-- CreateIndex
CREATE INDEX "checklist_sessions_organization_id_status_idx" ON "checklist_sessions"("organization_id", "status");

-- CreateIndex
CREATE INDEX "checklist_sessions_organization_id_observer_id_idx" ON "checklist_sessions"("organization_id", "observer_id");

-- CreateIndex
CREATE INDEX "checklist_sessions_organization_id_scheduled_at_idx" ON "checklist_sessions"("organization_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "checklist_session_events_session_id_created_at_id_idx" ON "checklist_session_events"("session_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "checklist_session_events_organization_id_created_at_idx" ON "checklist_session_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "checklist_score_revisions_instance_id_created_at_id_idx" ON "checklist_score_revisions"("instance_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "checklist_score_revisions_organization_id_created_at_idx" ON "checklist_score_revisions"("organization_id", "created_at");

-- CreateIndex
-- DB-level idempotency guardrail for PR 291's scheduler: at most one pre_start and one
-- incomplete_after_start reminder can ever exist per session.
CREATE UNIQUE INDEX "checklist_session_reminders_session_id_reminder_type_key" ON "checklist_session_reminders"("session_id", "reminder_type");

-- CreateIndex
CREATE INDEX "checklist_session_reminders_organization_id_scheduled_for_idx" ON "checklist_session_reminders"("organization_id", "scheduled_for");

-- CreateIndex
-- DB-level enforcement of "start/end only" geolocation capture (PR 290): at most one start row
-- and one end row can ever exist per session.
CREATE UNIQUE INDEX "checklist_location_captures_session_id_capture_point_key" ON "checklist_location_captures"("session_id", "capture_point");

-- CreateIndex
CREATE INDEX "checklist_location_captures_organization_id_idx" ON "checklist_location_captures"("organization_id");

-- CreateIndex
CREATE INDEX "checklist_scales_organization_id_status_idx" ON "checklist_scales"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_scale_levels_scale_id_value_key" ON "checklist_scale_levels"("scale_id", "value");

-- CreateIndex
CREATE INDEX "checklist_scale_levels_organization_id_idx" ON "checklist_scale_levels"("organization_id");

-- AddForeignKey
ALTER TABLE "checklist_sessions" ADD CONSTRAINT "checklist_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_sessions" ADD CONSTRAINT "checklist_sessions_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "checklist_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_sessions" ADD CONSTRAINT "checklist_sessions_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_session_events" ADD CONSTRAINT "checklist_session_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_session_events" ADD CONSTRAINT "checklist_session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "checklist_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_session_events" ADD CONSTRAINT "checklist_session_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_score_revisions" ADD CONSTRAINT "checklist_score_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_score_revisions" ADD CONSTRAINT "checklist_score_revisions_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "checklist_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_score_revisions" ADD CONSTRAINT "checklist_score_revisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_session_reminders" ADD CONSTRAINT "checklist_session_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_session_reminders" ADD CONSTRAINT "checklist_session_reminders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "checklist_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_location_captures" ADD CONSTRAINT "checklist_location_captures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_location_captures" ADD CONSTRAINT "checklist_location_captures_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "checklist_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_location_captures" ADD CONSTRAINT "checklist_location_captures_captured_by_fkey" FOREIGN KEY ("captured_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_scales" ADD CONSTRAINT "checklist_scales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_scales" ADD CONSTRAINT "checklist_scales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_scale_levels" ADD CONSTRAINT "checklist_scale_levels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_scale_levels" ADD CONSTRAINT "checklist_scale_levels_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "checklist_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
