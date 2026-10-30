-- PR 381: longread lessons. Additive only: a boolean flag (default off) on organizations and three new
-- tables. Existing lessons, courses and progress are untouched; rollback = switch the flag off (the tables
-- can stay, nothing reads them while the flag is off).
ALTER TABLE "organizations" ADD COLUMN "longread_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "longread_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "draft_revision" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "longread_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "longread_chapters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "longread_chapters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "longread_blocks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "longread_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "longread_documents_lesson_id_key" ON "longread_documents"("lesson_id");
CREATE INDEX "longread_documents_organization_id_idx" ON "longread_documents"("organization_id");
CREATE UNIQUE INDEX "longread_chapters_document_id_anchor_key" ON "longread_chapters"("document_id", "anchor");
CREATE INDEX "longread_chapters_organization_id_idx" ON "longread_chapters"("organization_id");
CREATE INDEX "longread_chapters_document_id_order_idx" ON "longread_chapters"("document_id", "order");
CREATE INDEX "longread_blocks_organization_id_idx" ON "longread_blocks"("organization_id");
CREATE INDEX "longread_blocks_chapter_id_order_idx" ON "longread_blocks"("chapter_id", "order");

ALTER TABLE "longread_documents" ADD CONSTRAINT "longread_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "longread_documents" ADD CONSTRAINT "longread_documents_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "longread_chapters" ADD CONSTRAINT "longread_chapters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "longread_chapters" ADD CONSTRAINT "longread_chapters_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "longread_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "longread_blocks" ADD CONSTRAINT "longread_blocks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "longread_blocks" ADD CONSTRAINT "longread_blocks_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "longread_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
