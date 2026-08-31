export type Course = { id: string; organizationId: string; title: string; status: string };
export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  status: string;
};
export type Group = { id: string; organizationId: string; name: string; status: string };
export type Department = { id: string; organizationId: string; name: string; status: string };
export type AssignmentStatus = 'assigned' | 'completed' | 'cancelled';
export type Assignment = {
  id: string;
  courseId: string;
  userId: string | null;
  groupId: string | null;
  departmentId?: string | null;
  includeDescendants?: boolean;
  status: string;
  dueAt: string | null;
};
export type Progress = {
  id: string;
  courseId: string;
  lessonId: string | null;
  userId: string;
  status: string;
  score: number | null;
  completedAt: string | null;
};

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = ['assigned', 'completed', 'cancelled'];

export function getUserLabel(user: User): string {
  const fullName = [user.lastName, user.firstName].filter(Boolean).join(' ');
  return fullName || user.email;
}

export function findCourseTitle(courses: Course[], courseId: string): string {
  return courses.find((c) => c.id === courseId)?.title ?? courseId;
}

export function findUserLabel(users: User[], userId: string | null, fallback: string): string {
  if (!userId) return fallback;
  const user = users.find((u) => u.id === userId);
  return user ? getUserLabel(user) : userId;
}

export function findGroupLabel(groups: Group[], groupId: string | null, fallback: string): string {
  if (!groupId) return fallback;
  const group = groups.find((g) => g.id === groupId);
  return group ? group.name : groupId;
}

export function findDepartmentLabel(departments: Department[], departmentId: string | null, fallback: string): string {
  if (!departmentId) return fallback;
  const department = departments.find((d) => d.id === departmentId);
  return department ? department.name : departmentId;
}

export type AssignmentStats = { active: number; dueThisWeek: number; overdue: number; completed: number };

export function computeAssignmentStats(assignments: Assignment[], now: number): AssignmentStats {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const active = assignments.filter((a) => a.status === 'assigned').length;
  const dueThisWeek = assignments.filter((a) => {
    if (a.status !== 'assigned' || !a.dueAt) return false;
    const dueTime = new Date(a.dueAt).getTime();
    return dueTime >= now && dueTime - now <= weekMs;
  }).length;
  const overdue = assignments.filter((a) => {
    if (a.status !== 'assigned' || !a.dueAt) return false;
    return new Date(a.dueAt).getTime() < now;
  }).length;
  const completed = assignments.filter((a) => a.status === 'completed').length;
  return { active, dueThisWeek, overdue, completed };
}
