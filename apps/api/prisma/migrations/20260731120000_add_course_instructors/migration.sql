CREATE TABLE "course_instructors" (
    "course_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_instructors_pkey" PRIMARY KEY ("course_id", "instructor_id"),
    CONSTRAINT "course_instructors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_instructors_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_instructors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "course_instructors_organization_id_instructor_id_idx"
ON "course_instructors"("organization_id", "instructor_id");

CREATE INDEX "course_instructors_organization_id_course_id_idx"
ON "course_instructors"("organization_id", "course_id");
