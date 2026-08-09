-- Drop pre-existing duplicate (course_id, lesson_id, user_id) rows before enforcing uniqueness,
-- keeping the most recently updated row per group (id as a stable tiebreaker).
DELETE FROM "progress"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (
      PARTITION BY "course_id", "lesson_id", "user_id"
      ORDER BY "updated_at" DESC, "id" DESC
    ) AS rn
    FROM "progress"
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX "progress_course_id_lesson_id_user_id_key" ON "progress"("course_id", "lesson_id", "user_id");
