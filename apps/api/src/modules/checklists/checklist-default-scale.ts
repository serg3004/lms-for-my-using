export type DefaultScaleLocale = 'ru' | 'en' | 'kk' | 'zh';

type Localized = Record<DefaultScaleLocale, string>;

const NAME: Localized = { ru: 'Да/Нет', en: 'Yes/No', kk: 'Иә/Жоқ', zh: '是/否' };
const NO: Localized = { ru: 'Нет', en: 'No', kk: 'Жоқ', zh: '否' };
const YES: Localized = { ru: 'Да', en: 'Yes', kk: 'Иә', zh: '是' };

/** Stored text is fixed at creation, so it follows the language of whoever first opens the scale library. */
export function defaultScaleDefinition(locale: string | null | undefined) {
  const key: DefaultScaleLocale = locale === 'en' || locale === 'kk' || locale === 'zh' ? locale : 'ru';
  return {
    name: NAME[key],
    levels: [
      { value: 1, label: NO[key], score: 0 },
      { value: 2, label: YES[key], score: 100 },
    ],
  };
}
