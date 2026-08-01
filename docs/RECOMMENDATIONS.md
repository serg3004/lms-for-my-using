# Рекомендации

## R1 — 2026-07-27 — Снижение падений CI из-за Dependabot и pnpm audit

### Чтобы падения CI происходили реже

- Делать Dependabot PR маленькими и частыми.
- Соблюдать порядок merge:

  ```text
  GitHub Actions → dev dependencies → prod dependencies
  ```

- Мержить зелёные Dependabot PR быстро, не копить их неделями.
- Не отключать `pnpm audit --audit-level high`.

Важно: если в `main` появилась новая high-уязвимость, audit может уронить CI даже у unrelated PR.

### Что добавить в PR template

```md
## Dependency/audit impact

- [ ] This PR does not change dependencies
- [ ] This PR changes dependencies
- [ ] If CI fails on `pnpm audit`, use separate security/deps PR
```

### Чтобы audit чинился почти автоматически

Добавить отдельный workflow `Security audit fixer`.

Он может запускаться:

- вручную через GitHub Actions;
- по расписанию, например раз в день;
- когда Dependabot PR не закрывает audit.

Workflow должен:

1. создать ветку `security/fix-pnpm-audit-high`;
2. запустить `pnpm install`;
3. запустить `pnpm audit --audit-level high`;
4. если audit падает — попробовать `pnpm audit --fix`;
5. снова запустить `pnpm install`;
6. снова запустить `pnpm audit --audit-level high`;
7. если high-уязвимости закрыты — создать PR.

Auto-merge не включать.

### Что можно автоматизировать безопасно

- создание `security` branch;
- запуск `pnpm audit --audit-level high`;
- запуск `pnpm audit --fix`;
- запуск `pnpm install`;
- создание PR;
- комментарий в зависимом PR: `audit fixed in #...`.

### Что не автоматизировать

- auto-merge dependency PR;
- auto-ignore advisories;
- ручную правку `pnpm-lock.yaml`;
- отключение audit в CI.

## R2 — 2026-08-01 — Страница «Мои курсы»: отложенные доработки

Три доработки, которые не вошли в текущую реализацию из-за отсутствия данных в API.
Каждая требует изменений на бэкенде (`apps/api`) и фронтенде (`apps/web`).

### R2.1 — Категория курса

**Проблема:** в прототипе карточка курса показывает лейбл категории в обложке (например «Безопасность», «Управление»). Поля `category` в схеме Prisma нет.

**Что нужно сделать:**
1. Добавить поле `category String?` в модель `Course` в `prisma/schema.prisma`
2. Создать и применить миграцию `pnpm prisma migrate dev`
3. Добавить `category` в `courseSelect` в `courses.service.ts`
4. Добавить `category` в тип `CourseSummary` в `apps/web/src/shared/api/types.ts`
5. Показать лейбл в обложке карточки на странице `LearnerCoursesPage.tsx`

### R2.2 — Точный процент прогресса курса

**Проблема:** прогресс-бар сейчас показывает 0% для активных и 100% для завершённых. Реальный % (например 72%) требует знания сколько уроков пользователь прошёл.

**Что нужно сделать:**
1. В `courses.service.ts` при `listCourses` добавить агрегацию: для каждого курса считать кол-во `LessonProgress` записей со статусом `completed` для текущего `userId`
2. Вернуть поля `lessonsCompleted: number` и `lessonsTotal: number` в ответе
3. Добавить эти поля в тип `CourseSummary`
4. Вычислять `pct = Math.round(lessonsCompleted / lessonsTotal * 100)` на фронте

### R2.3 — Следующий урок

**Проблема:** прототип показывает в карточке «Следующий урок: Эвакуация». Это первый незавершённый урок курса для данного пользователя. API этого не возвращает.

**Что нужно сделать:**
1. В `courses.service.ts` при `listCourses` для каждого курса найти первый урок без записи `LessonProgress(completed)` для текущего `userId` — по полю `order`
2. Вернуть `nextLesson: { title: string } | null`
3. Добавить поле в тип `CourseSummary`
4. Показать в мета-сетке карточки на фронте
