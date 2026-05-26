ALTER TABLE "assessment_questions"
ADD COLUMN "image_url" TEXT;

ALTER TABLE "assessment_answer_options"
ADD COLUMN "image_url" TEXT;

ALTER TABLE "assessment_answer_options"
ALTER COLUMN "text" DROP NOT NULL;

ALTER TABLE "assessment_answer_options"
ADD CONSTRAINT "assessment_answer_options_content_check"
CHECK ("text" IS NOT NULL OR "image_url" IS NOT NULL);
