-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'invited', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('active', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "OrganizationPlan" AS ENUM ('trial', 'standard', 'enterprise');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('learner', 'instructor', 'manager', 'admin');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'active',
    "plan" "OrganizationPlan" NOT NULL DEFAULT 'trial',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "assigned_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "users_organization_id_status_idx" ON "users"("organization_id", "status");

-- CreateIndex
CREATE INDEX "users_last_login_at_idx" ON "users"("last_login_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE INDEX "memberships_organization_id_role_idx" ON "memberships"("organization_id", "role");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_assigned_by_idx" ON "memberships"("assigned_by");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_role_key" ON "memberships"("organization_id", "user_id", "role");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

