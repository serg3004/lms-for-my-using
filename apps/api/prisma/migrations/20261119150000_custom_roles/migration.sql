-- CreateEnum
CREATE TYPE "CustomRoleState" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('own', 'assigned', 'team', 'department', 'organization');

-- CreateEnum
CREATE TYPE "CustomRoleAssignmentState" AS ENUM ('active', 'revoked');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "custom_roles_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "custom_roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "state" "CustomRoleState" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_role_permissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_custom_role_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "state" "CustomRoleAssignmentState" NOT NULL DEFAULT 'active',
    "assigned_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_custom_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_roles_organization_id_state_idx" ON "custom_roles"("organization_id", "state");

-- CreateIndex
CREATE INDEX "custom_roles_created_by_idx" ON "custom_roles"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_id_organization_id_key" ON "custom_roles"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_organization_id_name_key" ON "custom_roles"("organization_id", "name");

-- CreateIndex
CREATE INDEX "custom_role_permissions_organization_id_action_idx" ON "custom_role_permissions"("organization_id", "action");

-- CreateIndex
CREATE INDEX "custom_role_permissions_role_id_idx" ON "custom_role_permissions"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_role_permissions_role_id_action_scope_key" ON "custom_role_permissions"("role_id", "action", "scope");

-- CreateIndex
CREATE INDEX "user_custom_role_assignments_organization_id_role_id_idx" ON "user_custom_role_assignments"("organization_id", "role_id");

-- CreateIndex
CREATE INDEX "user_custom_role_assignments_user_id_idx" ON "user_custom_role_assignments"("user_id");

-- CreateIndex
CREATE INDEX "user_custom_role_assignments_assigned_by_idx" ON "user_custom_role_assignments"("assigned_by");

-- CreateIndex
CREATE UNIQUE INDEX "user_custom_role_assignments_organization_id_user_id_role_i_key" ON "user_custom_role_assignments"("organization_id", "user_id", "role_id");

-- AddForeignKey
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_role_permissions" ADD CONSTRAINT "custom_role_permissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_role_permissions" ADD CONSTRAINT "custom_role_permissions_role_id_organization_id_fkey" FOREIGN KEY ("role_id", "organization_id") REFERENCES "custom_roles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_custom_role_assignments" ADD CONSTRAINT "user_custom_role_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_custom_role_assignments" ADD CONSTRAINT "user_custom_role_assignments_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_custom_role_assignments" ADD CONSTRAINT "user_custom_role_assignments_role_id_organization_id_fkey" FOREIGN KEY ("role_id", "organization_id") REFERENCES "custom_roles"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_custom_role_assignments" ADD CONSTRAINT "user_custom_role_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

