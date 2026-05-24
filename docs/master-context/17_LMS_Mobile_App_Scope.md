# 17. LMS Mobile App Scope

Статус: mobile scope для LMS  
Контекст: mobile learner-first; полноценная мобильная админка не входит в MVP  
Платформа: React Native / Expo как предпочтительный вариант для будущего этапа

---

## 1. Назначение документа

Этот документ определяет границы мобильного приложения LMS.

Главный принцип:

> Мобильное приложение в первую очередь нужно учащемуся, а не администратору.

Мобильный продукт должен помогать сотруднику быстро проходить назначенное обучение, получать уведомления, смотреть прогресс и сертификаты.

---

## 2. Роль мобильного приложения в продукте

Мобильное приложение нужно для:

- прохождения обучения с телефона;
- быстрого доступа к назначенным курсам;
- push-уведомлений;
- напоминаний о дедлайнах;
- просмотра прогресса;
- просмотра сертификатов;
- поддержки corporate learning в полевых/операционных командах.

Особенно полезно для:

- retail;
- logistics;
- production;
- field teams;
- healthcare operations;
- distributed teams;
- onboarding сотрудников без постоянного desktop-доступа.

---

## 3. Что входит в Mobile MVP

Mobile MVP должен быть learner-first.

Обязательные функции:

1. Авторизация.
2. Личный dashboard.
3. Мои курсы.
4. Страница курса.
5. Прохождение уроков.
6. Прохождение тестов.
7. Прогресс.
8. Сертификаты.
9. Уведомления.
10. Профиль.

---

## 4. Что не входит в Mobile MVP

Не включать:

- создание курсов;
- редактирование курсов;
- управление пользователями;
- массовые назначения;
- отчёты администратора;
- сложный offline mode;
- SCORM/xAPI player;
- AI-чат;
- видео-конференции;
- корпоративный мессенджер;
- mobile BI dashboard;
- сложная кастомизация бренда.

Admin/Manager mobile можно сделать позже как lightweight view-only.

---

## 5. Mobile user flows

### 5.1 Вход в приложение

Поток:

```text
Open App
→ Login
→ Validate credentials
→ Load profile
→ Load assigned courses
→ Learner Dashboard
```

Требования:

- понятные ошибки входа;
- сохранение сессии;
- logout;
- безопасное хранение токенов;
- обновление токена, если выбрана token-based auth.

---

### 5.2 Продолжить обучение

Поток:

```text
Dashboard
→ Continue Course
→ Course Page
→ Current Lesson
→ Complete Lesson
→ Next Lesson / Assessment
```

Это главный сценарий мобильного приложения.

---

### 5.3 Прохождение теста

Поток:

```text
Course / Lesson
→ Start Assessment
→ Answer Questions
→ Submit
→ Result
→ Retry or Finish
```

Требования:

- подтверждение перед отправкой;
- обработка потери соединения;
- понятный результат;
- статус pass/fail;
- переход к сертификату, если курс завершён.

---

### 5.4 Сертификат

Поток:

```text
Certificates
→ Certificate Details
→ View / Download / Share
```

MVP:

- просмотр сертификата;
- ссылка на скачивание;
- дата выдачи;
- курс;
- статус.

---

### 5.5 Уведомления

Поток:

```text
Notifications
→ Notification Details
→ Related Course / Assignment
```

Типы уведомлений:

- назначен курс;
- приближается дедлайн;
- курс просрочен;
- курс завершён;
- выдан сертификат;
- обновлён курс.

---

## 6. Mobile screens

### 6.1 Auth

- login;
- password reset как optional;
- invite acceptance как optional для MVP+.

### 6.2 Dashboard

Блоки:

- продолжить обучение;
- обязательные курсы;
- дедлайны;
- прогресс;
- уведомления.

### 6.3 My Courses

Фильтры:

- все;
- не начатые;
- в процессе;
- завершённые;
- обязательные.

### 6.4 Course Details

- описание;
- прогресс;
- список уроков;
- дедлайн;
- кнопка продолжения.

### 6.5 Lesson Player

Поддержка:

- текст;
- изображение;
- видео по ссылке/встроенное;
- PDF/файл как ссылка или встроенный просмотр, если удобно;
- кнопка завершения.

### 6.6 Assessment

- вопросы;
- варианты;
- прогресс по вопросам;
- submit;
- результат.

### 6.7 Certificates

- список;
- детали;
- download/view.

### 6.8 Notifications

- список;
- статус прочитано/не прочитано;
- переход к связанному объекту.

### 6.9 Profile

- имя;
- email;
- роль;
- организация;
- logout.

---

## 7. Технический подход

### 7.1 Рекомендуемый стек

Предпочтительный вариант:

- React Native;
- Expo;
- TypeScript;
- shared API client;
- shared validation schemas;
- secure storage для токенов.

Причина:

- быстрее для одного разработчика;
- лучше подходит для AI-assisted разработки;
- можно переиспользовать TypeScript-типы;
- проще связать с существующим backend.

---

### 7.2 Структура mobile app

```text
apps/mobile/
  src/
    app/
    screens/
    components/
    features/
      auth/
      courses/
      lessons/
      assessments/
      certificates/
      notifications/
      profile/
    api/
    navigation/
    storage/
    utils/
```

---

### 7.3 API reuse

Mobile должен использовать те же API, что и web learner portal:

- `/auth`;
- `/me`;
- `/courses`;
- `/assignments`;
- `/progress`;
- `/assessments`;
- `/certificates`;
- `/notifications`.

Не нужно делать отдельный backend только для mobile в MVP.

---

## 8. Offline strategy

### 8.1 MVP

В MVP достаточно:

- graceful handling при потере сети;
- retry для запросов;
- локальное кэширование списка курсов;
- отображение последнего загруженного состояния.

### 8.2 Future

Позже можно добавить:

- offline lesson download;
- offline assessment draft;
- background sync;
- conflict resolution;
- encrypted local content cache.

Offline mode не должен блокировать запуск MVP.

---

## 9. Push notifications

### 9.1 MVP+

Push можно добавить после базового mobile MVP.

Типы push:

- назначен новый курс;
- дедлайн скоро;
- курс просрочен;
- сертификат выдан.

### 9.2 Требования

- пользователь должен дать разрешение;
- backend хранит device tokens;
- уведомления должны уважать настройки пользователя;
- не отправлять чувствительные данные в push body.

---

## 10. Mobile security

Требования:

- не хранить пароль;
- токены хранить безопасно;
- logout должен очищать локальное хранилище;
- API всегда проверяет RBAC;
- не доверять mobile client;
- файлы открывать через signed URLs;
- не кэшировать sensitive content без необходимости.

---

## 11. Mobile UX rules

1. Главная кнопка: “Продолжить обучение”.
2. Минимум административных терминов.
3. Короткие тексты.
4. Крупные touch targets.
5. Прогресс должен быть виден сразу.
6. Ошибки должны быть понятными.
7. Дедлайны должны быть заметными.
8. Не перегружать dashboard.
9. Уроки должны открываться быстро.
10. Assessment flow должен защищать от случайной отправки.

---

## 12. Mobile MVP backlog

### Epic M1. Mobile Foundation

- создать Expo app;
- настроить TypeScript;
- настроить navigation;
- настроить shared API client;
- настроить secure token storage.

### Epic M2. Auth

- login;
- logout;
- profile loading;
- session restore.

### Epic M3. Courses

- my courses;
- course details;
- progress display.

### Epic M4. Lessons

- lesson player;
- complete lesson;
- next lesson navigation.

### Epic M5. Assessments

- assessment start;
- submit answers;
- show result.

### Epic M6. Certificates

- list certificates;
- certificate details;
- open/download.

### Epic M7. Notifications

- list notifications;
- mark as read;
- navigate to related object.

### Epic M8. Mobile QA

- smoke tests;
- auth tests;
- course flow tests;
- network error handling.

---

## 13. Когда начинать mobile app

Не начинать mobile app до завершения:

- базового backend;
- auth;
- courses;
- lessons;
- assignments;
- progress;
- assessments;
- certificates;
- stable API contracts.

Рекомендуемый порядок:

1. Сначала web MVP.
2. Потом стабилизировать API.
3. Потом mobile learner MVP.
4. Потом push/offline/future improvements.

---

## 14. Связь с документами

Этот документ связан с:

- `03_LMS_Architecture_Map.md`;
- `05_LMS_API_Contracts_Draft.md`;
- `06_LMS_Repository_Structure.md`;
- `10_LMS_AI_Coding_Agent_Instructions.md`;
- `16_LMS_UX_UI_Structure.md`;
- `19_LMS_Product_Version_Map.md`.

