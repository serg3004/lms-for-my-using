/**
 * PR 479 (CROLE-01): the catalog of actions that a role may be granted, with the scopes each action allows.
 *
 * The catalog is the single list that the API (effective rights, later PRs) and the web (role editor) share.
 * An arbitrary string is never a permission: only a key listed here can be granted. Built-in roles keep their
 * behaviour: the API maps every action to the `rolePolicies` entry that decides it today (see the API adapter).
 * Rights are only ever added (union); there are no denials.
 */

export const PERMISSION_SCOPES = ['own', 'assigned', 'team', 'department', 'organization'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export const PERMISSION_GROUPS = ['checklists', 'courses', 'longreads', 'tests', 'reviews', 'reports', 'users'] as const;
export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export const PERMISSION_LABEL_LOCALES = ['ru', 'en', 'kk', 'zh'] as const;
export type PermissionLabelLocale = (typeof PERMISSION_LABEL_LOCALES)[number];
export type PermissionLabels = Record<PermissionLabelLocale, string>;

export type PermissionAction = {
  readonly key: string;
  readonly group: PermissionGroup;
  /** Scopes a role may be given for this action. A grant outside this list is invalid. */
  readonly scopes: readonly PermissionScope[];
  /** False: the action stays with the system role and is never offered to a custom role. */
  readonly delegable: boolean;
  /** Actions a role must also hold, otherwise the grant is useless or leaks nothing usable. */
  readonly requires: readonly string[];
  readonly labels: PermissionLabels;
};

const l = (ru: string, en: string, kk: string, zh: string): PermissionLabels => ({ ru, en, kk, zh });

const ALL: readonly PermissionScope[] = PERMISSION_SCOPES;
const ORG: readonly PermissionScope[] = ['organization'];
const OWN_ORG: readonly PermissionScope[] = ['own', 'organization'];
const TEAM_UP: readonly PermissionScope[] = ['team', 'department', 'organization'];

function action(
  key: string,
  group: PermissionGroup,
  scopes: readonly PermissionScope[],
  labels: PermissionLabels,
  requires: readonly string[] = [],
  delegable = true,
): PermissionAction {
  return { key, group, scopes, delegable, requires, labels };
}

export const PERMISSION_ACTIONS = [
  // Checklists
  action('checklist.library.read', 'checklists', ORG, l('Видеть библиотеку чек-листов', 'See the checklist library', 'Чек-парақ кітапханасын көру', '查看检查表库')),
  action('checklist.author', 'checklists', ORG, l('Создавать и редактировать чек-листы', 'Create and edit checklists', 'Чек-парақтарды жасау және өңдеу', '创建和编辑检查表'), ['checklist.library.read']),
  action('checklist.template.manage', 'checklists', ORG, l('Управлять шаблонами организации', 'Manage organization templates', 'Ұйым үлгілерін басқару', '管理组织模板'), ['checklist.library.read']),
  action('checklist.free.start', 'checklists', ['own'], l('Начинать самостоятельную проверку по свободной ссылке', 'Start a self-service check', 'Еркін тексеруді өзі бастау', '自行开始自助检查')),
  action('checklist.assign', 'checklists', TEAM_UP, l('Назначать чек-листы сотрудникам', 'Assign checklists to employees', 'Қызметкерлерге чек-парақ тағайындау', '向员工分配检查表'), ['checklist.instance.read']),
  action('checklist.instance.read', 'checklists', ['own', ...TEAM_UP], l('Видеть заполненные листы', 'See filled-in sheets', 'Толтырылған парақтарды көру', '查看已填写的表单')),
  action('checklist.answer.write', 'checklists', ['own', ...TEAM_UP], l('Отвечать на критерии', 'Answer criteria', 'Критерийлерге жауап беру', '回答评估项'), ['checklist.instance.read']),
  action('checklist.session.read', 'checklists', ALL, l('Видеть сессии наблюдения', 'See observation sessions', 'Бақылау сессияларын көру', '查看观察会话')),
  action('checklist.session.manage', 'checklists', ['assigned', ...TEAM_UP], l('Планировать, переносить и отменять сессии', 'Schedule, move and cancel sessions', 'Сессияларды жоспарлау, көшіру және болдырмау', '安排、改期和取消会话'), ['checklist.session.read']),
  action('checklist.session.create.own', 'checklists', ['own'], l('Создавать сессии на себя', 'Create sessions for yourself', 'Өзіне сессия жасау', '为自己创建会话'), ['checklist.session.read']),
  action('checklist.session.import', 'checklists', TEAM_UP, l('Загружать сессии файлом', 'Import sessions from a file', 'Сессияларды файлмен жүктеу', '通过文件导入会话'), ['checklist.session.manage']),
  action('checklist.session.conduct', 'checklists', ['own', 'assigned'], l('Проводить сессию наблюдения', 'Conduct an observation session', 'Бақылау сессиясын өткізу', '进行观察会话'), ['checklist.library.read']),
  action('checklist.analytics.read', 'checklists', TEAM_UP, l('Видеть аналитику по сотрудникам', 'See employee analytics', 'Қызметкерлер талдауын көру', '查看员工分析'), ['checklist.session.read']),
  action('checklist.workplace.read', 'checklists', ORG, l('Видеть настройки рабочих проверок', 'See workplace check settings', 'Жұмыс орнындағы тексеру баптауларын көру', '查看工作场所检查设置')),
  action('checklist.workplace.write', 'checklists', ORG, l('Менять настройки рабочих проверок', 'Change workplace check settings', 'Жұмыс орнындағы тексеру баптауларын өзгерту', '更改工作场所检查设置'), ['checklist.workplace.read']),
  action('checklist.results.delete', 'checklists', ORG, l('Удалять и восстанавливать завершённые результаты', 'Delete and restore finished results', 'Аяқталған нәтижелерді жою және қалпына келтіру', '删除和恢复已完成的结果'), ['checklist.instance.read']),
  // Reviews
  action('checklist.review.write', 'reviews', TEAM_UP, l('Проверять и принимать листы', 'Review and accept sheets', 'Парақтарды тексеру және қабылдау', '审核并接受表单'), ['checklist.instance.read']),
  action('checklist.score.recalculate', 'reviews', TEAM_UP, l('Пересчитывать баллы', 'Recalculate scores', 'Балдарды қайта есептеу', '重新计算分数'), ['checklist.instance.read']),
  action('assessment.attempt.read', 'reviews', ['own', ...TEAM_UP], l('Видеть попытки тестов', 'See test attempts', 'Тест әрекеттерін көру', '查看测试尝试')),
  action('assessment.attempt.result.read', 'reviews', ['own', ...TEAM_UP], l('Видеть результаты попыток тестов', 'See test attempt results', 'Тест әрекеттерінің нәтижелерін көру', '查看测试尝试结果')),
  // Courses
  action('course.read', 'courses', OWN_ORG, l('Видеть курсы', 'See courses', 'Курстарды көру', '查看课程')),
  action('course.edit', 'courses', OWN_ORG, l('Создавать и редактировать курсы', 'Create and edit courses', 'Курстарды жасау және өңдеу', '创建和编辑课程'), ['course.read']),
  action('lesson.read', 'courses', OWN_ORG, l('Видеть уроки', 'See lessons', 'Сабақтарды көру', '查看课时')),
  action('lesson.read.all', 'courses', ORG, l('Видеть все уроки организации', 'See all lessons of the organization', 'Ұйымның барлық сабақтарын көру', '查看组织的所有课时'), ['lesson.read']),
  action('lesson.edit', 'courses', OWN_ORG, l('Создавать и редактировать уроки', 'Create and edit lessons', 'Сабақтарды жасау және өңдеу', '创建和编辑课时'), ['lesson.read']),
  action('material.read', 'courses', OWN_ORG, l('Видеть материалы курса', 'See course materials', 'Курс материалдарын көру', '查看课程资料')),
  action('material.edit', 'courses', OWN_ORG, l('Загружать и менять материалы курса', 'Upload and change course materials', 'Курс материалдарын жүктеу және өзгерту', '上传和更改课程资料'), ['material.read']),
  // Longreads
  action('longread.read', 'longreads', OWN_ORG, l('Видеть лонгриды', 'See longreads', 'Лонгридтерді көру', '查看长文')),
  action('longread.edit', 'longreads', OWN_ORG, l('Создавать и редактировать лонгриды', 'Create and edit longreads', 'Лонгридтерді жасау және өңдеу', '创建和编辑长文'), ['longread.read']),
  // Tests
  action('assessment.read', 'tests', OWN_ORG, l('Видеть тесты', 'See tests', 'Тесттерді көру', '查看测试')),
  action('assessment.author', 'tests', OWN_ORG, l('Создавать и редактировать тесты', 'Create and edit tests', 'Тесттерді жасау және өңдеу', '创建和编辑测试'), ['assessment.read']),
  action('assessment.question.read', 'tests', OWN_ORG, l('Видеть вопросы тестов', 'See test questions', 'Тест сұрақтарын көру', '查看测试题目')),
  action('assessment.question.edit', 'tests', OWN_ORG, l('Создавать и редактировать вопросы', 'Create and edit questions', 'Сұрақтарды жасау және өңдеу', '创建和编辑题目'), ['assessment.question.read']),
  action('assessment.option.read', 'tests', OWN_ORG, l('Видеть варианты ответов', 'See answer options', 'Жауап нұсқаларын көру', '查看答案选项')),
  action('assessment.option.edit', 'tests', OWN_ORG, l('Создавать и редактировать варианты ответов', 'Create and edit answer options', 'Жауап нұсқаларын жасау және өңдеу', '创建和编辑答案选项'), ['assessment.option.read']),
  action('assessment.attempt.start', 'tests', ['own'], l('Проходить тесты', 'Take tests', 'Тесттерден өту', '参加测试')),
  // Reports
  action('report.summary.read', 'reports', TEAM_UP, l('Видеть сводный отчёт', 'See the summary report', 'Жиынтық есепті көру', '查看汇总报告')),
  action('report.team.read', 'reports', ['team', 'department'], l('Видеть сводку по команде', 'See the team summary', 'Команда бойынша жиынтықты көру', '查看团队汇总')),
  action('report.course.read', 'reports', TEAM_UP, l('Видеть аналитику по курсам и пользователям', 'See course and user analytics', 'Курстар мен пайдаланушылар талдауын көру', '查看课程和用户分析')),
  action('report.admin.dashboard.read', 'reports', ORG, l('Видеть панель администратора', 'See the administrator dashboard', 'Әкімші тақтасын көру', '查看管理员面板')),
  // Users
  action('user.read', 'users', TEAM_UP, l('Видеть пользователей', 'See users', 'Пайдаланушыларды көру', '查看用户')),
  action('user.create', 'users', ['department', 'organization'], l('Регистрировать пользователей', 'Register users', 'Пайдаланушыларды тіркеу', '注册用户'), ['user.read']),
  action('user.import', 'users', ['department', 'organization'], l('Загружать пользователей файлом', 'Import users from a file', 'Пайдаланушыларды файлмен жүктеу', '通过文件导入用户'), ['user.read']),
  action('user.update', 'users', ['department', 'organization'], l('Менять данные пользователей', 'Edit user details', 'Пайдаланушы деректерін өзгерту', '修改用户资料'), ['user.read']),
  action('user.deactivate', 'users', ['department', 'organization'], l('Блокировать и возвращать пользователей', 'Suspend and reactivate users', 'Пайдаланушыларды бұғаттау және қайтару', '停用和恢复用户'), ['user.read']),
  action('user.reset-password', 'users', ['department', 'organization'], l('Сбрасывать пароль пользователям', 'Reset users\' passwords', 'Пайдаланушылардың құпиясөзін қалпына келтіру', '重置用户密码'), ['user.read']),
  action('user.invitation.manage', 'users', ORG, l('Управлять приглашениями', 'Manage invitations', 'Шақыруларды басқару', '管理邀请'), [], false),
  action('user.activation-qr.shared', 'users', ORG, l('Управлять общими QR активации', 'Manage shared activation QR codes', 'Ортақ белсендіру QR кодтарын басқару', '管理通用激活二维码'), [], false),
  // Stays with the system role: it decides who may act as an observer, which is an access setting.
  action('checklist.access.settings', 'checklists', ORG, l('Менять, кто может быть наблюдателем', 'Change who may be an observer', 'Бақылаушы кім бола алатынын өзгерту', '更改谁可以担任观察员'), [], false),
] as const satisfies readonly PermissionAction[];

export type PermissionActionKey = (typeof PERMISSION_ACTIONS)[number]['key'];

/**
 * Never given to a custom role, whatever the grant: these decide who holds rights and where the organization ends.
 * They are capabilities, not catalog actions; no catalog action may carry one of these keys.
 */
export const NON_DELEGABLE_CAPABILITIES = [
  'role.manage',
  'role.grant.admin',
  'organization.cross',
  'security.settings',
  'organization.delete',
] as const;

const ACTIONS_BY_KEY: ReadonlyMap<string, PermissionAction> = new Map(PERMISSION_ACTIONS.map((item) => [item.key, item]));

export function findPermissionAction(key: string): PermissionAction | undefined {
  return ACTIONS_BY_KEY.get(key);
}

export function isPermissionActionKey(key: string): key is PermissionActionKey {
  return ACTIONS_BY_KEY.has(key);
}

/** The actions an administrator may put into a custom role. */
export function delegablePermissionActions(): readonly PermissionAction[] {
  return PERMISSION_ACTIONS.filter((item) => item.delegable);
}

/** Every action the grant needs and the set lacks, in catalog order; empty when the set is complete. */
export function missingPermissionDependencies(keys: Iterable<string>): { action: string; missing: string[] }[] {
  const held = new Set(keys);
  const problems: { action: string; missing: string[] }[] = [];
  for (const item of PERMISSION_ACTIONS) {
    if (!held.has(item.key)) continue;
    const missing = item.requires.filter((required) => !held.has(required));
    if (missing.length > 0) problems.push({ action: item.key, missing });
  }
  return problems;
}

export type PermissionGrantProblem =
  | { code: 'unknown_action'; action: string }
  | { code: 'not_delegable'; action: string }
  | { code: 'scope_not_allowed'; action: string; scope: PermissionScope }
  | { code: 'missing_dependency'; action: string; missing: string[] };

/** Checks one custom-role grant set; the API and the editor call the same function, so they cannot disagree. */
export function validatePermissionGrants(grants: readonly { action: string; scope: PermissionScope }[]): PermissionGrantProblem[] {
  const problems: PermissionGrantProblem[] = [];
  for (const grant of grants) {
    const item = findPermissionAction(grant.action);
    if (!item) problems.push({ code: 'unknown_action', action: grant.action });
    else if (!item.delegable) problems.push({ code: 'not_delegable', action: grant.action });
    else if (!item.scopes.includes(grant.scope)) problems.push({ code: 'scope_not_allowed', action: grant.action, scope: grant.scope });
  }
  for (const problem of missingPermissionDependencies(grants.map((grant) => grant.action))) {
    problems.push({ code: 'missing_dependency', ...problem });
  }
  return problems;
}
