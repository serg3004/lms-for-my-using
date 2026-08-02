import { createLesson, updateLesson } from '../../shared/api/lessons.js';
import { deleteCourse, updateCourse } from '../../shared/api/courses.js';

export function useCourseBuilderMutations() {
  return {
    updateCourse,
    deleteCourse,
    createLesson,
    updateLesson,
  };
}
