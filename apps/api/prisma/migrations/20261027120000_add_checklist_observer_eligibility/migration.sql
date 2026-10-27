CREATE TYPE "ChecklistObserverEligibility" AS ENUM ('any_user', 'selected_roles', 'selected_users');

ALTER TABLE "checklist_workplace_settings"
  ADD COLUMN "observer_eligibility" "ChecklistObserverEligibility" NOT NULL DEFAULT 'selected_roles',
  ADD COLUMN "observer_roles" "UserRole"[] NOT NULL DEFAULT ARRAY['instructor', 'manager', 'admin']::"UserRole"[],
  ADD COLUMN "observer_user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
