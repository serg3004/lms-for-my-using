# Продолжение аудита актуальности документации — часть 2

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. `docs/DOCUMENTATION_AUDIT_CONTINUED.md` содержит результат №21. Этот файл продолжает тот же последовательный аудит с №22.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 22 | `MVP_DEFINITION_OF_DONE.md` | ⚠️ Historical minimum bar | Сам historical framing корректен, но current status block и несколько Required пунктов расходятся с текущим seed, auth/deploy model и retired docs |

---

## 22. `MVP_DEFINITION_OF_DONE.md`

**Статус:** ⚠️ исторический minimum bar; полезен как описание раннего порога MVP, но его current-status утверждение `every Required checklist item below is satisfied` нельзя считать буквально верным для текущего `main`.

### Проверено

- сам `MVP_DEFINITION_OF_DONE.md` и его status framing;
- `MVP_SCOPE_LOCK.md` как более приоритетный current scope source;
- `PILOT_CHECKLIST.md`;
- `PASSWORD_RESET_STATUS.md`;
- current demo seed `apps/api/prisma/seed.mjs`;
- Railway migration startup contract;
- current auth guard credential resolution;
- GitHub branch protection state для `main`;
- наличие/retirement `API_STATUS.md`;
- соответствие отдельных “Required” пунктов current repository behavior.

### Подтверждённые факты

- Документ сам честно помечает себя как **historical minimum bar** и прямо говорит, что при расхождении с `MVP_SCOPE_LOCK.md` приоритет имеет `MVP_SCOPE_LOCK.md §0`. Эта часть framing актуальна и должна быть сохранена.
- Базовые backend capabilities из раннего MVP уже давно существуют: health, login/protected auth flow, Zod validation, centralized API errors, Prisma schema/migrations, tenant/RBAC foundation.
- Refresh/logout flow действительно больше не является исключением: current auth/session model содержит refresh token hash/expiry, refresh endpoint и logout-all.
- Password reset delivery всё ещё является skeleton: `PASSWORD_RESET_STATUS.md` подтверждает, что request/confirm endpoints существуют, но service намеренно возвращает `503 Service Unavailable` и не генерирует/не отправляет reset token/email.
- Current demo seed создаёт одну organization, admin, **одного** learner, instructor, manager, одну group, один course, **три** lessons, assignment, progress record и assessment data.
- Current auth guard использует `resolveAccessToken(...)`, а не жёстко требует только Bearer header; проект поддерживает access credential resolution через текущий auth cookie/header contract.
- `main` сейчас не protected: GitHub возвращает `protected: false`, required status check enforcement — `off`.
- `docs/API_STATUS.md` отсутствует (404). `PILOT_CHECKLIST.md` прямо фиксирует, что `API_STATUS.md` retired, а status section merged в `API_CONTRACTS.md`.
- Railway API startup автоматически выполняет `prisma migrate deploy` перед application process; это ранее подтверждено в `MIGRATION_BACKUP_POLICY.md` аудите.

### Несоответствия

1. **Status block `every Required checklist item below is satisfied` слишком сильный.** Как минимум Data readiness в заявленном виде сейчас не выполняется: Required seed dataset требует `two learners`, а текущий demo seed создаёт только одного learner. Дополнительный третий lesson не проблема сам по себе, но второго learner нет.

2. **Data readiness checklist не синхронизирован с реальным canonical demo seed.** Документ требует: one org, admin, instructor, two learners, one group, one course, two lessons, one assignment, one progress record. Current seed создаёт admin + learner + instructor + manager, одну group/course, три lessons, assignment/progress и assessment data. Следует либо привести requirement к реальному seed contract, либо добавить второго learner в seed отдельным code change.

3. **Required documentation list содержит retired `Current API status`.** Отдельного `docs/API_STATUS.md` больше нет; `PILOT_CHECKLIST.md` уже объясняет его retirement и перенос статуса в `API_CONTRACTS.md`. DoD должен ссылаться на текущий artifact, а не требовать несуществующий документ.

4. **Backend readiness пункт `No real database migration is applied outside an explicit operator action` больше не соответствует production deploy model.** Railway startup автоматически запускает `prisma migrate deploy`. Это не означает unsafe migration само по себе, но explicit operator action больше не является непосредственным trigger каждой production migration; merge/deploy может привести к автоматическому применению committed migrations.

5. **Security readiness фраза `Auth-protected endpoints reject missing bearer tokens` устарела по authentication model.** Current `AuthGuard` разрешает access token resolution через общий cookie/header mechanism. Корректный invariant — protected endpoints reject requests **без valid access credential**, а не обязательно без Bearer header. Запрос без Bearer header, но с валидной access cookie, может быть легитимно authenticated.

6. **Test readiness merge rule не enforced GitHub settings.** `A PR can be merged only after GitHub CI is green and the explicit merge approval command is provided` является process policy, а не repository protection: `main` не protected и required checks enforcement выключен. Если это должен быть технический DoD gate, branch protection/ruleset должен его обеспечивать.

7. **Формат required checks устарел относительно реального CI breadth.** DoD перечисляет только `Lint / Types / Tests / Build`, хотя current CI дополнительно выполняет dependency audit/waivers, migrations/integration, browser E2E, accessibility, visual tests, Docker build и Trivy. Для historical minimum это допустимо, но current status section должен явно назвать эти четыре minimum subset, а не создавать впечатление полного current CI contract.

8. **Production deployment automation перенесена из “not required” в “Done”, но operational readiness остаётся неоднозначной.** Сам факт Railway deployment подтверждён repository config/status docs, однако свежий production smoke/storage/backup readiness ранее отмечены как требующие live verification. `Deployment automation done` не должно автоматически означать `production operational readiness fully verified`.

9. **Документ исторический, но содержит current-status assertions без `Verified against main SHA`.** Из-за этого смешиваются две роли: исторический baseline и текущий readiness statement. Это уже привело к drift в seed/docs/auth/deploy пунктах.

### Что изменить

1. Сохранить документ как **historical MVP minimum bar**, но убрать/ослабить абсолютное current утверждение `every Required checklist item below is satisfied` либо заново вычислять его только после проверки каждого Required item на конкретном main SHA.
2. Добавить `Verified at` и `Verified against main SHA` к status block.
3. Синхронизировать Data readiness с canonical demo seed:
   - либо requirement должен описывать текущий dataset (1 learner, manager, 3 lessons, assessment data);
   - либо отдельным code PR привести seed к действительно требуемым двум learners.
4. Заменить `Current API status` на `API_CONTRACTS.md` current status section и явно отметить retirement `API_STATUS.md`.
5. Переписать migration Required item под текущий deploy contract: production migrations применяются только из reviewed/committed migration history через `prisma migrate deploy`; risky migration требует operational approval/backup policy — не утверждать ручной trigger каждой migration.
6. Заменить `missing bearer token` на `missing valid access credential`; при необходимости отдельно документировать Bearer и cookie authentication + CSRF semantics.
7. Разделить `process requirement` и `GitHub-enforced requirement` для merge. Если green CI должен быть технически обязательным — включить branch protection/ruleset; иначе честно написать, что это manual team policy.
8. Для Test readiness либо оставить четыре historical minimum checks как `minimum subset`, либо перечислить текущий полный CI gate set.
9. Отделить `repository/deployment implemented` от `live production verified`: production smoke, storage, Redis, backup/restore readiness должны иметь собственные live evidence/date.
10. Добавить ссылку на `MVP_READINESS_DASHBOARD.md` как current readiness aggregation, а этот файл не использовать как основной current dashboard.

### [НЕ ПРОВЕРЕНО]

- Фактическое live production состояние Railway на 2026-08-08, включая storage/Redis/backup readiness и свежий smoke, не проверялось в рамках этого документационного шага.
- Не воспроизводился весь historical MVP smoke suite именно на commit/date, когда status block был добавлен 2026-08-06.
- Не подтверждалось, был ли когда-либо canonical seed с двумя learners до текущего `seed.mjs`; аудит фиксирует current `main`.
- Полный список всех protected endpoints и каждый auth-negative test не пересчитывались route-by-route; вывод про Bearer wording основан на current centralized `AuthGuard` credential resolution.
- Фактическое отсутствие секретов в истории Git не доказывалось вручную; current CI security scanning существует, но это отдельный security verification scope.

### Итог

`MVP_DEFINITION_OF_DONE.md` полезен именно в той роли, которую он сам теперь заявляет: **исторический минимальный порог раннего controlled pilot**. Проблема возникает только там, где historical document продолжает делать current абсолютные утверждения. Текущий `main` уже расходится как минимум по seed shape, retired API status artifact, production migration trigger и Bearer-only wording, а merge gate остаётся manual policy без branch protection. Рекомендуется сохранить historical checklist, но current readiness полностью делегировать `MVP_SCOPE_LOCK.md`/`MVP_READINESS_DASHBOARD.md` и привязывать любые “satisfied” статусы к конкретному SHA/date.
