# Продолжение аудита актуальности документации — часть 7

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_6.md` содержат результаты №21–26. Этот файл продолжает тот же последовательный аудит с №27.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 27 | `PILOT_CHECKLIST.md` | ⚠️ Частично актуален | Полезный pre-flight, но seed shape, migration approval, tenant error semantics, local runbook/DoD dependencies и live Railway claims требуют reconciliation |

---

## 27. `PILOT_CHECKLIST.md`

**Статус:** ⚠️ частично актуален. Checklist остаётся полезной структурой pre-flight перед controlled pilot, но несколько обязательных пунктов больше не соответствуют текущему `main`, а часть go/no-go условий зависит от документов и live-фактов, которые сами требуют повторной верификации.

### Проверено

- `docs/PILOT_CHECKLIST.md`;
- current `apps/api/prisma/seed.mjs`;
- current `.github/workflows/ci.yml`;
- current `MVP_DEFINITION_OF_DONE.md`;
- current `MVP_LOCAL_RUNBOOK.md`;
- current `PROJECT_LOG.md` retirement note;
- текущий branch protection state `main`;
- ранее подтверждённые runtime semantics для instructor ownership / 404 hiding и Railway migration startup.

### Подтверждённые факты

- Scope-confirmation section по смыслу остаётся корректным: pilot organization/users/course/learner flow и explicit out-of-scope действительно должны быть согласованы до пилота.
- `.env.example`, API port/JWT/database/storage settings и local runbook существуют, но сам local runbook сейчас неполон как clean-machine bootstrap.
- Current CI реально выполняет значительно больше минимальных четырех checks: dependency audit/waivers, lint, Prisma generate, typecheck, coverage tests, staging-smoke script tests, migrations, DB integration, build, browser E2E, accessibility, visual regression, Docker builds и Trivy image scans.
- Current seed безопасно использует фиксированный demo password и synthetic demo identities; в нем нет реальных пользовательских персональных данных.
- Current seed содержит: 1 organization, admin, **1 learner**, instructor, manager, 1 group, 1 course, **3 lessons**, 1 assignment, 1 progress record, assessment/questions/options.
- `PROJECT_LOG.md` действительно retired и прямо указывает `DEVELOPMENT_PLAN.md` как de facto дальнейший changelog/implementation ledger.
- `MVP_DEFINITION_OF_DONE.md` сам помечен как historical minimum bar, но продолжает утверждать, что все Required items удовлетворены.
- `main` не protected; required status checks enforcement выключен. Значит green CI перед merge — process policy, а не GitHub-enforced rule.

### Несоответствия и риски

1. **Seed checklist не соответствует current canonical seed.** Checklist требует 2 learners и 2 lessons. Current `seed.mjs` создаёт 1 learner и 3 lessons. Следовательно, пункт `Pilot dataset is ready` нельзя считать выполненным по literal checklist без изменения либо seed, либо checklist contract.

2. **Database migration rule устарел для production deployment.** Checklist требует `Do not apply real migrations without explicit operator approval`. Current Railway API startup автоматически выполняет `prisma migrate deploy` перед запуском application process. Review/merge approval может оставаться организационным gate, но каждое фактическое применение migration уже не имеет отдельного непосредственного operator trigger.

3. **API validation `Tenant-scope mismatch returns 403` слишком абсолютна.** Current authorization deliberately использует разные disclosure semantics: часть tenant/RBAC violations действительно даёт 403, но object-level instructor course ownership скрывает foreign/unassigned/missing course resources через 404. Checklist должен проверять endpoint-specific expected semantics, а не универсальный `tenant mismatch = 403`.

4. **`Protected endpoint without token returns 401` нужно сформулировать как отсутствие valid access credential.** Current browser auth cookie-first, а API также поддерживает Bearer path. Запрос без Authorization header может быть легитимно authenticated access cookie. Инвариант — нет валидного access credential → 401.

5. **`OpenAPI skeleton is available` формально верно, но недостаточно для pilot API-doc readiness.** Manual OpenAPI существует, однако предыдущий/current audit подтверждает, что он partial и не синхронизирован со всем runtime API. Checklist должен различать `skeleton exists` и `runtime contract synchronized`.

6. **Documentation section называет `DEVELOPMENT_PLAN.md` project changelog без предупреждения о его drift.** `PROJECT_LOG.md` действительно retired, но `DEVELOPMENT_PLAN.md` смешивает historical implementation ledger/current roadmap, имеет внутреннюю `PR N` нумерацию, не совпадающую с реальными GitHub PR, и содержит устаревшие статусы. Использовать его как canonical changelog можно только после reconciliation либо с явной оговоркой.

7. **Go/no-go утверждает, что MVP Definition of Done satisfied, но current DoD сам содержит stale Required items.** Проверенный DoD требует 2 learners в seed, explicit operator migration trigger, Bearer-only wording и clean local instructions; часть этих требований current `main` не выполняет буквально. Поэтому checklist не должен безусловно считать DoD satisfied без SHA-bound recalculation/waiver list.

8. **Go condition `Required env setup is clear` зависит от `MVP_LOCAL_RUNBOOK.md`, который сейчас не является clean-machine reproducible.** Current runbook не использует committed compose как canonical source, не включает migrations/seed в main flow, не поднимает Redis при default `REDIS_URL`, не создаёт MinIO bucket и устарел по refresh-cookie auth. Поэтому этот go-condition требует исправления runbook или явного pilot-specific environment runbook.

9. **`Smoke tests are green` не определяет, какой smoke является pilot evidence.** CI содержит browser E2E и тесты staging smoke script, но это не то же самое, что свежий live pilot-environment smoke. Для go/no-go нужен конкретный run ID/environment/date и набор tested flows.

10. **Known-risk statement `Redis not yet provisioned` является live operational assertion.** Repository code поддерживает Redis, `.env.production.example` ожидает `REDIS_URL`, а фактическое наличие Railway Redis service нельзя доказать текущими GitHub files. Этот пункт должен быть `[НЕ ПРОВЕРЕНО]` без свежего provider evidence.

11. **Status block с конкретным Railway production URL является быстро стареющим live fact.** Для pilot checklist нужно хранить `Verified at`/environment evidence или ссылаться на отдельный environment status artifact вместо бессрочного URL в stable checklist.

12. **Security validation `No real secrets in repository` нельзя подтвердить только чтением текущих файлов.** Current CI запускает Gitleaks secret scan, что является сильным автоматизированным контролем для checked commit/history scope CI, но checklist должен ссылаться на latest successful scan/run, а не превращать отсутствие найденного секрета в вечный static assertion.

13. **CI validation block неполон и не отражает merge enforcement.** Четыре строки Lint/Types/Tests/Build — только subset current CI. Одновременно branch protection выключена. Для pilot gate полезно проверять full current `Checks` workflow + CodeQL и отдельно фиксировать, что merge protection manual, если ruleset не включён.

14. **Rollback path слишком абстрактен.** Go condition требует, чтобы rollback path был clear, но checklist не указывает, какой именно rollback ожидается для code deploy, DB migration, seed/data changes и storage. `MIGRATION_BACKUP_POLICY.md` уже показал, что backup/restore readiness не machine-enforced и требует live operational evidence.

### Что изменить

1. Синхронизировать pilot seed contract с current canonical dataset: либо изменить требование на 1 learner/3 lessons + manager/assessment data, либо отдельным code PR добавить второго learner и привести dataset к checklist.
2. Переписать production migration пункт под фактический deployment model: committed/reviewed migrations применяются `prisma migrate deploy` автоматически при deploy; risky changes требуют отдельного backup/approval gate, если он действительно принят.
3. Заменить универсальный `tenant mismatch → 403` на endpoint-specific expected authorization/disclosure semantics (`401`, `403`, `404`).
4. Заменить `without token` на `without a valid access credential` и явно учитывать cookie + Bearer paths.
5. Для OpenAPI requirement определить требуемый уровень: `skeleton exists` либо `runtime contracts synchronized`; текущему состоянию соответствует только первое.
6. Не использовать `DEVELOPMENT_PLAN.md` как безусловно authoritative changelog до reconciliation; лучше сослаться на `PROJECT_SOURCE_OF_TRUTH.md` + current code/PR history, а DEVELOPMENT_PLAN оставить historical ledger.
7. В Go/no-go не считать DoD автоматически satisfied: хранить список verified/waived criteria и SHA/date.
8. Починить `MVP_LOCAL_RUNBOOK.md` либо добавить отдельный pilot environment runbook, который реально воспроизводит infra → migrations → seed → health → login → learner flow.
9. Для `Smoke tests are green` хранить конкретный workflow/run, environment и timestamp; отделить CI E2E от live production/pilot smoke.
10. Все Railway/Redis/live URL assertions вынести в environment-status документ и снабдить freshness evidence.
11. Расширить CI validation до current full checks и отдельно указать `main branch protection: off` как process risk, если green-before-merge должен быть обязательным.
12. Детализировать rollback path по типу изменения: code redeploy/revert, DB forward-fix/restore, seed/data rollback, storage operations; ссылаться на проверенный backup/restore runbook.
13. Добавить `Verified at` / `Verified against main SHA` в status block checklist.

### [НЕ ПРОВЕРЕНО]

- Фактический live Railway production URL/service topology и наличие Redis на 2026-08-08 не проверялись provider API.
- Свежий end-to-end smoke именно в pilot/live environment не запускался в рамках этого документационного шага.
- Не подтверждалось, что pilot organization/users/course и owner risk acceptance уже выбраны бизнесом.
- Не выполнялся clean-machine bootstrap по `MVP_LOCAL_RUNBOOK.md`; его gaps подтверждены static code/config audit, но не повторным практическим запуском в этой задаче.
- Не проверялся полный rollback drill/backup restore.

### Итог

`PILOT_CHECKLIST.md` сохраняет правильную структуру pre-flight, но текущий status block переоценивает его актуальность. На текущем `main` буквальный seed contract не выполнен, migration approval wording не соответствует Railway startup, tenant errors не всегда 403, DoD/local-runbook dependencies сами stale, а live Redis/Railway/smoke assertions требуют свежего evidence. Перед реальным pilot go/no-go checklist нужно превратить из статического списка в SHA/date-bound verification record с конкретными CI/live run IDs, explicit waivers и rollback evidence.
