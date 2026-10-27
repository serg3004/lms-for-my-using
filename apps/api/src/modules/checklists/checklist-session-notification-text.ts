import type { ChecklistSessionChangeType } from './checklist-session-notifications.js';

// Email copy mirrors the portal's localized notifications.types resources; contains no session content.
const texts = {
  "ru": {
    "checklist_session_scheduled": {
      "title": "Назначена сессия наблюдения",
      "message": "Вам назначено обучение на рабочем месте. Откройте раздел сессий, чтобы узнать подробности."
    },
    "checklist_session_rescheduled": {
      "title": "Сессия наблюдения изменена",
      "message": "Изменились время или участники сессии. Откройте раздел сессий, чтобы проверить расписание."
    },
    "checklist_session_deleted": {
      "title": "Сессия наблюдения удалена",
      "message": "Неначатая сессия удалена. Участие в ней больше не требуется."
    },
    "checklist_session_completed": {
      "title": "Сессия наблюдения завершена",
      "message": "Сессия завершена. Откройте её, чтобы просмотреть доступную обратную связь."
    }
  },
  "en": {
    "checklist_session_scheduled": {
      "title": "Training session scheduled",
      "message": "Workplace training has been scheduled for you. Open your sessions for details."
    },
    "checklist_session_rescheduled": {
      "title": "Training session changed",
      "message": "The time or participants of a session have changed. Open your sessions to check the schedule."
    },
    "checklist_session_deleted": {
      "title": "Training session deleted",
      "message": "A session that had not started was deleted. Participation is no longer required."
    },
    "checklist_session_completed": {
      "title": "Training session completed",
      "message": "The session is complete. Open it to view the feedback available to you."
    }
  },
  "kk": {
    "checklist_session_scheduled": {
      "title": "Бақылау сессиясы тағайындалды",
      "message": "Сізге жұмыс орнында оқыту тағайындалды. Толығырақ білу үшін сессиялар бөлімін ашыңыз."
    },
    "checklist_session_rescheduled": {
      "title": "Бақылау сессиясы өзгертілді",
      "message": "Сессияның уақыты немесе қатысушылары өзгерді. Кестені тексеру үшін сессиялар бөлімін ашыңыз."
    },
    "checklist_session_deleted": {
      "title": "Бақылау сессиясы жойылды",
      "message": "Әлі басталмаған сессия жойылды. Оған қатысу енді қажет емес."
    },
    "checklist_session_completed": {
      "title": "Бақылау сессиясы аяқталды",
      "message": "Сессия аяқталды. Сізге қолжетімді кері байланысты көру үшін оны ашыңыз."
    }
  },
  "zh": {
    "checklist_session_scheduled": {
      "title": "已安排观察场次",
      "message": "已为您安排在岗培训。请打开场次列表查看详情。"
    },
    "checklist_session_rescheduled": {
      "title": "观察场次已更改",
      "message": "场次的时间或参与者已更改。请打开场次列表查看安排。"
    },
    "checklist_session_deleted": {
      "title": "观察场次已删除",
      "message": "尚未开始的场次已删除，您无需再参加。"
    },
    "checklist_session_completed": {
      "title": "观察场次已完成",
      "message": "场次已完成。请打开场次查看您有权查看的反馈。"
    }
  }
} as const;

const observerDeactivatedTexts = {
  "ru": { "title": "Наблюдатель заблокирован", "message": "У заблокированного наблюдателя остались незавершённые сессии. Откройте список и назначьте другого наблюдателя." },
  "en": { "title": "Observer blocked", "message": "A blocked observer still has unfinished sessions. Open the list and assign another observer." },
  "kk": { "title": "Бақылаушы бұғатталды", "message": "Бұғатталған бақылаушының аяқталмаған сессиялары бар. Тізімді ашып, басқа бақылаушыны тағайындаңыз." },
  "zh": { "title": "观察员已被停用", "message": "已停用的观察员仍有未完成的场次。请打开列表并指派其他观察员。" }
} as const;

export function observerDeactivatedText(locale: string) {
  const language = locale.split('-')[0];
  return language && language in observerDeactivatedTexts ? observerDeactivatedTexts[language as keyof typeof observerDeactivatedTexts] : observerDeactivatedTexts.ru;
}

export function sessionChangeText(type: ChecklistSessionChangeType, locale: string) {
  const language = locale.split('-')[0];
  const translations = language && language in texts ? texts[language as keyof typeof texts] : texts.ru;
  return translations[type];
}
