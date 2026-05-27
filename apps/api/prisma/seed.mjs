import { scryptSync } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const seedPassword = 'ChangeMe123!';
const passwordSalt = 'mvp-seed-local-salt';
const passwordHash = `scrypt:${passwordSalt}:${scryptSync(seedPassword, passwordSalt, 64).toString('hex')}`;

const id = {
  organization: '00000000-0000-4000-8000-000000000001',
  admin: '00000000-0000-4000-8000-000000000011',
  instructor: '00000000-0000-4000-8000-000000000012',
  learnerOne: '00000000-0000-4000-8000-000000000013',
  learnerTwo: '00000000-0000-4000-8000-000000000014',
  group: '00000000-0000-4000-8000-000000000021',
  course: '00000000-0000-4000-8000-000000000031',
  lessonOne: '00000000-0000-4000-8000-000000000041',
  lessonTwo: '00000000-0000-4000-8000-000000000042',
  assignment: '00000000-0000-4000-8000-000000000051',
  progress: '00000000-0000-4000-8000-000000000061',
};

const users = [
  [id.admin, 'admin.mvp@example.test', 'MVP', 'Admin', 'Administrator', 'admin'],
  [id.instructor, 'instructor.mvp@example.test', 'MVP', 'Instructor', 'Instructor', 'instructor'],
  [id.learnerOne, 'learner1.mvp@example.test', 'MVP', 'Learner One', 'Learner', 'learner'],
  [id.learnerTwo, 'learner2.mvp@example.test', 'MVP', 'Learner Two', 'Learner', 'learner'],
];

async function main() {
  await prisma.organization.createMany({
    data: [
      {
        id: id.organization,
        name: 'MVP Pilot Organization',
        slug: 'mvp-pilot',
        status: 'active',
        plan: 'trial',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.user.createMany({
    data: users.map(([userId, email, firstName, lastName, position]) => ({
      id: userId,
      organizationId: id.organization,
      email,
      passwordHash,
      firstName,
      lastName,
      position,
      status: 'active',
    })),
    skipDuplicates: true,
  });

  await prisma.membership.createMany({
    data: users.map(([userId, , , , , role]) => ({
      id: `${userId.slice(0, 35)}a`,
      organizationId: id.organization,
      userId,
      role,
      assignedBy: id.admin,
    })),
    skipDuplicates: true,
  });

  await prisma.group.createMany({
    data: [
      {
        id: id.group,
        organizationId: id.organization,
        name: 'MVP Learners',
        slug: 'mvp-learners',
        description: 'Pilot learner group for MVP seed data.',
        status: 'active',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.course.createMany({
    data: [
      {
        id: id.course,
        organizationId: id.organization,
        title: 'MVP Onboarding Course',
        slug: 'mvp-onboarding-course',
        description: 'Small pilot course for validating the learner flow.',
        status: 'published',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.lesson.createMany({
    data: [
      {
        id: id.lessonOne,
        organizationId: id.organization,
        courseId: id.course,
        title: 'Welcome to the MVP',
        slug: 'welcome-to-the-mvp',
        description: 'Intro lesson for pilot learners.',
        order: 1,
        status: 'published',
      },
      {
        id: id.lessonTwo,
        organizationId: id.organization,
        courseId: id.course,
        title: 'Complete Your First Lesson',
        slug: 'complete-your-first-lesson',
        description: 'Second lesson for progress validation.',
        order: 2,
        status: 'published',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.assignment.createMany({
    data: [
      {
        id: id.assignment,
        organizationId: id.organization,
        courseId: id.course,
        groupId: id.group,
        status: 'assigned',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.progress.createMany({
    data: [
      {
        id: id.progress,
        organizationId: id.organization,
        courseId: id.course,
        lessonId: id.lessonOne,
        userId: id.learnerOne,
        status: 'completed',
        score: 100,
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    skipDuplicates: true,
  });

  console.log('MVP seed data is ready.');
  console.log(`Seed users use local password: ${seedPassword}`);
}

main()
  .catch((error) => {
    console.error('Failed to seed MVP data.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
