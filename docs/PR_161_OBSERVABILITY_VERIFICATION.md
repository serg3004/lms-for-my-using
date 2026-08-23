# PR 161 — Structured logs and Sentry verification

**Проверено:** 2026-08-23  
**Статус:** repository scope complete; production delivery remains `LIVE-VERIFY`

## Решение

Новый logging stack не добавлялся: API уже использует `nestjs-pino`, поэтому
второй logger создал бы дублирующиеся события и расходящиеся правила redaction.
В production Pino пишет JSON, а вне production подключает `pino-pretty`.
Централизованные redact paths скрывают authorization/cookie headers и известные
password/token/secret поля request body.

## Correlation и ошибки

Для каждого запроса принимается только валидный `X-Request-ID` либо создаётся
UUID. Один ID возвращается в response header, сохраняется в async telemetry
context и добавляется в structured logs.

Server-side errors (5xx) проходят через общий sanitizer до записи в logger. Тот же
sanitised `Error` отправляется в Sentry, если задан прошедший env validation
`SENTRY_DSN`. Ожидаемые client errors (4xx) в error tracking не отправляются.
Без `SENTRY_DSN` callback не создаётся и API не зависит от доступности Sentry.
Startup failures используют тот же sanitizer и устанавливают ненулевой exit
code, не печатая строки с password/token/secret/authorization/API key.

## Проверяемое покрытие

- logger config выбирает JSON production output и human-readable local output;
- redact-path tests фиксируют обязательные credential headers и body fields;
- telemetry-context tests проверяют validation, propagation и response header;
- startup tests проверяют sanitization перед внешним error tracker;
- exception-filter tests проверяют безопасный 500 response, sanitised capture и
  отсутствие capture для ожидаемого 4xx;
- env tests проверяют optional `SENTRY_DSN` и допустимые `LOG_LEVEL` values.

## Production boundary

Код и конфигурация репозитория не доказывают ingestion в Railway или доставку
события во внешний Sentry project. После deployment оператор должен привязать
проверку к точному SHA и времени, затем:

1. подтвердить, что production log является валидным JSON и содержит request ID;
2. выполнить безопасный synthetic 5xx без реальных credentials;
3. найти событие по request ID в Railway logs и, если Sentry включён, в Sentry;
4. убедиться, что sample event не содержит authorization, cookie, password,
   token, secret или DSN values;
5. проверить, что обычный 4xx не создаёт Sentry event.

До этой операторской проверки внешняя доставка имеет статус `LIVE-VERIFY`.

## Repository gate

```bash
pnpm --filter @lms/api test -- --runInBand
pnpm --filter @lms/api typecheck
pnpm --filter @lms/api lint
pnpm --filter @lms/api build
```
