# Branch Protection / Ruleset — Future Work

> **Статус:** `DEFERRED`
>
> **Implementation status:** `NOT-IMPLEMENTED`
>
> **Назначение:** зафиксировать рекомендуемую будущую конфигурацию GitHub Ruleset для `main`, не создавая ложного впечатления, что защита ветки уже включена.
>
> **Проверено по `main`:** `9488961e1c5c654af9b6095cacff1f6a88827d9c` (2026-08-09).

## 1. Текущее состояние

На момент проверки:

- `main` имеет `protected: false`;
- required status checks не являются repository-enforced merge gates;
- текущие стабильные check names:
  - `Checks` — основной `CI / Checks` job;
  - `Analyze (javascript-typescript)` — CodeQL analysis job;
- PR-based workflow уже используется как рабочий процесс проекта, но GitHub settings пока не запрещают обход через прямое изменение `main`.

**Правило для ИИ-агента:** этот документ описывает **будущую** настройку. `MUST NOT` утверждать, что branch protection активна, пока repository settings не перепроверены и не подтверждают это.

---

## 2. Цель будущей настройки

Когда задача будет активирована, GitHub должен технически обеспечивать:

1. изменения в `main` проходят через Pull Request;
2. основной CI и CodeQL должны быть green перед merge;
3. force push в `main` запрещён;
4. удаление `main` запрещено;
5. защита не должна создавать искусственную блокировку single-owner workflow;
6. изменение имён required checks должно сопровождаться синхронным обновлением Ruleset.

---

## 3. Рекомендуемый GitHub Ruleset

### Ruleset metadata

```text
Ruleset name: Protect main
Enforcement status: Active
Bypass list: empty
Target branches: Include default branch
```

Если default branch перестанет быть `main`, target через `Include default branch` должен продолжить защищать текущую default branch. Если вместо этого будет использован explicit branch pattern, его нужно обновить вручную при переименовании ветки.

### Rules to enable

```text
Restrict deletions: ON
Block force pushes: ON
Require a pull request before merging: ON
Require status checks to pass: ON
```

### Pull Request settings

Рекомендуемый initial configuration:

```text
Required approvals: 0
Dismiss stale approvals: OFF
Require review from Code Owners: OFF
Require approval of the most recent reviewable push: OFF
```

Причина `Required approvals: 0`: текущий workflow ориентирован на single-owner repository. Требование чужого approval может сделать legitimate merge невозможным без добавления отдельного reviewer process.

Если в проекте появится обязательный multi-person review, approvals policy должна быть пересмотрена отдельной задачей.

### Required status checks

Добавить ровно текущие реальные check names:

```text
Checks
Analyze (javascript-typescript)
```

На момент проверки:

- `Checks` создаётся основным CI workflow;
- `Analyze (javascript-typescript)` создаётся CodeQL workflow.

**Критическое правило:** если job/check name изменяется в `.github/workflows/ci.yml` или `.github/workflows/codeql.yml`, Ruleset должен быть обновлён в той же change set / operational task. Иначе GitHub может ждать status check, который больше никогда не появляется, и merge окажется заблокирован.

---

## 4. `Require branches to be up to date before merging`

### Initial recommendation

```text
Require branches to be up to date before merging: OFF
```

Это сознательный компромисс для текущего интенсивного single-owner development flow.

При `ON` любой новый merge в `main` после green CI может потребовать:

1. повторно синхронизировать PR branch с `main`;
2. снова запустить CI/CodeQL;
3. повторно дождаться green checks.

Это повышает strictness, но увеличивает количество workflow runs и может создавать цикл `sync -> CI -> main advanced -> sync` при высокой активности.

### Когда включить позже

Рассмотреть `ON`, если выполняется одно или несколько условий:

- появляется несколько параллельно работающих разработчиков/агентов;
- merge conflicts или stale-base regressions становятся регулярными;
- release/security policy требует проверки строго относительно последнего `main`;
- стоимость дополнительных CI runs приемлема.

Изменение этого флага — отдельное repository-setting решение, не автоматическая часть initial protection.

---

## 5. Rules, которые пока оставить выключенными

Initial recommendation:

```text
Restrict creations: OFF
Restrict updates: OFF
Require linear history: OFF
Require deployments to succeed: OFF
Require signed commits: OFF
Require code scanning results: OFF
Require code quality results: OFF
Restrict code coverage: OFF
Automatically request Copilot code review: OFF
```

### Почему

- `Restrict creations/updates` могут непреднамеренно заблокировать legitimate maintenance operations.
- `Require linear history` конфликтует с текущим использованием merge commits.
- `Require deployments to succeed` требует отдельной deployment/environment policy.
- `Require signed commits` требует отдельного signing rollout.
- CodeQL уже планируется required через реальный status check `Analyze (javascript-typescript)`; отдельный code-scanning merge-protection mechanism не нужен в initial rollout.
- Code quality/coverage/Copilot review не являются текущими согласованными merge gates.

Каждый из этих rules может быть включён позже отдельным решением с собственными acceptance criteria.

---

## 6. Bypass policy

Initial recommendation:

```text
Bypass list: empty
```

Цель — не создавать скрытый путь обхода required PR/CI правил.

Если позже понадобится emergency/admin bypass, он должен быть:

- явно обоснован;
- минимально scoped;
- документирован;
- проверен после изменения;
- не использоваться обычным ИИ-агентом как shortcut.

ИИ-агент `MUST NOT` обходить protection/ruleset ради ускорения задачи.

---

## 7. Будущая процедура включения

### До изменения

1. Перепроверить current default branch.
2. Перепроверить текущий branch/ruleset protection state.
3. Перепроверить реальные check names на свежем успешном PR/main SHA.
4. Убедиться, что оба required checks действительно запускаются на PR target `main`.
5. Убедиться, что нет переименования CI/CodeQL jobs в ожидающем merge PR.

### Применение

В GitHub:

```text
Repository -> Settings -> Rules -> Rulesets -> New branch ruleset
```

Создать Ruleset по конфигурации из раздела 3.

### После изменения

Обязательно подтвердить фактически:

- Ruleset `Active`;
- target включает default branch / `main`;
- `main` отображается protected;
- required PR rule активен;
- required checks ровно:
  - `Checks`;
  - `Analyze (javascript-typescript)`;
- force pushes запрещены;
- deletions запрещены;
- bypass list соответствует принятой policy;
- существующий обычный PR с green checks остаётся mergeable;
- PR с pending/failed required check блокируется GitHub.

Только после этой read-back verification статус задачи можно менять с `NOT-IMPLEMENTED` на `IMPLEMENTED`.

---

## 8. Rollback

Если Ruleset создаёт непредвиденную блокировку:

1. определить точную rule/check, создающую блокировку;
2. не отключать protection целиком без необходимости;
3. исправить минимально необходимый параметр;
4. повторно проверить обычный PR workflow;
5. задокументировать изменение.

Типичный риск — переименованный required status check. В таком случае нужно обновить required check name, а не отключать CI protection целиком.

---

## 9. Влияние на ИИ-агентов

При initial recommended configuration влияние минимально, потому что нормальный агентный workflow уже должен быть:

```text
branch -> commit -> PR -> CI/CodeQL -> verify -> user-approved merge
```

### Практическое влияние

- `Require PR`: почти без дополнительной работы.
- Required `Checks`: агент обязан дождаться/проверить CI — уже часть текущего процесса.
- Required CodeQL: аналогично.
- Block force pushes: не влияет на корректный workflow.
- Restrict deletions: не влияет на обычные file deletions через PR; защищает саму branch ref.
- Up-to-date `OFF`: избегает лишних sync/CI cycles на initial rollout.

Protection предназначена не для усложнения работы агента, а для технического enforcement процесса, который агент и так обязан соблюдать.

---

## 10. Acceptance criteria будущей задачи

Задача Branch Protection считается выполненной только если:

- [ ] Ruleset существует и `Active`;
- [ ] default branch / `main` является target;
- [ ] Pull Request обязателен перед merge;
- [ ] required check `Checks` активен;
- [ ] required check `Analyze (javascript-typescript)` активен;
- [ ] force push запрещён;
- [ ] deletion branch запрещён;
- [ ] required approvals соответствуют согласованной single-owner/multi-owner policy;
- [ ] up-to-date policy явно выбрана и задокументирована;
- [ ] settings перечитаны после записи;
- [ ] проверено реальное blocking behavior на PR;
- [ ] canonical security/readiness docs обновлены с `NOT-ENFORCED` на фактический новый status.

---

## 11. Связанные документы

- `docs/READINESS_AND_SECURITY_GATES.md` — текущие security/readiness semantics.
- `docs/CI_AUDIT_BASELINE.md` — текущие CI/check names и topology.
- `docs/PROJECT_SOURCE_OF_TRUTH.md` — canonical source hierarchy.
- `docs/TODO_VERIFY.md` — decision/implementation/live verification registry.

## 12. Правило актуальности

До фактического включения Ruleset:

```text
Branch protection status: DEFERRED / NOT-IMPLEMENTED
```

После будущего включения этот документ `MUST` быть обновлён: убрать future-work framing, записать фактический Ruleset state и verification evidence либо заменить ссылкой на canonical действующую policy.