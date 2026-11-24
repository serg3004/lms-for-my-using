import type { PrismaService } from '../../database/prisma.service.js';
import { ANALYTICS_WIDGET_IDS, type ChecklistAnalyticsDashboardLayoutInput } from './checklists.schemas.js';

const ORGANIZATION_KEY = 'organization';

export type DashboardWidget = { id: (typeof ANALYTICS_WIDGET_IDS)[number]; size: 'S' | 'M' | 'L' };
export type DashboardLayout = { version: 1; widgets: DashboardWidget[] };

/** What a stored value is trusted as: unknown widgets and repeats are dropped, so an old or edited row can never break the page. */
export function normalizeLayout(value: unknown): DashboardLayout | null {
  const widgets = (value as { widgets?: unknown } | null)?.widgets;
  if (!Array.isArray(widgets)) return null;
  const seen = new Set<string>();
  const clean: DashboardWidget[] = [];
  for (const entry of widgets as Array<{ id?: unknown; size?: unknown }>) {
    const id = entry?.id as DashboardWidget['id'];
    if (!ANALYTICS_WIDGET_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    clean.push({ id, size: entry.size === 'S' || entry.size === 'L' ? entry.size : 'M' });
  }
  return { version: 1, widgets: clean };
}

/** PR 520: the dashboard layout, kept per user with an organization default. Plain helper, built in ChecklistsService's constructor body. */
export class ChecklistAnalyticsDashboardLayouts {
  constructor(private readonly prisma: PrismaService) {}

  /** The viewer's own layout and the organization default; the client falls back from the first to the second to the built-in set. */
  async get(organizationId: string, userId: string) {
    const rows = await this.prisma.checklistAnalyticsDashboardLayout.findMany({ where: { organizationId, ownerKey: { in: [userId, ORGANIZATION_KEY] } } });
    return {
      user: normalizeLayout(rows.find((row) => row.ownerKey === userId)?.layout),
      organization: normalizeLayout(rows.find((row) => row.ownerKey === ORGANIZATION_KEY)?.layout),
    };
  }

  /** Saves the layout; only an administrator may write the organization default. `null` resets it. */
  async save(organizationId: string, actor: { id: string; roles: readonly string[] }, input: ChecklistAnalyticsDashboardLayoutInput, forbidden: () => never) {
    if (input.scope === 'organization' && !actor.roles.includes('admin')) forbidden();
    const ownerKey = input.scope === 'organization' ? ORGANIZATION_KEY : actor.id;
    if (input.widgets === null) {
      await this.prisma.checklistAnalyticsDashboardLayout.deleteMany({ where: { organizationId, ownerKey } });
    } else {
      const layout = { version: 1, widgets: input.widgets };
      await this.prisma.checklistAnalyticsDashboardLayout.upsert({
        where: { organizationId_ownerKey: { organizationId, ownerKey } },
        create: { organizationId, ownerKey, layout },
        update: { layout },
      });
    }
    return this.get(organizationId, actor.id);
  }
}
