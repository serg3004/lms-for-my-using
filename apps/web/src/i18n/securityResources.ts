const en = {
  navTitle: 'Security', eyebrow: 'Security', title: 'Security', subtitle: 'The password policy of your organization and your own password.',
  policyTitle: 'Password policy', policyHint: 'Applies to every new password: set by an administrator, an invitation, a reset or the user. Passwords must contain letters and digits and must not repeat the email, the name or a common password.',
  minLength: 'Minimum length (5–20)', historyCount: 'Do not allow the last passwords again (0–10)', weakWarning: 'A minimum below 8 characters is easy to guess. A value of 10 or more is recommended.',
  savePolicy: 'Save policy', savingPolicy: 'Saving…', policySaved: 'Policy saved.', policySaveError: 'Could not save the policy. Try again.', loadError: 'Could not load the policy.', loading: 'Loading…',
  changeTitle: 'Change password', changeHint: 'After the change you stay signed in here; all other sessions are signed out and you get an email about it.',
  currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Repeat the new password', requirements: 'At least {{count}} characters, letters and digits.',
  change: 'Change password', changing: 'Changing…', changed: 'Password changed. Other devices were signed out.', mismatch: 'The passwords do not match.', required: 'Fill in all fields.',
  wrongCurrent: 'The current password is incorrect.', changeError: 'Could not change the password. Try again.',
  violations: {
    too_short: 'The password is shorter than {{count}} characters.', too_long: 'The password is too long.', no_letter: 'Add at least one letter.', no_digit: 'Add at least one digit.',
    contains_email: 'The password must not contain the email address.', contains_name: 'The password must not contain your name.', common: 'This password is too common.', reused: 'This password was used recently. Choose a new one.',
  },
  invalidPassword: 'The password does not meet the password policy.',
} as const;

export const securityResources = {
  en,
  ru: {
    navTitle: 'Безопасность', eyebrow: 'Безопасность', title: 'Безопасность', subtitle: 'Политика паролей организации и ваш собственный пароль.',
    policyTitle: 'Политика паролей', policyHint: 'Действует для каждого нового пароля: заданного администратором, по приглашению, при сбросе или самим пользователем. В пароле должны быть буквы и цифры, он не должен повторять почту, имя или распространённый пароль.',
    minLength: 'Минимальная длина (5–20)', historyCount: 'Не разрешать недавние пароли снова (0–10)', weakWarning: 'Минимум меньше 8 символов легко подобрать. Рекомендуем 10 и больше.',
    savePolicy: 'Сохранить политику', savingPolicy: 'Сохранение…', policySaved: 'Политика сохранена.', policySaveError: 'Не удалось сохранить политику. Попробуйте снова.', loadError: 'Не удалось загрузить политику.', loading: 'Загрузка…',
    changeTitle: 'Смена пароля', changeHint: 'После смены вы остаётесь в системе здесь, остальные сеансы завершатся, а на почту придёт уведомление.',
    currentPassword: 'Текущий пароль', newPassword: 'Новый пароль', confirmPassword: 'Повторите новый пароль', requirements: 'Не менее {{count}} символов, буквы и цифры.',
    change: 'Сменить пароль', changing: 'Смена…', changed: 'Пароль изменён. На других устройствах выполнен выход.', mismatch: 'Пароли не совпадают.', required: 'Заполните все поля.',
    wrongCurrent: 'Текущий пароль неверный.', changeError: 'Не удалось сменить пароль. Попробуйте снова.',
    violations: {
      too_short: 'Пароль короче {{count}} символов.', too_long: 'Пароль слишком длинный.', no_letter: 'Добавьте хотя бы одну букву.', no_digit: 'Добавьте хотя бы одну цифру.',
      contains_email: 'Пароль не должен содержать адрес почты.', contains_name: 'Пароль не должен содержать ваше имя.', common: 'Этот пароль слишком распространённый.', reused: 'Этот пароль использовался недавно. Выберите новый.',
    },
    invalidPassword: 'Пароль не соответствует политике паролей.',
  },
  kk: {
    navTitle: 'Қауіпсіздік', eyebrow: 'Қауіпсіздік', title: 'Қауіпсіздік', subtitle: 'Ұйымның құпиясөз саясаты және өз құпиясөзіңіз.',
    policyTitle: 'Құпиясөз саясаты', policyHint: 'Әкімші, шақыру, қалпына келтіру немесе пайдаланушы орнататын әр жаңа құпиясөзге қолданылады. Құпиясөзде әріптер мен сандар болуы керек, ол поштаны, атты немесе кең таралған құпиясөзді қайталамауы тиіс.',
    minLength: 'Ең аз ұзындығы (5–20)', historyCount: 'Соңғы құпиясөздерді қайта қолдануға тыйым салу (0–10)', weakWarning: '8 таңбадан аз ұзындықты табу оңай. 10 және одан көп ұсынылады.',
    savePolicy: 'Саясатты сақтау', savingPolicy: 'Сақталуда…', policySaved: 'Саясат сақталды.', policySaveError: 'Саясатты сақтау мүмкін болмады. Қайталап көріңіз.', loadError: 'Саясатты жүктеу мүмкін болмады.', loading: 'Жүктелуде…',
    changeTitle: 'Құпиясөзді өзгерту', changeHint: 'Өзгерткеннен кейін осы жерде жүйеде қаласыз, басқа сеанстар аяқталады, поштаңызға хабарлама келеді.',
    currentPassword: 'Ағымдағы құпиясөз', newPassword: 'Жаңа құпиясөз', confirmPassword: 'Жаңа құпиясөзді қайталаңыз', requirements: 'Кемінде {{count}} таңба, әріптер мен сандар.',
    change: 'Құпиясөзді өзгерту', changing: 'Өзгертілуде…', changed: 'Құпиясөз өзгертілді. Басқа құрылғылардан шығарылды.', mismatch: 'Құпиясөздер сәйкес келмейді.', required: 'Барлық өрісті толтырыңыз.',
    wrongCurrent: 'Ағымдағы құпиясөз қате.', changeError: 'Құпиясөзді өзгерту мүмкін болмады. Қайталап көріңіз.',
    violations: {
      too_short: 'Құпиясөз {{count}} таңбадан қысқа.', too_long: 'Құпиясөз тым ұзын.', no_letter: 'Кемінде бір әріп қосыңыз.', no_digit: 'Кемінде бір сан қосыңыз.',
      contains_email: 'Құпиясөзде пошта мекенжайы болмауы керек.', contains_name: 'Құпиясөзде атыңыз болмауы керек.', common: 'Бұл құпиясөз тым кең таралған.', reused: 'Бұл құпиясөз жақында қолданылған. Жаңасын таңдаңыз.',
    },
    invalidPassword: 'Құпиясөз құпиясөз саясатына сай емес.',
  },
  zh: {
    navTitle: '安全', eyebrow: '安全', title: '安全', subtitle: '组织的密码策略和您自己的密码。',
    policyTitle: '密码策略', policyHint: '适用于每个新密码：由管理员设置、通过邀请、重置或用户自行设置。密码必须包含字母和数字，且不得重复邮箱、姓名或常见密码。',
    minLength: '最小长度（5–20）', historyCount: '禁止再次使用最近的密码（0–10）', weakWarning: '少于 8 个字符的密码容易被猜到，建议 10 个或更多。',
    savePolicy: '保存策略', savingPolicy: '正在保存…', policySaved: '策略已保存。', policySaveError: '无法保存策略，请重试。', loadError: '无法加载策略。', loading: '正在加载…',
    changeTitle: '修改密码', changeHint: '修改后您在此处保持登录，其他会话将被退出，并会收到邮件通知。',
    currentPassword: '当前密码', newPassword: '新密码', confirmPassword: '再次输入新密码', requirements: '至少 {{count}} 个字符，包含字母和数字。',
    change: '修改密码', changing: '正在修改…', changed: '密码已修改，其他设备已退出登录。', mismatch: '两次输入的密码不一致。', required: '请填写所有字段。',
    wrongCurrent: '当前密码不正确。', changeError: '无法修改密码，请重试。',
    violations: {
      too_short: '密码少于 {{count}} 个字符。', too_long: '密码过长。', no_letter: '请至少添加一个字母。', no_digit: '请至少添加一个数字。',
      contains_email: '密码不得包含邮箱地址。', contains_name: '密码不得包含您的姓名。', common: '此密码过于常见。', reused: '此密码最近使用过，请选择新密码。',
    },
    invalidPassword: '密码不符合密码策略。',
  },
} as const;
