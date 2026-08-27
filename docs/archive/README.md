# Архив документации

> **HISTORICAL — НЕ CURRENT AUTHORITY.**
>
> Материалы в `docs/archive/` сохраняются для истории, rationale и восстановления контекста. Они не описывают гарантированно текущее поведение продукта, API, схемы, RBAC, инфраструктуры или workflow. Current facts необходимо проверять по `docs/README.md` и canonical owner-sources.

## Pre-implementation master context

`pre-implementation-master-context/` содержит исходный набор pre-implementation материалов, физически отделённый от current knowledge на DOC-05.

Сохранены без semantic modernization 23 numbered-файла из бывшего `docs/master-context/`:

1. `01_LMS_Master_Product_Specification.md`
2. `02_LMS_MVP_Roadmap.md`
3. `03_LMS_Architecture_Map.md`
4. `04_LMS_Database_Model_Draft.md`
5. `05_LMS_API_Contracts_Draft.md`
6. `06_LMS_Repository_Structure.md`
7. `07_LMS_Unified_Product_Backlog.md`
8. `08_LMS_GitHub_Issues_Import.md`
9. `09_LMS_Implementation_Plan_Solo_Developer_AI_Agents.md`
10. `10_LMS_AI_Coding_Agent_Instructions.md`
11. `11_LMS_AI_Agent_Workflow_GitHub_Railway.md`
12. `12_LMS_Audit_Log_And_Context_Management.md`
13. `13_LMS_Security_Checklist.md`
14. `14_LMS_Testing_Strategy.md`
15. `15_LMS_Deployment_Plan_Railway_Docker.md`
16. `16_LMS_UX_UI_Structure.md`
17. `17_LMS_Mobile_App_Scope.md`
18. `18_LMS_Commercial_Strategy.md`
19. `19_LMS_Product_Version_Map.md`
20. `20_LMS_Full_Project_Documentation_Index.md`
21. `21_LMS_Documentation_Consistency_Check.md`
22. `22_LMS_Final_Implementation_Order.md`
23. `23_LMS_AI_Agent_Master_Context.md`

Там же хранится `AI_AGENT_STARTER_PROMPT.md` — полная historical версия starter prompt, сохранённая на DOC-04. Active entry point остаётся `docs/AI_AGENT_STARTER_PROMPT.md` и ведёт в `AGENTS.md` / `docs/README.md`.

## Правило использования

Archive можно читать только когда задача требует истории, rationale или доказательства того, что было зафиксировано раньше. Current документы не должны использовать archive как источник текущего implementation state.
