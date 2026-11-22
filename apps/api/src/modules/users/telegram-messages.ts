/**
 * PR 503: texts the Telegram bot sends. Short, in the language of the person (`User.locale`), and with no more
 * personal data than the first name. The link or the password is the only secret a text may carry.
 */
export type MessageLocale = 'ru' | 'en' | 'kk' | 'zh';

export function resolveMessageLocale(locale: string | null | undefined): MessageLocale {
  const code = (locale ?? '').toLowerCase().slice(0, 2);
  return code === 'en' || code === 'kk' || code === 'zh' ? code : 'ru';
}

type Texts = {
  bound: (firstName: string) => string;
  invalidLink: string;
  invitation: (p: { firstName: string; organizationName: string; link: string; days: number }) => string;
  activation: (p: { firstName: string; organizationName: string; link: string; organization: string }) => string;
  temporaryPassword: (p: { firstName: string; organizationName: string; link: string; password: string; days: number }) => string;
};

const texts: Record<MessageLocale, Texts> = {
  ru: {
    bound: (name) => `${name}, Telegram подключён. Дальше всё придёт сюда.`,
    invalidLink: 'Ссылка недействительна или устарела. Попросите администратора отправить новую.',
    invitation: ({ firstName, organizationName, link, days }) =>
      `Здравствуйте, ${firstName}!\n\nВас пригласили в «${organizationName}». Откройте ссылку и задайте пароль (действует ${days} дн.):\n${link}\n\nЕсли это письмо пришло по ошибке, обратитесь к администратору.`,
    activation: ({ firstName, organizationName, link, organization }) =>
      `Здравствуйте, ${firstName}!\n\nВас добавили в «${organizationName}». Откройте страницу активации и введите организацию «${organization}», табельный номер и ФИО, как в вашей карточке, затем задайте пароль:\n${link}`,
    temporaryPassword: ({ firstName, organizationName, link, password, days }) =>
      `Здравствуйте, ${firstName}!\n\nВременный пароль для «${organizationName}»: ${password}\nВойдите по ссылке и сразу выберите свой пароль (временный действует ${days} дн.):\n${link}\n\nНе пересылайте это сообщение. Удалите его после входа.`,
  },
  en: {
    bound: (name) => `${name}, Telegram is connected. Everything else will arrive here.`,
    invalidLink: 'The link is invalid or has expired. Ask your administrator to send a new one.',
    invitation: ({ firstName, organizationName, link, days }) =>
      `Hello, ${firstName}!\n\nYou have been invited to "${organizationName}". Open the link and set your password (valid for ${days} days):\n${link}\n\nIf this message reached you by mistake, contact your administrator.`,
    activation: ({ firstName, organizationName, link, organization }) =>
      `Hello, ${firstName}!\n\nYou have been added to "${organizationName}". Open the activation page and enter the organization "${organization}", your employee number and full name as in your card, then set a password:\n${link}`,
    temporaryPassword: ({ firstName, organizationName, link, password, days }) =>
      `Hello, ${firstName}!\n\nTemporary password for "${organizationName}": ${password}\nSign in with the link and choose your own password right away (the temporary one is valid for ${days} days):\n${link}\n\nDo not forward this message. Delete it after signing in.`,
  },
  kk: {
    bound: (name) => `${name}, Telegram қосылды. Қалғаны осында келеді.`,
    invalidLink: 'Сілтеме жарамсыз немесе мерзімі өтті. Әкімшіден жаңасын жіберуін сұраңыз.',
    invitation: ({ firstName, organizationName, link, days }) =>
      `Сәлеметсіз бе, ${firstName}!\n\nСізді «${organizationName}» ұйымына шақырды. Сілтемені ашып, құпиясөз орнатыңыз (${days} күн жарамды):\n${link}\n\nХабар қателесіп келсе, әкімшіге хабарласыңыз.`,
    activation: ({ firstName, organizationName, link, organization }) =>
      `Сәлеметсіз бе, ${firstName}!\n\nСізді «${organizationName}» ұйымына қосты. Белсендіру бетін ашып, «${organization}» ұйымын, табель нөмірін және аты-жөніңізді карточкадағыдай енгізіңіз, содан кейін құпиясөз орнатыңыз:\n${link}`,
    temporaryPassword: ({ firstName, organizationName, link, password, days }) =>
      `Сәлеметсіз бе, ${firstName}!\n\n«${organizationName}» үшін уақытша құпиясөз: ${password}\nСілтеме арқылы кіріп, өз құпиясөзіңізді бірден таңдаңыз (уақытша құпиясөз ${days} күн жарамды):\n${link}\n\nБұл хабарды басқаға жібермеңіз. Кіргеннен кейін жойыңыз.`,
  },
  zh: {
    bound: (name) => `${name}，Telegram 已连接。后续消息会发到这里。`,
    invalidLink: '链接无效或已过期。请联系管理员重新发送。',
    invitation: ({ firstName, organizationName, link, days }) =>
      `${firstName}，您好！\n\n您已被邀请加入“${organizationName}”。请打开链接并设置密码（${days} 天内有效）：\n${link}\n\n如果您误收了此消息，请联系管理员。`,
    activation: ({ firstName, organizationName, link, organization }) =>
      `${firstName}，您好！\n\n您已被添加到“${organizationName}”。请打开激活页面，填写组织“${organization}”、工号和与资料卡一致的姓名，然后设置密码：\n${link}`,
    temporaryPassword: ({ firstName, organizationName, link, password, days }) =>
      `${firstName}，您好！\n\n“${organizationName}”的临时密码：${password}\n请通过链接登录并立即设置自己的密码（临时密码 ${days} 天内有效）：\n${link}\n\n请勿转发此消息，登录后请删除。`,
  },
};

export function messageTexts(locale: string | null | undefined): Texts {
  return texts[resolveMessageLocale(locale)];
}
