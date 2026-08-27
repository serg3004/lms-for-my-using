# LearnSpace UI prototypes

Автономные HTML-прототипы интерфейса LMS. Они являются **UX/design reference**, но не production-кодом и сами по себе не доказывают, что экран реализован или совпадает с production.

## Модель доверия

- HTML prototype + `designStatus` описывают состояние дизайн-референса.
- Current implementation fact проверяется по `apps/web` и runtime application, а не по prototype HTML.
- `implementationStatus` и `productionRoute` заполняются только после проверки production implementation.
- `parityStatus` заполняется только после явного сравнения prototype ↔ production.
- `approved` означает только approved design. Это не синоним `implemented` или `aligned`.

Короткие правила терминологии находятся в [`../contracts/GLOSSARY.md`](../contracts/GLOSSARY.md).

## Manifest v2

`manifest.json` разделяет три независимых состояния для каждой страницы:

| Поле | Значения | Смысл |
|---|---|---|
| `designStatus` | `draft`, `approved`, `retired` | Lifecycle дизайн-референса |
| `implementationStatus` | `unknown`, `not_implemented`, `partial`, `implemented` | Проверенный статус production implementation |
| `parityStatus` | `unknown`, `diverged`, `aligned` | Результат явного сравнения design ↔ production |
| `route` | string | Intended/design route, используемый для навигации по прототипам |
| `productionRoute` | string или `null` | Проверенный production route; `implemented` требует непустое значение |
| `lastComparedAt` | `YYYY-MM-DD` или `null` | Дата последней parity-проверки |
| `lastComparedSha` | Git SHA или `null` | Commit, на котором выполнялась parity-проверка |
| `knownDifferences` | array | Явно известные отличия, если они зафиксированы |

При миграции v1 старый `status: approved` переносится только в `designStatus: approved`. Непроверенные implementation/parity остаются `unknown`; значения не выводятся из имени HTML-файла, route или факта design approval.

`parityStatus: aligned` разрешён только вместе с `lastComparedAt` и `lastComparedSha`. `implementationStatus: implemented` разрешён только с проверенным `productionRoute`. Эти инварианты проверяет `pnpm docs:prototype:test`, который входит в `pnpm docs:consistency:test`.

## Правила использования

1. Перед изменением интерфейса найдите страницу в `manifest.json`.
2. Откройте соответствующий HTML-прототип и проверьте его `designStatus`.
3. Current production behaviour всегда перепроверяйте по актуальному приложению.
4. Не копируйте HTML напрямую в production-код.
5. Сохраняйте текущий визуальный язык и локализацию `RU / EN / KK / ZH`, если задача не меняет design decision.
6. Расхождения фиксируйте через status/evidence fields; не повышайте `unknown` до проверенного статуса по предположению.
7. Pixel-parity всех экранов не является blanket requirement. `aligned` ставится только после конкретной проверки конкретной страницы.

## Структура

- `public/` — публичные и системные страницы.
- `learner/` — интерфейс ученика.
- `admin/` — административный интерфейс.
- `manager/` — интерфейс менеджера.
- `instructor/` — интерфейс инструктора.
- `manifest.json` — design/implementation/parity metadata и соответствие prototype files.

## Технические свойства

- каждый HTML-файл полностью автономен;
- внешние CSS/JS-зависимости отсутствуют;
- выбор языка сохраняется в `localStorage` под ключом `lms-prototype-language`;
- интерактивные действия являются демонстрационными;
- наличие prototype file не означает наличие production implementation.

## Для AI-агентов

Используйте prototypes только как UX-контекст. `designStatus: approved` не разрешает объявлять страницу реализованной или parity-aligned. При конфликте prototype и production сначала установите canonical implementation fact из приложения, затем явно обновите manifest metadata только при наличии фактической проверки.
