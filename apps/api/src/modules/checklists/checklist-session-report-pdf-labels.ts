export type PdfLocale = 'ru' | 'en' | 'kk' | 'zh';

/** PR 372: texts of the session report PDF. The file speaks the language of the person who downloads it. */
export type PdfLabels = {
  title: string; checklist: string; learner: string; observer: string; department: string; status: string;
  scheduled: string; started: string; completed: string; timezone: string; generalInfo: string;
  total: string; points: string; passed: string; notPassed: string; notScored: string; threshold: string;
  answered: string; skipped: string; unanswered: string; formula: { snapshot: string; criteria: string };
  groups: string; criteria: string; number: string; criterion: string; score: string; level: string; comment: string;
  skippedCriterion: string; photos: string; photoFile: string; photosOmitted: (count: number) => string; photoUnavailable: string;
  feedback: string; strengths: string; developmentAreas: string; nextSteps: string;
  hidden: string; page: (page: number, pages: number) => string; empty: string;
  statuses: Record<string, string>; review: Record<string, string>;
};

export const PDF_LABELS: Record<PdfLocale, PdfLabels> = {
  ru: {
    title: 'Отчёт по сессии', checklist: 'Чек-лист', learner: 'Сотрудник', observer: 'Наблюдатель', department: 'Подразделение', status: 'Статус',
    scheduled: 'Запланировано', started: 'Начато', completed: 'Завершено', timezone: 'Часовой пояс', generalInfo: 'Общая информация',
    total: 'Итог', points: 'Баллы', passed: 'Пройдено', notPassed: 'Не пройдено', notScored: 'Без оценки', threshold: 'Порог',
    answered: 'Оценено', skipped: 'Пропущено', unanswered: 'Без ответа', formula: { snapshot: 'Формула: по снимку чек-листа', criteria: 'Формула: по критериям' },
    groups: 'Группы', criteria: 'Критерии', number: '№', criterion: 'Критерий', score: 'Баллы', level: 'Уровень', comment: 'Комментарий',
    skippedCriterion: 'Пропущен', photos: 'Фотографии', photoFile: 'Фото', photosOmitted: (count) => `Ещё фотографий не включено в файл: ${count}`, photoUnavailable: 'Фото недоступно',
    feedback: 'Обратная связь', strengths: 'Сильные стороны', developmentAreas: 'Зоны роста', nextSteps: 'Комментарий',
    hidden: 'Результат пока скрыт от сотрудника.', page: (page, pages) => `Стр. ${page} из ${pages}`, empty: 'нет данных',
    statuses: { scheduled: 'Запланирована', in_progress: 'В процессе', paused: 'На паузе', completed: 'Завершена', cancelled: 'Отменена' },
    review: { pending: 'На проверке', approved: 'Принято', rejected: 'Отклонено' },
  },
  en: {
    title: 'Session report', checklist: 'Checklist', learner: 'Employee', observer: 'Observer', department: 'Department', status: 'Status',
    scheduled: 'Scheduled', started: 'Started', completed: 'Completed', timezone: 'Time zone', generalInfo: 'General information',
    total: 'Result', points: 'Points', passed: 'Passed', notPassed: 'Not passed', notScored: 'Not scored', threshold: 'Threshold',
    answered: 'Scored', skipped: 'Skipped', unanswered: 'Unanswered', formula: { snapshot: 'Formula: checklist snapshot', criteria: 'Formula: by criteria' },
    groups: 'Groups', criteria: 'Criteria', number: '#', criterion: 'Criterion', score: 'Points', level: 'Level', comment: 'Comment',
    skippedCriterion: 'Skipped', photos: 'Photos', photoFile: 'Photo', photosOmitted: (count) => `Photos not included in the file: ${count}`, photoUnavailable: 'Photo unavailable',
    feedback: 'Feedback', strengths: 'Strengths', developmentAreas: 'Development areas', nextSteps: 'Comment',
    hidden: 'The result is still hidden from the employee.', page: (page, pages) => `Page ${page} of ${pages}`, empty: 'no data',
    statuses: { scheduled: 'Scheduled', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', cancelled: 'Cancelled' },
    review: { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' },
  },
  kk: {
    title: 'Сессия есебі', checklist: 'Чек-лист', learner: 'Қызметкер', observer: 'Бақылаушы', department: 'Бөлім', status: 'Мәртебе',
    scheduled: 'Жоспарланған', started: 'Басталды', completed: 'Аяқталды', timezone: 'Уақыт белдеуі', generalInfo: 'Жалпы ақпарат',
    total: 'Нәтиже', points: 'Балл', passed: 'Тапсырылды', notPassed: 'Тапсырылмады', notScored: 'Бағаланбаған', threshold: 'Шек',
    answered: 'Бағаланды', skipped: 'Өткізілді', unanswered: 'Жауапсыз', formula: { snapshot: 'Формула: чек-листтің көшірмесі бойынша', criteria: 'Формула: өлшемдер бойынша' },
    groups: 'Топтар', criteria: 'Өлшемдер', number: '№', criterion: 'Өлшем', score: 'Балл', level: 'Деңгей', comment: 'Пікір',
    skippedCriterion: 'Өткізілді', photos: 'Фотолар', photoFile: 'Фото', photosOmitted: (count) => `Файлға енгізілмеген фотолар: ${count}`, photoUnavailable: 'Фото қолжетімсіз',
    feedback: 'Кері байланыс', strengths: 'Күшті жақтары', developmentAreas: 'Даму аймақтары', nextSteps: 'Пікір',
    hidden: 'Нәтиже қызметкерден әзірге жасырылған.', page: (page, pages) => `${page} / ${pages} бет`, empty: 'дерек жоқ',
    statuses: { scheduled: 'Жоспарланған', in_progress: 'Жүріп жатыр', paused: 'Тоқтатылған', completed: 'Аяқталған', cancelled: 'Бас тартылған' },
    review: { pending: 'Тексерілуде', approved: 'Қабылданды', rejected: 'Қабылданбады' },
  },
  zh: {
    title: '会话报告', checklist: '清单', learner: '员工', observer: '观察员', department: '部门', status: '状态',
    scheduled: '计划时间', started: '开始时间', completed: '完成时间', timezone: '时区', generalInfo: '基本信息',
    total: '结果', points: '得分', passed: '通过', notPassed: '未通过', notScored: '未评分', threshold: '及格线',
    answered: '已评分', skipped: '已跳过', unanswered: '未回答', formula: { snapshot: '公式：清单快照', criteria: '公式：按标准' },
    groups: '分组', criteria: '评分标准', number: '序号', criterion: '标准', score: '得分', level: '等级', comment: '备注',
    skippedCriterion: '已跳过', photos: '照片', photoFile: '照片', photosOmitted: (count) => `未包含在文件中的照片：${count}`, photoUnavailable: '照片不可用',
    feedback: '反馈', strengths: '优势', developmentAreas: '改进方向', nextSteps: '备注',
    hidden: '结果暂未向员工公开。', page: (page, pages) => `第 ${page} 页，共 ${pages} 页`, empty: '无数据',
    statuses: { scheduled: '已计划', in_progress: '进行中', paused: '已暂停', completed: '已完成', cancelled: '已取消' },
    review: { pending: '待审核', approved: '已通过', rejected: '已驳回' },
  },
};
