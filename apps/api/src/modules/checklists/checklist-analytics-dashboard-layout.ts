import type { PrismaService } from '../../database/prisma.service.js';
import { ANALYTICS_WIDGET_IDS, MAX_ANALYTICS_DASHBOARDS, type ChecklistAnalyticsDashboardLayoutInput } from './checklists.schemas.js';

const ORGANIZATION_KEY = 'organization';
const DASHBOARD_ID = /^[a-z0-9-]{1,24}$/;

export type DashboardWidget = { id: (typeof ANALYTICS_WIDGET_IDS)[number]; size: 'S' | 'M' | 'L'; options?: Record<string, string | string[]> };
export type Dashboard = { id: string; name: string; widgets: DashboardWidget[] };
export type DashboardSet = { version: 2; current: string; dashboards: Dashboard[] };

function normalizeOptions(value: unknown): DashboardWidget['options'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const clean: Record<string, string | string[]> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 6)) {
    if (typeof entry === 'string') clean[key.slice(0, 20)] = entry.slice(0, 40);
    else if (Array.isArray(entry)) clean[key.slice(0, 20)] = entry.filter((item): item is string => typeof item === 'string').slice(0, 10).map((item) => item.slice(0, 40));
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** Unknown widgets and repeats are dropped, a bad size becomes medium. */
function normalizeWidgets(value: unknown): DashboardWidget[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const clean: DashboardWidget[] = [];
  for (const entry of value as Array<{ id?: unknown; size?: unknown; options?: unknown }>) {
    const id = entry?.id as DashboardWidget['id'];
    if (!ANALYTICS_WIDGET_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    const options = normalizeOptions(entry.options);
    clean.push({ id, size: entry.size === 'S' || entry.size === 'L' ? entry.size : 'M', ...(options ? { options } : {}) });
  }
  return clean;
}

/**
 * What a stored value is trusted as. The first version stored one list of widgets (`{ version: 1, widgets }`); it reads as one default dashboard.
 * A broken value is "nothing saved", so an old or edited row can never break the page.
 */
export function normalizeLayout(value: unknown): DashboardSet | null {
  const stored = value as { widgets?: unknown; dashboards?: unknown; current?: unknown } | null;
  if (Array.isArray(stored?.widgets)) return { version: 2, current: 'main', dashboards: [{ id: 'main', name: '', widgets: normalizeWidgets(stored.widgets) }] };
  if (!Array.isArray(stored?.dashboards)) return null;
  const seen = new Set<string>();
  const dashboards: Dashboard[] = [];
  for (const entry of stored.dashboards as Array<{ id?: unknown; name?: unknown; widgets?: unknown }>) {
    if (typeof entry?.id !== 'string' || !DASHBOARD_ID.test(entry.id) || seen.has(entry.id) || dashboards.length >= MAX_ANALYTICS_DASHBOARDS) continue;
    seen.add(entry.id);
    dashboards.push({ id: entry.id, name: typeof entry.name === 'string' ? entry.name.trim().slice(0, 60) : '', widgets: normalizeWidgets(entry.widgets) });
  }
  if (dashboards.length === 0) return null;
  return { version: 2, current: typeof stored.current === 'string' && seen.has(stored.current) ? stored.current : dashboards[0]!.id, dashboards };
}

/** PR 520: the dashboards, kept per user with an organization default. Plain helper, built in ChecklistsService's constructor body. */
export class ChecklistAnalyticsDashboardLayouts {
  constructor(private readonly prisma: PrismaService) {}

  /** The viewer's own dashboards and the organization default; the client falls back from the first to the second to the built-in set. */
  async get(organizationId: string, userId: string) {
    const rows = await this.prisma.checklistAnalyticsDashboardLayout.findMany({ where: { organizationId, ownerKey: { in: [userId, ORGANIZATION_KEY] } } });
    return {
      user: normalizeLayout(rows.find((row) => row.ownerKey === userId)?.layout),
      organization: normalizeLayout(rows.find((row) => row.ownerKey === ORGANIZATION_KEY)?.layout),
    };
  }

  /** Saves the set; only an administrator may write the organization default. `null` resets it. */
  async save(organizationId: string, actor: { id: string; roles: readonly string[] }, input: ChecklistAnalyticsDashboardLayoutInput, forbidden: () => never) {
    if (input.scope === 'organization' && !actor.roles.includes('admin')) forbidden();
    const ownerKey = input.scope === 'organization' ? ORGANIZATION_KEY : actor.id;
    if (input.dashboards === null) {
      await this.prisma.checklistAnalyticsDashboardLayout.deleteMany({ where: { organizationId, ownerKey } });
    } else {
      const layout = { version: 2, current: input.current ?? input.dashboards[0]!.id, dashboards: input.dashboards };
      await this.prisma.checklistAnalyticsDashboardLayout.upsert({
        where: { organizationId_ownerKey: { organizationId, ownerKey } },
        create: { organizationId, ownerKey, layout },
        update: { layout },
      });
    }
    return this.get(organizationId, actor.id);
  }
}
