import { resolveInvitationLocale, type InvitationLocale } from './user-invitation.js';

type Texts = { subject: string; body: (firstName: string, when: string) => string };

/** PR 488: the notice sent after a user changes their own password, in the user's language. It has no link and no password. */
const texts: Record<InvitationLocale, Texts> = {
  ru: {
    subject: 'Пароль изменён',
    body: (firstName, when) => `Здравствуйте, ${firstName}!\n\nВаш пароль был изменён ${when}. Остальные устройства вышли из системы.\n\nЕсли это были не вы, сразу обратитесь к администратору вашей организации.`,
  },
  en: {
    subject: 'Your password was changed',
    body: (firstName, when) => `Hello, ${firstName}!\n\nYour password was changed on ${when}. Your other devices were signed out.\n\nIf this was not you, contact your organization administrator right away.`,
  },
  kk: {
    subject: 'Құпия сөз өзгертілді',
    body: (firstName, when) => `Сәлеметсіз бе, ${firstName}!\n\nСіздің құпия сөзіңіз ${when} өзгертілді. Басқа құрылғылар жүйеден шықты.\n\nЕгер бұл сіз болмасаңыз, ұйымыңыздың әкімшісіне дереу хабарласыңыз.`,
  },
  zh: {
    subject: '您的密码已更改',
    body: (firstName, when) => `${firstName}，您好！\n\n您的密码已于 ${when} 更改，其他设备已退出登录。\n\n如果这不是您本人的操作，请立即联系您所在组织的管理员。`,
  },
};

export function buildPasswordChangedMail(locale: string | null | undefined, params: { firstName: string; at: Date }) {
  const language = resolveInvitationLocale(locale);
  const when = params.at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  return { subject: texts[language].subject, text: texts[language].body(params.firstName, when) };
}
