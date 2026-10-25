import { randomUUID } from 'node:crypto';

import type { ContextField, ScaleLevel } from './checklists.schemas.js';

export type TemplateLocale = 'ru' | 'en' | 'kk' | 'zh';
type Localized = Record<TemplateLocale, string>;

/** Built-in starter sheets (PR 341). Code, not data: no migration and nothing tenant-owned to keep in sync. */
type TemplateItem = { text: Localized; photoRequired?: boolean };
type TemplateGroup = { title: Localized; items: TemplateItem[] };
type TemplateDefinition = {
  key: string;
  title: Localized;
  description: Localized;
  scoringMode: 'sum_points' | 'all_required' | 'scale';
  passThreshold: number;
  scaleLevels?: Array<{ label: Localized; points: number }>;
  contextFields: Array<{ label: Localized; type: ContextField['type']; required: boolean }>;
  groups: TemplateGroup[];
};

const L = (ru: string, en: string, kk: string, zh: string): Localized => ({ ru, en, kk, zh });
const item = (ru: string, en: string, kk: string, zh: string, photoRequired = false): TemplateItem => ({ text: L(ru, en, kk, zh), photoRequired });

export const CHECKLIST_TEMPLATES: TemplateDefinition[] = [
  {
    key: 'consultant-assessment',
    title: L('Оценка консультанта', 'Sales consultant assessment', 'Консультантты бағалау', '销售顾问评估'),
    description: L('Наблюдение за работой консультанта с клиентом: от встречи до завершения разговора.', 'Observation of a consultant working with a customer, from the greeting to the close.', 'Консультанттың клиентпен жұмысын бақылау: амандасудан әңгімені аяқтауға дейін.', '观察顾问接待顾客的全过程：从问候到结束交谈。'),
    scoringMode: 'scale',
    passThreshold: 70,
    scaleLevels: [
      { label: L('Не выполнено', 'Not done', 'Орындалмады', '未完成'), points: 0 },
      { label: L('Частично', 'Partly', 'Ішінара', '部分完成'), points: 50 },
      { label: L('Выполнено', 'Done', 'Орындалды', '已完成'), points: 100 },
    ],
    contextFields: [
      { label: L('Точка / магазин', 'Store / location', 'Нүкте / дүкен', '门店 / 地点'), type: 'text', required: true },
      { label: L('Дата наблюдения', 'Observation date', 'Бақылау күні', '观察日期'), type: 'date', required: true },
    ],
    groups: [
      { title: L('Встреча клиента', 'Greeting', 'Клиентті қарсы алу', '迎接顾客'), items: [
        item('Поприветствовал клиента в течение 10 секунд', 'Greeted the customer within 10 seconds', 'Клиентпен 10 секунд ішінде амандасты', '在10秒内问候了顾客'),
        item('Установил зрительный контакт и улыбнулся', 'Made eye contact and smiled', 'Көзбен байланыс орнатып, күлімдеді', '保持眼神交流并微笑'),
        item('Представился и предложил помощь', 'Introduced themselves and offered help', 'Өзін таныстырып, көмек ұсынды', '自我介绍并主动提供帮助'),
      ] },
      { title: L('Выявление потребностей', 'Needs discovery', 'Қажеттіліктерді анықтау', '了解需求'), items: [
        item('Задал открытые вопросы', 'Asked open questions', 'Ашық сұрақтар қойды', '提出了开放式问题'),
        item('Выяснил бюджет и сроки покупки', 'Learned the budget and timing', 'Бюджет пен сатып алу мерзімін анықтады', '了解了预算和购买时间'),
        item('Резюмировал потребность клиента', 'Summarised the customer need', 'Клиенттің қажеттілігін қорытындылады', '总结了顾客的需求'),
      ] },
      { title: L('Презентация и возражения', 'Presentation and objections', 'Таныстырылым және қарсылықтар', '介绍与异议处理'), items: [
        item('Предложил решение под потребность клиента', 'Offered a solution fitting the need', 'Клиенттің қажеттілігіне сай шешім ұсынды', '针对顾客需求提出了解决方案'),
        item('Назвал выгоды, а не только характеристики', 'Named benefits, not only features', 'Тек сипаттамаларды емес, артықшылықтарды атады', '不仅介绍了特点，还讲明了好处'),
        item('Спокойно отработал возражения', 'Handled objections calmly', 'Қарсылықтарды сабырмен өңдеді', '冷静地处理了顾客异议'),
      ] },
      { title: L('Завершение', 'Close', 'Аяқтау', '结束'), items: [
        item('Предложил сопутствующий товар', 'Suggested a complementary product', 'Қосымша тауар ұсынды', '推荐了搭配商品'),
        item('Подвёл итог и договорился о следующем шаге', 'Summarised and agreed the next step', 'Қорытынды шығарып, келесі қадамды келісті', '做了总结并约定下一步'),
        item('Поблагодарил клиента', 'Thanked the customer', 'Клиентке алғыс айтты', '感谢了顾客'),
      ] },
    ],
  },
  {
    key: 'shift-opening',
    title: L('Открытие смены', 'Shift opening', 'Ауысымды ашу', '开班检查'),
    description: L('Проверка готовности точки к началу работы.', 'Check that the location is ready to start work.', 'Нүктенің жұмысқа дайындығын тексеру.', '检查门店是否已做好开始营业的准备。'),
    scoringMode: 'sum_points',
    passThreshold: 90,
    contextFields: [{ label: L('Точка', 'Location', 'Нүкте', '地点'), type: 'text', required: true }],
    groups: [
      { title: L('Зал и оборудование', 'Floor and equipment', 'Зал және жабдық', '营业区与设备'), items: [
        item('Включены освещение и оборудование', 'Lighting and equipment are on', 'Жарық пен жабдық қосылған', '照明和设备已开启'),
        item('Чистота зала и витрин', 'The floor and displays are clean', 'Зал мен витриналардың тазалығы', '营业区和展柜整洁', true),
        item('Касса исправна, размен на месте', 'The till works and change is in place', 'Касса жұмыс істейді, ұсақ ақша бар', '收银机正常，零钱已备好'),
      ] },
      { title: L('Товар и витрины', 'Goods and displays', 'Тауар және витриналар', '商品与陈列'), items: [
        item('Выкладка соответствует планограмме', 'The layout matches the planogram', 'Тауар қойылымы планограммаға сәйкес', '陈列符合陈列图', true),
        item('Ценники актуальны', 'Price tags are up to date', 'Бағалар өзекті', '价签为最新'),
        item('Нет просроченного товара', 'There are no expired goods', 'Мерзімі өткен тауар жоқ', '没有过期商品'),
      ] },
      { title: L('Команда', 'Team', 'Команда', '团队'), items: [
        item('Сотрудники в форме и на местах', 'Staff are in uniform and at their posts', 'Қызметкерлер форма киіп, орнында', '员工着工装并在岗'),
        item('Проведён короткий инструктаж', 'A short briefing was held', 'Қысқа нұсқаулық өткізілді', '已进行简短的工作交代'),
      ] },
    ],
  },
  {
    key: 'workplace-safety',
    title: L('Проверка безопасности рабочего места', 'Workplace safety check', 'Жұмыс орнының қауіпсіздігін тексеру', '工作场所安全检查'),
    description: L('Все пункты обязательны: лист пройден, только если выполнено всё.', 'Every item is required: the sheet is passed only if everything is done.', 'Барлық тармақ міндетті: бәрі орындалғанда ғана парақ өтілген болып саналады.', '所有项目均为必填：只有全部完成才算通过。'),
    scoringMode: 'all_required',
    passThreshold: 100,
    contextFields: [{ label: L('Участок', 'Area', 'Учаске', '区域'), type: 'text', required: true }],
    groups: [
      { title: L('Проходы и пожарная безопасность', 'Aisles and fire safety', 'Өтетін жолдар және өрт қауіпсіздігі', '通道与消防安全'), items: [
        item('Эвакуационные выходы свободны', 'Emergency exits are clear', 'Эвакуациялық шығулар бос', '疏散出口畅通', true),
        item('Огнетушители на местах и опломбированы', 'Fire extinguishers are in place and sealed', 'Өрт сөндіргіштер орнында және пломбаланған', '灭火器在位且已铅封', true),
        item('Проходы не загромождены', 'Aisles are not obstructed', 'Өтетін жолдар бөгелмеген', '通道无堵塞'),
      ] },
      { title: L('Электрика и оборудование', 'Electrics and equipment', 'Электр және жабдық', '电气与设备'), items: [
        item('Провода и розетки без повреждений', 'Cables and sockets are undamaged', 'Сымдар мен розеткалар зақымдалмаған', '电线和插座无损坏'),
        item('Оборудование исправно и имеет допуск', 'Equipment works and is approved for use', 'Жабдық жарамды және рұқсаты бар', '设备完好并已获准使用'),
      ] },
      { title: L('Личная защита', 'Personal protection', 'Жеке қорғаныс', '个人防护'), items: [
        item('СИЗ выданы и применяются', 'Protective equipment is issued and used', 'ЖҚҚ берілген және қолданылады', '已发放并正确使用防护用品'),
        item('Аптечка укомплектована', 'The first-aid kit is complete', 'Дәрі қобдишасы толық жиынтықталған', '急救箱配备齐全'),
      ] },
    ],
  },
];

/** Russian, English, Kazakh and Chinese texts exist; any other language gets English. */
export function templateLocale(locale: string | undefined): TemplateLocale {
  return locale === 'ru' || locale === 'kk' || locale === 'zh' ? locale : 'en';
}

export function listTemplates(locale: string | undefined) {
  const lang = templateLocale(locale);
  return CHECKLIST_TEMPLATES.map((template) => ({
    key: template.key,
    title: template.title[lang],
    description: template.description[lang],
    groupCount: template.groups.length,
    itemCount: template.groups.reduce((sum, group) => sum + group.items.length, 0),
  }));
}

export function findTemplate(key: string) {
  return CHECKLIST_TEMPLATES.find((template) => template.key === key);
}

/** Plain, localized payload ready to be written; ids for context fields are fresh per call. */
export function renderTemplate(template: TemplateDefinition, locale: string | undefined) {
  const lang = templateLocale(locale);
  const scaleLevels: ScaleLevel[] | undefined = template.scaleLevels?.map((level, index) => ({ level: index + 1, label: level.label[lang], points: level.points }));
  const contextFields: ContextField[] = template.contextFields.map((field, index) => ({
    id: randomUUID(), label: field.label[lang], type: field.type, required: field.required, order: index,
  }));
  return {
    title: template.title[lang],
    description: template.description[lang],
    scoringMode: template.scoringMode,
    passThreshold: template.passThreshold,
    scaleLevels,
    contextFields,
    groups: template.groups.map((group, groupIndex) => ({
      title: group.title[lang],
      order: groupIndex,
      items: group.items.map((entry) => ({ text: entry.text[lang], photoRequired: entry.photoRequired === true })),
    })),
  };
}
