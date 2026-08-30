CREATE TABLE "department_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "department_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_memberships_id_organization_id_key" ON "department_memberships"("id", "organization_id");
CREATE INDEX "department_memberships_organization_id_department_id_effective_idx" ON "department_memberships"("organization_id", "department_id", "effective_to");
CREATE INDEX "department_memberships_organization_id_user_id_effective_to_idx" ON "department_memberships"("organization_id", "user_id", "effective_to");

-- Plan invariant: at most one current (effective_to IS NULL) primary membership per user.
CREATE UNIQUE INDEX "department_memberships_current_primary_user_key"
ON "department_memberships" ("organization_id", "user_id")
WHERE "is_primary" = TRUE AND "effective_to" IS NULL;

-- Plan invariant: at most one current membership per (user, department) pair, primary or not.
CREATE UNIQUE INDEX "department_memberships_current_user_department_key"
ON "department_memberships" ("organization_id", "user_id", "department_id")
WHERE "effective_to" IS NULL;

ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
