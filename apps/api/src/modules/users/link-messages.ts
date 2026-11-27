import { resolveMessageLocale, type MessageLocale } from './telegram-messages.js';

/**
 * PR 572: texts of the two link messages (install the app, open one check), the same for the e-mail and the Telegram
 * bot. A text carries a link and the first name only: no password, no code, no data of other people.
 */
type Texts = {
  installSubject: string;
  sessionSubject: string;
  install: (p: { firstName: string; link: string }) => string;
  session: (p: { firstName: string; link: string }) => string;
};

const texts: Record<MessageLocale, Texts> = {
  ru: {
    installSubject: 'Установка приложения',
    sessionSubject: 'Вам назначена проверка',
    install: ({ firstName, link }) =>
      `Здравствуйте, ${firstName}!\n\nОткройте ссылку на телефоне: страница покажет, как установить приложение на экран «Домой»:\n${link}\n\nЕсли ссылка открылась внутри Telegram или почтового приложения, выберите «Открыть в браузере».`,
    session: ({ firstName, link }) =>
      `Здравствуйте, ${firstName}!\n\nВам назначена проверка. Откройте ссылку и войдите, нужный экран откроется сразу после входа:\n${link}\n\nЕсли ссылка открылась внутри Telegram или почтового приложения, выберите «Открыть в браузере».`,
  },
  en: {
    installSubject: 'Install the app',
    sessionSubject: 'A check is assigned to you',
    install: ({ firstName, link }) =>
      `Hello, ${firstName}!\n\nOpen the link on your phone: the page shows how to put the app on your home screen:\n${link}\n\nIf the link opened inside Telegram or a mail app, choose "Open in browser".`,
    session: ({ firstName, link }) =>
      `Hello, ${firstName}!\n\nA check is assigned to you. Open the link and sign in, the right screen opens right after signing in:\n${link}\n\nIf the link opened inside Telegram or a mail app, choose "Open in browser".`,
  },
  kk: {
    installSubject: 'Қолданбаны орнату',
    sessionSubject: 'Сізге тексеру тағайындалды',
    install: ({ firstName, link }) =>
      `Сәлеметсіз бе, ${firstName}!\n\nСілтемені телефонда ашыңыз: бет қолданбаны «Басты» экранға қалай орнату керегін көрсетеді:\n${link}\n\nСілтеме Telegram немесе пошта қолданбасының ішінде ашылса, «Браузерде ашу» таңдаңыз.`,
    session: ({ firstName, link }) =>
      `Сәлеметсіз бе, ${firstName}!\n\nСізге тексеру тағайындалды. Сілтемені ашып, жүйеге кіріңіз, қажетті экран кіргеннен кейін бірден ашылады:\n${link}\n\nСілтеме Telegram немесе пошта қолданбасының ішінде ашылса, «Браузерде ашу» таңдаңыз.`,
  },
  zh: {
    installSubject: '安装应用',
    sessionSubject: '已为您分配一项检查',
    install: ({ firstName, link }) =>
      `${firstName}，您好！\n\n请在手机上打开链接：页面会说明如何把应用添加到主屏幕：\n${link}\n\n如果链接在 Telegram 或邮件应用内打开，请选择“在浏览器中打开”。`,
    session: ({ firstName, link }) =>
      `${firstName}，您好！\n\n已为您分配一项检查。请打开链接并登录，登录后会直接进入对应页面：\n${link}\n\n如果链接在 Telegram 或邮件应用内打开，请选择“在浏览器中打开”。`,
  },
};

export function linkTexts(locale: string | null | undefined): Texts {
  return texts[resolveMessageLocale(locale)];
}
