# I18N Guide

## Default locale

ru

## Supported locales

- ru
- en
- kk
- zh

All four locales are implemented and used across login, public home, admin, and learner UI (`apps/web/src/i18n/index.ts`). Switching is manual via the language switcher in each layout; there is no server-driven locale selection (see "Locale priority" below).

---

## Frontend

Use:

- i18next
- react-i18next

Structure:

```text
src/i18n/locales/
  ru/
  en/
  kk/
  zh/
```

Example:

```tsx
t("auth.login")
```

Never:

```tsx
"Войти"
```

inside components.

---

## Locale priority

Current implementation:

```text
1. value stored in localStorage (set by the language switcher)
2. i18next default language (ru)
```

`User.locale` is persisted in Postgres and returned by `GET /api/v1/auth/me`, but the frontend does not read it to set the UI language. There is no `organization`-level default locale — `Organization` has no locale/timezone fields. Wiring `user.locale` into the frontend's initial language selection is not implemented.

Fallback locale:

```text
ru
```

---

## Database

User (`apps/api/prisma/schema.prisma`):

```prisma
locale   String @default("ru")
timezone String @default("Asia/Almaty")
```

`Organization` has no locale or timezone fields. The `locale`/`timezone` fields on `registerOrganizationSchema` (`apps/api/src/modules/organizations/organizations.schemas.ts`) belong to the admin user created during registration, not to the organization itself.

---

## API

Backend returns codes:

```json
{
  "error": {
    "code": "AUTH_INVALID_PASSWORD"
  }
}
```

Frontend translates messages by code where implemented. Current coverage is narrow: `apps/web/src/shared/apiErrorFeedback.ts` maps specific codes (e.g. `TOO_MANY_REQUESTS`) to translated messages; most errors fall back to `error.message` from the API response rather than a per-code translation key.

---

## Dates & numbers

Use:

```ts
Intl.DateTimeFormat
Intl.NumberFormat
```

---

## Course content

MVP:

- single-language content allowed

Future:

- course_translations
- lesson_translations

---

## Notifications

Store:

```json
{
  "translationKey": "notifications.courseAssigned",
  "variables": {
    "courseName": "Охрана труда"
  }
}
```

---

## Rules

- no hardcoded UI texts
- use translation keys
- keep API locale-agnostic
- multilingual-ready, not multilingual-overengineered

---

## Out of MVP

- AI translation
- translation CMS
- runtime translation editor
- localization microservice
