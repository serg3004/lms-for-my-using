import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import type { ChecklistFeedbackVisibility, ChecklistGeolocationPolicy, ChecklistObserverEligibility, Prisma, UserRole } from '@prisma/client';

import { resolveResultColors, type ResultColors } from './checklist-colors.js';
import { presentWorkplaceSettings, type ChecklistWorkplaceSettingsView } from './checklist-workplace-settings.service.js';
import type { ChecklistModuleSettingsInput } from './checklists.schemas.js';

/**
 * PR 397: a checklist may override five groups of the organization's module settings. Null (or, for the
 * observer group, an absent eligibility) means "as in the organization". The pure functions here are the one
 * place that merges the two; every reader (report, analytics, observers, geolocation, feedback) goes through it.
 */
export const SHEET_OVERRIDES_SELECT = {
  highThresholdOverride: true,
  lowThresholdOverride: true,
  resultColorLowOverride: true,
  resultColorMidOverride: true,
  resultColorHighOverride: true,
  feedbackVisibilityOverride: true,
  observerEligibilityOverride: true,
  observerRolesOverride: true,
  observerUserIdsOverride: true,
  defaultLocationCapturePolicy: true,
} as const;

export type SheetOverridesRow = {
  highThresholdOverride: number | null;
  lowThresholdOverride: number | null;
  resultColorLowOverride: string | null;
  resultColorMidOverride: string | null;
  resultColorHighOverride: string | null;
  feedbackVisibilityOverride: ChecklistFeedbackVisibility | null;
  observerEligibilityOverride: ChecklistObserverEligibility | null;
  observerRolesOverride: UserRole[];
  observerUserIdsOverride: string[];
  defaultLocationCapturePolicy: ChecklistGeolocationPolicy | null;
};

/** What the API shows of a sheet's overrides; every `null` group inherits the organization. */
export type ModuleSettingsOverridesView = {
  thresholds: { high: number; low: number } | null;
  resultColors: ResultColors | null;
  feedbackVisibility: ChecklistFeedbackVisibility | null;
  observers: { eligibility: ChecklistObserverEligibility; roles: UserRole[]; userIds: string[] } | null;
  /** The geolocation override is the sheet's existing `defaultLocationCapturePolicy`. */
  defaultLocationCapturePolicy: ChecklistGeolocationPolicy | null;
};

export function presentOverrides(row: SheetOverridesRow): ModuleSettingsOverridesView {
  const { highThresholdOverride: high, lowThresholdOverride: low } = row;
  const { resultColorLowOverride: cLow, resultColorMidOverride: cMid, resultColorHighOverride: cHigh } = row;
  return {
    thresholds: high != null && low != null ? { high, low } : null,
    resultColors: cLow && cMid && cHigh ? { low: cLow, mid: cMid, high: cHigh } : null,
    feedbackVisibility: row.feedbackVisibilityOverride ?? null,
    observers: row.observerEligibilityOverride
      ? { eligibility: row.observerEligibilityOverride, roles: row.observerRolesOverride ?? [], userIds: row.observerUserIdsOverride ?? [] }
      : null,
    defaultLocationCapturePolicy: row.defaultLocationCapturePolicy ?? null,
  };
}

const OVERRIDE_COLUMNS = Object.keys(SHEET_OVERRIDES_SELECT).filter((key) => key !== 'defaultLocationCapturePolicy');

/** A staff-facing sheet row with the raw override columns folded into `moduleSettings` (+ a flag for the list badge). */
export function presentStaffChecklist<T extends SheetOverridesRow>(row: T) {
  const rest: Record<string, unknown> = { ...row };
  for (const key of OVERRIDE_COLUMNS) delete rest[key];
  const moduleSettings = presentOverrides(row);
  return { ...(rest as Omit<T, Exclude<keyof SheetOverridesRow, 'defaultLocationCapturePolicy'>>), moduleSettings, hasModuleOverrides: hasModuleOverrides(moduleSettings) };
}

export const hasModuleOverrides = (view: ModuleSettingsOverridesView) => Object.values(view).some((group) => group !== null);

export type EffectiveSettings = Pick<ChecklistWorkplaceSettingsView,
  'highPerformanceThreshold' | 'lowThreshold' | 'resultColors' | 'defaultGeolocationPolicy' | 'feedbackVisibility' | 'observerEligibility' | 'observerRoles' | 'observerUserIds'>;

/** The organization settings with the sheet's overrides laid over them. */
export function resolveEffectiveSettings(
  org: Pick<ChecklistWorkplaceSettingsView, keyof EffectiveSettings>,
  overrides: ModuleSettingsOverridesView | null,
): EffectiveSettings {
  return {
    highPerformanceThreshold: overrides?.thresholds?.high ?? org.highPerformanceThreshold,
    lowThreshold: overrides?.thresholds ? overrides.thresholds.low : org.lowThreshold,
    resultColors: overrides?.resultColors ?? org.resultColors,
    defaultGeolocationPolicy: overrides?.defaultLocationCapturePolicy ?? org.defaultGeolocationPolicy,
    feedbackVisibility: overrides?.feedbackVisibility ?? org.feedbackVisibility,
    observerEligibility: overrides?.observers?.eligibility ?? org.observerEligibility,
    observerRoles: overrides?.observers?.roles ?? org.observerRoles,
    observerUserIds: overrides?.observers?.userIds ?? org.observerUserIds,
  };
}

type Reader = Pick<Prisma.TransactionClient, 'checklistWorkplaceSettings' | 'checklist'>;

/** Effective settings of one sheet; an unknown sheet (or none) reads as the organization's settings. */
export async function loadEffectiveSettings(client: Reader, organizationId: string, checklistId: string | null): Promise<EffectiveSettings> {
  const [row, sheet] = await Promise.all([
    client.checklistWorkplaceSettings.findUnique({ where: { organizationId } }),
    checklistId ? client.checklist.findFirst({ where: { id: checklistId, organizationId }, select: SHEET_OVERRIDES_SELECT }) : null,
  ]);
  return resolveEffectiveSettings(presentWorkplaceSettings(organizationId, row), sheet ? presentOverrides(sheet) : null);
}

/** Frozen into the instance when it completes (see `reportSettings`): only what the report paints from. */
export type FrozenReportSettings = { highPerformanceThreshold: number; lowThreshold: number | null; resultColors: ResultColors };

export const freezeReportSettings = (settings: EffectiveSettings): FrozenReportSettings => ({
  highPerformanceThreshold: settings.highPerformanceThreshold,
  lowThreshold: settings.lowThreshold,
  resultColors: settings.resultColors,
});

export function readFrozenReportSettings(value: unknown): FrozenReportSettings | null {
  const v = value as Partial<FrozenReportSettings> | null;
  if (!v || typeof v.highPerformanceThreshold !== 'number' || !v.resultColors) return null;
  return { highPerformanceThreshold: v.highPerformanceThreshold, lowThreshold: v.lowThreshold ?? null, resultColors: resolveResultColors({ resultColorLow: v.resultColors.low, resultColorMid: v.resultColors.mid, resultColorHigh: v.resultColors.high }) };
}

/** Columns for a `moduleSettings` patch: a group set to `null` returns to "as in the organization". */
export function overridesToColumns(input: ChecklistModuleSettingsInput): Prisma.ChecklistUpdateInput {
  const data: Prisma.ChecklistUpdateInput = {};
  if (input.thresholds !== undefined) {
    if (input.thresholds && input.thresholds.low >= input.thresholds.high) {
      throw new UnprocessableEntityException('lowThreshold must be below highPerformanceThreshold so the result ranges do not overlap');
    }
    data.highThresholdOverride = input.thresholds?.high ?? null;
    data.lowThresholdOverride = input.thresholds?.low ?? null;
  }
  if (input.resultColors !== undefined) {
    data.resultColorLowOverride = input.resultColors?.low ?? null;
    data.resultColorMidOverride = input.resultColors?.mid ?? null;
    data.resultColorHighOverride = input.resultColors?.high ?? null;
  }
  if (input.feedbackVisibility !== undefined) data.feedbackVisibilityOverride = input.feedbackVisibility;
  if (input.observers !== undefined) {
    if (input.observers?.eligibility === 'selected_users' && input.observers.userIds.length === 0) {
      throw new BadRequestException('Select at least one observer or choose another eligibility');
    }
    data.observerEligibilityOverride = input.observers?.eligibility ?? null;
    data.observerRolesOverride = input.observers?.roles ?? [];
    data.observerUserIdsOverride = input.observers?.userIds ?? [];
  }
  return data;
}

/** Observers chosen for a sheet must be active users of the organization (as for the organization list). */
export async function assertObserversBelongToOrganization(client: Pick<Prisma.TransactionClient, 'user'>, organizationId: string, userIds: readonly string[]) {
  if (!userIds.length) return;
  const count = await client.user.count({ where: { organizationId, id: { in: [...userIds] }, deletedAt: null, status: 'active' } });
  if (count !== userIds.length) throw new BadRequestException('Selected observers must be active users in this organization');
}
