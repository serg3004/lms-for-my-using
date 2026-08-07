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
| 3 | `AI_AGENT_STARTER_PROMPT.md` | ⚠️ Частично актуален | Требуется обновить visibility, пути к документам, backend pattern и bootstrap-инструкции |

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

---

## 3. `AI_AGENT_STARTER_PROMPT.md`

**Статус:** ⚠️ частично актуален.

### Проверено

- описание visibility и структуры репозитория;
- основной технологический стек;
- пути к обязательным документам;
- backend-паттерн, предлагаемый агенту;
- подход к валидации входных данных;
- bootstrap-порядок первого запуска проекта;
- наличие Docker Compose, health и основных backend-модулей.

### Подтверждённые факты

- Основной стек в целом соответствует текущему проекту: `apps/api/package.json` использует NestJS, TypeScript и Prisma; `apps/web/package.json` — React, Vite и TypeScript; workspace управляется pnpm.
- Docker Compose с PostgreSQL и MinIO уже существует в `infra/docker/docker-compose.yml`.
- Backend уже содержит `health`, `auth`, `users`, `memberships`, `courses` и другие прикладные модули в `apps/api/src/modules/`.
- Файлы `01_LMS_...`—`23_LMS_...`, на которые опирается starter prompt, находятся в `docs/master-context/`, а не непосредственно в `docs/`.
- Текущий модуль `courses` не использует отдельный repository layer: `courses.service.ts` напрямую инъектирует `PrismaService` и выполняет запросы Prisma.
- Входные данные в `courses` описаны и валидируются через Zod schemas в `courses.schemas.ts`, а не через классические DTO-классы.

### Несоответствия

1. **Visibility репозитория.** Документ несколько раз называет репозиторий `private GitHub repository` / `private GitHub monorepo`. GitHub API для `serg3004/lms-for-my-using` сейчас возвращает `private: false` и `visibility: public`.

2. **Неверные пути к master-context документам.** В base prompt указаны, например, `docs/03_LMS_Architecture_Map.md`, `docs/04_LMS_Database_Model_Draft.md`, `docs/05_LMS_API_Contracts_Draft.md`, `docs/13_LMS_Security_Checklist.md`, `docs/14_LMS_Testing_Strategy.md`. Таких файлов непосредственно в `docs/` нет. Фактические пути находятся под `docs/master-context/`.

3. **Backend pattern не соответствует текущей реализации.** Раздел `Prompt for backend issue` предписывает `module/controller/service/repository pattern` и утверждает, что repository отвечает за Prisma/PostgreSQL. Как минимум текущий `courses` module устроен как module/controller/service/schemas и использует `PrismaService` непосредственно из service. Поэтому инструкция может заставить агента вводить новый слой, которого нет в существующей архитектуре.

4. **Формулировка про DTO слишком узкая.** Документ говорит, что DTO должны валидировать входные данные. Текущий код использует Zod schemas и выведенные из них TypeScript types. Как нормативная инструкция это может неверно направлять агента к другому стилю валидации.

5. **`Первый практический порядок` устарел как инструкция для текущего репозитория.** Он предлагает заново создать monorepo, pnpm workspace, `apps/api`, `apps/web`, PostgreSQL/Prisma, Docker Compose, health endpoint, CI и начать M1. Эти компоненты уже существуют. Такой bootstrap-чеклист был уместен на старте проекта, но сейчас не должен использоваться как рабочий порядок для нового Issue.

6. **Starter prompt смешивает актуальные root-документы и исторический `master-context` без явного приоритета.** В текущем `docs/` уже существуют `PROJECT_SOURCE_OF_TRUTH.md`, `MVP_SCOPE_LOCK.md`, `TODO_VERIFY.md`, `API_CONTRACTS.md`, `ARCHITECTURE_MODULE_BOUNDARIES.md` и другие текущие документы. При этом prompt направляет агента к старым Draft/Map файлам без `master-context/` и не объясняет, что делать при расхождении с текущими документами и кодом.

### Что изменить

1. Заменить `private` на фактическое `public` либо убрать visibility из starter prompt, если она не является архитектурным требованием.
2. Исправить все ссылки на `01_LMS_...`—`23_LMS_...` на `docs/master-context/...` и явно обозначить этот каталог как reference/legacy context, если именно так он должен использоваться.
3. В списке документов первого приоритета использовать текущие root-документы (`PROJECT_SOURCE_OF_TRUTH.md`, `MVP_SCOPE_LOCK.md`, `TODO_VERIFY.md`, `API_CONTRACTS.md`, `ARCHITECTURE_MODULE_BOUNDARIES.md` и релевантные специализированные документы), а код/конфигурацию считать источником фактической реализации.
4. Переписать backend rule на требование следовать существующей структуре конкретного модуля. Не требовать repository layer без подтверждения, что он принят в затрагиваемой области.
5. Заменить DTO-specific правило на более общее: входные данные должны валидироваться существующим в модуле механизмом; для текущих модулей это в том числе Zod schemas.
6. Удалить или вынести `Первый практический порядок` в исторический bootstrap-раздел, явно пометив его как уже выполненный, чтобы агент не пытался повторно создавать существующую инфраструктуру.
7. Добавить явный порядок приоритетов при конфликте: текущий код/конфигурация и актуальные root-документы выше исторических master-context drafts.

### [НЕ ПРОВЕРЕНО]

Полное соответствие каждого security/RBAC тезиса из starter prompt всем защищённым endpoint не проверялось в рамках этого файла; эти утверждения должны подтверждаться при аудите специализированных security/RBAC документов.

### Итог

Документ полезен как общий шаблон работы AI-агента, но в текущем виде содержит устаревшие стартовые сведения и несколько инструкций, способных направить агента по неверным путям или к несовместимому стилю реализации. Перед повторным использованием starter prompt следует обновить перечисленные пункты.
