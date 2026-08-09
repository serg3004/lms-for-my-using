# Продолжение аудита актуальности документации — часть 6

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_5.md` содержат результаты №21–25. Этот файл продолжает тот же последовательный аудит с №26.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 26 | `PASSWORD_RESET_STATUS.md` | ✅ Актуален с minor maintenance notes | Skeleton-only статус подтверждён controller/service/schema/tests/UI; уточнить UUID-only organizationId, reserved accepted schema и controller/HTTP test coverage |

---

## 26. `PASSWORD_RESET_STATUS.md`

**Статус:** ✅ актуален. Центральное утверждение документа — password reset в текущем MVP является disabled skeleton only — полностью подтверждается текущим `main`.

### Подтверждено

- Существуют публичные endpoints `POST /api/v1/auth/password-reset/request` и `POST /api/v1/auth/password-reset/confirm`.
- Оба controller methods валидируют body через Zod schemas и затем вызывают `AuthService`.
- `AuthService.requestPasswordReset()` и `AuthService.confirmPasswordReset()` всегда бросают `ServiceUnavailableException` с текущим message constant `Password reset is not unavailable`; runtime contract — `503 Service Unavailable`.
- `passwordResetRequestSchema` требует `organizationId` UUID и нормализует email через trim/email/lowercase transform.
- `passwordResetConfirmSchema` требует token длиной 32–512 и использует strong-password schema: 12–255 символов, lowercase, uppercase, digit и special character.
- В reset service methods нет Prisma lookup/write: token не создаётся и не хранится, password hash не меняется, email не отправляется, reset-specific session invalidation не выполняется.
- `auth.password-reset.spec.ts` проверяет disabled behavior обоих service methods, email normalization, strong-password valid case и weak-password rejection.
- Current Login UI не вызывает reset API: `Forgot password` показывает только localized informational help; self-service reset flow в Web отсутствует.
- PR #524, вошедший в `main` во время этого аудита, добавил manual expired-session cleanup и не изменил password-reset skeleton behavior.

### Уточнения / maintenance gaps

1. Request contract стоит описать точнее: `organizationId` в password reset request — только UUID, в отличие от login organization field, который допускает slug или UUID.
2. `passwordResetAcceptedSchema` (`{ accepted: true }`) уже существует в `auth.schemas.ts`, хотя runtime happy path его не возвращает. Это reserved/future contract и его стоит так и пометить либо удалить до реализации.
3. Формулировка о test coverage верна, но текущие подтверждённые tests в основном service/schema-level. В `auth.controller.spec.ts` отдельные reset request/confirm HTTP/controller cases не обнаружены.
4. Future password-policy checklist частично уже реализован на уровне input validation schema; реальный reset transaction/hashing/delivery flow по-прежнему отсутствует.
5. Для status-документа полезно добавить `Verified at` и `Verified against main SHA`.

### Что изменить

1. Сохранить основной статус `skeleton only / 503`.
2. Уточнить request body: UUID `organizationId` + normalized lowercase email.
3. Явно описать уже действующую strong-password input policy.
4. Пометить `passwordResetAcceptedSchema` как reserved future response contract либо убрать до включения happy path.
5. Добавить controller/HTTP contract tests: valid request/confirm → 503; invalid body → validation failure; endpoints остаются public.
6. Разделить future checklist на уже существующую validation policy и ещё не реализованный reset transaction/delivery/session-revocation behavior.
7. Добавить freshness markers.
8. При будущем включении reset одновременно обновить этот status doc, `API_CONTRACTS.md`, readiness/dashboard docs, operator runbook и security/session semantics.

### [НЕ ПРОВЕРЕНО]

- Live HTTP reset endpoints в production/staging не вызывались.
- Полная Git-history всех старых password-reset attempts не реконструировалась; проверяется current `main`.
- Delivery provider, TTL, per-email/IP rate limit и post-reset session revocation policy остаются будущими бизнес/безопасностными решениями.
- Внешняя operator/admin account-recovery procedure вне LMS не проверялась.

### Итог

`PASSWORD_RESET_STATUS.md` — один из наиболее точных status-документов проекта. Endpoints и validation skeleton существуют, но оба service paths всегда возвращают 503, не создают token, не отправляют email, не меняют password и не инвалидируют sessions; Web self-service reset тоже не реализован. Реализационный статус менять не требуется — нужны только maintenance-уточнения и более явный controller/HTTP test contract.
