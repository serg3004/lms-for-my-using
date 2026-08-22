import { scryptSync } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Demo credentials — document these in RAILWAY_DEPLOY_GUIDE.md
const demoPassword = 'Demo1234!';
const passwordSalt = 'demo-seed-salt-2026';
const passwordHash = `scrypt:${passwordSalt}:${scryptSync(demoPassword, passwordSalt, 64).toString('hex')}`;

const now = new Date('2026-05-01T10:00:00.000Z');

// Stable UUIDs for idempotent re-runs
const id = {
  // Org
  org: '10000000-0000-4000-8000-000000000001',
  // Users
  admin: '10000000-0000-4000-8000-000000000011',
  learner: '10000000-0000-4000-8000-000000000012',
  instructor: '10000000-0000-4000-8000-000000000013',
  manager: '10000000-0000-4000-8000-000000000014',
  group: '10000000-0000-4000-8000-000000000021',
  // Course
  course: '10000000-0000-4000-8000-000000000031',
  // Lessons
  lessonOne: '10000000-0000-4000-8000-000000000041',
  lessonTwo: '10000000-0000-4000-8000-000000000042',
  lessonThree: '10000000-0000-4000-8000-000000000043',
  // Materials
  matOne: '10000000-0000-4000-8000-000000000051',
  matTwo: '10000000-0000-4000-8000-000000000052',
  matThree: '10000000-0000-4000-8000-000000000053',
  // Assignment
  assignment: '10000000-0000-4000-8000-000000000061',
  // Progress (learner completed only lesson 1)
  progressOne: '10000000-0000-4000-8000-000000000071',
  // Assessment
  assessment: '10000000-0000-4000-8000-000000000081',
  // Questions
  q1: '10000000-0000-4000-8000-000000000091',
  q2: '10000000-0000-4000-8000-000000000092',
  q3: '10000000-0000-4000-8000-000000000093',
  q4: '10000000-0000-4000-8000-000000000094',
  q5: '10000000-0000-4000-8000-000000000095',
  // Options q1
  q1o1: '10000000-0000-4000-8000-0000000000a1',
  q1o2: '10000000-0000-4000-8000-0000000000a2',
  q1o3: '10000000-0000-4000-8000-0000000000a3',
  // Options q2
  q2o1: '10000000-0000-4000-8000-0000000000b1',
  q2o2: '10000000-0000-4000-8000-0000000000b2',
  q2o3: '10000000-0000-4000-8000-0000000000b3',
  // Options q3
  q3o1: '10000000-0000-4000-8000-0000000000c1',
  q3o2: '10000000-0000-4000-8000-0000000000c2',
  q3o3: '10000000-0000-4000-8000-0000000000c3',
  // Options q4
  q4o1: '10000000-0000-4000-8000-0000000000d1',
  q4o2: '10000000-0000-4000-8000-0000000000d2',
  q4o3: '10000000-0000-4000-8000-0000000000d3',
  // Options q5
  q5o1: '10000000-0000-4000-8000-0000000000e1',
  q5o2: '10000000-0000-4000-8000-0000000000e2',
  q5o3: '10000000-0000-4000-8000-0000000000e3',

  // ── Extra demo content (fresh namespace to avoid any collision) ───────────
  // Extra learners on the manager's team
  learnerTwo: '11000000-0000-4000-8000-000000000001',
  learnerThree: '11000000-0000-4000-8000-000000000002',
  membershipLearnerTwo: '11000000-0000-4000-8000-000000000011',
  membershipLearnerThree: '11000000-0000-4000-8000-000000000012',
  // Second course (draft)
  courseTwo: '11000000-0000-4000-8000-000000000021',
  courseTwoLessonOne: '11000000-0000-4000-8000-000000000031',
  courseTwoLessonTwo: '11000000-0000-4000-8000-000000000032',
  // Checklist A (published, review workflow demo)
  checklistA: '11000000-0000-4000-8000-000000000041',
  checklistAItemOne: '11000000-0000-4000-8000-000000000051',
  checklistAItemTwo: '11000000-0000-4000-8000-000000000052',
  checklistAItemThree: '11000000-0000-4000-8000-000000000053',
  checklistAItemFour: '11000000-0000-4000-8000-000000000054',
  checklistAInstance: '11000000-0000-4000-8000-000000000061',
  checklistAResultOne: '11000000-0000-4000-8000-000000000071',
  checklistAResultTwo: '11000000-0000-4000-8000-000000000072',
  checklistAResultThree: '11000000-0000-4000-8000-000000000073',
  checklistAResultFour: '11000000-0000-4000-8000-000000000074',
  // Checklist B (draft)
  checklistB: '11000000-0000-4000-8000-000000000081',
  checklistBItemOne: '11000000-0000-4000-8000-000000000091',
  checklistBItemTwo: '11000000-0000-4000-8000-000000000092',
  checklistBItemThree: '11000000-0000-4000-8000-000000000093',
  // Notifications
  notificationPassed: '11000000-0000-4000-8000-0000000000a1',
  notificationFailed: '11000000-0000-4000-8000-0000000000a2',
};

export async function seedDemo(prisma) {
  // ── Organization ──────────────────────────────────────────────────────────
  await prisma.organization.createMany({
    data: [{
      id: id.org,
      name: 'Demo Company',
      slug: 'demo-company',
      status: 'active',
      plan: 'enterprise',
    }],
    skipDuplicates: true,
  });

  // ── Users ──────────────────────────────────────────────────────────────────
  await prisma.user.createMany({
    data: [
      {
        id: id.admin,
        organizationId: id.org,
        email: 'admin@demo.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'Demo',
        position: 'LMS Administrator',
        status: 'active',
      },
      {
        id: id.learner,
        organizationId: id.org,
        email: 'learner@demo.com',
        passwordHash,
        firstName: 'Alex',
        lastName: 'Learner',
        position: 'New Employee',
        status: 'active',
      },
      {
        id: id.instructor,
        organizationId: id.org,
        email: 'instructor@demo.com',
        passwordHash,
        firstName: 'Iris',
        lastName: 'Instructor',
        position: 'Course Instructor',
        status: 'active',
      },
      {
        id: id.manager,
        organizationId: id.org,
        email: 'manager@demo.com',
        passwordHash,
        firstName: 'Morgan',
        lastName: 'Manager',
        position: 'Team Manager',
        status: 'active',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.membership.createMany({
    data: [
      {
        id: '10000000-0000-4000-8000-0000000000f1',
        organizationId: id.org,
        userId: id.admin,
        role: 'admin',
        assignedBy: id.admin,
      },
      {
        id: '10000000-0000-4000-8000-0000000000f2',
        organizationId: id.org,
        userId: id.learner,
        role: 'learner',
        assignedBy: id.admin,
      },
      {
        id: '10000000-0000-4000-8000-0000000000f3',
        organizationId: id.org,
        userId: id.instructor,
        role: 'instructor',
        assignedBy: id.admin,
      },
      {
        id: '10000000-0000-4000-8000-0000000000f4',
        organizationId: id.org,
        userId: id.manager,
        role: 'manager',
        assignedBy: id.admin,
      },
    ],
    skipDuplicates: true,
  });

  // ── Manager team ──────────────────────────────────────────────────────────
  await prisma.group.createMany({
    data: [{ id: id.group, organizationId: id.org, name: 'Demo Team', slug: 'demo-team', status: 'active' }],
    skipDuplicates: true,
  });
  await prisma.groupMember.createMany({
    data: [{ groupId: id.group, userId: id.learner, organizationId: id.org }],
    skipDuplicates: true,
  });
  await prisma.managerGroup.createMany({
    data: [{ groupId: id.group, managerId: id.manager, organizationId: id.org }],
    skipDuplicates: true,
  });

  // ── Course ────────────────────────────────────────────────────────────────
  await prisma.course.createMany({
    data: [{
      id: id.course,
      organizationId: id.org,
      title: 'Основы охраны труда',
      slug: 'workplace-safety-fundamentals',
      description: 'Необходимые знания по технике безопасности для всех новых сотрудников. Охватывает порядок действий при чрезвычайных ситуациях, средства индивидуальной защиты и безопасную эксплуатацию оборудования.',
      status: 'published',
    }],
    skipDuplicates: true,
  });

  await prisma.courseInstructor.createMany({
    data: [{ courseId: id.course, instructorId: id.instructor, organizationId: id.org }],
    skipDuplicates: true,
  });

  // ── Lessons ───────────────────────────────────────────────────────────────
  await prisma.lesson.createMany({
    data: [
      {
        id: id.lessonOne,
        organizationId: id.org,
        courseId: id.course,
        title: 'Введение в охрану труда',
        slug: 'introduction-to-workplace-safety',
        description: 'Изучите основные принципы безопасности и их важность для каждого сотрудника на объекте.',
        order: 1,
        status: 'published',
      },
      {
        id: id.lessonTwo,
        organizationId: id.org,
        courseId: id.course,
        title: 'Порядок действий в чрезвычайных ситуациях',
        slug: 'emergency-procedures',
        description: 'Пошаговые действия при пожарах, медицинских чрезвычайных ситуациях и разливах опасных веществ.',
        order: 2,
        status: 'published',
      },
      {
        id: id.lessonThree,
        organizationId: id.org,
        courseId: id.course,
        title: 'Безопасная эксплуатация оборудования',
        slug: 'safe-equipment-operation',
        description: 'Правильное использование, осмотр и обслуживание распространённого производственного оборудования.',
        order: 3,
        status: 'published',
      },
    ],
    skipDuplicates: true,
  });

  // ── Materials (links) ─────────────────────────────────────────────────────
  await prisma.courseMaterial.createMany({
    data: [
      {
        id: id.matOne,
        organizationId: id.org,
        courseId: id.course,
        lessonId: id.lessonOne,
        title: 'Обзор правил безопасности',
        slug: 'safety-overview-guide',
        description: 'Краткий справочник по основным принципам безопасности.',
        kind: 'link',
        fileUrl: 'https://cdn.internal.test/safety-overview-guide',
        status: 'active',
      },
      {
        id: id.matTwo,
        organizationId: id.org,
        courseId: id.course,
        lessonId: id.lessonTwo,
        title: 'Руководство по действиям в чрезвычайных ситуациях',
        slug: 'emergency-response-manual',
        description: 'Официальный порядок действий при чрезвычайных ситуациях на данном объекте.',
        kind: 'link',
        fileUrl: 'https://cdn.internal.test/emergency-response-manual',
        status: 'active',
      },
      {
        id: id.matThree,
        organizationId: id.org,
        courseId: id.course,
        lessonId: id.lessonThree,
        title: 'Чек-лист безопасности оборудования',
        slug: 'equipment-safety-checklist',
        description: 'Чек-лист предварительного осмотра для распространённого оборудования.',
        kind: 'link',
        fileUrl: 'https://cdn.internal.test/equipment-safety-checklist',
        status: 'active',
      },
    ],
    skipDuplicates: true,
  });

  // ── Assignment ────────────────────────────────────────────────────────────
  await prisma.assignment.createMany({
    data: [{
      id: id.assignment,
      organizationId: id.org,
      courseId: id.course,
      userId: id.learner,
      status: 'assigned',
    }],
    skipDuplicates: true,
  });

  // ── Progress (learner completed lesson 1 only — partial progress demo) ────
  await prisma.progress.createMany({
    data: [{
      id: id.progressOne,
      organizationId: id.org,
      courseId: id.course,
      lessonId: id.lessonOne,
      userId: id.learner,
      status: 'completed',
      completedAt: now,
    }],
    skipDuplicates: true,
  });

  // ── Assessment ────────────────────────────────────────────────────────────
  await prisma.assessment.createMany({
    data: [{
      id: id.assessment,
      organizationId: id.org,
      courseId: id.course,
      title: 'Проверка знаний по охране труда',
      slug: 'safety-knowledge-assessment',
      description: 'Проверьте свои знания основ охраны труда. Для прохождения нужно набрать 60%.',
      status: 'published',
      passingScore: 60,
      maxAttempts: 3,
      availableAfterCourseCompletion: false,
    }],
    skipDuplicates: true,
  });

  // ── 5 Questions ───────────────────────────────────────────────────────────
  await prisma.assessmentQuestion.createMany({
    data: [
      {
        id: id.q1,
        organizationId: id.org,
        assessmentId: id.assessment,
        type: 'single_choice',
        title: 'Что означает аббревиатура СИЗ?',
        order: 1,
        points: 1,
      },
      {
        id: id.q2,
        organizationId: id.org,
        assessmentId: id.assessment,
        type: 'single_choice',
        title: 'Кого нужно оповестить в первую очередь при обнаружении пожара?',
        order: 2,
        points: 1,
      },
      {
        id: id.q3,
        organizationId: id.org,
        assessmentId: id.assessment,
        type: 'single_choice',
        title: 'Как часто следует проверять переносные огнетушители?',
        order: 3,
        points: 1,
      },
      {
        id: id.q4,
        organizationId: id.org,
        assessmentId: id.assessment,
        type: 'single_choice',
        title: 'Какой цвет обычно обозначает предупреждение об опасности?',
        order: 4,
        points: 1,
      },
      {
        id: id.q5,
        organizationId: id.org,
        assessmentId: id.assessment,
        type: 'single_choice',
        title: 'Перед началом работы с оборудованием всегда следует:',
        order: 5,
        points: 1,
      },
    ],
    skipDuplicates: true,
  });

  // ── Answer options ────────────────────────────────────────────────────────
  await prisma.assessmentAnswerOption.createMany({
    data: [
      // Q1: СИЗ
      { id: id.q1o1, organizationId: id.org, questionId: id.q1, text: 'Средства индивидуальной защиты', isCorrect: true,  order: 1 },
      { id: id.q1o2, organizationId: id.org, questionId: id.q1, text: 'Предварительные профилактические упражнения',  isCorrect: false, order: 2 },
      { id: id.q1o3, organizationId: id.org, questionId: id.q1, text: 'Первичное обеспечение защиты',   isCorrect: false, order: 3 },
      // Q2: оповещение о пожаре
      { id: id.q2o1, organizationId: id.org, questionId: id.q2, text: 'Активировать ближайшую пожарную сигнализацию', isCorrect: true,  order: 1 },
      { id: id.q2o2, organizationId: id.org, questionId: id.q2, text: 'Попытаться потушить его самостоятельно',   isCorrect: false, order: 2 },
      { id: id.q2o3, organizationId: id.org, questionId: id.q2, text: 'Отправить письмо руководству',     isCorrect: false, order: 3 },
      // Q3: проверка огнетушителей
      { id: id.q3o1, organizationId: id.org, questionId: id.q3, text: 'Ежегодно',   isCorrect: true,  order: 1 },
      { id: id.q3o2, organizationId: id.org, questionId: id.q3, text: 'Раз в 5 лет', isCorrect: false, order: 2 },
      { id: id.q3o3, organizationId: id.org, questionId: id.q3, text: 'Только после использования', isCorrect: false, order: 3 },
      // Q4: цвет опасности
      { id: id.q4o1, organizationId: id.org, questionId: id.q4, text: 'Жёлтый', isCorrect: true,  order: 1 },
      { id: id.q4o2, organizationId: id.org, questionId: id.q4, text: 'Синий',   isCorrect: false, order: 2 },
      { id: id.q4o3, organizationId: id.org, questionId: id.q4, text: 'Зелёный',  isCorrect: false, order: 3 },
      // Q5: перед началом работы с оборудованием
      { id: id.q5o1, organizationId: id.org, questionId: id.q5, text: 'Изучить инструкцию по технике безопасности и осмотреть оборудование', isCorrect: true,  order: 1 },
      { id: id.q5o2, organizationId: id.org, questionId: id.q5, text: 'Начать немедленно, чтобы сэкономить время',                   isCorrect: false, order: 2 },
      { id: id.q5o3, organizationId: id.org, questionId: id.q5, text: 'Попросить коллегу сделать это вместо вас',                 isCorrect: false, order: 3 },
    ],
    skipDuplicates: true,
  });

  // ── Extra learners on the manager's team ───────────────────────────────────
  await prisma.user.createMany({
    data: [
      {
        id: id.learnerTwo,
        organizationId: id.org,
        email: 'learner2@demo.com',
        passwordHash,
        firstName: 'Dana',
        lastName: 'Newman',
        position: 'Warehouse Associate',
        status: 'active',
      },
      {
        id: id.learnerThree,
        organizationId: id.org,
        email: 'learner3@demo.com',
        passwordHash,
        firstName: 'Sam',
        lastName: 'Rivera',
        position: 'Machine Operator',
        status: 'active',
      },
    ],
    skipDuplicates: true,
  });

  await prisma.membership.createMany({
    data: [
      {
        id: id.membershipLearnerTwo,
        organizationId: id.org,
        userId: id.learnerTwo,
        role: 'learner',
        assignedBy: id.admin,
      },
      {
        id: id.membershipLearnerThree,
        organizationId: id.org,
        userId: id.learnerThree,
        role: 'learner',
        assignedBy: id.admin,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.groupMember.createMany({
    data: [
      { groupId: id.group, userId: id.learnerTwo, organizationId: id.org },
      { groupId: id.group, userId: id.learnerThree, organizationId: id.org },
    ],
    skipDuplicates: true,
  });

  // ── Second course (draft, demonstrates the course builder workflow) ───────
  await prisma.course.createMany({
    data: [{
      id: id.courseTwo,
      organizationId: id.org,
      title: 'Эффективная коммуникация в команде',
      slug: 'effective-team-communication',
      description: 'Черновик курса о принципах эффективного делового общения и обратной связи в команде.',
      status: 'draft',
    }],
    skipDuplicates: true,
  });

  await prisma.courseInstructor.createMany({
    data: [{ courseId: id.courseTwo, instructorId: id.instructor, organizationId: id.org }],
    skipDuplicates: true,
  });

  await prisma.lesson.createMany({
    data: [
      {
        id: id.courseTwoLessonOne,
        organizationId: id.org,
        courseId: id.courseTwo,
        title: 'Основы делового общения',
        slug: 'osnovy-delovogo-obshcheniya',
        description: 'Ключевые принципы ясной и уважительной коммуникации на рабочем месте.',
        order: 1,
        status: 'draft',
      },
      {
        id: id.courseTwoLessonTwo,
        organizationId: id.org,
        courseId: id.courseTwo,
        title: 'Обратная связь и активное слушание',
        slug: 'obratnaya-svyaz-i-aktivnoe-slushanie',
        description: 'Как давать и принимать конструктивную обратную связь.',
        order: 2,
        status: 'draft',
      },
    ],
    skipDuplicates: true,
  });

  // ── Checklist A (published, requires review — demonstrates the review queue) ──
  await prisma.checklist.createMany({
    data: [{
      id: id.checklistA,
      organizationId: id.org,
      title: 'Ежедневная проверка рабочего места',
      description: 'Ежедневный чек-лист для проверки безопасности и порядка на рабочем месте.',
      status: 'published',
      scoringMode: 'sum_points',
      passThreshold: 80,
      requiresReview: true,
      createdBy: id.manager,
    }],
    skipDuplicates: true,
  });

  await prisma.checklistItem.createMany({
    data: [
      { id: id.checklistAItemOne, organizationId: id.org, checklistId: id.checklistA, order: 1, text: 'Рабочая зона свободна от посторонних предметов', points: 10 },
      { id: id.checklistAItemTwo, organizationId: id.org, checklistId: id.checklistA, order: 2, text: 'Средства индивидуальной защиты в исправном состоянии', points: 10 },
      { id: id.checklistAItemThree, organizationId: id.org, checklistId: id.checklistA, order: 3, text: 'Огнетушитель на месте и не просрочен', points: 10 },
      { id: id.checklistAItemFour, organizationId: id.org, checklistId: id.checklistA, order: 4, text: 'Аварийные выходы не заблокированы', points: 10 },
    ],
    skipDuplicates: true,
  });

  // Learner submitted 3 of 4 items — pending manager review (75%, below the 80% pass threshold)
  await prisma.checklistInstance.createMany({
    data: [{
      id: id.checklistAInstance,
      organizationId: id.org,
      checklistId: id.checklistA,
      userId: id.learner,
      assignedBy: id.manager,
      status: 'submitted',
      totalScore: 30,
      maxScore: 40,
      percentage: 75,
      passed: false,
      submittedAt: now,
    }],
    skipDuplicates: true,
  });

  await prisma.checklistItemResult.createMany({
    data: [
      { id: id.checklistAResultOne, organizationId: id.org, instanceId: id.checklistAInstance, itemId: id.checklistAItemOne, checked: true, points: 10, reviewStatus: 'pending' },
      { id: id.checklistAResultTwo, organizationId: id.org, instanceId: id.checklistAInstance, itemId: id.checklistAItemTwo, checked: true, points: 10, reviewStatus: 'pending' },
      { id: id.checklistAResultThree, organizationId: id.org, instanceId: id.checklistAInstance, itemId: id.checklistAItemThree, checked: true, points: 10, reviewStatus: 'pending' },
      { id: id.checklistAResultFour, organizationId: id.org, instanceId: id.checklistAInstance, itemId: id.checklistAItemFour, checked: false, points: 0, reviewStatus: 'pending' },
    ],
    skipDuplicates: true,
  });

  // ── Checklist B (draft — demonstrates the checklist builder) ──────────────
  await prisma.checklist.createMany({
    data: [{
      id: id.checklistB,
      organizationId: id.org,
      title: 'Приёмка нового оборудования',
      description: 'Черновик чек-листа для приёмки и первичного осмотра нового оборудования.',
      status: 'draft',
      scoringMode: 'sum_points',
      passThreshold: 80,
      requiresReview: true,
      createdBy: id.manager,
    }],
    skipDuplicates: true,
  });

  await prisma.checklistItem.createMany({
    data: [
      { id: id.checklistBItemOne, organizationId: id.org, checklistId: id.checklistB, order: 1, text: 'Серийный номер соответствует накладной', points: 5 },
      { id: id.checklistBItemTwo, organizationId: id.org, checklistId: id.checklistB, order: 2, text: 'Внешних повреждений не обнаружено', points: 5 },
      { id: id.checklistBItemThree, organizationId: id.org, checklistId: id.checklistB, order: 3, text: 'Комплектность соответствует спецификации', points: 5 },
    ],
    skipDuplicates: true,
  });

  // ── Notifications (learner) ────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        id: id.notificationPassed,
        organizationId: id.org,
        userId: id.learner,
        type: 'assessment_passed',
        data: { assessmentTitle: 'Проверка знаний по охране труда', percentage: 90 },
        link: `/learn/assessments/${id.assessment}`,
        createdAt: now,
      },
      {
        id: id.notificationFailed,
        organizationId: id.org,
        userId: id.learner,
        type: 'assessment_failed',
        data: { assessmentTitle: 'Проверка знаний по охране труда', percentage: 40 },
        link: `/learn/assessments/${id.assessment}`,
        readAt: now,
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
      },
    ],
    skipDuplicates: true,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.error('Direct demo seed execution is disabled. Use the guarded admin:demo-seed task.');
  process.exitCode = 1;
}
