BEGIN;

ALTER TABLE assessments ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE assessments DROP CONSTRAINT assessments_course_id_fkey;
ALTER TABLE assessments ADD CONSTRAINT assessments_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE assessment_placements (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL ON UPDATE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL ON UPDATE CASCADE,
  longread_block_id UUID,
  location_key TEXT NOT NULL,
  legacy BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX assessment_placements_assessment_id_location_key_key
  ON assessment_placements (assessment_id, location_key);
CREATE INDEX assessment_placements_organization_id_course_id_deleted_at_idx
  ON assessment_placements (organization_id, course_id, deleted_at);

INSERT INTO assessment_placements (id, organization_id, assessment_id, course_id, lesson_id, location_key, legacy)
SELECT gen_random_uuid(), organization_id, id, course_id, lesson_id,
  CASE WHEN lesson_id IS NULL THEN 'course:' || course_id ELSE 'lesson:' || lesson_id END, true
FROM assessments WHERE course_id IS NOT NULL;

-- Legacy creators (including the longread question bank and revision restore) still write the original columns.
CREATE FUNCTION create_legacy_assessment_placement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO assessment_placements (id, organization_id, assessment_id, course_id, lesson_id, location_key, legacy)
  VALUES (gen_random_uuid(), NEW.organization_id, NEW.id, NEW.course_id, NEW.lesson_id,
    CASE WHEN NEW.lesson_id IS NULL THEN 'course:' || NEW.course_id ELSE 'lesson:' || NEW.lesson_id END, true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER assessment_legacy_placement AFTER INSERT ON assessments
  FOR EACH ROW WHEN (NEW.course_id IS NOT NULL) EXECUTE FUNCTION create_legacy_assessment_placement();

INSERT INTO assessment_placements (id, organization_id, assessment_id, course_id, lesson_id, longread_block_id, location_key, deleted_at)
SELECT gen_random_uuid(), links.organization_id, links.assessment_id, links.course_id, links.lesson_id, links.block_id, 'block:' || links.block_id, NULL
FROM (
  SELECT DISTINCT a.organization_id, a.id AS assessment_id, a.course_id, a.lesson_id, b.id AS block_id
  FROM longread_blocks b
  JOIN longread_chapters ch ON ch.id = b.chapter_id
  JOIN longread_documents doc ON doc.id = ch.document_id
  JOIN assessment_questions q ON q.id::text = b.content->>'questionId' AND q.organization_id = b.organization_id
  JOIN assessments a ON a.id = q.assessment_id AND a.organization_id = q.organization_id
  WHERE b.type = 'exercise' AND a.lesson_id = doc.lesson_id AND a.course_id IS NOT NULL
) links;

-- Old attempts can refer to a block removed from the draft after its version was published.
INSERT INTO assessment_placements (id, organization_id, assessment_id, course_id, lesson_id, longread_block_id, location_key, deleted_at)
SELECT gen_random_uuid(), historical.organization_id, historical.assessment_id, historical.course_id, historical.lesson_id,
  historical.longread_block_id, 'block:' || historical.longread_block_id, now()
FROM (
  SELECT DISTINCT t.organization_id, t.assessment_id, a.course_id, a.lesson_id, t.longread_block_id
  FROM assessment_attempts t
  JOIN assessments a ON a.id = t.assessment_id AND a.organization_id = t.organization_id
  WHERE t.longread_block_id IS NOT NULL AND a.course_id IS NOT NULL
) historical
ON CONFLICT (assessment_id, location_key) DO NOTHING;

ALTER TABLE assessment_attempts ADD COLUMN placement_id UUID
  REFERENCES assessment_placements(id) ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE assessment_attempts ADD COLUMN course_id UUID
  REFERENCES courses(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX assessment_attempts_organization_id_course_id_user_id_idx
  ON assessment_attempts (organization_id, course_id, user_id);
CREATE INDEX assessment_attempts_placement_id_user_id_idx
  ON assessment_attempts (placement_id, user_id);

UPDATE assessment_attempts t
SET placement_id = COALESCE(block.id, legacy.id), course_id = legacy.course_id
FROM assessment_attempts source
JOIN assessment_placements legacy ON legacy.assessment_id = source.assessment_id AND legacy.legacy
LEFT JOIN assessment_placements block ON block.assessment_id = source.assessment_id AND block.longread_block_id = source.longread_block_id
WHERE t.id = source.id;

COMMIT;
