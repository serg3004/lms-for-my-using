/** PR 573, 577: the theme menu: light / dark / follow the device. */
type Texts = { light: string; dark: string; system: string; menuLabel: string; switchLabel: string; appliedNow: string };

export const themeResources: Record<'ru' | 'en' | 'kk' | 'zh', Texts> = {
  ru: { light: 'Светлая', dark: 'Тёмная', system: 'Как на устройстве', menuLabel: 'Тема', switchLabel: 'Тема оформления: {{mode}}', appliedNow: 'сейчас {{theme}}' },
  en: { light: 'Light', dark: 'Dark', system: 'Same as device', menuLabel: 'Theme', switchLabel: 'Theme: {{mode}}', appliedNow: 'now {{theme}}' },
  kk: { light: 'Ашық', dark: 'Қараңғы', system: 'Құрылғыдағыдай', menuLabel: 'Тақырып', switchLabel: 'Тақырып: {{mode}}', appliedNow: 'қазір {{theme}}' },
  zh: { light: '浅色', dark: '深色', system: '跟随设备', menuLabel: '主题', switchLabel: '主题：{{mode}}', appliedNow: '当前：{{theme}}' },
};
