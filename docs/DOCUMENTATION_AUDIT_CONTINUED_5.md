# Продолжение аудита актуальности документации — часть 5

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_4.md` содержат результаты №21–24. Этот файл продолжает тот же последовательный аудит с №25.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 25 | `MVP_SCOPE_LOCK.md` | ⚠️ Частично актуален | Границы MVP в целом полезны, но current snapshot устарел; private/public, storage deployment, self-enrollment и readiness criteria требуют reconciliation |

---

## 25. `MVP_SCOPE_LOCK.md`

**Статус:** ⚠️ частично актуален. Документ остаётся сильным источником продуктовых границ и out-of-scope guardrails, но его current realization snapshot и несколько зафиксированных assumptions уже расходятся с текущим `main`.

### Проверено

- полный `MVP_SCOPE_LOCK.md`, включая §0 current realization status, §2 in-scope capabilities, §3 out-of-scope, §4 simplifications, §5 success criteria и agent rules;
- текущий repository visibility;
- current API module inventory;
- current production env template для Redis/storage;
- `PROJECT_SOURCE_OF_TRUTH.md` и приоритет `MVP_SCOPE_LOCK.md` как current scope source;
- изменения PR #520 в progress/course contract (`Course.selfEnrollmentEnabled`);
- ранее подтверждённые findings по notifications/audit log, instructor ownership, deployment/storage, local runbook и readiness dashboard;
- текущий `main` после PR #522.

### Подтверждённые факты

- Документ правильно отделяет fixed product scope от realization snapshot: §0 прямо говорит, что snapshot можно обновлять, а §2 не должен молча переписываться.
- Core learning loop и большая часть разделов 2.1–2.10 действительно реализованы в текущем API/Web surface; notifications и audit-log modules в current `apps/api/src/modules` отсутствуют.
- Документ честно показывает `Notifications` и `Audit Log` как не реализованные и отмечает audit log как единственный незакрытый пункт собственного success-criteria списка.
- Частичные статусы для Courses/Lessons и Assignments/Enrollments отражают реальное расхождение между первоначальной моделью и текущей архитектурой: отдельного `course_modules` слоя нет, а отдельная enrollment model не является основным текущим механизмом learner access/progress.
- Большой out-of-scope список (AI tutor/RAG, microservices, Kubernetes, SCORM/xAPI/LTI, enterprise SSO/SCIM, billing, native mobile, advanced BI, custom role builder и др.) по-прежнему служит полезным guardrail против scope creep.
- PR #520 ввёл новый подтверждённый продуктовый путь: learner может создавать progress при active Assignment **или** если у course включён `selfEnrollmentEnabled`; флаг добавлен в Course schema/API и по умолчанию `false`.

### Несоответствия и риски

1. **Current realization snapshot устарел по собственной метрике freshness.** §0 зафиксирован как пересчёт на 2026-08-06 против `main` после PR #505. Текущий `main` уже находится на merge PR #522. Для документа, который `PROJECT_SOURCE_OF_TRUTH.md` называет актуальным источником feature status, текущий snapshot должен иметь `Verified against main SHA`, а не только дату/PR.

2. **`private GitHub monorepo` фактически неверно.** §2.14 и практический checklist требуют private GitHub repository, но текущий repository имеет visibility `public`. Это либо невыполненное locked requirement, либо принятое изменение scope/security posture — в обоих случаях документ должен отражать решение явно.

3. **Production storage assumption противоречит current configuration guidance.** §0 Files и Deployment утверждают `MinIO на Railway` как текущий факт. Однако `.env.production.example` рекомендует `Cloudflare R2 or AWS S3 in production`, а MinIO упоминает как self-hosted/path-style option. Repository может подтвердить S3-compatible implementation, но не конкретного live provider. `MinIO on Railway` без свежего environment evidence должно быть `[НЕ ПРОВЕРЕНО]`, а не fixed current fact.

4. **Scope lock не отражает owner-approved self-enrollment change из PR #520.** Fixed scope §2.6 описывает assignment/enrollment flow, а §4 simplifications не содержит `Course.selfEnrollmentEnabled`. PR #520 сознательно добавил self-paced path без Assignment. Это продуктовый contract change, а не чистая реализационная деталь, поэтому его необходимо либо оформить как versioned approved scope exception, либо явно пересмотреть §2/§4.

5. **Readiness rule внутренне неоднозначен для Notifications.** §2.12 включает in-app Notifications в MVP и описывает конкретные capabilities. §0 показывает Notifications как не реализованные. Но §5 success criteria не содержит notification scenario и финальный status говорит, что только Audit Log мешает формальному выполнению критериев. В результате документ одновременно говорит «Notifications входят в MVP» и позволяет считать MVP success criteria выполненными без них. Нужно явно выбрать: все §2 обязательны для MVP readiness либо часть scope является `in-scope but non-blocking for pilot`.

6. **Accepted architecture simplifications не полностью отражены в §4.** Current implementation использует `Membership` для roles/organization relation, direct course→lesson structure вместо отдельного `course_modules`, а learner course access/progress строится вокруг Assignment + Progress плюс теперь self-enrollment flag. §0 частично объясняет эти отличия, но §4 — официальный раздел simplifications — не закрепляет их как принятые deviations. Из-за этого future agent может ошибочно попытаться “достроить” старую схему до буквального §2.

7. **Section 2.14 смешивает repository/deploy implementation и live infrastructure state.** Docker/Railway configs и health endpoints действительно существуют. Но `Postgres+MinIO на Railway`, “продакшн реально развёрнут и используется” и success criterion `приложение деплоится на Railway` имеют две разные доказательные базы: code/config vs live environment. Live state должен иметь дату/evidence и не храниться как бессрочный repository fact.

8. **`9 из 14 полностью / 3 частично / 2 не начаты` — snapshot, а не устойчивый current metric.** Числа могут остаться теми же, но после PR #520 изменились assignment/progress semantics, после последующих PR менялись security/domain contracts. Dashboard-like totals нужно пересчитывать на конкретном SHA, а не переносить автоматически.

9. **Agent rule “при изменении API/DB обновить docs” не сработал для scope-affecting изменения PR #520.** PR #520 обновил Prisma/API behavior и entity techspec, но `MVP_SCOPE_LOCK.md` остался на snapshot PR #505. Это прямой пример, почему scope document нуждается в explicit change log или check, а не только manual convention.

10. **Repository visibility drift дублируется в higher-level docs.** `PROJECT_SOURCE_OF_TRUTH.md` также говорит `private GitHub monorepo`, хотя repository public. Значит проблема не локальна одному файлу и при последующей фазе исправлений должна быть синхронизирована во всех canonical docs.

### Что изменить

1. Добавить snapshot header: `Verified at`, `Verified against main SHA`, `Verified through PR` и пересчитать §0 на текущем `main` после завершения documentation audit.
2. Разрешить конфликт repository visibility:
   - если private — обязательное требование, вернуть repository private отдельным явно разрешённым operational action;
   - если public принят осознанно, изменить scope/security docs и зафиксировать owner decision.
3. Разделить storage contract и live provider:
   - fixed scope: `S3-compatible object storage`;
   - local recommendation: MinIO;
   - production provider: current approved R2/S3/MinIO choice с отдельным live evidence/date.
4. Добавить versioned `Approved scope changes / exceptions` section. Первым подтверждённым примером вне snapshot должен быть PR #520: `Course.selfEnrollmentEnabled` как разрешённый self-paced learner path, owner decision, дата и PR.
5. Явно определить readiness semantics для §2: `required for MVP release`, `in-scope but pilot-non-blocking`, `P1`. Notifications нельзя одновременно считать обязательным MVP scope и не учитывать в readiness без объяснения.
6. Перенести принятые structural deviations в §4 simplifications: Membership вместо отдельного `user_roles` как самостоятельного домена, direct lessons без `course_modules`, Assignment/Progress + approved self-enrollment вместо отдельной enrollment architecture — только если это действительно подтверждённые продуктовые решения.
7. Для §2.14 и success criterion 18 отделить `deployment configuration implemented` от `live Railway verified`; live provider/service assertions снабжать timestamp/evidence.
8. Убрать бессрочные totals из §0 либо пересчитывать их автоматически/в каждом controlled scope reconciliation с SHA.
9. Ввести обязательное правило для scope-affecting PR: если меняется user-visible learning flow, роль, assignment/enrollment semantics или locked simplification, PR должен либо обновить `MVP_SCOPE_LOCK.md`, либо явно отметить `no scope impact` с обоснованием.
10. Сохранить §3 out-of-scope и agent guardrails: это одна из самых актуальных и полезных частей документа.

### [НЕ ПРОВЕРЕНО]

- Фактический live production storage provider на 2026-08-08 (MinIO/R2/AWS S3/другой) не проверялся через Railway/provider API.
- Не выполнялась исчерпывающая проверка отсутствия каждого элемента огромного §3 out-of-scope списка; проверены ключевые architecture/module boundaries и отсутствие очевидных соответствующих API modules.
- Не установлено, является ли public repository намеренным бизнес/безопасностным решением либо временным нарушением original scope requirement — это требует owner decision.
- Не определено бизнес-решением, являются ли Notifications release-blocking для MVP/pilot или могут оставаться `in-scope but non-blocking`.
- Не подтверждено, что все перечисленные выше structural deviations официально одобрены как постоянные simplifications; часть из них зафиксирована текущей реализацией, но scope document должен хранить именно подтверждённые решения, а не выводы аудитора.

### Итог

`MVP_SCOPE_LOCK.md` остаётся одним из самых полезных canonical документов проекта: fixed scope, out-of-scope guardrails и запрет silent scope creep сформулированы правильно. Его слабое место — отсутствие формального механизма evolution. С момента snapshot PR #505 уже появился owner-approved self-enrollment contract, repository фактически public, production storage guidance разошлась с `MinIO on Railway`, а Notifications показывают внутреннюю неоднозначность между “входит в scope” и “не блокирует success criteria”. Рекомендуется не переписывать lock задним числом, а добавить versioned exception/change log и отделить immutable product boundary от SHA-bound realization status и live infrastructure evidence.
