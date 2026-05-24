# 13. LMS Security Checklist

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** чеклист безопасности для MVP и подготовки к первому пилотному запуску.  
**Связь с предыдущими этапами:** документ опирается на продуктовую спецификацию, архитектуру, модель данных, API-контракты и workflow AI-агентов.  
**Стек:** TypeScript backend, React + TypeScript frontend, PostgreSQL, S3-compatible storage, Railway-first, Docker-portable.

---

## 1. Цель документа

Цель — не сделать enterprise security с первого дня, а обеспечить минимально достаточный уровень безопасности для корпоративной LMS:

```text
защита аккаунтов → защита ролей → защита данных обучения → защита файлов → защита админских действий → безопасный деплой
```

MVP должен быть пригоден для пилотного использования с реальными пользователями, без хранения небезопасных секретов, без открытых admin endpoint, без обхода RBAC и без публичного доступа к приватным учебным материалам.

---

## 2. Главные security-принципы

1. **Backend является единственным источником security-решений.** Frontend только отображает доступные действия.
2. **Каждый endpoint должен проверять authentication, authorization и organization scope.**
3. **RBAC не должен быть декоративным.** Проверки ролей обязательны на backend-уровне.
4. **Файлы не должны быть публичными по умолчанию.** Доступ к ним должен выдаваться через backend или pre-signed URL.
5. **Секреты не хранятся в коде.** Только env-переменные и secret storage платформы.
6. **Audit log обязателен для admin/security-sensitive действий.**
7. **AI-агенты не должны добавлять shortcuts, debug backdoors и временные bypass.**
8. **MVP не должен включать сложные enterprise-функции, если они не нужны для core learning loop.**

---

## 3. Identity & Authentication

### 3.1 Обязательные требования

- [ ] Используется безопасный механизм входа: JWT access + refresh token или session cookie с CSRF-защитой.
- [ ] Пароли хешируются только современным алгоритмом: Argon2id или bcrypt с адекватной сложностью.
- [ ] Пароли никогда не логируются.
- [ ] Password hash никогда не возвращается через API.
- [ ] Login endpoint имеет rate limiting.
- [ ] Ошибки входа не раскрывают, существует ли email в системе.
- [ ] Refresh token хранится безопасно и может быть отозван.
- [ ] Logout инвалидирует refresh token/session.
- [ ] Reset password не должен раскрывать существование email.

### 3.2 Для MVP

Минимальный вариант:

```text
email + password login
secure password hash
access token короткого срока жизни
refresh token или защищённая server-side session
logout
role-aware current user endpoint
```

### 3.3 Не включать в MVP без необходимости

- SSO/SAML/OIDC для enterprise-клиентов;
- magic link;
- MFA;
- device management;
- advanced session analytics.

Эти функции можно оставить как future scope.

---

## 4. Authorization & RBAC

### 4.1 Роли MVP

```text
Learner
Instructor
Manager
Admin
Owner/Super Admin
```

### 4.2 Обязательные проверки

- [ ] Learner видит только свои курсы, прогресс, сертификаты.
- [ ] Instructor управляет только назначенными курсами/контентом.
- [ ] Manager видит только пользователей своей группы/департамента.
- [ ] Admin управляет пользователями, курсами, назначениями и отчётами в своей организации.
- [ ] Owner/Super Admin управляет системными настройками организации.
- [ ] Любое изменение ролей логируется.
- [ ] Любое повышение прав требует admin/owner permission.

### 4.3 Backend-паттерн проверки доступа

Каждый protected endpoint должен проходить цепочку:

```text
authenticate request
load current user
validate organization scope
check role/permission
validate target resource ownership/scope
execute action
write audit log if needed
```

### 4.4 Запрещено

- [ ] Проверять роль только на frontend.
- [ ] Возвращать все записи и фильтровать их на frontend.
- [ ] Разрешать доступ к объекту только по UUID без проверки organization scope.
- [ ] Создавать временные bypass для AI-агента или разработки.

---

## 5. Organization / Tenant Safety

Даже если MVP стартует с одной организацией, модель должна быть tenant-ready.

### 5.1 Требования

- [ ] Все бизнес-сущности привязаны к `organization_id`, если они принадлежат организации.
- [ ] API не возвращает данные другой организации.
- [ ] Admin не может управлять пользователями другой организации.
- [ ] Course, assignment, progress, certificate и report фильтруются по organization scope.
- [ ] В audit log фиксируется organization context.

### 5.2 Критические таблицы

```text
users
organizations
organization_memberships
courses
lessons
assignments
progress
assessment_attempts
certificates
files
audit_logs
```

---

## 6. Course & Learning Content Security

### 6.1 Курсы

- [ ] Draft-курсы не видны Learner.
- [ ] Published-курсы доступны Learner только после назначения или при разрешённом catalog-доступе.
- [ ] Удаление курса должно быть soft delete, если есть прогресс пользователей.
- [ ] Изменение опубликованного курса должно учитывать уже назначенных Learner.

### 6.2 Уроки

- [ ] Уроки draft-курса не доступны по прямой ссылке.
- [ ] Learner не может отметить урок пройденным, если курс ему не назначен.
- [ ] Progress update должен проверять assignment scope.

### 6.3 Тесты

- [ ] Learner не должен получать правильные ответы до завершения попытки.
- [ ] Backend должен сам считать результат, а не доверять frontend.
- [ ] Повторные попытки должны проверять лимиты.
- [ ] Assessment result должен быть неизменяемым после фиксации, кроме admin correction с audit log.

---

## 7. File Upload & Storage Security

### 7.1 Общие требования

- [ ] Файлы хранятся в S3-compatible storage, не в PostgreSQL.
- [ ] В БД хранится metadata: owner, organization, file key, size, mime type, checksum, status.
- [ ] Upload endpoint проверяет роль пользователя.
- [ ] Размер файла ограничен.
- [ ] Тип файла проверяется по allowlist.
- [ ] File key не должен быть предсказуемым.
- [ ] Файлы не должны быть публичными по умолчанию.
- [ ] Скачивание идёт через backend authorization или pre-signed URL с коротким TTL.

### 7.2 Allowlist для MVP

```text
pdf
png
jpg/jpeg
webp
mp4
webm
txt
md
pptx/docx/xlsx — только если действительно нужно для пилота
```

### 7.3 Запрещено

- [ ] Разрешать загрузку исполняемых файлов.
- [ ] Хранить uploaded file path как публичный URL без проверки доступа.
- [ ] Доверять только frontend MIME type.
- [ ] Позволять Learner загружать файлы в course content без отдельного сценария.

---

## 8. API Security

### 8.1 Endpoint checklist

Для каждого endpoint:

- [ ] Есть authentication или endpoint явно public.
- [ ] Есть authorization.
- [ ] Есть validation request body/query/path params.
- [ ] Есть organization scope.
- [ ] Ошибки не раскрывают внутренние детали.
- [ ] Sensitive action пишет audit log.
- [ ] Pagination применяется к list endpoint.
- [ ] Rate limiting применяется к auth и потенциально дорогим endpoint.

### 8.2 Ошибки API

Ошибки должны быть в едином формате:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Недостаточно прав для выполнения действия"
  }
}
```

Не возвращать:

```text
stack trace
SQL query
internal file path
secret name
raw exception object
```

---

## 9. Input Validation

### 9.1 Правила

- [ ] Все входящие DTO валидируются на backend.
- [ ] Email нормализуется.
- [ ] UUID проверяется до обращения к БД.
- [ ] Текстовые поля имеют max length.
- [ ] HTML-контент sanitization обязателен, если будет rich text editor.
- [ ] Search/filter параметры ограничены allowlist.

### 9.2 Рекомендуемый подход

Для TypeScript backend использовать schema validation:

```text
Zod / Valibot / class-validator — выбрать один подход и использовать единообразно
```

---

## 10. Database Security

### 10.1 Требования

- [ ] Миграции выполняются управляемо.
- [ ] Нет raw SQL без параметризации.
- [ ] Все запросы используют ORM/query builder безопасно.
- [ ] Для production используется отдельный DB user с минимальными правами.
- [ ] Backup strategy описана до пилота.
- [ ] Soft delete применяется для ключевых бизнес-сущностей.
- [ ] Audit log не удаляется обычными admin-действиями.

### 10.2 Индексы безопасности/доступа

Проверить индексы на:

```text
organization_id
user_id
course_id
assignment_id
created_at
status
email unique per organization/global policy
```

---

## 11. Frontend Security

### 11.1 Требования

- [ ] Frontend не хранит секреты.
- [ ] Frontend не принимает окончательных security-решений.
- [ ] Protected routes скрывают UI, но backend всё равно проверяет доступ.
- [ ] XSS-риск учитывается при отображении rich text.
- [ ] API errors отображаются безопасно, без stack trace.
- [ ] Tokens не хранить в небезопасном месте, если выбран JWT.

### 11.2 UI для ролей

- [ ] Learner не видит admin navigation.
- [ ] Manager не видит system settings.
- [ ] Instructor не видит управление ролями.
- [ ] Admin UI не должен открываться без backend permissions.

---

## 12. Admin & Manager Security

### 12.1 Admin actions с audit log

- [ ] Создание пользователя.
- [ ] Изменение роли.
- [ ] Деактивация пользователя.
- [ ] Создание/публикация курса.
- [ ] Назначение курса.
- [ ] Изменение теста.
- [ ] Выдача/отзыв сертификата.
- [ ] Изменение настроек организации.

### 12.2 Manager ограничения

- [ ] Manager видит только подчинённых/группу/департамент.
- [ ] Manager не может назначить себе Admin role.
- [ ] Manager reports не должны раскрывать пользователей вне scope.

---

## 13. Logging & Monitoring

### 13.1 Что логировать

- [ ] Startup/shutdown backend.
- [ ] Auth failures aggregated, без паролей.
- [ ] Ошибки API.
- [ ] Failed permission checks.
- [ ] File upload failures.
- [ ] Migration execution.
- [ ] Deployment events.

### 13.2 Что не логировать

```text
passwords
refresh tokens
access tokens
private file URLs
full personal data dump
секреты env
SQL с sensitive значениями
```

---

## 14. Secrets Management

### 14.1 Правила

- [ ] `.env` не коммитится.
- [ ] `.env.example` содержит только названия переменных и безопасные placeholders.
- [ ] Railway variables используются для production/staging.
- [ ] S3 keys, DB URL, JWT secrets хранятся только в secret storage.
- [ ] Secrets rotation plan описан.
- [ ] AI-агентам нельзя вставлять реальные секреты в код/документацию/PR.

### 14.2 Минимальные env-переменные

```text
NODE_ENV
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
APP_BASE_URL
API_BASE_URL
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
EMAIL_PROVIDER_API_KEY
LOG_LEVEL
```

---

## 15. Railway Security

- [ ] Production и staging окружения разделены.
- [ ] Переменные окружения заданы в Railway, не в коде.
- [ ] Database не доступна публично без необходимости.
- [ ] Build logs не раскрывают секреты.
- [ ] Migrations запускаются контролируемо.
- [ ] Healthcheck endpoint не раскрывает внутреннюю информацию.
- [ ] Admin seed account не создаётся с публичным паролем.

---

## 16. Docker Portability Security

- [ ] Docker image не содержит `.env`.
- [ ] Docker image не содержит private keys.
- [ ] Non-root user для runtime, если возможно.
- [ ] `.dockerignore` настроен.
- [ ] Production image не содержит dev dependencies без необходимости.
- [ ] docker-compose для local dev отделён от production config.

---

## 17. Email & Notifications Security

- [ ] Email templates не раскрывают лишние данные.
- [ ] Reset password links имеют короткий TTL.
- [ ] Notification endpoints проверяют owner/scope.
- [ ] Массовые уведомления доступны только Admin.
- [ ] Email provider key хранится в secrets.

---

## 18. Compliance-ready минимумы

Для MVP не нужно обещать полную сертификацию, но нужно заложить основу:

- [ ] privacy policy placeholder;
- [ ] terms placeholder;
- [ ] user data export future scope;
- [ ] user deactivation вместо физического удаления при наличии истории;
- [ ] audit trail для сертификатов и обучения;
- [ ] backup и restore process.

---

## 19. AI-agent security rules

AI coding agent обязан:

- [ ] не добавлять hardcoded credentials;
- [ ] не отключать auth/RBAC для прохождения тестов;
- [ ] не создавать debug endpoint в production;
- [ ] не публиковать приватные bucket/file URLs;
- [ ] не менять security policy без отдельной задачи;
- [ ] при изменении auth/RBAC обновлять тесты;
- [ ] указывать security impact в PR.

---

## 20. Pre-pilot security gate

Перед пилотом должны быть выполнены условия:

```text
auth работает
RBAC проверяется backend-ом
organization scope проверяется
секреты вынесены в env
файлы не публичные
admin actions пишут audit log
ошибки API безопасны
production build запускается
backup process описан
basic smoke/security tests проходят
```

---

## 21. Приоритеты исправления

| Приоритет | Что относится |
|---|---|
| P0 | обход auth, доступ к чужой организации, утечка секретов, публичные private files |
| P1 | отсутствие audit log для admin actions, слабый password handling, XSS в rich text |
| P2 | недостаточный rate limiting, неполные security tests, слабая валидация |
| P3 | улучшения UX security, расширенная compliance-документация |

---

## 22. Definition of Done по безопасности

Функция считается готовой, если:

- backend проверяет auth/RBAC/scope;
- входные данные валидируются;
- sensitive actions логируются;
- тесты покрывают успешный и запрещённый сценарии;
- ошибки безопасны;
- документация обновлена, если изменился security contract.

