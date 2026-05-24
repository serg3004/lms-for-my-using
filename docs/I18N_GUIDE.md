# I18N Guide

## Default locale

ru

## Supported locales

- ru
- en (future-ready)
- kk (future)
- zh (future)

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

```text
1. user.locale
2. organization.default_locale
3. browser locale
4. fallback locale
```

Fallback locale:

```text
ru
```

---

## Database

User:

```prisma
locale   String? @default("ru")
timezone String? @default("Asia/Almaty")
```

Organization:

```prisma
default_locale String? @default("ru")
timezone        String?
```

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

Frontend translates messages.

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
