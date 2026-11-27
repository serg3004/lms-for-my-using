/** PR 357: the "install to the home screen" hint for the observer. */
type Texts = {
  title: string; androidText: string; iosText: string; install: string; dismiss: string;
  page: {
    heroTitle: string; heroText: string; title: string; installed: string; inApp: string; inAppAndroid: string; inAppIos: string; copyLink: string; copied: string;
    androidOffer: string; androidSteps: string; iosSteps: string; iosOtherBrowser: string; desktop: string; toLogin: string;
  };
  send: {
    menuItem: string; action: string; titleInstall: string; titleSession: string; hint: string; byEmail: string; byTelegram: string; sending: string; close: string;
    sentEmail: string; sentTelegram: string; failedMail: string; mailOff: string; noMailbox: string; notConnected: string;
  };
};

export const pwaResources: Record<'ru' | 'en' | 'kk' | 'zh', Texts> = {
  ru: { title: 'Установить на экран', androidText: 'Откройте проведение сессий как приложение, без адресной строки.', iosText: 'Нажмите «Поделиться» в Safari, затем «На экран Домой», и проведение сессий откроется как приложение.', install: 'Установить', dismiss: 'Не сейчас',
    page: {
      heroTitle: 'Приложение на телефон', heroText: 'Откройте проведение проверок как приложение, без адресной строки.', title: 'Установка приложения',
      installed: 'Приложение уже установлено. Откройте его с экрана «Домой».', inApp: 'Эта ссылка открыта внутри другого приложения, и установить отсюда нельзя. Откройте её в обычном браузере телефона.',
      inAppAndroid: 'Нажмите значок меню «⋮» и выберите «Открыть в Chrome» (или «Открыть в браузере»).', inAppIos: 'Нажмите значок компаса или «Поделиться» и выберите «Открыть в Safari».',
      copyLink: 'Копировать ссылку', copied: 'Скопировано', androidOffer: 'Нажмите кнопку, браузер попросит подтвердить установку.',
      androidSteps: 'Если кнопки нет: откройте меню браузера «⋮» и выберите «Установить приложение» или «Добавить на главный экран».',
      iosSteps: 'Нажмите «Поделиться» в Safari (квадрат со стрелкой), затем «На экран Домой» и «Добавить».', iosOtherBrowser: 'На iPhone добавить на экран «Домой» можно только из Safari. Откройте эту ссылку в Safari.',
      desktop: 'Откройте эту ссылку на телефоне. На компьютере в Chrome или Edge значок установки находится в адресной строке.', toLogin: 'Войти',
    },
    send: {
      menuItem: 'Отправить ссылку наблюдателю', action: 'Ссылка', titleInstall: 'Отправить ссылку на установку', titleSession: 'Отправить ссылку на проверку', hint: 'В сообщении только ссылка, без паролей. Проверка откроется после входа.',
      byEmail: 'Письмом', byTelegram: 'В Telegram', sending: 'Отправка…', close: 'Закрыть', sentEmail: 'Письмо отправлено.', sentTelegram: 'Сообщение отправлено в Telegram.',
      failedMail: 'Письмо не ушло. Попробуйте позже.', mailOff: 'Отправка писем на сервере не настроена.', noMailbox: 'У человека нет почты.', notConnected: 'У человека не подключён Telegram. Сначала отправьте ему ссылку на установку, она подключит Telegram.',
    },
  },
  en: { title: 'Install to your home screen', androidText: 'Open session conducting as an app, without the address bar.', iosText: 'Tap "Share" in Safari, then "Add to Home Screen", and session conducting opens like an app.', install: 'Install', dismiss: 'Not now',
    page: {
      heroTitle: 'The app on your phone', heroText: 'Open the checks as an app, without the address bar.', title: 'Install the app',
      installed: 'The app is already installed. Open it from your home screen.', inApp: 'This link is open inside another app, which cannot install it. Open it in the phone\'s regular browser.',
      inAppAndroid: 'Tap the menu icon "⋮" and choose "Open in Chrome" (or "Open in browser").', inAppIos: 'Tap the compass icon or "Share" and choose "Open in Safari".',
      copyLink: 'Copy link', copied: 'Copied', androidOffer: 'Tap the button, the browser will ask you to confirm.',
      androidSteps: 'If there is no button: open the browser menu "⋮" and choose "Install app" or "Add to Home screen".',
      iosSteps: 'Tap "Share" in Safari (the square with an arrow), then "Add to Home Screen" and "Add".', iosOtherBrowser: 'On an iPhone the app can be added to the Home Screen only from Safari. Open this link in Safari.',
      desktop: 'Open this link on your phone. On a computer in Chrome or Edge the install icon is in the address bar.', toLogin: 'Sign in',
    },
    send: {
      menuItem: 'Send the link to the observer', action: 'Link', titleInstall: 'Send the install link', titleSession: 'Send the link to the check', hint: 'The message has only a link, no passwords. The check opens after signing in.',
      byEmail: 'By e-mail', byTelegram: 'Via Telegram', sending: 'Sending…', close: 'Close', sentEmail: 'The e-mail was sent.', sentTelegram: 'The message was sent to Telegram.',
      failedMail: 'The e-mail was not sent. Try later.', mailOff: 'E-mail delivery is not set up on the server.', noMailbox: 'The person has no mailbox.', notConnected: 'The person has not connected Telegram. Send the install link first, it connects Telegram.',
    },
  },
  kk: { title: 'Басты экранға орнату', androidText: 'Сессияларды өткізуді мекенжай жолынсыз, қолданба ретінде ашыңыз.', iosText: 'Safari-де «Бөлісу» түймесін, содан кейін «Басты экранға қосу» таңдаңыз, сессияларды өткізу қолданба ретінде ашылады.', install: 'Орнату', dismiss: 'Қазір емес',
    page: {
      heroTitle: 'Телефондағы қолданба', heroText: 'Тексерулерді мекенжай жолынсыз, қолданба ретінде ашыңыз.', title: 'Қолданбаны орнату',
      installed: 'Қолданба орнатылып қойған. Оны «Басты» экраннан ашыңыз.', inApp: 'Бұл сілтеме басқа қолданбаның ішінде ашылды, мұнда орнату мүмкін емес. Оны телефонның әдеттегі браузерінде ашыңыз.',
      inAppAndroid: '«⋮» мәзір белгішесін басып, «Chrome-да ашу» (немесе «Браузерде ашу») таңдаңыз.', inAppIos: 'Компас белгішесін немесе «Бөлісу» түймесін басып, «Safari-де ашу» таңдаңыз.',
      copyLink: 'Сілтемені көшіру', copied: 'Көшірілді', androidOffer: 'Түймені басыңыз, браузер орнатуды растауды сұрайды.',
      androidSteps: 'Түйме болмаса: браузер мәзірін «⋮» ашып, «Қолданбаны орнату» немесе «Басты экранға қосу» таңдаңыз.',
      iosSteps: 'Safari-де «Бөлісу» (көрсеткісі бар шаршы) түймесін, содан кейін «Басты экранға қосу» және «Қосу» таңдаңыз.', iosOtherBrowser: 'iPhone-да «Басты» экранға тек Safari арқылы қосуға болады. Бұл сілтемені Safari-де ашыңыз.',
      desktop: 'Бұл сілтемені телефонда ашыңыз. Компьютерде Chrome немесе Edge-те орнату белгішесі мекенжай жолында тұрады.', toLogin: 'Кіру',
    },
    send: {
      menuItem: 'Сілтемені бақылаушыға жіберу', action: 'Сілтеме', titleInstall: 'Орнату сілтемесін жіберу', titleSession: 'Тексеруге сілтемені жіберу', hint: 'Хабарда тек сілтеме бар, құпиясөздер жоқ. Тексеру кіргеннен кейін ашылады.',
      byEmail: 'Хатпен', byTelegram: 'Telegram арқылы', sending: 'Жіберілуде…', close: 'Жабу', sentEmail: 'Хат жіберілді.', sentTelegram: 'Хабар Telegram-ға жіберілді.',
      failedMail: 'Хат жіберілмеді. Кейінірек қайталаңыз.', mailOff: 'Серверде хат жіберу бапталмаған.', noMailbox: 'Адамның поштасы жоқ.', notConnected: 'Адам Telegram-ды қоспаған. Алдымен орнату сілтемесін жіберіңіз, ол Telegram-ды қосады.',
    },
  },
  zh: { title: '添加到主屏幕', androidText: '以应用方式打开检查会话，不显示地址栏。', iosText: '在 Safari 中点按“分享”，再选择“添加到主屏幕”，即可像应用一样打开检查会话。', install: '安装', dismiss: '以后再说',
    page: {
      heroTitle: '手机上的应用', heroText: '以应用方式打开检查，不显示地址栏。', title: '安装应用',
      installed: '应用已安装。请从主屏幕打开。', inApp: '此链接在其他应用内打开，无法在这里安装。请在手机自带的浏览器中打开。',
      inAppAndroid: '点按菜单图标“⋮”，选择“在 Chrome 中打开”（或“在浏览器中打开”）。', inAppIos: '点按指南针图标或“分享”，选择“在 Safari 中打开”。',
      copyLink: '复制链接', copied: '已复制', androidOffer: '点按按钮，浏览器会请您确认安装。',
      androidSteps: '如果没有按钮：打开浏览器菜单“⋮”，选择“安装应用”或“添加到主屏幕”。',
      iosSteps: '在 Safari 中点按“分享”（带箭头的方框），再选择“添加到主屏幕”和“添加”。', iosOtherBrowser: '在 iPhone 上只有 Safari 可以添加到主屏幕。请在 Safari 中打开此链接。',
      desktop: '请在手机上打开此链接。在电脑的 Chrome 或 Edge 中，安装图标在地址栏里。', toLogin: '登录',
    },
    send: {
      menuItem: '向观察员发送链接', action: '链接', titleInstall: '发送安装链接', titleSession: '发送检查链接', hint: '消息中只有链接，没有密码。登录后会打开检查。',
      byEmail: '发邮件', byTelegram: '通过 Telegram', sending: '发送中…', close: '关闭', sentEmail: '邮件已发送。', sentTelegram: '消息已发送到 Telegram。',
      failedMail: '邮件未发出，请稍后再试。', mailOff: '服务器尚未配置邮件发送。', noMailbox: '此人没有邮箱。', notConnected: '此人尚未连接 Telegram。请先发送安装链接，它会连接 Telegram。',
    },
  },
};
