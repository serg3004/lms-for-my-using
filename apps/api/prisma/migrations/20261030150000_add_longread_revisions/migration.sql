-- PR 382: immutable longread versions. Additive only: one new table, two nullable/defaulted columns on
-- longread_documents (nothing outside longreads reads them) and one nullable column on progress. Rollback = ignore
-- them; old API versions never select the new columns.
ALTER TABLE "longread_documents" ADD COLUMN "last_revision_number" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "published_revision_id" UUID;

CREATE TABLE "longread_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "source_draft_revision" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "longread_revisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "progress" ADD COLUMN "longread_revision_id" UUID;

CREATE INDEX "longread_revisions_organization_id_idx" ON "longread_revisions"("organization_id");
CREATE UNIQUE INDEX "longread_revisions_document_id_number_key" ON "longread_revisions"("document_id", "number");
CREATE UNIQUE INDEX "longread_documents_published_revision_id_key" ON "longread_documents"("published_revision_id");

ALTER TABLE "progress" ADD CONSTRAINT "progress_longread_revision_id_fkey" FOREIGN KEY ("longread_revision_id") REFERENCES "longread_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "longread_documents" ADD CONSTRAINT "longread_documents_published_revision_id_fkey" FOREIGN KEY ("published_revision_id") REFERENCES "longread_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "longread_revisions" ADD CONSTRAINT "longread_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "longread_revisions" ADD CONSTRAINT "longread_revisions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "longread_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "longread_revisions" ADD CONSTRAINT "longread_revisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
