/** PR 507: texts of the employee card opened by scanning a badge, its settings for the administrator, and the list of those who looked. */
type Texts = {
  page: {
    title: string; loading: string; notFound: string; error: string; notAllowed: string; anonymousTitle: string; anonymousText: string; toLogin: string;
    scanTitle: string; scanHint: string; scanLabel: string; scanSubmit: string; scanInvalid: string;
    markChecked: string; checkedDone: string; checkedError: string; print: string; photoAlt: string; noData: string; viewer: string;
    level: { self: string; admin: string; manager: string; peer: string; inspector: string };
  };
  fields: { position: string; department: string; employeeNumber: string; email: string; phone: string };
  blocks: { courses: string; certificates: string; checklists: string; clearance: string };
  clearance: { ok: string; notOk: string; overdueCourses: string; overdueChecklists: string; revokedCertificates: string };
  status: { done: string; overdue: string; open: string; valid: string; revoked: string; passed: string; notPassed: string; due: string; issued: string };
  policy: { title: string; hint: string; save: string; saving: string; saved: string; saveError: string; loadError: string; detailNote: string };
  inspectors: {
    title: string; hint: string; email: string; firstName: string; lastName: string; until: string; untilHint: string; visibleTitle: string; create: string; creating: string; created: string; createError: string; empty: string; loadError: string;
    revoke: string; revokeConfirm: string; revoked: string; revokeError: string; cancel: string; access: string;
    state: { active: string; invited: string; expired: string; revoked: string };
    field: { photo: string; position: string; department: string; employeeNumber: string };
  };
  views: { title: string; hint: string; empty: string; unknown: string; loadError: string };
};

export const employeeCardResources: Record<'ru' | 'en' | 'kk' | 'zh', Texts> = {
  ru: {
    page: {
      title: 'Карточка сотрудника', loading: 'Открываем карточку…', notFound: 'Карточка не найдена: бейдж отозван, недействителен или относится к другой организации.', error: 'Не удалось открыть карточку. Попробуйте ещё раз.',
      notAllowed: 'При входе по бейджу карточки недоступны. Войдите с логином и паролем.', anonymousTitle: 'Ай-ай-ай!', anonymousText: 'Чужие бейджи без входа не смотрим. Войдите в систему, и карточка откроется. Это сканирование записано в журнал.', toLogin: 'Войти',
      scanTitle: 'Откройте бейдж сотрудника', scanHint: 'Наведите камеру телефона на QR-код бейджа или вставьте ссылку с бейджа.', scanLabel: 'Ссылка с бейджа', scanSubmit: 'Открыть карточку', scanInvalid: 'Это не ссылка с бейджа.',
      markChecked: 'Отметить как проверенную', checkedDone: 'Отмечено: проверка записана в журнал.', checkedError: 'Не удалось записать отметку.', print: 'Печать', photoAlt: 'Фото сотрудника', noData: 'Данных нет.', viewer: 'Вы смотрите как',
      level: { self: 'владелец карточки', admin: 'администратор', manager: 'руководитель команды', peer: 'коллега', inspector: 'внешний проверяющий' },
    },
    fields: { position: 'Должность', department: 'Подразделение', employeeNumber: 'Табельный номер', email: 'Почта', phone: 'Телефон' },
    blocks: { courses: 'Курсы', certificates: 'Удостоверения', checklists: 'Чек-листы', clearance: 'Допуск' },
    clearance: { ok: 'Допуск действителен: да', notOk: 'Допуск действителен: нет', overdueCourses: 'Просроченных курсов', overdueChecklists: 'Просроченных чек-листов', revokedCertificates: 'Отозванных удостоверений' },
    status: { done: 'пройден', overdue: 'просрочен', open: 'в работе', valid: 'действует', revoked: 'отозвано', passed: 'зачтено', notPassed: 'не зачтено', due: 'срок', issued: 'выдано' },
    policy: {
      title: 'Карточка сотрудника по скану', hint: 'Любой вошедший пользователь организации может навести камеру на бейдж и открыть карточку. Отметьте, какие блоки видны всем.', save: 'Сохранить настройки карточки', saving: 'Сохраняем…', saved: 'Настройки карточки сохранены.', saveError: 'Не удалось сохранить настройки карточки.', loadError: 'Не удалось загрузить настройки карточки.',
      detailNote: 'Подробности (баллы, почта, телефон) видят только сам сотрудник, администратор и руководитель его команды. Каждый просмотр записывается, сотрудник видит, кто смотрел его карточку.',
    },
    inspectors: {
      title: 'Внешние проверяющие', hint: 'Проверяющий (например, инспектор) получает приглашение на почту, видит только карточку по бейджу и только отмеченные здесь сведения, пока не кончится срок.', email: 'Почта', firstName: 'Имя', lastName: 'Фамилия', until: 'Доступ до', untilHint: 'Не позже 90 дней от сегодняшнего дня.',
      visibleTitle: 'Что видит проверяющий (ФИО видно всегда)', create: 'Пригласить проверяющего', creating: 'Приглашаем…', created: 'Приглашение отправлено.', createError: 'Не удалось пригласить. Проверьте почту и срок доступа.', empty: 'Внешних проверяющих нет.', loadError: 'Не удалось загрузить проверяющих.',
      revoke: 'Закрыть доступ', revokeConfirm: 'Доступ будет закрыт сразу.', revoked: 'Доступ закрыт.', revokeError: 'Не удалось закрыть доступ.', cancel: 'Отмена', access: 'до',
      state: { active: 'работает', invited: 'не принял приглашение', expired: 'срок истёк', revoked: 'закрыт' },
      field: { photo: 'Фото', position: 'Должность', department: 'Подразделение', employeeNumber: 'Табельный номер' },
    },
    views: { title: 'Кто смотрел мою карточку', hint: 'Когда кто-то сканирует ваш бейдж и открывает карточку, это записывается.', empty: 'Пока никто не смотрел.', unknown: 'Неизвестный пользователь', loadError: 'Не удалось загрузить список просмотров.' },
  },
  en: {
    page: {
      title: 'Employee card', loading: 'Opening the card…', notFound: 'The card was not found: the badge was withdrawn, is not valid or belongs to another organization.', error: 'The card could not be opened. Try again.',
      notAllowed: 'Cards are not available when signed in by a badge. Sign in with your login and password.', anonymousTitle: 'Tut-tut!', anonymousText: 'Badges of other people are not shown without signing in. Sign in and the card will open. This scan was recorded.', toLogin: 'Sign in',
      scanTitle: 'Open an employee badge', scanHint: 'Point your phone camera at the QR code of the badge or paste the link from the badge.', scanLabel: 'Link from the badge', scanSubmit: 'Open the card', scanInvalid: 'This is not a link from a badge.',
      markChecked: 'Mark as checked', checkedDone: 'Marked: the check is recorded in the journal.', checkedError: 'The mark could not be recorded.', print: 'Print', photoAlt: 'Photo of the employee', noData: 'No data.', viewer: 'You are looking as',
      level: { self: 'the owner of the card', admin: 'administrator', manager: 'manager of the team', peer: 'colleague', inspector: 'outside inspector' },
    },
    fields: { position: 'Position', department: 'Department', employeeNumber: 'Employee number', email: 'Email', phone: 'Phone' },
    blocks: { courses: 'Courses', certificates: 'Certificates', checklists: 'Checklists', clearance: 'Admission' },
    clearance: { ok: 'Admission valid: yes', notOk: 'Admission valid: no', overdueCourses: 'Overdue courses', overdueChecklists: 'Overdue checklists', revokedCertificates: 'Withdrawn certificates' },
    status: { done: 'passed', overdue: 'overdue', open: 'in progress', valid: 'valid', revoked: 'withdrawn', passed: 'passed', notPassed: 'not passed', due: 'due', issued: 'issued' },
    policy: {
      title: 'Employee card by scan', hint: 'Any signed-in user of the organization can point a camera at a badge and open the card. Choose which blocks everybody sees.', save: 'Save card settings', saving: 'Saving…', saved: 'Card settings saved.', saveError: 'The card settings could not be saved.', loadError: 'The card settings could not be loaded.',
      detailNote: 'Details (scores, email, phone) are seen only by the employee, the administrator and the manager of their team. Every view is recorded and the employee sees who looked at their card.',
    },
    inspectors: {
      title: 'Outside inspectors', hint: 'An inspector gets an email invitation, sees only the badge card and only what is ticked here, until the access ends.', email: 'Email', firstName: 'First name', lastName: 'Last name', until: 'Access until', untilHint: 'No later than 90 days from today.',
      visibleTitle: 'What the inspector sees (the full name is always shown)', create: 'Invite the inspector', creating: 'Inviting…', created: 'The invitation was sent.', createError: 'The invitation failed. Check the email and the access date.', empty: 'There are no outside inspectors.', loadError: 'The inspectors could not be loaded.',
      revoke: 'Withdraw access', revokeConfirm: 'The access will be closed at once.', revoked: 'Access withdrawn.', revokeError: 'The access could not be withdrawn.', cancel: 'Cancel', access: 'until',
      state: { active: 'active', invited: 'invitation not accepted', expired: 'expired', revoked: 'withdrawn' },
      field: { photo: 'Photo', position: 'Position', department: 'Department', employeeNumber: 'Employee number' },
    },
    views: { title: 'Who looked at my card', hint: 'When somebody scans your badge and opens the card, it is recorded.', empty: 'Nobody has looked yet.', unknown: 'Unknown user', loadError: 'The list of views could not be loaded.' },
  },
  kk: {
    page: {
      title: 'Қызметкер картасы', loading: 'Карта ашылуда…', notFound: 'Карта табылмады: бейдж қайтарылып алынған, жарамсыз немесе басқа ұйымға тиесілі.', error: 'Картаны ашу мүмкін болмады. Қайталап көріңіз.',
      notAllowed: 'Бейджбен кіргенде карталар қолжетімсіз. Логин мен құпиясөзбен кіріңіз.', anonymousTitle: 'Әй-әй-әй!', anonymousText: 'Бөтен бейджді кірмей көрмейміз. Жүйеге кіріңіз, карта ашылады. Бұл сканерлеу журналға жазылды.', toLogin: 'Кіру',
      scanTitle: 'Қызметкер бейджін ашыңыз', scanHint: 'Телефон камерасын бейджнің QR-кодына бағыттаңыз немесе бейджден алынған сілтемені қойыңыз.', scanLabel: 'Бейджден алынған сілтеме', scanSubmit: 'Картаны ашу', scanInvalid: 'Бұл бейджден алынған сілтеме емес.',
      markChecked: 'Тексерілді деп белгілеу', checkedDone: 'Белгіленді: тексеру журналға жазылды.', checkedError: 'Белгіні жазу мүмкін болмады.', print: 'Басып шығару', photoAlt: 'Қызметкердің суреті', noData: 'Деректер жоқ.', viewer: 'Сіз көріп отырсыз',
      level: { self: 'карта иесі', admin: 'әкімші', manager: 'команда жетекшісі', peer: 'әріптес', inspector: 'сыртқы тексеруші' },
    },
    fields: { position: 'Лауазымы', department: 'Бөлімше', employeeNumber: 'Табель нөмірі', email: 'Пошта', phone: 'Телефон' },
    blocks: { courses: 'Курстар', certificates: 'Куәліктер', checklists: 'Чек-парақтар', clearance: 'Рұқсат' },
    clearance: { ok: 'Рұқсат жарамды: иә', notOk: 'Рұқсат жарамды: жоқ', overdueCourses: 'Мерзімі өткен курстар', overdueChecklists: 'Мерзімі өткен чек-парақтар', revokedCertificates: 'Қайтарып алынған куәліктер' },
    status: { done: 'өтілді', overdue: 'мерзімі өтті', open: 'орындалуда', valid: 'жарамды', revoked: 'қайтарылды', passed: 'есептелді', notPassed: 'есептелмеді', due: 'мерзімі', issued: 'берілді' },
    policy: {
      title: 'Сканер арқылы қызметкер картасы', hint: 'Ұйымның кез келген кірген пайдаланушысы камераны бейджге бағыттап, картаны аша алады. Барлығына қандай блоктар көрінетінін белгілеңіз.', save: 'Карта баптауларын сақтау', saving: 'Сақталуда…', saved: 'Карта баптаулары сақталды.', saveError: 'Карта баптауларын сақтау мүмкін болмады.', loadError: 'Карта баптауларын жүктеу мүмкін болмады.',
      detailNote: 'Егжей-тегжейді (балл, пошта, телефон) тек қызметкердің өзі, әкімші және команда жетекшісі көреді. Әр қарау жазылады, қызметкер картасын кім қарағанын көреді.',
    },
    inspectors: {
      title: 'Сыртқы тексерушілер', hint: 'Тексеруші поштаға шақыру алады, тек бейдж картасын және осында белгіленгенді ғана көреді, қолжетімділік мерзімі біткенге дейін.', email: 'Пошта', firstName: 'Аты', lastName: 'Тегі', until: 'Қолжетімділік мерзімі', untilHint: 'Бүгіннен бастап 90 күннен кешіктірмей.',
      visibleTitle: 'Тексеруші нені көреді (аты-жөні әрдайым көрінеді)', create: 'Тексерушіні шақыру', creating: 'Шақырылуда…', created: 'Шақыру жіберілді.', createError: 'Шақыру мүмкін болмады. Поштаны және мерзімді тексеріңіз.', empty: 'Сыртқы тексерушілер жоқ.', loadError: 'Тексерушілерді жүктеу мүмкін болмады.',
      revoke: 'Қолжетімділікті жабу', revokeConfirm: 'Қолжетімділік бірден жабылады.', revoked: 'Қолжетімділік жабылды.', revokeError: 'Қолжетімділікті жабу мүмкін болмады.', cancel: 'Бас тарту', access: 'дейін',
      state: { active: 'жұмыс істейді', invited: 'шақыруды қабылдамады', expired: 'мерзімі өтті', revoked: 'жабылды' },
      field: { photo: 'Сурет', position: 'Лауазымы', department: 'Бөлімше', employeeNumber: 'Табель нөмірі' },
    },
    views: { title: 'Картамды кім қарады', hint: 'Біреу бейджіңізді сканерлеп, картаны ашқанда, бұл жазылады.', empty: 'Әзірге ешкім қараған жоқ.', unknown: 'Белгісіз пайдаланушы', loadError: 'Қарау тізімін жүктеу мүмкін болмады.' },
  },
  zh: {
    page: {
      title: '员工卡', loading: '正在打开员工卡…', notFound: '未找到员工卡：工牌已被撤销、无效或属于其他组织。', error: '无法打开员工卡，请重试。',
      notAllowed: '使用工牌登录时无法查看员工卡，请使用账号和密码登录。', anonymousTitle: '哎呀！', anonymousText: '未登录不能查看他人的工牌。请登录后再打开员工卡。本次扫描已记入日志。', toLogin: '登录',
      scanTitle: '打开员工工牌', scanHint: '用手机相机对准工牌上的二维码，或粘贴工牌上的链接。', scanLabel: '工牌链接', scanSubmit: '打开员工卡', scanInvalid: '这不是工牌上的链接。',
      markChecked: '标记为已检查', checkedDone: '已标记：检查已记入日志。', checkedError: '无法记录标记。', print: '打印', photoAlt: '员工照片', noData: '暂无数据。', viewer: '您的查看身份',
      level: { self: '卡片所有者', admin: '管理员', manager: '团队负责人', peer: '同事', inspector: '外部检查人员' },
    },
    fields: { position: '职位', department: '部门', employeeNumber: '工号', email: '邮箱', phone: '电话' },
    blocks: { courses: '课程', certificates: '证书', checklists: '检查表', clearance: '准入' },
    clearance: { ok: '准入有效：是', notOk: '准入有效：否', overdueCourses: '逾期课程', overdueChecklists: '逾期检查表', revokedCertificates: '已撤销的证书' },
    status: { done: '已完成', overdue: '已逾期', open: '进行中', valid: '有效', revoked: '已撤销', passed: '通过', notPassed: '未通过', due: '截止', issued: '颁发' },
    policy: {
      title: '扫码查看员工卡', hint: '组织内任何已登录的用户都可以用相机对准工牌打开员工卡。请选择所有人可见的内容。', save: '保存员工卡设置', saving: '正在保存…', saved: '员工卡设置已保存。', saveError: '无法保存员工卡设置。', loadError: '无法加载员工卡设置。',
      detailNote: '详细信息（分数、邮箱、电话）仅员工本人、管理员和其团队负责人可见。每次查看都会被记录，员工可以看到谁查看了他的员工卡。',
    },
    inspectors: {
      title: '外部检查人员', hint: '检查人员会收到邮件邀请，只能看到工牌员工卡以及此处勾选的内容，直到访问期限结束。', email: '邮箱', firstName: '名', lastName: '姓', until: '访问截止', untilHint: '自今天起不超过 90 天。',
      visibleTitle: '检查人员可见内容（姓名始终可见）', create: '邀请检查人员', creating: '正在邀请…', created: '邀请已发送。', createError: '邀请失败，请检查邮箱和访问截止日期。', empty: '暂无外部检查人员。', loadError: '无法加载检查人员。',
      revoke: '撤销访问', revokeConfirm: '访问将立即关闭。', revoked: '访问已撤销。', revokeError: '无法撤销访问。', cancel: '取消', access: '至',
      state: { active: '有效', invited: '未接受邀请', expired: '已过期', revoked: '已撤销' },
      field: { photo: '照片', position: '职位', department: '部门', employeeNumber: '工号' },
    },
    views: { title: '谁查看了我的员工卡', hint: '有人扫描您的工牌并打开员工卡时，会被记录。', empty: '目前还没有人查看。', unknown: '未知用户', loadError: '无法加载查看记录。' },
  },
};
