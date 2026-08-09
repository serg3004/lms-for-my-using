# Продолжение аудита актуальности документации — часть 8

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_7.md` содержат результаты №21–27. Этот файл продолжает тот же последовательный аудит с №28.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 28 | `PRODUCTION_HARDENING_BACKLOG.md` | ⚠️ Существенно устарел как current backlog | Многие open items уже реализованы полностью или частично; live ops-хвосты нужно отделить от code backlog, major upgrades 132–135 закрыты |

---

## 28. `PRODUCTION_HARDENING_BACKLOG.md`

**Статус:** ⚠️ существенно устарел как текущий production-hardening backlog. Историческая часть полезна, но сводная таблица и рекомендуемый порядок больше не отражают current `main`.

### Подтверждено

- P0 auth/session items 118/120/121/122 действительно закрыты.
- PR 119 в исходном acceptance sense уже выполнен: большие frontend pages используют вынесенные leaf components/models/hooks, хотя дополнительный cleanup остаётся возможным.
- PR 124 фактически закрыт: upload validation содержит filename hardening, ZIP entry count, compression ratio и total uncompressed-size guards, плюс соответствующие negative tests.
- PR 125 code integration уже существует: quarantine flow, dispatch во внешний malware scanner, callback secret, timeout/error behavior и verdict handling реализованы. Live scanner service/provider остаётся operational verification.
- PR 126 частично закрыт: API имеет coverage thresholds (60/45/60/60), Web — global 40% и отдельный 80% threshold; Shared по-прежнему запускает Vitest с `--passWithNoTests` и не имеет coverage gate.
- PR 127 закрыт: Playwright browser E2E выполняется в CI вместе с accessibility и visual suites.
- PR 128 реализован, но неполно: Dependabot config существует с weekly grouping, однако npm directories охватывают `/`, `/apps/api`, `/apps/web`, но не `/apps/e2e` и `/packages/shared`.
- PR 129 остаётся открыт: GitHub возвращает `main protected: false`, required status checks enforcement `off`.
- PR 130 частично/существенно реализован в коде: `nestjs-pino` structured logging, redaction, optional Sentry (`SENTRY_DSN`) и rate-limit degradation/recovery events присутствуют. Basic external alerting/live Sentry configuration не подтверждены.
- PR 131 backup restore drill остаётся непроверенным/операционным gap: repository automation restore drill не обнаружена.
- PR 136 load testing остаётся открытым: в root scripts нет k6/load-test/bulk-seed scenario; production запуск такого теста не выполнялся.
- PR 137 закрыт; current expired-cookie test использует отдельные `waitForResponse()` и дополнительный `about:blank` race mitigation. Backlog описывает не всю актуальную историю стабилизации.
- Major upgrades 132–135 уже закрыты текущими manifests: NestJS 11, TypeScript 6, ESLint 10 и `@vitejs/plugin-react` 6 установлены.

### Несоответствия

1. Сводная таблица оставляет PR 119, 124, 125, 126, 127, 128, 130 и 132–135 как открытые/запланированные, хотя current code уже реализует их полностью или существенно частично.
2. PR 124 и PR 125 больше нельзя описывать как отсутствующие code capabilities: stronger archive validation и malware-scan integration существуют.
3. PR 126 следует разделить по workspace: API/Web gate реализован, Shared — нет.
4. PR 128 следует пометить `Partial`, а не “dependency updates manual”: Dependabot активно настроен, но scope workspace неполный.
5. PR 130 wording “нет видимости runtime ошибок” устарел: structured logging и optional Sentry уже в коде. Открытым остаётся live provider/alerts verification.
6. Redis PR 123 содержит конкретный Railway snapshot от 2026-08-06. Без свежего provider read его нельзя считать current live fact; repository подтверждает только code/env contract.
7. PR 131 утверждает `Backup есть (Railway автоматический)` без свежего provider evidence. Backup existence/retention/restore readiness должны быть live-verified.
8. PR 136 требует “403 там, где нужно”, но current authorization использует endpoint-specific 401/403/404 disclosure semantics; нагрузочные assertions должны следовать actual contract.
9. Recommended order устарел: PR 126/127/124 code work уже не должно блокировать очередь, а 132–135 уже выполнены.
10. Internal `PR N` numbering в backlog является plan-item numbering и не должно смешиваться с реальными GitHub PR, если номера не совпадают.

### Что изменить

1. Пересчитать таблицу на current `main` и ввести статусы `Done / Partial / Ops-only / Open / Live verification required`.
2. Закрыть или архивировать PR 119, 124, 127 и major-upgrade items 132–135 как выполненные по current code.
3. PR 125 разделить: `code integration done`, `scanner service/live config not verified`.
4. PR 126 разделить: API/Web coverage gates done; Shared coverage tests/gate open.
5. PR 128 пометить Partial и добавить `/apps/e2e`, `/packages/shared` в отдельном config change.
6. PR 130 пометить Partial: Pino/Sentry hooks implemented; live DSN, alert routing/dashboard verification остаются ops.
7. Оставить PR 129, 131 и 136 как реальные gaps; branch protection, restore drill и load testing требуют отдельных действий/verification.
8. Для PR 123 убрать stale Railway snapshot из evergreen backlog либо добавить `Verified at`/provider evidence.
9. Обновить PR 137 historical note с более поздним race fix (`about:blank`) и не держать закрытую задачу в active queue.
10. Пересобрать recommended order вокруг реально открытых задач: branch protection, Shared coverage, Dependabot workspace completion, live Redis/scanner/observability verification, backup restore drill, load testing.
11. Отделить code backlog от production-ops checklist, чтобы GitHub-verifiable implementation не смешивалась с Railway/provider state.
12. Добавить `Verified against main SHA` и дату последней reconciliation.

### [НЕ ПРОВЕРЕНО]

- Live Railway Redis provisioning и фактическое значение `REDIS_URL`/escape hatch на 2026-08-08.
- Live malware scanner service/provider и callback secret configuration.
- Live `SENTRY_DSN`, Sentry project, alert rules и incident delivery.
- Railway/Postgres backup schedule, retention и успешный restore drill.
- Нагрузочное поведение 500–1000 concurrent users: k6/load test не запускался.

### Итог

Документ полезен как историческая карта hardening, но больше не подходит как активная очередь без reconciliation. Current `main` уже существенно обогнал таблицу: stronger upload validation, malware scan integration, Playwright E2E, API/Web coverage gates, Dependabot automation, observability hooks и все четыре major upgrades реализованы. Реально открытые production-hardening gaps сейчас меньше и в значительной степени смещены в ops/enforcement: branch protection, Shared coverage, полный Dependabot workspace scope, live Redis/scanner/Sentry verification, backup restore drill и load testing.
