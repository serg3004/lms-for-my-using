# PR 259 — Frontend Performance Verification

**Дата:** 2026-08-25
**Метод:** Chrome DevTools `Performance.getMetrics()` (CDP) + сетевой профиль (`page.on('request')`) через Playwright с реальным Chromium, против production-сборки (`vite build` + `vite preview`, proxy на реальный NestJS API) и локально засеянной demo-базой (`pnpm admin:demo-seed`). Не против dev-сервера — `apps/web` включает `React.StrictMode`, который в dev намеренно дважды вызывает эффекты и даёт ложные 2x-паттерны, не отражающие прод.

Профилировались 6 экранов, перечисленных в критерии PR 259: `/learn`, `/manager/team`, `/manager/overdue`, `/admin/users`, `/admin/courses` (крупные admin-таблицы), `/admin/checklists` (checklist builder).

## Метод измерения "expensive renders"

React DevTools Profiler недоступен в headless/CI-контексте без ручного взаимодействия, поэтому вместо него использован `Performance.getMetrics()` (Chrome DevTools Protocol) — даёт кумулятивные `ScriptDuration`/`TaskDuration`/`LayoutDuration`/`RecalcStyleDuration`/`LayoutCount`/`RecalcStyleCount` с момента навигации. Это официальный, объективный profiler tooling (не React-специфичный, но измеряет то же самое — стоимость скриптинга/layout), позволяющий сравнить "до/после" без ручного клика по вкладке Performance.

## Finding 1 (подтверждён и исправлен): дублирующий `/auth/me`

**До исправления** (prod build, до фикса):

| Страница | `/auth/me` вызовов | Всего API-запросов |
|---|---|---|
| `/learn` | 3 | 6 |
| `/manager/team` | 2 | 4 |
| `/manager/overdue` | 2 | 4 |
| `/admin/users` | 3 | 5 |
| `/admin/courses` | 3 | 5 |
| `/admin/checklists` | 3 | 5 |

Root cause: `App.tsx` уже оборачивает всё дерево в `<SessionProvider>` (PR 244), который получает `currentUser` один раз. Но ~14 page-компонентов (включая мой собственный `LearnerHomePage` из PR 251) независимо вызывали `getCurrentUser()` ещё раз внутри своего `useAsyncData`-загрузчика — SessionProvider уже гарантирует наличие пользователя к моменту рендера страницы (см. `ProtectedRoute.tsx`), так что второй вызов был чистой избыточностью.

Отдельно выяснено (через перехват `window.fetch` со stack trace) и **не является багом**: первый `/auth/me` после жёсткой перезагрузки страницы всегда получает `401` (in-memory access token теряется при полной перезагрузке; работает только httpOnly refresh-cookie) → `apiClient.ts` делает silent `POST /auth/refresh` → повторяет `/auth/me`. Это 2 сетевых запроса на один логический вызов `getCurrentUser()`, а не дублирование — это осознанная auth-архитектура (короткоживущий access token в памяти + httpOnly refresh cookie), трогать в этом PR не входит в scope.

**Исправление:** для не-Instructor* авторизованных страниц (Learner/Admin/Manager — Instructor*-страницы намеренно не тронуты, т.к. параллельно ведётся PR 252 по `InstructorCoursesPage`) заменены прямые вызовы `getCurrentUser()` на уже существующий `useSession()`/`useOptionalSession()` из `shared/session.tsx` (тот самый `SessionProvider` из PR 244). Затронуто 9 page-компонентов + 1 hook (`useAdminUsers`), 14 отдельных call-sites.

**После исправления** (prod build):

| Страница | `/auth/me` вызовов | Всего API-запросов |
|---|---|---|
| `/learn` | 2 | 5 |
| `/manager/team` | 2 | 4 |
| `/manager/overdue` | 2 | 4 |
| `/admin/users` | 2 | 4 |
| `/admin/courses` | 2 | 4 |
| `/admin/checklists` | 2 | 4 |

Все страницы теперь на неизбежном минимуме (2 = 401 + refresh-retry). Критерий «нет дублирующего `/auth/me` из уже мигрированных authenticated flows» выполнен для всех измеренных экранов.

## Finding 2: `/learn` lesson fan-out — уже устранён (PR 251)

Подтверждено профилированием: `/learn` делает ровно один запрос к `/learner-dashboard`, ноль запросов `listLessons(courseId)`. Критерий «`/learn` не имеет прежнего lesson fan-out» — выполнен, работа сделана в PR 251, отдельных действий в PR 259 не потребовалось.

## Finding 3: render/scripting cost — без выявленных hotspot'ов

`ScriptDuration`/`TaskDuration`/`LayoutDuration` по всем 6 экранам малы (22–48 мс scripting, 92–152 мс total task duration на весь page load, включая сетевые round-trips) и не показывают выброса на каком-то конкретном экране. `LayoutCount`/`RecalcStyleCount` (5–18) тоже в пределах нормы для страниц с таблицами/формами такого размера с demo-данными.

**Вывод:** на измеренных данных (demo seed, не production-масштаб) добавление `React.memo`/`useMemo` не подтверждено профилем ни на одном экране — по правилу PR 259 «добавлять memoization только в подтверждённых hotspots» никакая memoization не добавлена. Если на реальных production-объёмах данных (например, `/admin/users` с тысячами записей) появится измеримая деградация, это отдельная задача с профилированием на реальных данных, а не спекулятивная оптимизация здесь.

## Критерии готовности PR 259

| Критерий | Статус |
|---|---|
| нет дублирующего `/auth/me` из уже мигрированных authenticated flows | ✅ исправлено на 6/6 измеренных экранах (Learner/Manager/Admin); Instructor*-страницы намеренно не тронуты — конфликт с параллельным PR 252 |
| `/learn` не имеет прежнего lesson fan-out | ✅ подтверждено, выполнено в PR 251 |
| render bottlenecks подтверждены профилем | ✅ профиль снят (`Performance.getMetrics()`); явных bottleneck'ов не найдено |
| memoization добавлена только при измеримой необходимости | ✅ не добавлена — не подтверждена профилем |
| повторный профиль не показывает регрессию | ✅ до/после сравнение выше показывает улучшение, не регрессию |
| performance findings и ограничения задокументированы | ✅ этот документ |
| frontend tests/build проходят | ✅ `pnpm typecheck`, `pnpm lint`, полный Vitest suite (547 тестов), production `vite build` — всё зелёное |

## Ограничения и что не покрыто

- Instructor*-страницы (`InstructorCoursesPage`, `InstructorCourseStudentsPage`, `InstructorCourseFormPage`, `InstructorChecklistReviewsPage`, `InstructorDashboardPage`) имеют тот же паттерн дублирования `/auth/me`, но намеренно не тронуты — `InstructorCoursesPage` сейчас меняется в параллельном PR 252. Рекомендуется применить тот же фикс (`useSession()` вместо `getCurrentUser()`) отдельным follow-up после мержа PR 252.
- `LearnerLessonDetailPage.handleCompleteLesson` вызывает `getCurrentUser()` по клику (submit), не при загрузке страницы — не входит в измеренный page-load hotspot, не тронут.
- Профиль снят на demo-seed данных (единицы записей), не на production-масштабе. Заключение «нет hotspot'ов» валидно для этого объёма данных, не гарантирует то же самое на тысячах записей.
