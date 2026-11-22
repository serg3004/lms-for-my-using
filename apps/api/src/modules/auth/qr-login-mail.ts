import { resolveInvitationLocale, type InvitationLocale } from './user-invitation.js';

type Texts = { subject: string; body: (firstName: string, device: string) => string };

/** PR 505: the notice sent after a sign-in by QR. It has no link, no code and no address. */
const texts: Record<InvitationLocale, Texts> = {
  ru: {
    subject: 'Выполнен вход по QR-коду',
    body: (firstName, device) => `Здравствуйте, ${firstName}!\n\nВы подтвердили вход по QR-коду на устройстве: ${device}.\n\nЕсли это были не вы, откройте «Мои устройства» в профиле, завершите этот сеанс и смените пароль.`,
  },
  en: {
    subject: 'Signed in with a QR code',
    body: (firstName, device) => `Hello, ${firstName}!\n\nYou confirmed a sign-in by QR code on this device: ${device}.\n\nIf it was not you, open "My devices" in your profile, end this session and change your password.`,
  },
  kk: {
    subject: 'QR-код арқылы кіру орындалды',
    body: (firstName, device) => `Сәлеметсіз бе, ${firstName}!\n\nСіз мына құрылғыда QR-код арқылы кіруді растадыңыз: ${device}.\n\nЕгер бұл сіз болмасаңыз, профильдегі «Құрылғыларым» бөлімін ашып, сеансты аяқтаңыз және құпиясөзді ауыстырыңыз.`,
  },
  zh: {
    subject: '已通过二维码登录',
    body: (firstName, device) => `${firstName}，您好！\n\n您已确认在以下设备上通过二维码登录：${device}。\n\n如果不是您本人，请在个人资料中打开“我的设备”，结束该会话并修改密码。`,
  },
};

export function buildQrLoginMail(locale: string | null | undefined, params: { firstName: string; device: string }) {
  const language = resolveInvitationLocale(locale);
  return { subject: texts[language].subject, text: texts[language].body(params.firstName, params.device) };
}
