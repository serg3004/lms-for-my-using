/** PR 503: texts of the "send to Telegram" dialog. */
type Texts = {
  action: string; title: string; loading: string; loadError: string; retry: string; close: string; send: string; sending: string;
  notConfigured: string; disabled: string; disabledAdmin: string; enable: string; enableFailed: string;
  invitationHint: string; passwordHint: string; passwordConfirm: string;
  sent: string; failed: string; awaitingTitle: string; awaitingHint: string; copy: string; copied: string; botLink: string; until: string;
  errors: { conflict: string; tooMany: string; notFound: string; forbidden: string; other: string };
  reasons: { blocked: string; chat_not_found: string; rate_limited: string; network: string; rejected: string; unavailable: string };
  history: string; historyEmpty: string; linked: string; notLinked: string;
  kinds: { invitation: string; temporary_password: string; install_link: string; session_link: string };
  statuses: { sent: string; failed: string; awaiting_start: string };
};

export const telegramResources: Record<'ru' | 'en' | 'kk' | 'zh', Texts> = {
  ru: {
    action: 'В Telegram', title: 'Отправить в Telegram', loading: 'Загрузка…', loadError: 'Не удалось загрузить данные канала.', retry: 'Повторить', close: 'Закрыть', send: 'Отправить', sending: 'Отправка…',
    notConfigured: 'Бот Telegram ещё не настроен на сервере. Обратитесь к владельцу системы.', disabled: 'Отправка через Telegram выключена для организации.',
    disabledAdmin: 'Отправка через Telegram выключена для организации. Администратор может её включить.', enable: 'Включить Telegram', enableFailed: 'Не удалось включить канал.',
    invitationHint: 'Человек получит ссылку для входа в чат с ботом. Приглашение придёт в чат после нажатия «Старт».',
    passwordHint: 'Будет выдан личный временный пароль. Человек обязан сменить его при входе.', passwordConfirm: 'Я понимаю, что пароль уйдёт человеку в Telegram',
    sent: 'Сообщение отправлено.', failed: 'Не удалось отправить', awaitingTitle: 'Передайте человеку ссылку на бота',
    awaitingHint: 'Бот не может написать первым. Когда человек откроет ссылку и нажмёт «Старт», сообщение придёт автоматически.', copy: 'Копировать ссылку', copied: 'Скопировано', botLink: 'Ссылка на бота', until: 'Действует до',
    errors: { conflict: 'Сейчас отправить нельзя: проверьте статус человека и настройки канала.', tooMany: 'Слишком часто. Подождите минуту или дождитесь следующего дня, если исчерпан дневной лимит.', notFound: 'Человек не найден.', forbidden: 'Недостаточно прав.', other: 'Не удалось отправить. Попробуйте ещё раз.' },
    reasons: { blocked: 'человек заблокировал бота', chat_not_found: 'чат не найден', rate_limited: 'Telegram просит подождать', network: 'нет связи с Telegram', rejected: 'Telegram отклонил сообщение', unavailable: 'сообщение сейчас недоступно' },
    history: 'Последние отправки', historyEmpty: 'Отправок ещё не было.', linked: 'Telegram подключён', notLinked: 'Telegram не подключён',
    kinds: { invitation: 'Приглашение', temporary_password: 'Временный пароль', install_link: 'Ссылка на установку', session_link: 'Ссылка на проверку' }, statuses: { sent: 'отправлено', failed: 'ошибка', awaiting_start: 'ждёт «Старт»' },
  },
  en: {
    action: 'Telegram', title: 'Send via Telegram', loading: 'Loading…', loadError: 'Could not load the channel data.', retry: 'Retry', close: 'Close', send: 'Send', sending: 'Sending…',
    notConfigured: 'The Telegram bot is not set up on the server yet. Ask the system owner.', disabled: 'Telegram delivery is turned off for the organization.',
    disabledAdmin: 'Telegram delivery is turned off for the organization. An administrator can turn it on.', enable: 'Turn on Telegram', enableFailed: 'Could not turn the channel on.',
    invitationHint: 'The person gets a link to the bot chat. The invitation arrives in the chat after they press "Start".',
    passwordHint: 'A personal temporary password is issued. The person must change it at sign-in.', passwordConfirm: 'I understand the password will be sent to the person in Telegram',
    sent: 'The message was sent.', failed: 'Could not send', awaitingTitle: 'Give the person the bot link',
    awaitingHint: 'A bot cannot write first. When the person opens the link and presses "Start", the message arrives automatically.', copy: 'Copy link', copied: 'Copied', botLink: 'Bot link', until: 'Valid until',
    errors: { conflict: 'Cannot send now: check the person status and the channel settings.', tooMany: 'Too often. Wait a minute, or until tomorrow if the daily limit is used up.', notFound: 'Person not found.', forbidden: 'Not enough rights.', other: 'Could not send. Try again.' },
    reasons: { blocked: 'the person blocked the bot', chat_not_found: 'chat not found', rate_limited: 'Telegram asks to wait', network: 'no connection to Telegram', rejected: 'Telegram rejected the message', unavailable: 'the message is unavailable right now' },
    history: 'Recent sends', historyEmpty: 'Nothing was sent yet.', linked: 'Telegram is connected', notLinked: 'Telegram is not connected',
    kinds: { invitation: 'Invitation', temporary_password: 'Temporary password', install_link: 'Install link', session_link: 'Link to a check' }, statuses: { sent: 'sent', failed: 'error', awaiting_start: 'waiting for "Start"' },
  },
  kk: {
    action: 'Telegram', title: 'Telegram арқылы жіберу', loading: 'Жүктелуде…', loadError: 'Арна деректерін жүктеу мүмкін болмады.', retry: 'Қайталау', close: 'Жабу', send: 'Жіберу', sending: 'Жіберілуде…',
    notConfigured: 'Telegram боты серверде әлі бапталмаған. Жүйе иесіне хабарласыңыз.', disabled: 'Ұйым үшін Telegram арқылы жіберу өшірулі.',
    disabledAdmin: 'Ұйым үшін Telegram арқылы жіберу өшірулі. Әкімші оны қосады.', enable: 'Telegram қосу', enableFailed: 'Арнаны қосу мүмкін болмады.',
    invitationHint: 'Адам бот чатына сілтеме алады. «Старт» басқаннан кейін шақыру чатқа келеді.',
    passwordHint: 'Жеке уақытша құпиясөз беріледі. Адам кірген кезде оны ауыстыруы тиіс.', passwordConfirm: 'Құпиясөз адамға Telegram арқылы баратынын түсінемін',
    sent: 'Хабар жіберілді.', failed: 'Жіберу мүмкін болмады', awaitingTitle: 'Адамға бот сілтемесін беріңіз',
    awaitingHint: 'Бот бірінші жаза алмайды. Адам сілтемені ашып, «Старт» басқанда хабар автоматты түрде келеді.', copy: 'Сілтемені көшіру', copied: 'Көшірілді', botLink: 'Бот сілтемесі', until: 'Жарамды',
    errors: { conflict: 'Қазір жіберу мүмкін емес: адам мәртебесін және арна баптауларын тексеріңіз.', tooMany: 'Тым жиі. Бір минут күтіңіз немесе күндік лимит таусылса ертеңге дейін күтіңіз.', notFound: 'Адам табылмады.', forbidden: 'Құқық жеткіліксіз.', other: 'Жіберу мүмкін болмады. Қайталап көріңіз.' },
    reasons: { blocked: 'адам ботты бұғаттады', chat_not_found: 'чат табылмады', rate_limited: 'Telegram күтуді сұрайды', network: 'Telegram-мен байланыс жоқ', rejected: 'Telegram хабарды қабылдамады', unavailable: 'хабар қазір қолжетімсіз' },
    history: 'Соңғы жіберулер', historyEmpty: 'Әлі ештеңе жіберілген жоқ.', linked: 'Telegram қосылған', notLinked: 'Telegram қосылмаған',
    kinds: { invitation: 'Шақыру', temporary_password: 'Уақытша құпиясөз', install_link: 'Орнату сілтемесі', session_link: 'Тексеруге сілтеме' }, statuses: { sent: 'жіберілді', failed: 'қате', awaiting_start: '«Старт» күтуде' },
  },
  zh: {
    action: 'Telegram', title: '通过 Telegram 发送', loading: '加载中…', loadError: '无法加载渠道数据。', retry: '重试', close: '关闭', send: '发送', sending: '发送中…',
    notConfigured: '服务器尚未配置 Telegram 机器人。请联系系统所有者。', disabled: '该组织已关闭 Telegram 发送。',
    disabledAdmin: '该组织已关闭 Telegram 发送。管理员可以开启。', enable: '开启 Telegram', enableFailed: '无法开启该渠道。',
    invitationHint: '对方会收到机器人聊天链接。点击“开始”后，邀请会发到聊天中。',
    passwordHint: '将发放个人临时密码。对方登录时必须修改。', passwordConfirm: '我了解密码将通过 Telegram 发给对方',
    sent: '消息已发送。', failed: '无法发送', awaitingTitle: '请把机器人链接交给对方',
    awaitingHint: '机器人不能先发消息。对方打开链接并点击“开始”后，消息会自动送达。', copy: '复制链接', copied: '已复制', botLink: '机器人链接', until: '有效期至',
    errors: { conflict: '现在无法发送：请检查对方状态和渠道设置。', tooMany: '过于频繁。请等待一分钟；如已用完每日上限，请明天再试。', notFound: '未找到此人。', forbidden: '权限不足。', other: '无法发送，请重试。' },
    reasons: { blocked: '对方已屏蔽机器人', chat_not_found: '未找到聊天', rate_limited: 'Telegram 要求稍候', network: '无法连接 Telegram', rejected: 'Telegram 拒绝了消息', unavailable: '消息暂时不可用' },
    history: '最近发送', historyEmpty: '尚未发送过。', linked: 'Telegram 已连接', notLinked: 'Telegram 未连接',
    kinds: { invitation: '邀请', temporary_password: '临时密码', install_link: '安装链接', session_link: '检查链接' }, statuses: { sent: '已发送', failed: '错误', awaiting_start: '等待“开始”' },
  },
};
