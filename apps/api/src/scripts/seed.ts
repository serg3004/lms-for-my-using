import { scryptSync } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const demoPassword = 'Demo1234!';
const passwordSalt = 'demo-seed-salt-2026';
const passwordHash = `scrypt:${passwordSalt}:${scryptSync(demoPassword, passwordSalt, 64).toString('hex')}`;

const now = new Date('2026-05-01T10:00:00.000Z');

const id = {
  org: '10000000-0000-4000-8000-000000000001',
  admin: '10000000-0000-4000-8000-000000000011',
  learner: '10000000-0000-4000-8000-000000000012',
  course: '10000000-0000-4000-8000-000000000031',
  lessonOne: '10000000-0000-4000-8000-000000000041',
  lessonTwo: '10000000-0000-4000-8000-000000000042',
  lessonThree: '10000000-0000-4000-8000-000000000043',
  matOne: '10000000-0000-4000-8000-000000000051',
  matTwo: '10000000-0000-4000-8000-000000000052',
  matThree: '10000000-0000-4000-8000-000000000053',
  assignment: '10000000-0000-4000-8000-000000000061',
  progressOne: '10000000-0000-4000-8000-000000000071',
  assessment: '10000000-0000-4000-8000-000000000081',
  q1: '10000000-0000-4000-8000-000000000091',
  q2: '10000000-0000-4000-8000-000000000092',
  q3: '10000000-0000-4000-8000-000000000093',
  q4: '10000000-0000-4000-8000-000000000094',
  q5: '10000000-0000-4000-8000-000000000095',
  q1o1: '10000000-0000-4000-8000-0000000000a1',
  q1o2: '10000000-0000-4000-8000-0000000000a2',
  q1o3: '10000000-0000-4000-8000-0000000000a3',
  q2o1: '10000000-0000-4000-8000-0000000000b1',
  q2o2: '10000000-0000-4000-8000-0000000000b2',
  q2o3: '10000000-0000-4000-8000-0000000000b3',
  q3o1: '10000000-0000-4000-8000-0000000000c1',
  q3o2: '10000000-0000-4000-8000-0000000000c2',
  q3o3: '10000000-0000-4000-8000-0000000000c3',
  q4o1: '10000000-0000-4000-8000-0000000000d1',
  q4o2: '10000000-0000-4000-8000-0000000000d2',
  q4o3: '10000000-0000-4000-8000-0000000000d3',
  q5o1: '10000000-0000-4000-8000-0000000000e1',
  q5o2: '10000000-0000-4000-8000-0000000000e2',
  q5o3: '10000000-0000-4000-8000-0000000000e3',
} as const;

async function main() {
  await prisma.organization.createMany({
    data: [{ id: id.org, name: 'Demo Company', slug: 'demo-company', status: 'active', plan: 'enterprise' }],
    skipDuplicates: true,
  });

  await prisma.user.createMany({
    data: [
      { id: id.admin,   organizationId: id.org, email: 'admin@demo.com',   passwordHash, firstName: 'Admin', lastName: 'Demo',    position: 'LMS Administrator', status: 'active' },
      { id: id.learner, organizationId: id.org, email: 'learner@demo.com', passwordHash, firstName: 'Alex',  lastName: 'Learner', position: 'New Employee',       status: 'active' },
    ],
    skipDuplicates: true,
  });

  await prisma.membership.createMany({
    data: [
      { id: `${id.admin.slice(0, 35)}m`,   organizationId: id.org, userId: id.admin,   role: 'admin',   assignedBy: id.admin },
      { id: `${id.learner.slice(0, 35)}m`, organizationId: id.org, userId: id.learner, role: 'learner', assignedBy: id.admin },
    ],
    skipDuplicates: true,
  });

  await prisma.course.createMany({
    data: [{
      id: id.course, organizationId: id.org,
      title: 'Workplace Safety Fundamentals', slug: 'workplace-safety-fundamentals',
      description: 'Essential safety knowledge for all new employees. Covers emergency procedures, protective equipment, and safe equipment operation.',
      status: 'published',
    }],
    skipDuplicates: true,
  });

  await prisma.lesson.createMany({
    data: [
      { id: id.lessonOne,   organizationId: id.org, courseId: id.course, title: 'Introduction to Workplace Safety', slug: 'introduction-to-workplace-safety', description: 'Learn the core safety principles and why they matter for every employee on site.', order: 1, status: 'published' },
      { id: id.lessonTwo,   organizationId: id.org, courseId: id.course, title: 'Emergency Procedures',              slug: 'emergency-procedures',              description: 'Step-by-step actions for fires, medical emergencies, and hazardous material spills.', order: 2, status: 'published' },
      { id: id.lessonThree, organizationId: id.org, courseId: id.course, title: 'Safe Equipment Operation',          slug: 'safe-equipment-operation',          description: 'Proper usage, inspection, and maintenance of common workplace equipment.', order: 3, status: 'published' },
    ],
    skipDuplicates: true,
  });

  await prisma.courseMaterial.createMany({
    data: [
      { id: id.matOne,   organizationId: id.org, courseId: id.course, lessonId: id.lessonOne,   title: 'Safety Overview Guide',       slug: 'safety-overview-guide',       description: 'Quick-reference guide covering core safety principles.',               kind: 'link', fileUrl: 'https://example.com/safety-overview-guide',       status: 'active' },
      { id: id.matTwo,   organizationId: id.org, courseId: id.course, lessonId: id.lessonTwo,   title: 'Emergency Response Manual',   slug: 'emergency-response-manual',   description: 'Official emergency response procedures for this facility.',           kind: 'link', fileUrl: 'https://example.com/emergency-response-manual',   status: 'active' },
      { id: id.matThree, organizationId: id.org, courseId: id.course, lessonId: id.lessonThree, title: 'Equipment Safety Checklist',  slug: 'equipment-safety-checklist',  description: 'Pre-use inspection checklist for common equipment.',                  kind: 'link', fileUrl: 'https://example.com/equipment-safety-checklist',  status: 'active' },
    ],
    skipDuplicates: true,
  });

  await prisma.assignment.createMany({
    data: [{ id: id.assignment, organizationId: id.org, courseId: id.course, userId: id.learner, status: 'assigned' }],
    skipDuplicates: true,
  });

  await prisma.progress.createMany({
    data: [{ id: id.progressOne, organizationId: id.org, courseId: id.course, lessonId: id.lessonOne, userId: id.learner, status: 'completed', completedAt: now }],
    skipDuplicates: true,
  });

  await prisma.assessment.createMany({
    data: [{
      id: id.assessment, organizationId: id.org, courseId: id.course,
      title: 'Safety Knowledge Assessment', slug: 'safety-knowledge-assessment',
      description: 'Test your understanding of workplace safety fundamentals. You need 60% to pass.',
      status: 'published', passingScore: 60, maxAttempts: 3, availableAfterCourseCompletion: false,
    }],
    skipDuplicates: true,
  });

  await prisma.assessmentQuestion.createMany({
    data: [
      { id: id.q1, organizationId: id.org, assessmentId: id.assessment, type: 'single_choice', title: 'What does PPE stand for?',                               order: 1, points: 1 },
      { id: id.q2, organizationId: id.org, assessmentId: id.assessment, type: 'single_choice', title: 'Who should you notify first when you discover a fire?',  order: 2, points: 1 },
      { id: id.q3, organizationId: id.org, assessmentId: id.assessment, type: 'single_choice', title: 'How often should portable fire extinguishers be inspected?', order: 3, points: 1 },
      { id: id.q4, organizationId: id.org, assessmentId: id.assessment, type: 'single_choice', title: 'What color label typically marks a safety hazard warning?', order: 4, points: 1 },
      { id: id.q5, organizationId: id.org, assessmentId: id.assessment, type: 'single_choice', title: 'Before operating machinery, you should always:',          order: 5, points: 1 },
    ],
    skipDuplicates: true,
  });

  await prisma.assessmentAnswerOption.createMany({
    data: [
      { id: id.q1o1, organizationId: id.org, questionId: id.q1, text: 'Personal Protective Equipment',                           isCorrect: true,  order: 1 },
      { id: id.q1o2, organizationId: id.org, questionId: id.q1, text: 'Preliminary Prevention Exercise',                          isCorrect: false, order: 2 },
      { id: id.q1o3, organizationId: id.org, questionId: id.q1, text: 'Primary Protection Enforcement',                           isCorrect: false, order: 3 },
      { id: id.q2o1, organizationId: id.org, questionId: id.q2, text: 'Activate the nearest fire alarm',                          isCorrect: true,  order: 1 },
      { id: id.q2o2, organizationId: id.org, questionId: id.q2, text: 'Try to extinguish it yourself',                            isCorrect: false, order: 2 },
      { id: id.q2o3, organizationId: id.org, questionId: id.q2, text: 'Send an email to management',                              isCorrect: false, order: 3 },
      { id: id.q3o1, organizationId: id.org, questionId: id.q3, text: 'Annually',                                                 isCorrect: true,  order: 1 },
      { id: id.q3o2, organizationId: id.org, questionId: id.q3, text: 'Every 5 years',                                            isCorrect: false, order: 2 },
      { id: id.q3o3, organizationId: id.org, questionId: id.q3, text: 'Only after use',                                           isCorrect: false, order: 3 },
      { id: id.q4o1, organizationId: id.org, questionId: id.q4, text: 'Yellow',                                                   isCorrect: true,  order: 1 },
      { id: id.q4o2, organizationId: id.org, questionId: id.q4, text: 'Blue',                                                     isCorrect: false, order: 2 },
      { id: id.q4o3, organizationId: id.org, questionId: id.q4, text: 'Green',                                                    isCorrect: false, order: 3 },
      { id: id.q5o1, organizationId: id.org, questionId: id.q5, text: 'Read the safety manual and inspect the equipment',         isCorrect: true,  order: 1 },
      { id: id.q5o2, organizationId: id.org, questionId: id.q5, text: 'Start immediately to save time',                           isCorrect: false, order: 2 },
      { id: id.q5o3, organizationId: id.org, questionId: id.q5, text: 'Ask a colleague to do it instead',                         isCorrect: false, order: 3 },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Demo seed complete.');
  console.log('');
  console.log('Credentials (password: Demo1234!):');
  console.log('  Admin:   admin@demo.com   org: demo-company');
  console.log('  Learner: learner@demo.com org: demo-company');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
