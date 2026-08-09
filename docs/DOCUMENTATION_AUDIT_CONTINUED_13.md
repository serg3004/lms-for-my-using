# Продолжение аудита актуальности документации — часть 13

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_12.md` содержат результаты №21–32. Этот файл продолжает последовательный аудит с №33.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 33 | `RAILWAY_PRODUCTION_SMOKE_STATUS.md` | ⚠️ Historical last-known-good, корректно self-marked stale | Stale warning точен, но direct public API/API_UPSTREAM_URL checklist уже противоречит current private-only API perimeter; live production всё ещё требует свежего smoke |

---

## 33. `RAILWAY_PRODUCTION_SMOKE_STATUS.md`

**Статус:** ⚠️ корректно помечен как stale historical last-known-good, но его operational checklist и network details частично superseded. Документ правильно предупреждает, что результат 2026-07-08 нельзя считать current production verification, однако внутри всё ещё хранит старую public-API workaround архитектуру.

### Проверено

- `docs/RAILWAY_PRODUCTION_SMOKE_STATUS.md`;
- Git history самого status-файла;
- historical GitHub PR #341 и #342;
- current `apps/web/Dockerfile`;
- current `infra/nginx/nginx.conf`;
- current `infra/railway/README.md`;
- current `apps/api/src/scripts/smoke-test.ts` и его Git history;
- current `.github/workflows/staging-smoke.yml`;
- current repository docs/context around staging/production smoke;
- current `main` after PR #528.

### Подтверждённые факты

- Последний успешный production smoke, записанный в документе, датирован **2026-07-08** и имеет результат `Passed: 17 / Failed: 0`.
- 2026-08-06 документ был намеренно обновлён commit `55e5609787d381d560f42033d9a7b0d2d9550296`, чтобы пометить этот результат stale, а не выдавать его за fresh verification.
- Stale banner прямо говорит, что fresh live smoke из тогдашнего sandbox не удалось выполнить из-за egress policy (`403 Host not in allowlist`) и что старый green результат нельзя доверять как current.
- Это корректная политика доказательств: документ также отдельно предупреждает `Do not treat green GitHub checks as production verification`.
- Historical PR #341 и #342 — реальные GitHub PR:
  - #341 `fix(web): allow full API upstream URL` ввёл `API_UPSTREAM_URL` и fallback на working public API URL, когда Railway private networking тогда не работал;
  - #342 `fix(web): configure nginx upstream TLS and timeouts` добавил SNI/timeouts для HTTPS public upstream workaround.
- Current Web Dockerfile по-прежнему поддерживает configurable `API_UPSTREAM_URL`, но его **default** теперь `http://api.railway.internal:3000`.
- Current nginx comment прямо говорит, что Railway private networking — default и API должен оставаться private, чтобы Web nginx был единственной public `/api/` entry point.
- Current `infra/railway/README.md` ещё жёстче фиксирует perimeter: `Do not enable Public Networking on the API service`; весь public `/api/` traffic должен входить через Web nginx/private network.
- Current smoke script всё ещё существует по `apps/api/src/scripts/smoke-test.ts`. Его последний code change был 2026-06-05, то есть сам smoke scenario не менялся после historical production run 2026-07-08. Следовательно, `Passed: 17 / Failed: 0` является правдоподобным historical result для того же script generation, но не evidence текущего deployment.
- Current GitHub workflow `Staging smoke` — manual `workflow_dispatch`, использует отдельный `scripts/smoke-staging.sh` и GitHub environment `staging`; это отдельный role-based smoke mechanism и не является автоматической current production verification.

### Несоответствия и риски

1. **`Production endpoints` продолжает публиковать direct public API URL как current endpoint, хотя current architecture требует private-only API.** Исторически этот URL был нужен для July workaround/diagnostics. Сейчас canonical infra guide запрещает API Public Networking. В current status artifact direct API URL следует либо удалить, либо явно пометить `historical endpoint; should not be publicly exposed under current perimeter`.

2. **`Railway web variables` фиксирует `API_UPSTREAM_URL=https://api-production-...railway.app`, что противоречит current Web default/private-network policy.** Current Dockerfile default — `http://api.railway.internal:3000`; `infra/railway/README.md` говорит, что Web не требует extra env и proxy target — private API. Public HTTPS upstream был historical workaround PR #341/#342, а не current desired topology.

3. **Post-merge checklist требует direct API health check.** Step `Check GET /api/v1/health through the direct API URL` больше не совместим с private-only API perimeter. Current production verification должна проверять public Web ingress `/api/...` плюс API readiness/liveness из Railway internal/service context, а не требовать public API domain.

4. **Checklist использует `/api/v1/health`, хотя current deploy healthcheck canonical path — `/api/v1/health/ready`.** `/health` остаётся compatibility/readiness alias, поэтому old check технически может работать, но current runbook должен использовать `/health/live` для liveness и `/health/ready` для dependency readiness.

5. **Status `OK (as of 2026-07-08, unverified since)` сформулирован приемлемо, но слово `OK` всё равно легко вырывается из stale context.** Для operational status artifact безопаснее top-level state `STALE / NOT CURRENTLY VERIFIED`, а `Last known-good: 2026-07-08 — 17/0` хранить вторичной строкой.

6. **Stale age в banner (`~60 PRs`) является быстро стареющим числом.** После update 2026-08-06 main продолжил меняться до PR #528. Для freshness лучше хранить exact last-verified SHA/PR и current check comparison либо просто дату, а не вручную поддерживать approximate merged-PR count.

7. **Last successful smoke не привязан к exact deployed commit/SHA.** Git history подтверждает дату status commit, но документ не хранит Railway deployment ID, deployed Git SHA или smoke execution log/run ID. Из-за этого даже historical 17/0 нельзя строго связать с конкретным application revision только по самому status file.

8. **Network fix history #341/#342 теперь должна быть маркирована superseded.** Эти fixes остаются важной incident history, но current private-network architecture изменила intended endpoint. Без qualifier читатель может восстановить public API upstream и тем самым нарушить нынешний perimeter.

9. **Smoke command использует Web ingress — это правильно для current public perimeter.** `BASE_URL=https://<web>/api/v1 ... smoke-test.ts` проверяет browser-like public entry path через nginx. Это следует сохранить. Но direct API check рядом с ним нужно убрать/заменить internal verification.

10. **Document не проверяет current Redis/storage readiness отдельно.** Current `/health/ready` включает DB/Redis/storage state. Historical status пишет `web -> api -> db OK`, но не фиксирует Redis/storage fields. Для current production smoke readiness evidence должен сохранять dependency-level result без секретов.

11. **`Staging smoke` workflow не решает freshness production status автоматически.** Он manual и использует `STAGING_*` variables/environment. Даже green staging smoke нельзя переносить на production без отдельного production-target evidence.

12. **Fresh live smoke всё ещё `[НЕ ПРОВЕРЕНО]` в этой задаче.** Доступный GitHub connector подтверждает repository/config/history, но не даёт Railway provider/live HTTP access; поэтому stale warning нельзя снять.

13. **PR #528, вошедший в main во время аудита, не меняет выводы.** Он docs-only и затрагивает только `ENTITY_TECHSPEC_IMPLEMENTED.md`; Railway/network/smoke code/config не изменены.

### Что изменить

1. Сменить top-level state на `STALE — production not currently verified`; отдельно хранить `Last known-good: 2026-07-08, Passed 17 / Failed 0`.
2. Добавить historical evidence metadata: deployed Git SHA, Railway deployment ID/environment и smoke execution timestamp/log artifact при следующем live run.
3. Удалить direct public API URL из current production endpoints либо пометить его historical/superseded; current public endpoint должен быть Web ingress.
4. Удалить/архивировать current-variable claim `API_UPSTREAM_URL=https://public-api...`; current desired value/default — `http://api.railway.internal:3000`, если live Railway topology это подтверждает.
5. Обновить post-merge verification:
   - public Web root;
   - public `Web /api/v1/health/ready`;
   - internal API `/health/live` и `/health/ready` через Railway service/private context;
   - full MVP smoke through Web ingress;
   - record Redis/storage readiness fields.
6. Сохранить PR #341/#342 как historical incident/fix context, но добавить `Superseded by current private-only API perimeter`.
7. Убрать approximate `~60 PRs`; использовать exact `Last verified at`, `Last verified SHA`, `Current main SHA at status review` или автоматически вычисляемый freshness marker.
8. Не обновлять `Status: OK` на основании CI/CodeQL. Менять stale→verified только после реального production smoke.
9. Развести `Staging smoke` workflow и production smoke: каждый environment должен иметь собственный evidence/run ID/date.
10. Ссылаться на `infra/railway/README.md` и `apps/*/railway.json` как current network/deployment config sources, чтобы historical workaround variables не становились новой настройкой по копипасте.

### [НЕ ПРОВЕРЕНО]

- Фактическая live доступность Web URL на 2026-08-08.
- Фактическая Railway service topology, private DNS connectivity и наличие/отсутствие Public Networking у API.
- Реальное текущее значение `API_UPSTREAM_URL` в Railway Web service.
- Production Redis/storage readiness, env values и provider state.
- Свежий production MVP smoke после PR #528.
- Exact deployed SHA/deployment ID historical smoke 2026-07-08 — status document их не содержит.

### Итог

`RAILWAY_PRODUCTION_SMOKE_STATUS.md` делает главное правильно: он **не притворяется свежим** и прямо говорит, что last-known-good от 2026-07-08 stale. Поэтому его нельзя классифицировать как просто ложный “green status”. Однако operational details внутри файла застыли в July public-API workaround: direct API endpoint, public `API_UPSTREAM_URL` и direct API post-merge check уже расходятся с current private-only API perimeter. Документ следует оставить status artifact, но сделать top-level `STALE/NOT VERIFIED`, вынести #341/#342 в superseded incident history и обновлять current status только по fresh production smoke с SHA/deployment/run evidence.
