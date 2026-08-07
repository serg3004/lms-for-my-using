# Аудит актуальности документации

## Назначение

Этот файл фиксирует результаты последовательной проверки документов в `docs/` на соответствие текущему состоянию ветки `main`.

Исключены из аудита:

- `docs/lms-ui-prototypes-complete/`;
- `docs/master-context/`;
- `.gitkeep` как служебный пустой файл.

Для каждого документа проверяются утверждения о коде, конфигурации, командах, тестах, CI и связанных компонентах. Неподтверждённые пункты помечаются `[НЕ ПРОВЕРЕНО]`.

## Сводка

| № | Документ | Статус | Итог |
|---:|---|---|---|
| 1 | `ACCESSIBILITY.md` | ✅ Актуален | Изменения не требуются |
| 2 | `ADMIN_DEMO_SEED.md` | ⚠️ Частично актуален | Требуется уточнить полноту проверки demo dataset либо расширить реализацию |

---

## 1. `ACCESSIBILITY.md`

**Статус:** ✅ актуален.

### Проверено

- целевой baseline WCAG;
- команда запуска accessibility-тестов;
- Playwright-конфигурация;
- Axe-порог нарушений;
- покрываемые маршруты и роли;
- клавиатурные сценарии;
- наличие исключений/отключённых правил;
- наличие accessibility gate в CI;
- фактический результат последнего проверенного CI run на момент аудита.

### Подтверждённые факты

- Документ указывает WCAG 2.1 Level AA. В `apps/e2e/accessibility-tests/accessibility.spec.ts` Axe запускается с тегами `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.
- Команда `pnpm test:a11y` существует в корневом `package.json` и запускает Playwright с `apps/e2e/playwright.accessibility.config.ts`.
- `apps/e2e/playwright.accessibility.config.ts` наследует основной Playwright config и использует отдельный `testDir` для accessibility-тестов.
- Axe-проверка считает ошибкой нарушения уровней `critical` и `serious`.
- Проверяются публичные страницы `/` и `/login`, а также рабочие области ролей `admin`, `manager`, `instructor`, `learner`.
- Отдельные keyboard-тесты проверяют skip navigation, language menu, login form, mobile navigation и возврат focus после `Escape`.
- В accessibility-suite не обнаружены отключённые Axe rules или selector-based исключения.
- `.github/workflows/ci.yml` содержит обязательный шаг `Accessibility baseline` с командой `pnpm test:a11y` без `continue-on-error`.
- Последний проверенный CI run `#1242` (`run_id=31148416203`) завершился `success`; шаг `Accessibility baseline` также завершился `success`.

### Несоответствия

Не обнаружены.

### Что изменить

Ничего.

### Итог

Документ соответствует текущей реализации и CI. Оставить без изменений.

---

## 2. `ADMIN_DEMO_SEED.md`

**Статус:** ⚠️ частично актуален.

### Проверено

- команда `admin:demo-seed`;
- build prerequisite;
- dry-run по умолчанию;
- подтверждения окружения и базы;
- production guard;
- транзакционность apply;
- direct-run guard для `prisma/seed.mjs` и `prisma db seed`;
- безопасный вывод target без credentials;
- полнота проверки demo dataset.

### Подтверждённые факты

- `pnpm --filter @lms/api admin:demo-seed` существует в `apps/api/package.json` и запускает `node dist/scripts/admin-demo-seed.js`.
- Перед запуском требуется собранный API, так как команда обращается к `dist`.
- Без `--apply` скрипт работает в dry-run режиме и не открывает `$transaction`.
- Для apply требуются точные `--confirm-environment=<NODE_ENV>` и `--confirm-database=<database name>`.
- `NODE_ENV=production` по умолчанию блокируется; обход возможен только через явный `--allow-demo-environment`.
- При apply запись и последующая проверка выполняются внутри одного `Prisma.$transaction`; ошибка verification приводит к rollback.
- `apps/api/prisma/seed.mjs` блокирует прямой запуск и требует guarded `admin:demo-seed`.
- `prisma db seed` в `apps/api/prisma.config.ts` также указывает на этот guarded direct-run path.
- В логируемый database target входят только environment, host, port, database и schema; username/password и полный `DATABASE_URL` не выводятся.

### Несоответствие

Документ создаёт впечатление, что dry-run и post-seed verification проверяют полный ожидаемый demo dataset и перечисляют отсутствующие записи.

Фактически `findMissingDemoData()` в `apps/api/src/scripts/admin-demo-seed.ts` проверяет только baseline subset:

- organization;
- admin user;
- learner user;
- course;
- lesson 1;
- lesson 2;
- lesson 3;
- assignment;
- assessment;
- ровно 5 assessment questions.

При этом `apps/api/prisma/seed.mjs` создаёт дополнительные сущности, в том числе manager, instructor, memberships/roles, demo group, group member, manager-group relation, course instructor, materials, learner progress, answer options и другие связанные записи. Они не входят в `findMissingDemoData()`.

Следствие: при отсутствии только одной из непроверяемых сущностей dry-run может классифицировать baseline как complete, а apply — вернуть `already-complete`, хотя полный набор seed-данных фактически неполон.

### Что изменить

Если сохраняется текущая реализация, документ следует уточнить:

1. В разделе Dry-run явно указать, что проверяется baseline subset, а не весь dataset.
2. Post-seed verification описать как проверку того же baseline subset.
3. Уточнить, что `already-complete` означает присутствие проверяемого baseline и не является полной проверкой каждой записи, создаваемой `prisma/seed.mjs`.

Альтернатива: если контракт должен гарантировать полноту всего demo dataset, необходимо расширить `findMissingDemoData()` в коде; тогда документ можно оставить с более широким обещанием.

### Итог

Документ требует уточнения либо расширения проверки в реализации. Остальные описанные механизмы безопасности соответствуют текущему коду.
