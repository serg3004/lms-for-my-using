/** PR 506: texts of the QR badge: the scan screen, the PIN pad, the profile card, the administrator's sheet and the policy. */
type Texts = {
  link: string;
  scan: { title: string; hint: string; cameraStart: string; cameraStop: string; cameraUnsupported: string; cameraDenied: string; cameraLabel: string; manualLabel: string; manualHint: string; manualSubmit: string; checking: string; invalid: string; error: string; toLogin: string };
  pin: { title: string; hint: string; label: string; digit: string; erase: string; submit: string; wrong: string; cancel: string };
  kiosk: { finish: string; notice: string; restricted: string };
  mine: { title: string; hint: string; issued: string; lastUsed: string; never: string; pinTitle: string; pinHint: string; pinLabel: string; pinSave: string; pinSaved: string; pinError: string; pinOff: string; lost: string; lostConfirm: string; lostDone: string; lostError: string; loadError: string; cancel: string };
  admin: {
    open: string; confirm: string; issue: string; loading: string; title: string; warning: string; pinsTitle: string; pinsHint: string; name: string; pin: string; print: string; skipped: string; error: string; employeeNumber: string; imageLabel: string;
    revoke: string; revokeConfirm: string; revoked: string; resetPin: string; resetPinDone: string; state: string; stateNone: string; stateActive: string; stateRevoked: string; stateLost: string; stateLocked: string; close: string; openLink: string;
  };
  policy: { title: string; hint: string; pin: string; idle: string; idleHint: string; roles: string; save: string; saving: string; saved: string; saveError: string; loadError: string };
};

export const badgeResources: Record<'ru' | 'en' | 'kk' | 'zh', Texts> = {
  ru: {
    link: 'Войти по бейджу',
    scan: {
      title: 'Вход по бейджу', hint: 'Поднесите QR-код бейджа к камере. После входа вам будут доступны только назначенные вам чек-листы, тесты и курсы.', cameraStart: 'Включить камеру', cameraStop: 'Выключить камеру',
      cameraUnsupported: 'Этот браузер не умеет читать QR с камеры. Отсканируйте бейдж сканером или телефоном, либо вставьте код ниже.', cameraDenied: 'Нет доступа к камере. Разрешите камеру в настройках браузера или используйте сканер.', cameraLabel: 'Изображение с камеры',
      manualLabel: 'Код бейджа', manualHint: 'Сканер штрихкодов вводит код сам: поставьте курсор в поле и отсканируйте бейдж.', manualSubmit: 'Продолжить', checking: 'Проверяем бейдж…',
      invalid: 'Бейдж или PIN не подходят. Если бейдж потерян, сообщите администратору.', error: 'Не удалось выполнить вход. Попробуйте ещё раз.', toLogin: 'Войти с логином и паролем',
    },
    pin: { title: 'Введите PIN', hint: 'PIN из 4–6 цифр знаете только вы.', label: 'PIN', digit: 'Цифра {{digit}}', erase: 'Стереть', submit: 'Войти', wrong: 'Бейдж или PIN не подходят. После нескольких ошибок бейдж блокируется.', cancel: 'Другой бейдж' },
    kiosk: { finish: 'Закончить работу', notice: 'Вы вошли по бейджу: доступно только назначенное вам.', restricted: 'Эта функция недоступна при входе по бейджу. Войдите с логином и паролем.' },
    mine: {
      title: 'Мой бейдж', hint: 'По QR-коду бейджа вы входите на общем устройстве и проходите только назначенное вам.', issued: 'Выдан', lastUsed: 'Последний вход по бейджу', never: 'ещё не использовался',
      pinTitle: 'PIN бейджа', pinHint: 'От 4 до 6 цифр. Не записывайте PIN на бейдже.', pinLabel: 'Новый PIN', pinSave: 'Сменить PIN', pinSaved: 'PIN изменён.', pinError: 'Не удалось сменить PIN. Нужны 4–6 цифр.', pinOff: 'Сейчас организация не требует PIN, но он пригодится, если требование включат.',
      lost: 'Бейдж потерян', lostConfirm: 'Бейдж перестанет работать сразу, администратору придёт уведомление. Продолжить?', lostDone: 'Бейдж отозван. Администратор получит уведомление и выдаст новый.', lostError: 'Не удалось отозвать бейдж. Сообщите администратору.', loadError: 'Не удалось загрузить сведения о бейдже.', cancel: 'Отмена',
    },
    admin: {
      open: 'Бейдж', confirm: 'Будет выдан новый бейдж, прежний перестанет работать. Бейдж только для ролей «ученик», «наставник» и «преподаватель»; остальные будут пропущены.', issue: 'Выдать бейдж', loading: 'Готовим бейджи…',
      title: 'Бейджи сотрудников', warning: 'QR-код и PIN показаны один раз. QR печатается на бейдже, PIN передаётся сотруднику отдельно и лично: не печатайте его на бейдже.', pinsTitle: 'PIN-коды (не печатаются)', pinsHint: 'Передайте каждому сотруднику его PIN лично. Сотрудник может сменить PIN в профиле.',
      name: 'Сотрудник', pin: 'PIN', print: 'Печать бейджей', skipped: 'Пропущено: {{count}} (нет права, не та роль или нет активной учётной записи).', error: 'Не удалось выдать бейджи. Попробуйте ещё раз.', employeeNumber: 'Табельный номер', imageLabel: 'QR-код бейджа', openLink: 'Открыть ссылку',
      revoke: 'Отозвать бейдж', revokeConfirm: 'Бейдж перестанет работать сразу. Отозвать?', revoked: 'Бейдж отозван.', resetPin: 'Сбросить PIN', resetPinDone: 'Новый PIN: {{pin}}. Передайте его сотруднику лично; он показан один раз.',
      state: 'Состояние бейджа', stateNone: 'не выдан', stateActive: 'действует', stateRevoked: 'отозван', stateLost: 'потерян', stateLocked: 'заблокирован после неверных PIN до {{time}}', close: 'Закрыть',
    },
    policy: {
      title: 'Вход по QR-бейджу', hint: 'Бейдж открывает короткий сеанс только для прохождения назначенного: без отчётов, профиля и настроек. Для администраторов, руководителей и людей с настраиваемыми ролями бейдж не работает.',
      pin: 'Просить PIN после сканирования бейджа', idle: 'Сеанс по бейджу закрывается через, минут бездействия', idleHint: 'От 15 до 120 минут. Сеанс закрывается и после завершения прохождения, и через 8 часов в любом случае.', roles: 'Бейдж могут иметь роли: ученик, наставник, преподаватель.',
      save: 'Сохранить', saving: 'Сохранение…', saved: 'Настройки бейджа сохранены.', saveError: 'Не удалось сохранить. Проверьте значения и попробуйте ещё раз.', loadError: 'Не удалось загрузить настройки бейджа.',
    },
  },
  en: {
    link: 'Sign in with a badge',
    scan: {
      title: 'Sign in with a badge', hint: 'Hold the QR code of your badge in front of the camera. Afterwards you can open only the checklists, tests and courses assigned to you.', cameraStart: 'Turn the camera on', cameraStop: 'Turn the camera off',
      cameraUnsupported: 'This browser cannot read a QR code from the camera. Scan the badge with a scanner or a phone, or paste the code below.', cameraDenied: 'No access to the camera. Allow the camera in the browser settings or use a scanner.', cameraLabel: 'Camera image',
      manualLabel: 'Badge code', manualHint: 'A barcode scanner types the code by itself: put the cursor in the field and scan the badge.', manualSubmit: 'Continue', checking: 'Checking the badge…',
      invalid: 'The badge or the PIN is not valid. If the badge is lost, tell your administrator.', error: 'Sign-in failed. Please try again.', toLogin: 'Sign in with a login and password',
    },
    pin: { title: 'Enter your PIN', hint: 'Only you know the 4–6 digit PIN.', label: 'PIN', digit: 'Digit {{digit}}', erase: 'Erase', submit: 'Sign in', wrong: 'The badge or the PIN is not valid. After several mistakes the badge is locked.', cancel: 'Another badge' },
    kiosk: { finish: 'Finish work', notice: 'You signed in with a badge: only what is assigned to you is available.', restricted: 'This function is not available with a badge sign-in. Sign in with a login and password.' },
    mine: {
      title: 'My badge', hint: 'The QR code of your badge signs you in on a shared device so you can do only what is assigned to you.', issued: 'Issued', lastUsed: 'Last sign-in with the badge', never: 'not used yet',
      pinTitle: 'Badge PIN', pinHint: '4 to 6 digits. Do not write the PIN on the badge.', pinLabel: 'New PIN', pinSave: 'Change PIN', pinSaved: 'PIN changed.', pinError: 'Could not change the PIN. Use 4–6 digits.', pinOff: 'The organization does not ask for a PIN now, but you will need it if that changes.',
      lost: 'Badge lost', lostConfirm: 'The badge stops working at once and the administrator is notified. Continue?', lostDone: 'The badge is revoked. The administrator is notified and will issue a new one.', lostError: 'Could not revoke the badge. Tell your administrator.', loadError: 'Could not load the badge details.', cancel: 'Cancel',
    },
    admin: {
      open: 'Badge', confirm: 'A new badge will be issued and the previous one stops working. Badges are for the learner, mentor and instructor roles; others are skipped.', issue: 'Issue badge', loading: 'Preparing badges…',
      title: 'Employee badges', warning: 'The QR code and the PIN are shown once. Print the QR on the badge and give the PIN to the employee separately and in person: do not print it on the badge.', pinsTitle: 'PINs (not printed)', pinsHint: 'Give each employee their PIN in person. The employee can change it in the profile.',
      name: 'Employee', pin: 'PIN', print: 'Print badges', skipped: 'Skipped: {{count}} (no right, a different role or no active account).', error: 'Could not issue the badges. Please try again.', employeeNumber: 'Employee number', imageLabel: 'Badge QR code', openLink: 'Open link',
      revoke: 'Revoke badge', revokeConfirm: 'The badge stops working at once. Revoke it?', revoked: 'The badge is revoked.', resetPin: 'Reset PIN', resetPinDone: 'New PIN: {{pin}}. Give it to the employee in person; it is shown once.',
      state: 'Badge state', stateNone: 'not issued', stateActive: 'active', stateRevoked: 'revoked', stateLost: 'lost', stateLocked: 'locked after wrong PINs until {{time}}', close: 'Close',
    },
    policy: {
      title: 'QR badge sign-in', hint: 'A badge opens a short session only for doing what is assigned: no reports, profile or settings. It does not work for administrators, managers or people with custom roles.',
      pin: 'Ask for a PIN after the badge is scanned', idle: 'Close a badge session after, minutes idle', idleHint: '15 to 120 minutes. The session also closes when the work is handed in and after 8 hours at most.', roles: 'Roles that can have a badge: learner, mentor, instructor.',
      save: 'Save', saving: 'Saving…', saved: 'Badge settings saved.', saveError: 'Could not save. Check the values and try again.', loadError: 'Could not load the badge settings.',
    },
  },
  kk: {
    link: 'Бейдж арқылы кіру',
    scan: {
      title: 'Бейдж арқылы кіру', hint: 'Бейджіңіздің QR-кодын камераға көрсетіңіз. Кіргеннен кейін тек сізге тағайындалған чек-парақтар, тесттер және курстар ашылады.', cameraStart: 'Камераны қосу', cameraStop: 'Камераны өшіру',
      cameraUnsupported: 'Бұл браузер камерадан QR оқи алмайды. Бейджді сканермен немесе телефонмен сканерлеңіз не кодты төменге қойыңыз.', cameraDenied: 'Камераға қолжетім жоқ. Браузер параметрлерінде камераға рұқсат беріңіз немесе сканерді қолданыңыз.', cameraLabel: 'Камера кескіні',
      manualLabel: 'Бейдж коды', manualHint: 'Штрихкод сканері кодты өзі енгізеді: меңзерді өріске қойып, бейджді сканерлеңіз.', manualSubmit: 'Жалғастыру', checking: 'Бейдж тексерілуде…',
      invalid: 'Бейдж немесе PIN жарамайды. Бейдж жоғалса, әкімшіге хабарлаңыз.', error: 'Кіру орындалмады. Қайталап көріңіз.', toLogin: 'Логин мен құпиясөзбен кіру',
    },
    pin: { title: 'PIN енгізіңіз', hint: '4–6 саннан тұратын PIN-ді тек сіз білесіз.', label: 'PIN', digit: '{{digit}} саны', erase: 'Өшіру', submit: 'Кіру', wrong: 'Бейдж немесе PIN жарамайды. Бірнеше қатеден кейін бейдж бұғатталады.', cancel: 'Басқа бейдж' },
    kiosk: { finish: 'Жұмысты аяқтау', notice: 'Сіз бейдж арқылы кірдіңіз: тек сізге тағайындалғандар ғана қолжетімді.', restricted: 'Бейдж арқылы кіргенде бұл функция қолжетімсіз. Логин мен құпиясөзбен кіріңіз.' },
    mine: {
      title: 'Менің бейджім', hint: 'Бейджіңіздің QR-коды ортақ құрылғыда кіруге және тек сізге тағайындалғанды орындауға мүмкіндік береді.', issued: 'Берілген күні', lastUsed: 'Бейдж арқылы соңғы кіру', never: 'әлі пайдаланылмаған',
      pinTitle: 'Бейдж PIN-і', pinHint: '4-тен 6-ға дейін сан. PIN-ді бейджге жазбаңыз.', pinLabel: 'Жаңа PIN', pinSave: 'PIN ауыстыру', pinSaved: 'PIN ауыстырылды.', pinError: 'PIN ауыстырылмады. 4–6 сан қажет.', pinOff: 'Қазір ұйым PIN сұрамайды, бірақ талап қосылса, ол қажет болады.',
      lost: 'Бейдж жоғалды', lostConfirm: 'Бейдж бірден жұмысын тоқтатады, әкімші хабарлама алады. Жалғастырасыз ба?', lostDone: 'Бейдж қайтарып алынды. Әкімші хабарлама алып, жаңасын береді.', lostError: 'Бейдж қайтарып алынбады. Әкімшіге хабарлаңыз.', loadError: 'Бейдж туралы мәлімет жүктелмеді.', cancel: 'Бас тарту',
    },
    admin: {
      open: 'Бейдж', confirm: 'Жаңа бейдж беріледі, бұрынғысы жұмысын тоқтатады. Бейдж тек «оқушы», «тәлімгер» және «оқытушы» рөлдеріне арналған; қалғандары өткізіледі.', issue: 'Бейдж беру', loading: 'Бейджілер дайындалуда…',
      title: 'Қызметкерлер бейджілері', warning: 'QR-код пен PIN бір рет көрсетіледі. QR-ды бейджге басыңыз, PIN-ді қызметкерге бөлек және жеке өзіне беріңіз: оны бейджге баспаңыз.', pinsTitle: 'PIN-дер (басылмайды)', pinsHint: 'Әр қызметкерге PIN-ін жеке өзіне беріңіз. Қызметкер оны профильде ауыстыра алады.',
      name: 'Қызметкер', pin: 'PIN', print: 'Бейджілерді басу', skipped: 'Өткізілді: {{count}} (құқық жоқ, басқа рөл немесе белсенді тіркелгі жоқ).', error: 'Бейджілер берілмеді. Қайталап көріңіз.', employeeNumber: 'Табель нөмірі', imageLabel: 'Бейдж QR-коды', openLink: 'Сілтемені ашу',
      revoke: 'Бейджді қайтарып алу', revokeConfirm: 'Бейдж бірден жұмысын тоқтатады. Қайтарып аласыз ба?', revoked: 'Бейдж қайтарып алынды.', resetPin: 'PIN-ді тастау', resetPinDone: 'Жаңа PIN: {{pin}}. Оны қызметкерге жеке беріңіз; ол бір рет көрсетіледі.',
      state: 'Бейдж күйі', stateNone: 'берілмеген', stateActive: 'жарамды', stateRevoked: 'қайтарып алынған', stateLost: 'жоғалған', stateLocked: 'қате PIN-нен кейін {{time}} дейін бұғатталған', close: 'Жабу',
    },
    policy: {
      title: 'QR-бейдж арқылы кіру', hint: 'Бейдж тек тағайындалғанды орындауға арналған қысқа сеансты ашады: есептерсіз, профильсіз және параметрлерсіз. Әкімшілерге, басшыларға және баптамалы рөлі бар адамдарға бейдж жұмыс істемейді.',
      pin: 'Бейдж сканерленгеннен кейін PIN сұрау', idle: 'Бейдж сеансы әрекетсіздіктен кейін жабылады, минут', idleHint: '15-тен 120 минутқа дейін. Сеанс жұмыс тапсырылғанда да, ең көбі 8 сағаттан кейін де жабылады.', roles: 'Бейдж болуы мүмкін рөлдер: оқушы, тәлімгер, оқытушы.',
      save: 'Сақтау', saving: 'Сақталуда…', saved: 'Бейдж параметрлері сақталды.', saveError: 'Сақталмады. Мәндерді тексеріп, қайталап көріңіз.', loadError: 'Бейдж параметрлері жүктелмеді.',
    },
  },
  zh: {
    link: '使用工牌登录',
    scan: {
      title: '使用工牌登录', hint: '请将工牌上的二维码对准摄像头。登录后只能打开分配给您的检查清单、测试和课程。', cameraStart: '打开摄像头', cameraStop: '关闭摄像头',
      cameraUnsupported: '此浏览器无法通过摄像头读取二维码。请用扫码枪或手机扫描工牌，或在下方粘贴代码。', cameraDenied: '无法使用摄像头。请在浏览器设置中允许使用摄像头，或使用扫码枪。', cameraLabel: '摄像头画面',
      manualLabel: '工牌代码', manualHint: '扫码枪会自动输入代码：将光标放在此栏并扫描工牌。', manualSubmit: '继续', checking: '正在检查工牌…',
      invalid: '工牌或 PIN 无效。如果工牌丢失，请告知管理员。', error: '登录失败，请重试。', toLogin: '使用账号和密码登录',
    },
    pin: { title: '输入 PIN', hint: '4–6 位 PIN 只有您自己知道。', label: 'PIN', digit: '数字 {{digit}}', erase: '删除', submit: '登录', wrong: '工牌或 PIN 无效。多次输错后工牌将被锁定。', cancel: '换一个工牌' },
    kiosk: { finish: '结束工作', notice: '您已使用工牌登录：只能使用分配给您的内容。', restricted: '使用工牌登录时无法使用此功能。请使用账号和密码登录。' },
    mine: {
      title: '我的工牌', hint: '凭工牌二维码可在共用设备上登录，只能完成分配给您的内容。', issued: '发放时间', lastUsed: '最近一次工牌登录', never: '尚未使用',
      pinTitle: '工牌 PIN', pinHint: '4 到 6 位数字。请勿把 PIN 写在工牌上。', pinLabel: '新 PIN', pinSave: '修改 PIN', pinSaved: 'PIN 已修改。', pinError: '无法修改 PIN，需要 4–6 位数字。', pinOff: '组织目前不要求 PIN，但如果启用要求，您将需要它。',
      lost: '工牌丢失', lostConfirm: '工牌将立即失效，并通知管理员。是否继续？', lostDone: '工牌已撤销。管理员会收到通知并发放新工牌。', lostError: '无法撤销工牌，请告知管理员。', loadError: '无法加载工牌信息。', cancel: '取消',
    },
    admin: {
      open: '工牌', confirm: '将发放新工牌，原工牌失效。工牌仅适用于学员、导师和讲师角色，其他人将被跳过。', issue: '发放工牌', loading: '正在准备工牌…',
      title: '员工工牌', warning: '二维码和 PIN 只显示一次。请把二维码印在工牌上，PIN 单独当面交给员工：不要印在工牌上。', pinsTitle: 'PIN（不打印）', pinsHint: '请把 PIN 当面交给每位员工。员工可在个人资料中修改 PIN。',
      name: '员工', pin: 'PIN', print: '打印工牌', skipped: '已跳过：{{count}}（无权限、角色不符或账户未激活）。', error: '无法发放工牌，请重试。', employeeNumber: '工号', imageLabel: '工牌二维码', openLink: '打开链接',
      revoke: '撤销工牌', revokeConfirm: '工牌将立即失效。确定撤销吗？', revoked: '工牌已撤销。', resetPin: '重置 PIN', resetPinDone: '新 PIN：{{pin}}。请当面交给员工；仅显示一次。',
      state: '工牌状态', stateNone: '未发放', stateActive: '有效', stateRevoked: '已撤销', stateLost: '已丢失', stateLocked: '因 PIN 错误被锁定至 {{time}}', close: '关闭',
    },
    policy: {
      title: '二维码工牌登录', hint: '工牌只开启一个仅用于完成分配任务的短时会话：没有报表、个人资料和设置。对管理员、负责人和拥有自定义角色的人无效。',
      pin: '扫描工牌后要求输入 PIN', idle: '工牌会话空闲后关闭，分钟', idleHint: '15 到 120 分钟。完成工作后会话也会关闭，最长 8 小时。', roles: '可持有工牌的角色：学员、导师、讲师。',
      save: '保存', saving: '正在保存…', saved: '工牌设置已保存。', saveError: '无法保存。请检查数值后重试。', loadError: '无法加载工牌设置。',
    },
  },
};
