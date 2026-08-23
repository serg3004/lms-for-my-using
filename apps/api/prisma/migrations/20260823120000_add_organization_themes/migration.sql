CREATE TABLE "organization_themes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "logo_object_key" TEXT,
    "logo_mime_type" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_themes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_themes_organization_id_key"
    ON "organization_themes"("organization_id");

ALTER TABLE "organization_themes"
    ADD CONSTRAINT "organization_themes_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve themes written by the legacy JSON column while separating stored
-- object metadata from the public theme settings document.
INSERT INTO "organization_themes" (
    "id", "organization_id", "settings", "logo_object_key", "logo_mime_type"
)
SELECT
    gen_random_uuid(),
    "id",
    "theme_settings" - 'logoObjectKey' - 'logoMimeType' - 'logoUrl',
    "theme_settings" ->> 'logoObjectKey',
    "theme_settings" ->> 'logoMimeType'
FROM "organizations"
WHERE "theme_settings" IS NOT NULL;

ALTER TABLE "organizations" DROP COLUMN "theme_settings";
