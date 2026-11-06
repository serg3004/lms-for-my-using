import { createAssessmentSchema } from '../assessments/assessments.schemas.js';
import { createCourseMaterialSchema } from '../course-materials/course-materials.schemas.js';
import { createDepartmentSchema } from '../departments/departments.schemas.js';
import { createGroupSchema } from '../groups/groups.schemas.js';
import { createLessonSchema } from '../lessons/lessons.schemas.js';
import { createPositionSchema } from '../positions/positions.schemas.js';
import { createCourseSchema } from './courses.schemas.js';

const id = '11111111-1111-1111-1111-111111111111';
const dirty = '<script>alert(1)</script><strong onclick="bad()">Важно</strong>';

function expectSafe(value: string | null | undefined) {
  expect(value).toContain('Важно');
  expect(value).not.toContain('<script');
  expect(value).not.toContain('onclick');
}

describe('rich descriptions of other modules', () => {
  it('sanitizes course descriptions and keeps legacy plain text', () => {
    const base = { organizationId: id, title: 'Курс', slug: 'kurs' };
    expectSafe(createCourseSchema.parse({ ...base, description: dirty }).description);
    expect(createCourseSchema.parse({ ...base, description: 'Просто текст' }).description).toBe('Просто текст');
  });

  it('sanitizes lesson and material descriptions', () => {
    expectSafe(createLessonSchema.parse({ organizationId: id, courseId: id, title: 'Урок', slug: 'lesson-a', description: dirty } as never).description);
    expectSafe(createCourseMaterialSchema.parse({ organizationId: id, courseId: id, title: 'Материал', slug: 'material-a', description: dirty } as never).description);
  });

  it('sanitizes assessment description and messages', () => {
    const parsed = createAssessmentSchema.parse({ organizationId: id, courseId: id, title: 'Тест', slug: 'test-a', description: dirty, passMessage: dirty, failMessage: dirty } as never);
    expectSafe(parsed.description);
    expectSafe(parsed.passMessage);
    expectSafe(parsed.failMessage);
  });

  it('sanitizes group, department and position descriptions', () => {
    expectSafe(createGroupSchema.parse({ organizationId: id, name: 'Г', slug: 'group-a', description: dirty }).description);
    expectSafe(createDepartmentSchema.parse({ organizationId: id, name: 'О', code: 'o', description: dirty } as never).description);
    expectSafe(createPositionSchema.parse({ organizationId: id, code: 'p', title: 'Д', description: dirty } as never).description);
  });
});
