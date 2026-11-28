import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AssessmentLibraryQuery } from './assessments.schemas.js';

const baseSorts = {
  createdAt: Prisma.sql`a.created_at`,
  title: Prisma.sql`lower(a.title)`,
  course: Prisma.sql`lower(a.course_title)`,
  status: Prisma.sql`a.status`,
};
const statsSorts = {
  questions: Prisma.sql`a.questions_count`,
  attempts: Prisma.sql`a.attempts_count`,
  passRate: Prisma.sql`a.pass_rate`,
  lastAttemptAt: Prisma.sql`a.last_attempt_at`,
};

export async function queryAssessmentLibrary(
  prisma: PrismaService, organizationId: string, actorId: string, courseScoped: boolean, query: AssessmentLibraryQuery,
  /** PR 576: folders closed to the actor; the tests inside them are not listed. */
  hiddenFolders: readonly string[] = [],
) {
  const direction = query.direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const sort = { ...baseSorts, ...statsSorts }[query.sort];
  const order = Prisma.sql`${sort} ${direction} NULLS LAST, a.id ${direction}`;
  const offset = (query.page - 1) * query.pageSize;
  const sortUsesStats = Object.hasOwn(statsSorts, query.sort);
  const attempts = Prisma.sql`r.assessment_id = a.id AND r.organization_id = a.organization_id
    AND r.deleted_at IS NULL AND r.counts_toward_results
    ${courseScoped ? Prisma.sql`AND EXISTS (
      SELECT 1 FROM courses rc JOIN course_instructors ri ON ri.course_id = rc.id
      WHERE rc.id = r.course_id AND rc.organization_id = a.organization_id AND rc.deleted_at IS NULL
        AND ri.organization_id = a.organization_id AND ri.instructor_id = ${actorId}::uuid AND ri.deleted_at IS NULL
    )` : Prisma.empty}`;
  const filters = [
    Prisma.sql`a.organization_id = ${organizationId}::uuid`,
    Prisma.sql`a.deleted_at IS NULL`,
  ];
  if (courseScoped) filters.push(Prisma.sql`EXISTS (
    SELECT 1 FROM course_instructors ci
    WHERE ci.course_id = c.id AND ci.organization_id = a.organization_id AND ci.instructor_id = ${actorId}::uuid AND ci.deleted_at IS NULL
  )`);
  if (query.search) filters.push(Prisma.sql`strpos(lower(a.title), lower(${query.search})) > 0`);
  if (query.status) filters.push(Prisma.sql`a.status = ${query.status}::"AssessmentStatus"`);
  if (query.mine) filters.push(Prisma.sql`a.created_by = ${actorId}::uuid`);
  if (query.courseId) filters.push(query.courseId === 'standalone' ? Prisma.sql`a.course_id IS NULL` : Prisma.sql`a.course_id = ${query.courseId}::uuid`);
  if (hiddenFolders.length > 0) filters.push(Prisma.sql`(a.folder_id IS NULL OR a.folder_id <> ALL(${[...hiddenFolders]}::uuid[]))`);
  if (query.folderId) filters.push(query.folderId === 'root' ? Prisma.sql`a.folder_id IS NULL` : Prisma.sql`a.folder_id = ${query.folderId}::uuid`);
  if (query.attempts) filters.push(Prisma.sql`${query.attempts === 'without' ? Prisma.sql`NOT` : Prisma.empty}
    EXISTS (SELECT 1 FROM assessment_attempts r WHERE ${attempts})`);

  // Page ordinary sorts before aggregating questions and attempts. Metric sorts aggregate
  // the filtered candidates before paging so they use the same ordering across pages.
  const page = Prisma.sql`ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${offset}`;
  const [result] = await prisma.$queryRaw<{ total: number; items: Prisma.JsonArray }[]>`
    WITH filtered AS MATERIALIZED (
      SELECT a.id, a.organization_id, a.course_id, a.lesson_id, a.folder_id, a.title, a.slug,
             a.status, a.description, a.passing_score, a.max_attempts, a.available_after_course_completion,
             a.pass_message, a.fail_message, a.show_correct_answers, a.randomize_order, a.is_longread_exercise,
             (a.editor_draft IS NOT NULL) AS has_unpublished_changes, a.created_at, c.title AS course_title
      FROM assessments a
      LEFT JOIN courses c ON c.id = a.course_id AND c.organization_id = a.organization_id AND c.deleted_at IS NULL
      WHERE ${Prisma.join(filters, ' AND ')}
    ), candidates AS (
      SELECT * FROM filtered a ${sortUsesStats ? Prisma.empty : page}
    ), measured AS (
      SELECT a.*, q.questions_count, r.attempts_count, r.pass_rate, r.last_attempt_at, pl.places
      FROM candidates a
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS questions_count FROM assessment_questions q
        WHERE q.assessment_id = a.id AND q.organization_id = a.organization_id AND q.deleted_at IS NULL
      ) q
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS attempts_count, max(r.started_at) AS last_attempt_at,
               round(100.0 * count(*) FILTER (WHERE r.status = 'completed' AND r.passed)
                 / nullif(count(*) FILTER (WHERE r.status = 'completed'), 0))::int AS pass_rate
        FROM assessment_attempts r WHERE ${attempts}
      ) r
      CROSS JOIN LATERAL (
        -- PR 583: where the test is used besides its own course: courses and longread lessons (at most three, no repeats).
        SELECT coalesce(jsonb_agg(jsonb_build_object('kind', u.kind, 'title', u.title) ORDER BY u.kind, u.title), '[]'::jsonb) AS places
        FROM (
          SELECT DISTINCT CASE WHEN p.longread_block_id IS NOT NULL THEN 'longread' ELSE 'course' END AS kind,
                 coalesce(CASE WHEN p.longread_block_id IS NOT NULL THEN l.title END, pc.title) AS title
          FROM assessment_placements p
          LEFT JOIN courses pc ON pc.id = p.course_id AND pc.organization_id = p.organization_id AND pc.deleted_at IS NULL
          LEFT JOIN lessons l ON l.id = p.lesson_id AND l.organization_id = p.organization_id
          WHERE p.assessment_id = a.id AND p.organization_id = a.organization_id AND p.deleted_at IS NULL
            AND (p.longread_block_id IS NULL OR l.title IS NOT NULL) AND (p.longread_block_id IS NOT NULL OR pc.title IS NOT NULL)
            AND (p.longread_block_id IS NOT NULL OR p.course_id IS DISTINCT FROM a.course_id)
          LIMIT 3
        ) u
      ) pl
    ), paged AS (
      SELECT * FROM measured a ${sortUsesStats ? page : Prisma.empty}
    )
    SELECT (SELECT count(*)::int FROM filtered) AS total,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'courseId', a.course_id, 'courseTitle', a.course_title, 'lessonId', a.lesson_id,
        'folderId', a.folder_id, 'title', a.title, 'slug', a.slug, 'description', a.description,
        'status', a.status, 'hasUnpublishedChanges', a.has_unpublished_changes, 'passingScore', a.passing_score, 'maxAttempts', a.max_attempts,
        'availableAfterCourseCompletion', a.available_after_course_completion,
        'passMessage', a.pass_message, 'failMessage', a.fail_message, 'showCorrectAnswers', a.show_correct_answers,
        'randomizeOrder', a.randomize_order, 'isLongreadExercise', a.is_longread_exercise, 'createdAt', a.created_at,
        'questionsCount', a.questions_count, 'attemptsCount', a.attempts_count,
        'passRate', a.pass_rate, 'lastAttemptAt', a.last_attempt_at, 'places', a.places
      ) ORDER BY ${order}), '[]') AS items
    FROM paged a
  `;
  return { ...result!, page: query.page, pageSize: query.pageSize };
}
