-- PR 362в: who may edit a checklist besides its creator and admins. Existing rows stay editable by all.
ALTER TABLE "checklists" ADD COLUMN "allow_edit_by_all" BOOLEAN NOT NULL DEFAULT true;
