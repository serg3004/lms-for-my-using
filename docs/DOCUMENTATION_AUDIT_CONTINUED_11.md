# Продолжение аудита актуальности документации — часть 11

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_10.md` содержат результаты №21–30. Этот файл продолжает тот же последовательный аудит с №31.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 31 | `PR_89_102_VERIFICATION.md` | ⚠️ Historical snapshot, существенно stale как current status | Verification от 2026-06-04 полезен как история, но internal planned PR 89–102 не равны GitHub PR #89–102; upload/auto-certificate уже реализованы, seed и routing изменились, Railway smoke позже выполнялся |

---

## 31. `PR_89_102_VERIFICATION.md`

**Статус:** ⚠️ исторический verification snapshot от 2026-06-04; существенно устарел как current implementation/readiness status. Документ не следует переписывать построчно под сегодняшнее состояние — его нужно явно зафиксировать как snapshot и убрать двусмысленность идентификаторов.

### Проверено

- полный `docs/PR_89_102_VERIFICATION.md`;
- Git commit, которым документ был добавлен, и его parent snapshot;
- реальные GitHub PR #89, #97, #102 как выборку для проверки нумерации;
- current upload backend/controller/validation;
- current Admin Materials upload UI;
- current assessment-attempt certificate issuance logic/tests;
- current demo seed;
- current route composition;
- current CI workflow;
- later `STAGING_SMOKE_REPORT.md`;
- current `main` после PR #526.

### Подтверждённые исторические факты

- Документ был добавлен commit `7d110f6eb0cf4112a2fff81b011ef3ddd594324e` от 2026-06-04 с message `docs: verify PR 89-102 status`.
- Его parent snapshot — `5c8594c9136b9a2f4477869575938c11539a4262` от 2026-06-04. Это точная база, относительно которой корректно читать старые `present / partial / not confirmed` выводы.
- Commit самого verification документа был docs-only и прямо фиксировал, что runtime/Prisma/Docker/Railway/env/API/UI/test code не менялся.
- Сам документ честно говорил, что verification был repository inspection, а local build/tests/seed/Docker/Railway deployment не запускались в рамках этого шага. Это корректный historical process fact.

### Существенные несоответствия и drift

1. **`PR 89–102` в документе не являются реальными GitHub PR #89–102.** Это главная проблема идентификации.
   - Planned PR 89 в документе — Railway configuration; реальный GitHub PR #89 — `feature: add admin org structure UI`.
   - Planned PR 97 в документе — backend S3-compatible upload; реальный GitHub PR #97 — `feature: add results dashboard and certificates UI`.
   - Planned PR 102 в документе — demo seed; реальный GitHub PR #102 — `PR 43 — docs sync after auth hardening`.
   Следовательно, таблица использует internal plan/work-item numbering. Название файла и headings создают ложное впечатление, что проверяются GitHub PR #89–102.

2. **Backend upload blocker из planned PR 97 давно закрыт на уровне current code.** Сейчас существует `apps/api/src/modules/upload/` с service/validation/tests. `CourseMaterialsController` имеет buffered file upload, direct multipart initiate/complete/abort, presigned download, delete flow, validation и malware-scan dispatch. Поэтому status `not confirmed / missing` корректен только для snapshot 2026-06-04.

3. **Frontend file upload blocker из planned PR 98 также закрыт.** Current `AdminMaterialsPage.tsx` использует `uploadFileWithProgress`, file picker, upload progress, create/edit file flows и replace-file action. Старое утверждение `file upload not confirmed` нельзя использовать как current status.

4. **Auto certificate issuance из planned PR 101 теперь реализована.** Current `AssessmentAttemptsService.createAttempt()` оценивает attempt и при `passed === true` внутри той же Prisma transaction выполняет `certificate.upsert` по `(organizationId, courseId, userId)` с привязкой к assessment attempt. То есть старый blocker `automatic issuance not confirmed` больше не соответствует runtime implementation.

5. **Demo seed из planned PR 102 существенно изменился.** Current seed создаёт admin, **1 learner**, instructor и manager; 1 group; 1 course; **3 lessons**; 3 link materials; assignment; partial progress; assessment с `passingScore: 60`, `maxAttempts: 3`, `availableAfterCourseCompletion: false`; **5 questions** и answer options. Это уже не старый dataset, который verification описывал как 2 learners / 2 lessons / 1 question / passing score 70 и pre-existing certificate/attempt state.

6. **Current seed не содержит pre-created assessment attempt/certificate в проверенном `seed.mjs`.** Certificate теперь может выдаваться runtime при successful assessment attempt. Поэтому старую verification-логику “seed already includes issued certificate, but auto issuance not confirmed” особенно важно оставить только как historical observation.

7. **Routing paths устарели.** Verification многократно проверяет наличие route wiring в `apps/web/src/app/App.tsx`. Current `App.tsx` теперь только композирует `AdminRoutes`, `ManagerRoutes`, `InstructorRoutes`, `LearnerRoutes`, `PublicRoutes` из `apps/web/src/app/routes/*`. Старые file-location checks больше не подходят для current verification.

8. **Blocker `full Railway smoke not run` является историческим, а не current fact.** В repository позже появился `STAGING_SMOKE_REPORT.md`: Smoke #1 от 2026-06-06 и Smoke #2 от 2026-06-07 фиксируют Railway API/Web/PostgreSQL bring-up и manual smoke flows. Это не означает, что production/staging сейчас свежо проверены — только доказывает, что старый blocker был позже преодолён хотя бы исторически.

9. **Поздний smoke сам теперь historical.** `STAGING_SMOKE_REPORT.md` привязан к June 2026 commits и не является evidence текущего live состояния на 2026-08-08. Поэтому нельзя просто заменить старое `not run` на бессрочное `green`; current live environment по-прежнему требует свежей проверки.

10. **Admin/learner runtime verification теперь имеет более сильную CI базу, но старые claims нельзя автоматически считать полностью закрытыми route-by-route.** Current CI выполняет browser E2E, accessibility и responsive visual suites, database migrations/integration tests, build и security scans. Однако в рамках этого audit шага не реконструировалось соответствие каждого planned item 91–100 отдельному current E2E case.

11. **Verification methodology должна быть snapshot-bound.** Старый документ использует слова `Current repository state`, `Current blockers`, `Recommended next PR order`, но не показывает parent/main SHA рядом с header. Git history позволяет восстановить snapshot (`5c8594c9...`), но читателю это не очевидно.

12. **Recommended next order давно не является актуальной очередью.** Upload implementation, automatic certificate issuance, seed evolution и Railway smoke появились после snapshot; project main уже дошёл до PR #526. Поэтому старый порядок 97 → 101 → 102 → 103 должен быть помечен historical, а не current backlog.

13. **PR #526, вошедший в `main` во время аудита, не меняет выводы по этому документу.** Он изменяет learner draft-course visibility в courses controller/service/tests и `ENTITY_TECHSPEC_IMPLEMENTED.md`; исторические verification findings 89–102, upload, certificate, seed и routing он не затрагивает.

### Что изменить

1. Не обновлять старую таблицу под current code; сохранить её как historical snapshot.
2. Переименовать/дополнить title и banner: `Historical verification of internal plan items 89–102 (2026-06-04)`.
3. Явно написать: `89–102 are internal plan/work-item identifiers, not GitHub pull request numbers`.
4. Добавить snapshot metadata:
   - `Verified at: 2026-06-04`;
   - `Verified against repository SHA: 5c8594c9136b9a2f4477869575938c11539a4262`;
   - verification commit `7d110f6eb0cf4112a2fff81b011ef3ddd594324e`.
5. Переименовать `Current repository state`, `Current blockers`, `Recommended next PR order` в `Repository state at snapshot`, `Blockers at snapshot`, `Recommended next order at snapshot`.
6. Добавить короткий `Superseded/current status` banner: upload, frontend upload, auto-certificate и later Railway smoke были реализованы/выполнены позже; за current state обращаться к current code + current readiness artifacts, а не к этой таблице.
7. Не использовать `App.tsx` как evergreen route verification path; historical path оставить как snapshot evidence, current navigation checks должны следовать `app/routes/*`.
8. Для seed section явно пометить dataset values как state-at-snapshot, не как canonical current demo contract.
9. Не превращать later June smoke report в current live evidence: operational statuses всегда снабжать environment/date/SHA/run evidence.
10. Если нужен новый end-to-end verification of current project, создать отдельный fresh artifact, а не мутировать historical `PR_89_102_VERIFICATION.md`.

### [НЕ ПРОВЕРЕНО]

- Не реконструирован полный mapping каждого internal planned item 89–102 к branch/commit/actual GitHub PR. Выборка GitHub #89/#97/#102 достаточно подтверждает, что internal numbering не равно GitHub numbering, но точное происхождение каждого plan item требует historical planning archaeology.
- Не воспроизводились build/tests/seed/Docker/Railway commands на snapshot commit `5c8594c9...`; сохранено исходное утверждение документа, что автор verification их тогда не запускал.
- Не проверено live Railway состояние на 2026-08-08; June staging smoke — только historical evidence.
- Не проведён route-by-route current E2E mapping для всех planned items 91–100.
- Не проверялся полный historical diff каждого planned item против snapshot; цель аудита — определить актуальность документа сегодня, а не провести forensic reconstruction всех старых implementation steps.

### Итог

`PR_89_102_VERIFICATION.md` полезен как археологический snapshot состояния проекта на 2026-06-04, но опасен как current status document. Главный structural defect — название `PR 89–102`: эти номера не совпадают с реальными GitHub PR и должны быть названы internal plan/work items. Большая часть тогдашних blockers уже исторически закрыта: backend/frontend upload реализованы, successful assessment attempt автоматически upsert-ит certificate, seed сильно изменён, routing вынесен из monolithic `App.tsx`, а Railway smoke позже выполнялся. Документ следует заморозить как SHA-bound historical evidence и не использовать для текущего go/no-go.
