import { resolveInvitationLocale, type InvitationLocale } from './user-invitation.js';

type Texts = { subject: string; body: (firstName: string, minutes: number) => string };

/** PR 493: the notice sent when too many failed sign-ins lock the account. It has no link, no address and no password. */
const texts: Record<InvitationLocale, Texts> = {
  ru: {
    subject: 'Вход в вашу учётную запись временно закрыт',
    body: (firstName, minutes) => `Здравствуйте, ${firstName}!\n\nВ вашу учётную запись несколько раз пытались войти с неверным паролем. Вход закрыт на ${minutes} мин.\n\nЕсли это были вы, подождите и попробуйте снова. Если нет, сообщите администратору вашей организации.`,
  },
  en: {
    subject: 'Sign-in to your account is temporarily blocked',
    body: (firstName, minutes) => `Hello, ${firstName}!\n\nThere were several attempts to sign in to your account with a wrong password. Sign-in is blocked for ${minutes} min.\n\nIf it was you, wait and try again. If not, tell your organization administrator.`,
  },
  kk: {
    subject: 'Тіркелгіңізге кіру уақытша жабылды',
    body: (firstName, minutes) => `Сәлеметсіз бе, ${firstName}!\n\nТіркелгіңізге қате құпия сөзбен бірнеше рет кіруге әрекет жасалды. Кіру ${minutes} мин жабылды.\n\nЕгер бұл сіз болсаңыз, күтіп, қайта көріңіз. Болмасаңыз, ұйымыңыздың әкімшісіне хабарлаңыз.`,
  },
  zh: {
    subject: '您的账户已被暂时锁定登录',
    body: (firstName, minutes) => `${firstName}，您好！\n\n有人多次使用错误密码尝试登录您的账户，登录已被锁定 ${minutes} 分钟。\n\n如果是您本人，请稍后再试。如果不是，请告知您所在组织的管理员。`,
  },
};

export function buildLoginLockedMail(locale: string | null | undefined, params: { firstName: string; minutes: number }) {
  const language = resolveInvitationLocale(locale);
  return { subject: texts[language].subject, text: texts[language].body(params.firstName, params.minutes) };
}
