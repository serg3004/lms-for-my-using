-- PR 496: own profile (short note, photo) and a version counter for concurrent edits. Additive only.
ALTER TABLE "users" ADD COLUMN "about_me" TEXT;
ALTER TABLE "users" ADD COLUMN "photo_object_key" TEXT;
ALTER TABLE "users" ADD COLUMN "photo_mime_type" TEXT;
ALTER TABLE "users" ADD COLUMN "profile_version" INTEGER NOT NULL DEFAULT 0;
