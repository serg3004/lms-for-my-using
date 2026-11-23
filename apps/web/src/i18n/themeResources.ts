/** PR 573: the light / dark / system theme switch. */
type Texts = { light: string; dark: string; system: string; switchLabel: string };

export const themeResources: Record<'ru' | 'en' | 'kk' | 'zh', Texts> = {
  ru: { light: 'Светлая', dark: 'Тёмная', system: 'Как в системе', switchLabel: 'Тема оформления: {{mode}}. Нажмите, чтобы сменить' },
  en: { light: 'Light', dark: 'Dark', system: 'System', switchLabel: 'Theme: {{mode}}. Press to change' },
  kk: { light: 'Ашық', dark: 'Қараңғы', system: 'Жүйедегідей', switchLabel: 'Тақырып: {{mode}}. Ауыстыру үшін басыңыз' },
  zh: { light: '浅色', dark: '深色', system: '跟随系统', switchLabel: '主题：{{mode}}。点击切换' },
};
