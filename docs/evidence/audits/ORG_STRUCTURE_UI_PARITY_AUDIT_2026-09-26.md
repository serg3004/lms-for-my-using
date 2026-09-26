# Оргструктура: визуальный parity-аудит (PR 309)

> **Lifecycle:** `EVIDENCE`. Наблюдение на конкретную дату/SHA/окружение, не authority текущего UI.
> Итоговая таблица расхождений и follow-up PR — в
> [`docs/product/future/UI_REFRESH_IMPLEMENTATION_PLAN.md`](../../product/future/UI_REFRESH_IMPLEMENTATION_PLAN.md).

| Поле | Значение |
| --- | --- |
| observed_at | 2026-09-26 |
| SHA | `654908d11ba951937820f61fac78c67d6f7ba54f` (`main`) |
| Окружение | локально: PostgreSQL 16 (disposable `lms_dev`), Redis, API `node dist/main.js`, web `vite dev`; S3 не поднимался (оргструктуре не нужен) |
| Браузер | Chromium (Playwright), `colorScheme: light`, `locale: ru-RU` |
| Viewport | desktop 1440×900 (карточка подразделения — 1440×1400), mobile 390×844 |
| Пользователь | `admin@demo.com` / `demo-company` (admin demo seed) |
| Эталон | `docs/product/future/ORG_STRUCTURE_UI_REFRESH_PROTOTYPE.html`, светлая тема |

## Данные

Admin demo seed не содержит оргструктуры, поэтому перед аудитом через API под администратором создано:
3 типа подразделений; 7 подразделений в 2 корнях через CSV-импорт (`DEPARTMENTS`, `CREATE_ONLY`) — это
же наполнило историю `OrgStructureEvent`; 4 должности; 3 требования (2 обязательных, 1 необязательное);
3 группы (плюс уже существующая `Demo Team` из seed).

## Наблюдения

### Навигация между вкладками

`OrgStructureTabs` рендерит обычные `<a href>`. Замер в браузере: JS-маркер `window.__marker`,
установленный на `/admin/departments`, не пережил клик по вкладке «Должности»,
`performance.getEntriesByType('navigation')[0].type === 'navigate'`. Значит, каждая смена вкладки —
полная перезагрузка документа (~2,2 с на `vite dev`; production-сборка не замерялась). Активная вкладка
корректно помечена `aria-current="page"`.

### Скриншоты

| Экран | Desktop | Mobile 390 |
| --- | --- | --- |
| Подразделения | [пусто](./org-structure-ui-parity-2026-09-26/desktop-departments.png), [выбрано подразделение](./org-structure-ui-parity-2026-09-26/desktop-departments-expanded.png) | [первый экран](./org-structure-ui-parity-2026-09-26/mobile-departments.png) |
| Должности | [desktop](./org-structure-ui-parity-2026-09-26/desktop-positions.png) | [mobile](./org-structure-ui-parity-2026-09-26/mobile-positions.png) |
| Требования по должностям | [desktop](./org-structure-ui-parity-2026-09-26/desktop-position-courses.png) | [mobile](./org-structure-ui-parity-2026-09-26/mobile-position-courses.png) |
| Группы | [desktop](./org-structure-ui-parity-2026-09-26/desktop-groups.png) | [mobile](./org-structure-ui-parity-2026-09-26/mobile-groups.png) |
| Импорт и история | [форма](./org-structure-ui-parity-2026-09-26/desktop-tools.png), [история](./org-structure-ui-parity-2026-09-26/desktop-tools-history.png) | — |

### Замеры DOM

- **Карточка подразделения, desktop 1440.** Правый край кнопки «Сотрудники» — 1412px, правый край
  карточки — 1360px: ряд действий выходит за карточку на 52px.
- **Mobile 390, таблицы `DataTable`.** Колонки «Должностей», «Требований» и «Групп» сжимаются до
  ~34–39px, текст переносится по одной букве. Ни одна колонка не имеет `data-priority`. На ≤860px правило
  `.ds-data-table .admin-table-wrap table { min-width: 0 }` снимает `min-width: 640px`, а кнопки действий
  не сжимаются. Для сравнения: `/admin/users` задаёт `data-priority` (48 ячеек) и не ломается. `/admin/courses`
  (`data-priority` нет) имеет такую же форму таблицы, но вне scope этого аудита.
- **«Импорт и история».** 15 строк истории, пагинация «Previous / Page 1 of 1 / Next». В колонке «Actor» —
  полный UUID. Весь экран на английском при `ru-RU`: строки захардкожены в
  `AdminOrgStructureToolsPage.tsx`, там же `brandLabel="LearnSpace"` и собственные `navItems`
  (`Departments / Import & history`) вместо `t(...)`, как на остальных четырёх вкладках.
