CREATE TABLE question_bank_folders (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (organization_id, name)
);

CREATE TABLE question_bank_entries (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES question_bank_folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX question_bank_entries_organization_id_folder_id_idx ON question_bank_entries(organization_id, folder_id);

ALTER TABLE assessment_questions ADD COLUMN bank_entry_id UUID REFERENCES question_bank_entries(id) ON DELETE RESTRICT;
CREATE INDEX assessment_questions_bank_entry_id_idx ON assessment_questions(bank_entry_id);

ALTER TABLE assessments ADD COLUMN bank_sample_size INTEGER CHECK (bank_sample_size > 0);
ALTER TABLE assessment_questions ADD COLUMN bank_sample_candidate BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE assessment_attempts ADD COLUMN bank_question_snapshot JSONB;
