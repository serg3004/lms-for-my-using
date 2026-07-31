CREATE TABLE "group_members" (
  "group_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id", "user_id"),
  CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE,
  CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "group_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE TABLE "manager_groups" (
  "group_id" UUID NOT NULL,
  "manager_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manager_groups_pkey" PRIMARY KEY ("group_id", "manager_id"),
  CONSTRAINT "manager_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE,
  CONSTRAINT "manager_groups_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "manager_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "group_members_organization_id_user_id_idx" ON "group_members"("organization_id", "user_id");
CREATE INDEX "manager_groups_organization_id_manager_id_idx" ON "manager_groups"("organization_id", "manager_id");
