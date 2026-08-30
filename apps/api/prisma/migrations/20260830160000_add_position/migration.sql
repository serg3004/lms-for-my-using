CREATE TYPE "PositionStatus" AS ENUM ('active', 'archived');

CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "PositionStatus" NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "positions_id_organization_id_key" ON "positions"("id", "organization_id");
CREATE UNIQUE INDEX "positions_organization_id_code_key" ON "positions"("organization_id", "code");
CREATE INDEX "positions_organization_id_status_idx" ON "positions"("organization_id", "status");

ALTER TABLE "positions" ADD CONSTRAINT "positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "department_memberships" ADD COLUMN "position_id" UUID;

CREATE INDEX "department_memberships_organization_id_position_id_idx" ON "department_memberships"("organization_id", "position_id");

ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_position_id_organization_id_fkey" FOREIGN KEY ("position_id", "organization_id") REFERENCES "positions"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;
