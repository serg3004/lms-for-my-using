# Claude Code

Этот файл — только Claude-specific adapter. Общий workflow authority репозитория: [`AGENTS.md`](./AGENTS.md). Карта документации и ownership: [`docs/README.md`](./docs/README.md).

## Старт

1. Прочитать `AGENTS.md`.
2. Прочитать `docs/README.md`.
3. Открыть только task-specific sources, необходимые для текущей задачи.

## Claude-specific

- `.claude/settings.json` содержит только provider/tool permissions и не является workflow authority.
- Соблюдать ограничения инструментов из `.claude/settings.json`.
- Не переносить в active context machine-specific paths, demo URLs, credentials или volatile environment state из historical материалов.
- Если Claude-specific настройка противоречит общему repository workflow, применять `AGENTS.md`.

Branch/PR workflow, CI recovery, documentation rules, security process и domain facts намеренно здесь не дублируются.
