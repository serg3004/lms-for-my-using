/** PR 505: texts of sign-in by QR: the device screen, the phone screen and the administrator's policy. */
type Texts = {
  tab: string; hint: string; starting: string; imageLabel: string; expiresIn: string; waiting: string; denied: string; failed: string; refresh: string; warning: string;
  confirm: { title: string; question: string; device: string; place: string; time: string; unknown: string; warning: string; approve: string; deny: string;
    signIn: string; toLogin: string; invalid: string; error: string; approved: string; denied: string; notAllowed: string };
  policy: { title: string; hint: string; enable: string; hours: string; hoursHint: string; roles: string; customRoles: string; wideWarning: string; save: string; saving: string; saved: string; saveError: string; loadError: string;
    role: { learner: string; mentor: string; instructor: string; manager: string; admin: string } };
};

export const qrLoginResources: Record<'ru' | 'en' | 'kk' | 'zh', Texts> = {
  ru: {
    tab: 'По QR', hint: 'Откройте систему на телефоне, где вы уже вошли, и отсканируйте этот код камерой. Подтвердите вход на телефоне.', starting: 'Готовим код…', imageLabel: 'QR-код для входа',
    expiresIn: 'Код действует ещё {{seconds}} с', waiting: 'Ждём подтверждения на телефоне…', denied: 'Вход отклонён на телефоне.', failed: 'Не удалось получить код. Попробуйте ещё раз.', refresh: 'Новый код',
    warning: 'Никому не показывайте этот код и не подтверждайте вход, который начали не вы.',
    confirm: {
      title: 'Вход по QR-коду', question: 'Кто-то хочет войти в вашу учётную запись по этому коду. Это вы?', device: 'Устройство', place: 'Примерное место (сеть)', time: 'Запрошено', unknown: 'неизвестно',
      warning: 'Подтверждайте, только если вы сами сейчас показываете код на этом устройстве. Если вас попросил посторонний, нажмите «Это не я».', approve: 'Подтвердить вход', deny: 'Это не я',
      signIn: 'Сначала войдите в систему на этом телефоне, затем отсканируйте код ещё раз.', toLogin: 'Перейти ко входу', invalid: 'Код недействителен или устарел. Покажите на устройстве новый код.',
      error: 'Не удалось выполнить действие. Попробуйте ещё раз.', approved: 'Вход подтверждён. Устройство откроет систему само.', denied: 'Вход отклонён.', notAllowed: 'Вход по QR для вашей роли не разрешён. Войдите с паролем.',
    },
    policy: {
      title: 'Вход по QR-коду', hint: 'Человек показывает QR на общем компьютере или планшете и подтверждает вход на своём телефоне, где уже вошёл. Сеанс по QR короткий, его нельзя продлить, а подтвердить с него другой вход нельзя.',
      enable: 'Разрешить вход по QR в организации', hours: 'Срок сеанса по QR, часов', hoursHint: 'От 1 до 24 часов.', roles: 'Роли, которым разрешён вход по QR',
      customRoles: 'Люди с настраиваемыми ролями всегда входят с паролем: такие роли дают права, которые для этого входа не проверялись.', wideWarning: 'Для руководителей и администраторов вход по QR лучше не включать: общий компьютер получит широкие права.',
      save: 'Сохранить', saving: 'Сохранение…', saved: 'Настройки входа по QR сохранены.', saveError: 'Не удалось сохранить. Проверьте значения и попробуйте ещё раз.', loadError: 'Не удалось загрузить настройки входа по QR.',
      role: { learner: 'Ученик', mentor: 'Наставник', instructor: 'Преподаватель', manager: 'Руководитель', admin: 'Администратор' },
    },
  },
  en: {
    tab: 'By QR', hint: 'Open the system on the phone where you are already signed in and scan this code with the camera. Confirm the sign-in on the phone.', starting: 'Preparing the code…', imageLabel: 'Sign-in QR code',
    expiresIn: 'The code is valid for {{seconds}} s more', waiting: 'Waiting for the confirmation on the phone…', denied: 'The sign-in was declined on the phone.', failed: 'Could not get a code. Try again.', refresh: 'New code',
    warning: 'Do not show this code to anyone and do not confirm a sign-in you did not start.',
    confirm: {
      title: 'Sign-in by QR code', question: 'Someone wants to sign in to your account with this code. Is it you?', device: 'Device', place: 'Approximate place (network)', time: 'Requested', unknown: 'unknown',
      warning: 'Confirm only if you are showing the code on that device right now. If someone else asked you to, press "It is not me".', approve: 'Confirm sign-in', deny: 'It is not me',
      signIn: 'Sign in on this phone first, then scan the code again.', toLogin: 'Go to sign-in', invalid: 'The code is invalid or has expired. Show a new code on the device.',
      error: 'Could not do that. Try again.', approved: 'Sign-in confirmed. The device will open the system by itself.', denied: 'The sign-in was declined.', notAllowed: 'Sign-in by QR is not allowed for your role. Sign in with a password.',
    },
    policy: {
      title: 'Sign-in by QR code', hint: 'A person shows a QR on a shared computer or tablet and confirms the sign-in on their phone, where they are already signed in. A session by QR is short, cannot be extended, and cannot confirm another sign-in.',
      enable: 'Allow sign-in by QR in the organization', hours: 'Session by QR, hours', hoursHint: 'From 1 to 24 hours.', roles: 'Roles allowed to sign in by QR',
      customRoles: 'People with custom roles always sign in with a password: such roles grant rights that were not reviewed for this way of signing in.', wideWarning: 'It is better not to turn QR sign-in on for managers and administrators: a shared computer would get wide rights.',
      save: 'Save', saving: 'Saving…', saved: 'The QR sign-in settings are saved.', saveError: 'Could not save. Check the values and try again.', loadError: 'Could not load the QR sign-in settings.',
      role: { learner: 'Learner', mentor: 'Mentor', instructor: 'Instructor', manager: 'Manager', admin: 'Administrator' },
    },
  },
  kk: {
    tab: 'QR арқылы', hint: 'Жүйені өзіңіз кірген телефоннан ашып, осы кодты камерамен сканерлеңіз. Кіруді телефонда растаңыз.', starting: 'Код дайындалуда…', imageLabel: 'Кіруге арналған QR-код',
    expiresIn: 'Код тағы {{seconds}} с жарамды', waiting: 'Телефонда растауды күтудеміз…', denied: 'Кіру телефонда қабылданбады.', failed: 'Код алу мүмкін болмады. Қайталап көріңіз.', refresh: 'Жаңа код',
    warning: 'Бұл кодты ешкімге көрсетпеңіз және өзіңіз бастамаған кіруді растамаңыз.',
    confirm: {
      title: 'QR-код арқылы кіру', question: 'Біреу осы код арқылы тіркелгіңізге кіргісі келеді. Бұл сіз бе?', device: 'Құрылғы', place: 'Шамамен орны (желі)', time: 'Сұралған уақыты', unknown: 'белгісіз',
      warning: 'Кодты дәл қазір сол құрылғыда өзіңіз көрсетіп тұрсаңыз ғана растаңыз. Бөтен адам сұраса, «Бұл мен емеспін» батырмасын басыңыз.', approve: 'Кіруді растау', deny: 'Бұл мен емеспін',
      signIn: 'Алдымен осы телефонда жүйеге кіріңіз, содан кейін кодты қайта сканерлеңіз.', toLogin: 'Кіруге өту', invalid: 'Код жарамсыз немесе мерзімі өтті. Құрылғыда жаңа код көрсетіңіз.',
      error: 'Әрекетті орындау мүмкін болмады. Қайталап көріңіз.', approved: 'Кіру расталды. Құрылғы жүйені өзі ашады.', denied: 'Кіру қабылданбады.', notAllowed: 'Рөліңіз үшін QR арқылы кіруге рұқсат жоқ. Құпиясөзбен кіріңіз.',
    },
    policy: {
      title: 'QR-код арқылы кіру', hint: 'Адам ортақ компьютерде немесе планшетте QR көрсетіп, кіруді өзі кірген телефонында растайды. QR арқылы ашылған сеанс қысқа, оны ұзартуға болмайды және одан басқа кіруді растауға болмайды.',
      enable: 'Ұйымда QR арқылы кіруге рұқсат беру', hours: 'QR арқылы сеанс, сағат', hoursHint: '1 сағаттан 24 сағатқа дейін.', roles: 'QR арқылы кіруге рұқсат етілген рөлдер',
      customRoles: 'Реттелетін рөлі бар адамдар әрқашан құпиясөзбен кіреді: мұндай рөлдер осы кіру тәсілі үшін тексерілмеген құқықтар береді.', wideWarning: 'Басшылар мен әкімшілер үшін QR арқылы кіруді қоспаған дұрыс: ортақ компьютер кең құқық алады.',
      save: 'Сақтау', saving: 'Сақталуда…', saved: 'QR арқылы кіру баптаулары сақталды.', saveError: 'Сақтау мүмкін болмады. Мәндерді тексеріп, қайталап көріңіз.', loadError: 'QR арқылы кіру баптауларын жүктеу мүмкін болмады.',
      role: { learner: 'Оқушы', mentor: 'Тәлімгер', instructor: 'Оқытушы', manager: 'Басшы', admin: 'Әкімші' },
    },
  },
  zh: {
    tab: '二维码', hint: '请用已登录的手机打开系统，并用相机扫描此二维码，然后在手机上确认登录。', starting: '正在准备二维码…', imageLabel: '登录二维码',
    expiresIn: '二维码还剩 {{seconds}} 秒有效', waiting: '正在等待手机确认…', denied: '登录已在手机上被拒绝。', failed: '无法获取二维码，请重试。', refresh: '新二维码',
    warning: '请勿向任何人展示此二维码，也不要确认不是您发起的登录。',
    confirm: {
      title: '二维码登录', question: '有人想用此二维码登录您的账户。是您本人吗？', device: '设备', place: '大致位置（网络）', time: '请求时间', unknown: '未知',
      warning: '仅当您此刻正在该设备上展示二维码时才确认。如果是陌生人让您确认，请点“不是我”。', approve: '确认登录', deny: '不是我',
      signIn: '请先在这部手机上登录系统，然后再次扫描二维码。', toLogin: '前往登录', invalid: '二维码无效或已过期。请在设备上显示新的二维码。',
      error: '无法完成操作，请重试。', approved: '登录已确认。设备会自动进入系统。', denied: '登录已被拒绝。', notAllowed: '您的角色不允许二维码登录。请使用密码登录。',
    },
    policy: {
      title: '二维码登录', hint: '用户在公用电脑或平板上显示二维码，并在已登录的手机上确认登录。二维码会话较短，不能延长，也不能用它确认另一次登录。',
      enable: '允许本组织使用二维码登录', hours: '二维码会话时长（小时）', hoursHint: '1 到 24 小时。', roles: '允许二维码登录的角色',
      customRoles: '拥有自定义角色的人始终使用密码登录：这类角色的权限没有针对此登录方式审核过。', wideWarning: '最好不要为主管和管理员开启二维码登录：公用电脑会获得较大的权限。',
      save: '保存', saving: '保存中…', saved: '二维码登录设置已保存。', saveError: '无法保存。请检查数值后重试。', loadError: '无法加载二维码登录设置。',
      role: { learner: '学员', mentor: '导师', instructor: '讲师', manager: '主管', admin: '管理员' },
    },
  },
};
