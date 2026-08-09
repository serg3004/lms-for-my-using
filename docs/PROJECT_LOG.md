# Project Log — Historical Archive

> **Статус:** `HISTORICAL / SUPERSEDED`
>
> **Последняя active запись:** 2026-05-30.
>
> Этот файл больше не является changelog, backlog или source of truth для current implementation.

## Почему документ сохранён

Файл содержит исторический контекст ранней серии внутренних planning/PR items примерно 20–42: auth/session hardening, admin layout, workspace registration/login/logout и связанные решения того периода.

Эта информация полезна только как provenance/rationale.

## Важное ограничение нумерации

Обозначения вида `PR 20`, `PR 39–42` в историческом тексте относятся к внутренним planning identifiers той фазы проекта. Их нельзя автоматически трактовать как номера GitHub Pull Requests.

## Что с тех пор изменилось

Многие разделы исторического лога давно superseded current repository behavior. В частности, old deferred statements про refresh/session/revocation больше не отражают current auth implementation.

Не использовать этот файл для ответа на вопросы:

- как сейчас работает auth/session;
- какие feature ещё open;
- какой текущий MVP scope;
- какие проверки CI обязательны;
- как сейчас устроен deployment.

## Current sources

Для актуального состояния использовать:

- `docs/PROJECT_SOURCE_OF_TRUTH.md`;
- `docs/MVP_SCOPE_LOCK.md`;
- `docs/TODO_VERIFY.md`;
- `docs/DEVELOPMENT_PLAN.md` — active development ledger;
- `docs/PRODUCTION_HARDENING_BACKLOG.md` — current hardening gaps.

## Historical record

Оригинальный подробный вариант этого журнала сохранён в Git history до этой cleanup-ревизии. При расследовании старого решения нужно читать соответствующую revision/commit, а не переносить старый status в current docs.

## Правило для ИИ-агента

`MUST NOT` использовать этот файл как current implementation/status authority.

Допустимое использование:

- история решения;
- поиск старого rationale;
- provenance для последующей проверки по Git history/current code.
