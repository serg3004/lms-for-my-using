import { createHash, randomBytes } from 'node:crypto';

export const invitationLifetimeDays = 7;
export const invitationLifetimeMs = invitationLifetimeDays * 24 * 60 * 60 * 1000;

export function createInvitationToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export type InvitationLocale = 'ru' | 'en' | 'kk' | 'zh';
export type InvitationMailParams = { firstName: string; organizationName: string; link: string; days: number };

type InvitationTexts = {
  subject: (organizationName: string) => string;
  body: (params: InvitationMailParams) => string;
};

/** The language of the person who is invited (`User.locale`), never the language of the administrator. */
const texts: Record<InvitationLocale, InvitationTexts> = {
  ru: {
    subject: (organization) => `Приглашение в ${organization}`,
    body: ({ firstName, organizationName, link, days }) =>
      `Здравствуйте, ${firstName}!\n\nВас пригласили в «${organizationName}». Чтобы войти, перейдите по ссылке и задайте пароль (ссылка действует ${days} дн.):\n${link}\n\nЕсли ссылка не работает или письмо пришло по ошибке, обратитесь к администратору вашей организации.`,
  },
  en: {
    subject: (organization) => `Invitation to ${organization}`,
    body: ({ firstName, organizationName, link, days }) =>
      `Hello, ${firstName}!\n\nYou have been invited to "${organizationName}". Follow the link and set your password to sign in (the link is valid for ${days} days):\n${link}\n\nIf the link does not work or you received this email by mistake, contact your organization administrator.`,
  },
  kk: {
    subject: (organization) => `${organization} ұйымына шақыру`,
    body: ({ firstName, organizationName, link, days }) =>
      `Сәлеметсіз бе, ${firstName}!\n\nСізді «${organizationName}» ұйымына шақырды. Кіру үшін сілтемені ашып, құпиясөз орнатыңыз (сілтеме ${days} күн жарамды):\n${link}\n\nСілтеме жұмыс істемесе немесе хат қателесіп келсе, ұйымыңыздың әкімшісіне хабарласыңыз.`,
  },
  zh: {
    subject: (organization) => `邀请您加入 ${organization}`,
    body: ({ firstName, organizationName, link, days }) =>
      `${firstName}，您好！\n\n您已被邀请加入“${organizationName}”。请打开链接并设置密码后登录（链接 ${days} 天内有效）：\n${link}\n\n如果链接无法使用，或您误收了此邮件，请联系所在组织的管理员。`,
  },
};

export function resolveInvitationLocale(locale: string | null | undefined): InvitationLocale {
  const code = (locale ?? '').toLowerCase().slice(0, 2);
  return code === 'en' || code === 'kk' || code === 'zh' ? code : 'ru';
}

export function buildInvitationMail(locale: string | null | undefined, params: InvitationMailParams) {
  const language = texts[resolveInvitationLocale(locale)];
  return { subject: language.subject(params.organizationName), text: language.body(params) };
}
