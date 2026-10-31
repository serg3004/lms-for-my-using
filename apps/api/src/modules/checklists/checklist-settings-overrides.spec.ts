import { describe, expect, it } from '@jest/globals';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';

import {
  freezeReportSettings, hasModuleOverrides, overridesToColumns, presentOverrides, presentStaffChecklist, readFrozenReportSettings,
  resolveEffectiveSettings, type SheetOverridesRow,
} from './checklist-settings-overrides.js';

const org = {
  highPerformanceThreshold: 90, lowThreshold: null as number | null, resultColors: { low: '#C62828', mid: '#F9A825', high: '#2E7D32' },
  defaultGeolocationPolicy: 'off' as const, feedbackVisibility: 'after_completion' as const,
  observerEligibility: 'selected_roles' as const, observerRoles: ['admin' as const], observerUserIds: [] as string[],
};
const none: SheetOverridesRow = {
  highThresholdOverride: null, lowThresholdOverride: null, resultColorLowOverride: null, resultColorMidOverride: null, resultColorHighOverride: null,
  feedbackVisibilityOverride: null, observerEligibilityOverride: null, observerRolesOverride: [], observerUserIdsOverride: [], defaultLocationCapturePolicy: null,
};

describe('checklist module-settings overrides (PR 397)', () => {
  it('a sheet without overrides is exactly the organization', () => {
    const view = presentOverrides(none);
    expect(hasModuleOverrides(view)).toBe(false);
    expect(resolveEffectiveSettings(org, view)).toEqual(org);
    expect(resolveEffectiveSettings(org, null)).toEqual(org);
  });

  it('each group overrides on its own and leaves the others', () => {
    const effective = resolveEffectiveSettings(org, presentOverrides({
      ...none, highThresholdOverride: 60, lowThresholdOverride: 20, feedbackVisibilityOverride: 'live',
      observerEligibilityOverride: 'selected_users', observerUserIdsOverride: ['u1'], defaultLocationCapturePolicy: 'required',
    }));
    expect(effective).toMatchObject({
      highPerformanceThreshold: 60, lowThreshold: 20, feedbackVisibility: 'live', observerEligibility: 'selected_users', observerUserIds: ['u1'],
      defaultGeolocationPolicy: 'required', resultColors: org.resultColors,
    });
  });

  it('colours and thresholds are groups: a half-set group inherits', () => {
    expect(presentOverrides({ ...none, highThresholdOverride: 60 }).thresholds).toBeNull();
    expect(presentOverrides({ ...none, resultColorLowOverride: '#111111' }).resultColors).toBeNull();
  });

  it('turns a patch into columns, null returns a group to the organization', () => {
    expect(overridesToColumns({ thresholds: { high: 70, low: 30 } })).toEqual({ highThresholdOverride: 70, lowThresholdOverride: 30 });
    expect(overridesToColumns({ thresholds: null, resultColors: null, feedbackVisibility: null, observers: null })).toEqual({
      highThresholdOverride: null, lowThresholdOverride: null, resultColorLowOverride: null, resultColorMidOverride: null, resultColorHighOverride: null,
      feedbackVisibilityOverride: null, observerEligibilityOverride: null, observerRolesOverride: [], observerUserIdsOverride: [],
    });
    expect(overridesToColumns({})).toEqual({});
    expect(() => overridesToColumns({ thresholds: { high: 30, low: 30 } })).toThrow(UnprocessableEntityException);
    expect(() => overridesToColumns({ observers: { eligibility: 'selected_users', roles: [], userIds: [] } })).toThrow(BadRequestException);
  });

  it('folds the raw columns into moduleSettings for the API', () => {
    const shown = presentStaffChecklist({ id: 'c1', ...none, highThresholdOverride: 60, lowThresholdOverride: 20 });
    expect(shown).not.toHaveProperty('highThresholdOverride');
    expect(shown).toMatchObject({ id: 'c1', hasModuleOverrides: true, moduleSettings: { thresholds: { high: 60, low: 20 } } });
  });

  it('freezes only what the report paints from and reads it back', () => {
    const frozen = freezeReportSettings(resolveEffectiveSettings(org, null));
    expect(readFrozenReportSettings(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen);
    expect(readFrozenReportSettings(null)).toBeNull();
    expect(readFrozenReportSettings({})).toBeNull();
  });
});
