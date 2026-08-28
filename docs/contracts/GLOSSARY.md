# Glossary

Этот glossary намеренно короткий: он устраняет только повторяющиеся терминологические конфликты. Он не является inventory ролей, permissions или data model. Current implementation facts по-прежнему проверяются по canonical owner-sources из [`docs/README.md`](../README.md).

| Термин | Current meaning | Что не следует подразумевать |
|---|---|---|
| **Mentor / Наставник / `mentor`** | Текущее техническое имя отдельной роли. Набор ролей принадлежит Prisma/shared role constants, permissions — `rolePolicies`/guards. Контекст решения: [`ADR_CURATOR_ROLE.md`](../architecture/adr/ADR_CURATOR_ROLE.md). | Не считать синонимом `instructor` и не выводить permissions из слова «наставник». |
| **Curator / Куратор** | Legacy/ambiguous product wording, сохранённое в historical context и ADR. В current technical role set имя `curator` не является canonical role name. | Не создавать enum/permission `curator` по старому тексту и не заменять им `mentor` или `instructor` без нового решения. |
| **Instructor / Инструктор / `instructor`** | Текущее техническое имя instructor-role. Workspace/course semantics описываются current contracts, например [`INSTRUCTOR_WORKSPACE.md`](./INSTRUCTOR_WORKSPACE.md), а permissions принадлежат code owner-sources. | Не использовать как общий перевод для любого reviewer/mentor. |
| **Learner / Ученик / Student / `learner`** | `learner` — canonical technical role name в schema/API/code. «Ученик»/student допустимы как human-facing product wording, если контекст не требует literal enum value. | Не вводить отдельную technical role `student` только из UI/продуктового текста. |
| **Organization** | Persisted tenant/domain boundary, связанная с `organizationId`, memberships и organization-scoped data. Canonical data model — [`schema.prisma`](../../apps/api/prisma/schema.prisma). | Не путать с role-specific UI area или navigation shell. |
| **Workspace** | Role-oriented frontend area/navigation context, например instructor workspace. Это UX/navigation concept, а не отдельная persisted organization. | Не использовать `workspace` как синоним tenant/organization или как новый data-model entity без отдельного решения. |

## Правило применения

Если term в старом prototype, archive или historical document конфликтует с current code vocabulary, historical wording сохраняется как история, а current implementation называется по canonical owner-source. Mass rewrite существующих документов только ради единообразия терминов не требуется.
