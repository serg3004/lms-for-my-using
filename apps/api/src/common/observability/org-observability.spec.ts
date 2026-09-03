import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';

import {
  metricsRegistry,
  orgDepartmentTreeQueryDuration,
  orgImportFailures,
  orgImportRows,
  orgLearningTargetResolutionDuration,
  orgReparentConflicts,
  orgReportQueryDuration,
  orgScopeResolutionDuration,
} from './metrics.js';
import { logOrgDiagnostic, observeOrgDuration, orgFailureReason } from './org-observability.js';

describe('organization observability', () => {
  it('registers every required metric with bounded labels', () => {
    expect([
      orgDepartmentTreeQueryDuration,
      orgScopeResolutionDuration,
      orgLearningTargetResolutionDuration,
      orgReportQueryDuration,
      orgImportRows,
      orgImportFailures,
      orgReparentConflicts,
    ].map((metric) => ({ name: metric.name, labels: metric.labelNames }))).toEqual([
      { name: 'lms_org_department_tree_query_duration_seconds', labels: ['operation', 'outcome'] },
      { name: 'lms_org_scope_resolution_duration_seconds', labels: ['operation', 'outcome'] },
      { name: 'lms_org_learning_target_resolution_duration_seconds', labels: ['outcome'] },
      { name: 'lms_org_report_query_duration_seconds', labels: ['report', 'outcome'] },
      { name: 'lms_org_import_rows_total', labels: ['kind', 'stage', 'outcome'] },
      { name: 'lms_org_import_failures_total', labels: ['kind', 'stage', 'reason'] },
      { name: 'lms_org_reparent_conflicts_total', labels: ['reason'] },
    ]);
  });

  it('records success and error outcomes without changing action behavior', async () => {
    await expect(observeOrgDuration(orgLearningTargetResolutionDuration, {}, async () => 'unchanged')).resolves.toBe('unchanged');
    const failure = new Error('private database detail');
    await expect(observeOrgDuration(orgLearningTargetResolutionDuration, {}, async () => { throw failure; })).rejects.toBe(failure);

    const metric = await metricsRegistry.getSingleMetricAsString('lms_org_learning_target_resolution_duration_seconds');
    expect(metric).toContain('outcome="success"');
    expect(metric).toContain('outcome="error"');
    expect(metric).not.toContain('private database detail');
  });

  it('maps diagnostics to bounded reasons and never adds identifiers', () => {
    expect(orgFailureReason(new ConflictException('Cycle detected for department secret-id'))).toBe('cycle');
    expect(orgFailureReason(new BadRequestException('Depth exceeds 32'))).toBe('depth');
    expect(orgFailureReason(new ForbiddenException('token-is-secret'))).toBe('denied');

    const logger = { warn: jest.fn() };
    logOrgDiagnostic(logger, 'org_import_failed', 'validation', { kind: 'DEPARTMENTS', stage: 'preview' });
    expect(logger.warn).toHaveBeenCalledWith(
      { event: 'org_import_failed', reason: 'validation', kind: 'DEPARTMENTS', stage: 'preview' },
      'Organization structure operation diagnostic',
    );
  });
});
