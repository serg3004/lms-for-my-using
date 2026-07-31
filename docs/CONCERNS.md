# Concerns Register

Файл для фиксации всего что вызывает сомнение — архитектура, потенциальные проблемы, технический долг, наблюдения по PR.

**Severity:** 🔴 критично · 🟡 смущает · 🟢 мелочь  
**Status:** открыто / закрыто (дата)

---

## Открытые

### [2026-07-31] `assertResourceAccess` — двойной запрос в БД для вложенных ресурсов
**Файл:** `apps/api/src/modules/course-access/course-access.policy.ts`  
**Severity:** 🟡  
Для `attempt` и `question` метод делает 2 запроса: сначала резолвит `courseId` через промежуточную таблицу, потом проверяет доступ к курсу через `assertCourseAccess`. При высокой нагрузке это заметно. Можно объединить в один Prisma-запрос с `include`/JOIN.

---

### [2026-07-31] Миграции с хардкоженным timestamp в имени
**Файлы:** `apps/api/prisma/migrations/20260731120000_*`, `20260731150000_*`  
**Severity:** 🟢  
Если разработчик запустит `prisma migrate dev` локально в тот же день — возможен конфликт порядка применения миграций. Мелочь, но стоит следить.

---

### [2026-07-31] RBAC-тесты есть только у 2 из 14 контроллеров
**Файлы:** `apps/api/src/modules/assignments/`, `apps/api/src/modules/progress/`  
**Severity:** 🟡  
Audit-тест (`api-policy.audit.spec.ts`) проверяет что у каждого endpoint есть `@Roles()` — но это не то же самое что проверить поведение guard. Dedicated `.rbac.spec.ts` файлы есть только у `assignments` и `progress`. Остальные 12 контроллеров без поведенческих RBAC-тестов.

---

### [2026-07-31] Redis rate limiting не реализован — счётчики in-memory
**Файл:** `apps/api/src/modules/auth/`  
**Severity:** 🟡  
PR 123 в плане. Текущий rate limit хранится в памяти процесса. При перезапуске NestJS на Railway — счётчики сбрасываются. При горизонтальном масштабировании (несколько инстансов) — счётчики не синхронизированы. На продакшне это дыра в защите от брутфорса.

---

### [2026-07-31] S3/R2 инфраструктура на Railway не настроена
**Файл:** `apps/api/src/modules/` (upload-модуль)  
**Severity:** 🟡  
PR 170 — код загрузки файлов написан, но бакет S3/R2 на Railway не создан и env-переменные не выставлены. Функциональность загрузки материалов сейчас нерабочая в проде.

---

### [2026-07-31] Покрытие функций на нижней границе
**Файл:** `apps/web/vitest.config.ts`  
**Severity:** 🟢  
Threshold `functions: 25%`. После фикса PR 172 — 25.6%, запас минимальный. Любое добавление нетестированных функций в `apps/web` уронит CI. Стоит поднять порог до 30% или добавить тесты заранее.

---

### [2026-07-31] Instructor видит все курсы организации до PR 176
**Файл:** `apps/web/src/app/InstructorDashboardPage.tsx`, `InstructorCourseStudentsPage.tsx`  
**Severity:** 🟡  
Фронтенд инструктора вызывает `listCourses({ pageSize: 200 })` без фильтрации по владельцу. API-сайд ownership (`CourseAccessPolicy`) добавлен в PR 176, но фронтенд ещё не обновлён — инструктор в UI видит все курсы организации.

---

### [2026-07-31] `sessionStore` @Optional — logout-all молча не работает без Redis
**Файл:** `apps/api/src/modules/auth/auth.controller.ts`  
**Severity:** 🔴  
`AuthSessionStore` помечен `@Optional()`. Если Redis не сконфигурирован — `logout-all` возвращает `{ accepted: true }` но сессии не отзывает. Пользователь считает что вышел со всех устройств — нет.

---

### [2026-07-31] `ALLOW_IN_MEMORY_RATE_LIMIT=true` — escape хatch без предупреждения
**Файл:** `apps/api/src/config/env.ts`  
**Severity:** 🟡  
Флаг позволяет запустить production без Redis. Нет Warning в логах при старте что включён небезопасный режим. Легко выставить на Railway и забыть.

---

### [2026-07-31] Fail-open при недоступном Redis — rate limit полностью отключается
**Файл:** `apps/api/src/common/middleware/api-hardening.ts`  
**Severity:** 🟡  
При ошибке Redis store middleware делает `catch {}` и пропускает запрос. Атакующий может положить Redis и брутфорсить `/auth/login` без ограничений.

---

### [2026-07-31] `createCourse` + `assignInstructor` без транзакции
**Файл:** `apps/api/src/modules/courses/courses.controller.ts`  
**Severity:** 🟡  
Два последовательных запроса к БД не обёрнуты в транзакцию. Если `assignInstructor` упадёт — курс создан но без инструктора. Инструктор-создатель его больше не увидит в своём списке.

---

### [2026-07-31] Password reset — нереализованная заглушка на публичном endpoint
**Файл:** `apps/api/src/modules/auth/auth.controller.ts`  
**Severity:** 🟡  
`confirmPasswordReset()` принимает любые данные и возвращает 200 без действий. Endpoint публичный. Пользователь не получит ошибку при попытке сбросить пароль.

---

### [2026-07-31] Rate limit 429 использует raw JSON вместо NestJS error формата
**Файл:** `apps/api/src/common/middleware/api-hardening.ts`  
**Severity:** 🟢  
Middleware находится до NestJS pipeline — формат ошибки 429 отличается от остальных API ошибок. Клиент получает разные структуры ответа при разных ошибках.

---

### [2026-07-31] Login возвращает `accessToken` и в теле и в cookie одновременно
**Файл:** `apps/api/src/modules/auth/auth.controller.ts`  
**Severity:** 🟢  
После PR 137 refresh token убран из тела — правильно. Но access token дублируется: и в Set-Cookie и в JSON body. При переходе на cookie-only — избыточность.

---

## Закрытые

### [2026-07-31] Покрытие функций ниже threshold 25% в CI → **закрыто**
PR 172 — экспортированы `computeStats` и `buildStudentRows`, добавлен `InstructorUtils.spec.ts`. Coverage поднялась до 25.6%.

---
