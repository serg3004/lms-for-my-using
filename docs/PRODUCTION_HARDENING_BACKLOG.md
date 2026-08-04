# Production Hardening Backlog

**Дата:** 2026-06-05  
**Статус:** После MVP — Railway staging запущен, MVP flow работает

---

## Что уже закрыто (PR 104–110)

| PR | Что сделано | Коммит |
|----|-------------|--------|
| 104 | CI audit baseline — зафиксирован commit SHA, подтверждён состав CI (lint, prisma generate, typecheck, tests, build) | `docs/CI_AUDIT_BASELINE.md` |
| 105 | Dependency audit (`pnpm audit --audit-level high`) + Gitleaks secret scan в каждом PR | `.github/workflows/ci.yml` |
| 106 | CodeQL SAST для JS/TS с `security-extended` ruleset | `.github/workflows/codeql.yml` |
| 107 | Upload hardening — проверка типа файла по extension + magic bytes, тесты | `upload.validation.ts` |
| 108 | Auth/session production readiness — задокументированы gaps (нет refresh, нет revocation, custom JWT, in-memory rate limit) | `docs/AUTH_SESSION_PRODUCTION_READINESS.md` |
| 109 | Frontend maintainability audit, упрощён course list | `docs/FRONTEND_MVP_MAINTAINABILITY_AUDIT.md` |
| 110 | MVP smoke tests — все learner и admin страницы (loading + happy path, Vitest/SSR) | `LearnerPages.smoke.spec.tsx`, `AdminPages.smoke.spec.tsx` |

---

## Backlog: что нужно сделать

### P0 — Критично для production

#### PR 118 — Auth/session minimal tests and hardening
**Проблема:** Auth тесты сейчас покрывают отдельные guard/service. Нет сквозного теста login → protected route → logout с cookie/CSRF.  
**Что делать:** Tests for login/logout, unauthorized access, role guard, Cookie/CSRF unsafe request behavior. Minimal hardening без schema/migration.  
**Риск без него:** Регрессия в auth может пройти незамеченной.

#### PR 120 — Refresh/session store + Prisma migration
**Проблема:** JWT-токен выдаётся на фиксированный срок, нет способа аннулировать сессию без смены секрета.  
**Что делать:** Session/refresh token Prisma model, migration, safe storage design, tests для session creation/expiration.  
**Риск без него:** Скомпрометированный токен активен до истечения срока.  
**Зависимости:** Требует Prisma migration на staging/prod.

#### PR 121 — Token revocation and logout hardening
**Проблема:** Logout сейчас только удаляет cookie на клиенте; токен остаётся валидным на сервере.  
**Что делать:** Revoke текущую сессию при logout, optional logout-all endpoint, tests для revoked session.  
**Зависит от:** PR 120.

#### PR 122 — Replace custom JWT with `jose`
**Проблема:** JWT реализован вручную (PR 108 это зафиксировал). Кастомная реализация может иметь уязвимости.  
**Что делать:** Заменить на `jose` (RFC-compliant), сохранить JWT payload contract, тесты sign/verify/expired/invalid.  
**Риск:** При некорректной замене ломается весь auth.

---

### P1 — Важно для стабильности

#### PR 119 — Real frontend cleanup (одна большая страница)
**Проблема:** `AdminMaterialsPage.tsx` и `AdminAssessmentBuilderPage.tsx` — большие файлы со смешанной логикой.  
**Что делать:** Вынести один leaf component/helper из одного файла, сохранить UX/API/routes.  
**Риск без него:** Технический долг растёт, сложнее добавлять фичи.

#### PR 123 — Redis-backed rate limit
**Проблема:** Rate limit сейчас in-memory (указано в AUTH_SESSION_PRODUCTION_READINESS.md). При перезапуске сервиса счётчики сбрасываются, при горизонтальном масштабировании не работает.  
**Что делать:** Redis-backed limiter вместо in-memory, env config, safe fallback при отсутствии Redis, tests.  
**Зависимости:** Требует Redis в production инфраструктуре.  
**Триггер:** Обязательно перед (а) запуском нагрузочного теста (PR 136) — без Redis тест будет мерить срабатывание rate limiter, а не реальную производительность API; (б) любым горизонтальным масштабированием `api` до нескольких инстансов.

#### PR 124 — Stronger upload scanning
**Проблема:** Текущая валидация файлов проверяет extension и magic bytes, но не валидирует структуру архивов/Office-документов.  
**Что делать:** Более глубокая валидация (archive bomb, Office XML), safer filename/metadata handling, дополнительные negative tests.

#### PR 126 — Coverage threshold
**Проблема:** Нет минимального порога покрытия — CI не падает если кто-то удалит тесты.  
**Что делать:** Coverage config с realistic threshold для backend/frontend/shared, CI gate.  
**Важно:** Threshold должен быть реалистичным, не ломать CI искусственно.

#### PR 127 — Full Playwright E2E
**Проблема:** Smoke тесты (PR 110) — SSR рендер без браузера. Нет реального end-to-end теста через браузер.  
**Что делать:** Playwright setup, Learner E2E (login → курс → урок → тест → сертификат), Admin E2E (login → создать курс → опубликовать).  
**Зависимости:** Нужен staging URL или local Docker Compose.

---

### P2 — Улучшения после стабилизации

#### PR 125 — Malware scan integration
**Проблема:** Загружаемые файлы не проверяются на вредоносное содержимое.  
**Что делать:** Интегрировать scanner/service (ClamAV или cloud API) в upload flow, error/timeout behavior, tests/mocks.  
**Зависимости:** Требует внешний сервис или self-hosted scanner.

#### PR 128 — Dependabot / Renovate
**Проблема:** Обновления зависимостей сейчас только ручные.  
**Что делать:** Config с grouping rules, schedule (security updates — немедленно, остальные — еженедельно), автоматические PR.

#### PR 129 — Branch protection
**Проблема:** Нет защиты ветки `main` от прямых push.  
**Что делать:** Настроить: required CI, required CodeQL, no direct push, PR required. Требует подтверждения владельца репо.

#### PR 130 — Production observability
**Проблема:** Нет видимости runtime ошибок в production.  
**Что делать:** Интеграция error tracking (Sentry или аналог), structured logging, basic alerts при сбоях.  
**Зависимости:** Требует внешний сервис.

#### PR 131 — Backup restore drill
**Проблема:** Backup есть (Railway автоматический), но restore никогда не проверялся.  
**Что делать:** Задокументировать backup/restore procedure, провести test restore drill на non-production DB, зафиксировать RPO/RTO.

#### PR 136 — Load testing с ролевыми сценариями
**Проблема:** Нет данных о том, как API ведёт себя под нагрузкой (500–1000 одновременных пользователей), и нет автоматической проверки, что права доступа между ролями (admin/instructor/learner) не текут при параллельной нагрузке.  
**Что делать:** k6-сценарий с виртуальными пользователями по ролям (у каждого свой JWT и сценарий: learner проходит урок, instructor редактирует курс, admin смотрит отчёты), + bulk-seed скрипт, генерирующий N тестовых аккаунтов по ролям (текущий demo-seed создаёт единицы, не сотни). Assert и на latency/error rate, и на корректные 403 там, где нужно.  
**Зависимости:** Redis (PR 123) — иначе тест мерит не то. Staging-окружение — запускать на production нельзя. Bulk-seed скрипт (новый, отдельно от `admin-demo-seed.ts`).  
**Риск без него:** Неизвестно, как приложение поведёт себя при реальной нагрузке пилота; RBAC-баги под конкурентной нагрузкой не отлавливаются текущими тестами.

#### PR 137 — Stabilize the expired-cookie refresh e2e test — DONE
**Проблема:** `apps/e2e/tests/login-role-redirect.spec.ts` → `an expired access cookie is refreshed before the protected route renders` падал в CI четыре раза (дважды при таймауте `expect.poll` 5с, дважды уже после увеличения до 10с) — каждый раз с разным симптомом (`refreshSucceeded: false` / `expiredAccessRejected: false`), то есть разный шаг цепочки `401 → POST /auth/refresh → повтор запроса` не укладывался в таймаут в разные разы. Простое увеличение таймаута (5с → 10с) снизило частоту, но не убрало флак — упал и на 10с тоже.  
**Что сделано:** Тест переписан на три отдельных `page.waitForResponse()` (по одному на каждый сетевой раунд-трип: 401 → refresh 201 → повтор 200), зарегистрированных до навигации и дожидаемых по очереди — вместо одного `expect.poll`, опрашивающего накопленный массив статусов. Если тест снова упадёт, будет видно на каком именно шаге, а не общий таймаут "где-то в этих 10 секундах". Проверка "ровно один вызов /auth/refresh" сохранена.  
**Не сделано:** Возможная контенция ресурсов CI-раннера при параллельном запуске (2 воркера) как причина остаётся непроверенной гипотезой — если флак продолжится и после этого фикса, копать в эту сторону.

---

## Сводная таблица

| PR | Название | Приоритет | Риск | Зависит от |
|----|----------|-----------|------|------------|
| 118 | Auth/session тесты | P0 | Нет | — |
| 119 | Frontend cleanup | P1 | Нет | — |
| 120 | Refresh/session store | P0 | DB migration | — |
| 121 | Token revocation | P0 | Auth behavior | PR 120 |
| 122 | Custom JWT → jose | P0 | Auth behavior | — |
| 123 | Redis rate limit | P1 | Требует Redis | — |
| 124 | Upload scanning | P1 | Upload behavior | — |
| 125 | Malware scan | P2 | Внешний сервис | — |
| 126 | Coverage threshold | P1 | Нет | — |
| 127 | Playwright E2E | P1 | Новая зависимость | Staging URL |
| 128 | Dependabot | P2 | Нет | — |
| 129 | Branch protection | P2 | GitHub settings | — |
| 130 | Observability | P2 | Внешний сервис | — |
| 131 | Backup restore drill | P2 | Нет | — |
| 136 | Load testing (роли) | P2 | Нужен Redis + staging | PR 123 |
| 137 | Стабилизировать flaky refresh e2e-тест | P1 | Нет | — |

---

## Рекомендуемый порядок

```
Сейчас (без Railway):  PR 118 → PR 119 → PR 122 → PR 120 → PR 121 → PR 126
После Railway staging: PR 127 → PR 123 → PR 124
После стабилизации:    PR 125 → PR 128 → PR 129 → PR 130 → PR 131
После Redis:            PR 136
Мажорные зависимости:  PR 132 → PR 133 → PR 134 → PR 135
```

---

## Мажорные обновления зависимостей (запланированы 2026-06-05)

Эти обновления требуют ручной миграции кода, не просто bump версии.

#### PR 132 — @nestjs/common 10 → 11
**Проблема:** `@nestjs/core` и `@nestjs/platform-express` уже на v11 (смёрджены через Dependabot). `@nestjs/common` остался на v10 — несовместимость нарастает.  
**Что делать:** Bump `@nestjs/common` и `@nestjs/testing` до v11, проверить breaking changes (декораторы, pipes, guards), прогнать тесты.  
**Приоритет:** P1 — сделать как можно скорее, пока проект не сломался от несовместимости.

#### PR 133 — TypeScript 5.x → 6.0
**Проблема:** TypeScript 6 вышел, `^5.7.2` в lockfile разрешается в 5.9.x. Можно обновиться до 6.x.  
**Что делать:** Поднять до `^6.0.0`, исправить breaking changes (если есть), проверить `tsc --noEmit`.  
**Приоритет:** P2 — не срочно, TypeScript 5.x стабильно работает.

#### PR 134 — ESLint 9 → 10
**Проблема:** ESLint 10 вышел, текущий flat config (`eslint.config.js`) должен быть совместим.  
**Что делать:** Bump до v10, проверить что lint проходит без изменений конфига.  
**Приоритет:** P2 — не срочно.

#### PR 135 — @vitejs/plugin-react ^4 → ^6
**Проблема:** Два мажора позади (4→5→6). Могут быть изменения в конфигурации плагина.  
**Что делать:** Bump, проверить `vite.config.ts`, прогнать `vite build` и тесты.  
**Приоритет:** P2 — не срочно.
