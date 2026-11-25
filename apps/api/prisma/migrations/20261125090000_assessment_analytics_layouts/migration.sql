CREATE TABLE "assessment_analytics_layouts" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cards" JSONB NOT NULL,
    CONSTRAINT "assessment_analytics_layouts_pkey" PRIMARY KEY ("organization_id", "user_id"),
    CONSTRAINT "assessment_analytics_layouts_user_id_organization_id_fkey"
      FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id")
      ON DELETE CASCADE ON UPDATE CASCADE
);
