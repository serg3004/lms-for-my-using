/** PR 357: the "install to the home screen" hint for the observer. */
type Texts = { title: string; androidText: string; iosText: string; install: string; dismiss: string };

export const pwaResources: Record<'ru' | 'en' | 'kk' | 'zh', Texts> = {
  ru: { title: 'Установить на экран', androidText: 'Откройте проведение сессий как приложение, без адресной строки.', iosText: 'Нажмите «Поделиться» в Safari, затем «На экран Домой», и проведение сессий откроется как приложение.', install: 'Установить', dismiss: 'Не сейчас' },
  en: { title: 'Install to your home screen', androidText: 'Open session conducting as an app, without the address bar.', iosText: 'Tap "Share" in Safari, then "Add to Home Screen", and session conducting opens like an app.', install: 'Install', dismiss: 'Not now' },
  kk: { title: 'Басты экранға орнату', androidText: 'Сессияларды өткізуді мекенжай жолынсыз, қолданба ретінде ашыңыз.', iosText: 'Safari-де «Бөлісу» түймесін, содан кейін «Басты экранға қосу» таңдаңыз, сессияларды өткізу қолданба ретінде ашылады.', install: 'Орнату', dismiss: 'Қазір емес' },
  zh: { title: '添加到主屏幕', androidText: '以应用方式打开检查会话，不显示地址栏。', iosText: '在 Safari 中点按“分享”，再选择“添加到主屏幕”，即可像应用一样打开检查会话。', install: '安装', dismiss: '以后再说' },
};
