export function getCourseHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}`;
}

export function getLessonHref(lessonId: string) {
  return `/learn/lessons/${encodeURIComponent(lessonId)}`;
}

export function getCourseLessonsHref(courseId: string) {
  return `/learn/courses/${encodeURIComponent(courseId)}/lessons`;
}
