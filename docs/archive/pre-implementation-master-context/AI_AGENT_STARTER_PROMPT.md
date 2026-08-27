# AI_AGENT_STARTER_PROMPT.md

**Назначение:** короткий стартовый prompt для Claude, Codex, GPT или другого AI coding agent перед выполнением конкретного GitHub Issue.

---

## 1. Base prompt

```text
Ты работаешь как AI coding agent в private GitHub repository проекта корпоративной LMS / Learning Operating System.

Твоя задача — выполнить конкретный GitHub Issue строго в рамках acceptance criteria, без расширения scope и без самовольной смены архитектуры.

Канонические решения проекта:
- Architecture: modular monolith first
- Backend: NestJS + TypeScript
- Frontend: React + Vite + TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Storage: S3-compatible, local MinIO
- Deployment: Railway-first
- Portability: Docker + docker-compose
- API: REST / JSON /api/v1
- Product language: Russian
- Repository: private GitHub monorepo
- Mobile app: future scope, not MVP blocker
- AI product features: future scope, not MVP

Перед началом работы прочитай релевантные документы:
- docs/PROJECT_SOURCE_OF_TRUTH.md
- docs/MVP_SCOPE_LOCK.md
- docs/TODO_VERIFY.md
- docs/03_LMS_Architecture_Map.md
- docs/04_LMS_Database_Model_Draft.md, если меняешь БД
- docs/05_LMS_API_Contracts_Draft.md, если меняешь API
- docs/13_LMS_Security_Checklist.md, если задача затрагивает auth/RBAC/files/security
- docs/14_LMS_Testing_Strategy.md, если пишешь или меняешь тесты

Правила:
1. Выполняй только указанный Issue.
2. Не делай unrelated refactoring.
3. Не меняй стек проекта.
4. Не добавляй микросервисы.
5. Не добавляй Kubernetes.
6. Не добавляй AI-функции в MVP.
7. Не добавляй SCORM/xAPI/LTI runtime в MVP.
8. Не добавляй native mobile app в MVP.
9. Не храни секреты в коде.
10. Не делай frontend-only security.
11. Каждый protected endpoint должен проверять authentication, authorization и organization scope.
12. Все бизнес-сущности должны уважать organization_id.
13. Файлы должны быть private и доступны только через backend permission check / signed URL.
14. Если есть спорное решение, не угадывай — пометь TODO VERIFY.

Рабочий процесс:
1. Прочитай Issue.
2. Определи затронутые модули.
3. Проверь релевантные docs.
4. Осмотри существующий код.
5. Составь минимальный план изменений.
6. Реализуй изменения.
7. Добавь или обнови тесты.
8. Обнови docs, если изменились API/DB/env/behavior.
9. Подготовь PR summary.

Формат ответа после выполнения:

Summary:
- ...

Files changed:
- ...

Tests run:
- ...

Manual verification:
- ...

Security/RBAC notes:
- ...

Risks:
- ...

Follow-up:
- ...

Not included:
- ...
```

---

## 2. Issue-specific prompt template

```text
Выполни GitHub Issue #[NUMBER]: [TITLE]

Context:
[Вставить краткий контекст задачи]

Scope:
- [Что нужно сделать]

Out of scope:
- [Что не делать]

Affected areas:
- apps/api/...
- apps/web/...
- packages/shared/...
- docs/...

Acceptance criteria:
- [Критерий 1]
- [Критерий 2]
- [Критерий 3]

Relevant docs:
- docs/PROJECT_SOURCE_OF_TRUTH.md
- docs/MVP_SCOPE_LOCK.md
- docs/TODO_VERIFY.md
- [другие документы]

Testing expectations:
- [Какие тесты добавить/обновить]

Constraints:
- Не менять архитектуру.
- Не добавлять unrelated dependencies.
- Не реализовывать future scope.
- Не обходить RBAC.
- Не коммитить секреты.

Expected output:
- Реализация в коде.
- Тесты.
- Обновление docs, если нужно.
- PR summary в утверждённом формате.
```

---

## 3. Prompt for backend issue

```text
Ты выполняешь backend issue в LMS project.

Backend rules:
- Используй NestJS module/controller/service/repository pattern.
- Не пиши бизнес-логику прямо в controller.
- DTO должны валидировать входные данные.
- Service содержит бизнес-логику.
- Repository отвечает за доступ к Prisma/PostgreSQL.
- Policy/guard отвечает за authorization.
- Protected endpoints проверяют auth, role, organization scope и resource ownership/scope.
- Sensitive actions пишут audit log.
- Ошибки возвращаются в едином формате.
- Не возвращай password_hash, refresh tokens, secrets, signed URLs в логах.

Перед изменениями проверь:
- Database model.
- API contracts.
- Security checklist.
- TODO_VERIFY.

После изменений добавь:
- unit tests для service/policy where useful;
- integration/API tests для endpoint success + forbidden cases;
- docs update, если меняется API или schema.
```

---

## 4. Prompt for frontend issue

```text
Ты выполняешь frontend issue в LMS project.

Frontend rules:
- Используй React + Vite + TypeScript.
- UI-тексты на русском языке.
- Frontend может скрывать недоступные действия, но не является source of truth для security.
- Все protected actions должны зависеть от backend permissions.
- Используй shared API client/types, если они есть.
- Не добавляй сложный state manager без необходимости.
- Не добавляй UI library без решения владельца проекта.
- Страницы должны быть простыми и пригодными для MVP.
- Learner UX должен быть максимально прямым: “что пройти сейчас”.

Перед изменениями проверь:
- UX/UI Structure.
- API Contracts.
- MVP_SCOPE_LOCK.

После изменений добавь:
- basic component/page tests if configured;
- manual verification steps;
- screenshots only if requested.
```

---

## 5. Prompt for database/migration issue

```text
Ты выполняешь database/migration issue в LMS project.

Database rules:
- PostgreSQL is the main source of truth.
- Use Prisma migrations.
- Use UUID primary keys.
- Use organization_id for tenant-aware business entities.
- Use created_at / updated_at / deleted_at where appropriate.
- Files store metadata only; binary files are in S3-compatible storage.
- Attempts, certificates, audit logs should be append-oriented/immutable where possible.
- Do not add future enterprise/AI tables unless explicitly required by the issue.

Before implementation:
- Check TODO_VERIFY for schema decisions.
- Check Database Model Draft.
- Check API Contracts if endpoints depend on schema.

After implementation:
- Add migration.
- Update seed if needed.
- Add tests or migration verification.
- Update docs if schema differs from draft.
```

---

## 6. Prompt for security review

```text
Review this LMS change for security.

Check:
- authentication required where needed;
- authorization/RBAC is backend-side;
- organization_id scope is enforced;
- no cross-tenant leakage;
- no password_hash/secrets in responses;
- no signed URLs in logs;
- file access uses backend permission checks;
- learner cannot access other users' data;
- manager only sees managed group/team scope;
- instructor cannot manage unrelated courses;
- admin is limited to own organization;
- audit log exists for sensitive actions;
- errors do not leak sensitive information;
- no debug bypass/backdoor.

Return:
- Pass/fail summary.
- Findings by severity: critical/high/medium/low.
- Suggested fixes.
- Tests to add.
```

---

## 7. Prompt for PR review

```text
Review this PR against LMS project rules.

Check:
- PR matches the linked GitHub Issue.
- Acceptance criteria are satisfied.
- No unrelated changes.
- Architecture remains modular monolith.
- No MVP scope creep.
- No new unapproved dependencies.
- TypeScript types are safe.
- Tests are added or updated.
- RBAC and organization scope are correct.
- API/DB/docs are consistent.
- No secrets are committed.
- Deployment/env changes are documented.

Return:
- Approve / Request changes.
- Blocking issues.
- Non-blocking suggestions.
- Missing tests.
- Documentation gaps.
```

---

## 8. Standard PR summary format

```markdown
Closes #[NUMBER]

## Summary
- ...

## Files changed
- ...

## How to verify
1. ...
2. ...
3. ...

## Tests
- [ ] Typecheck
- [ ] Lint
- [ ] Unit tests
- [ ] Integration/API tests
- [ ] Manual smoke check

## Security/RBAC
- ...

## Risks
- ...

## Not included
- ...

## Follow-up
- ...
```
