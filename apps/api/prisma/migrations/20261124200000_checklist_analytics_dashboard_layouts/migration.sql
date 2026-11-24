CREATE TABLE checklist_analytics_dashboard_layouts (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_key TEXT NOT NULL,
  layout JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checklist_dashboard_layouts_org_owner_key UNIQUE (organization_id, owner_key)
);
