# Рекомендации

## R1 — 2026-07-27 — Снижение падений CI из-за Dependabot и pnpm audit

### Чтобы падения CI происходили реже

- Делать Dependabot PR маленькими и частыми.
- Соблюдать порядок merge:

  ```text
  GitHub Actions → dev dependencies → prod dependencies
  ```

- Мержить зелёные Dependabot PR быстро, не копить их неделями.
- Не отключать `pnpm audit --audit-level high`.

Важно: если в `main` появилась новая high-уязвимость, audit может уронить CI даже у unrelated PR.

### Что добавить в PR template

```md
## Dependency/audit impact

- [ ] This PR does not change dependencies
- [ ] This PR changes dependencies
- [ ] If CI fails on `pnpm audit`, use separate security/deps PR
```

### Чтобы audit чинился почти автоматически

Добавить отдельный workflow `Security audit fixer`.

Он может запускаться:

- вручную через GitHub Actions;
- по расписанию, например раз в день;
- когда Dependabot PR не закрывает audit.

Workflow должен:

1. создать ветку `security/fix-pnpm-audit-high`;
2. запустить `pnpm install`;
3. запустить `pnpm audit --audit-level high`;
4. если audit падает — попробовать `pnpm audit --fix`;
5. снова запустить `pnpm install`;
6. снова запустить `pnpm audit --audit-level high`;
7. если high-уязвимости закрыты — создать PR.

Auto-merge не включать.

### Что можно автоматизировать безопасно

- создание `security` branch;
- запуск `pnpm audit --audit-level high`;
- запуск `pnpm audit --fix`;
- запуск `pnpm install`;
- создание PR;
- комментарий в зависимом PR: `audit fixed in #...`.

### Что не автоматизировать

- auto-merge dependency PR;
- auto-ignore advisories;
- ручную правку `pnpm-lock.yaml`;
- отключение audit в CI.
