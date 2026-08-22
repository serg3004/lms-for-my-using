#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const RULESET_NAME = 'Protect main';
export const REQUIRED_CHECKS = ['Checks', 'Analyze (javascript-typescript)'];

export function desiredRuleset() {
  return {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: {
      ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] },
    },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: false,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: false,
          do_not_enforce_on_create: false,
          required_status_checks: REQUIRED_CHECKS.map((context) => ({ context })),
        },
      },
    ],
  };
}

function ruleByType(ruleset, type) {
  return ruleset.rules?.find((rule) => rule.type === type);
}

export function verifyRuleset(ruleset) {
  const failures = [];
  if (ruleset.name !== RULESET_NAME) failures.push(`name must be "${RULESET_NAME}"`);
  if (ruleset.target !== 'branch') failures.push('target must be branch');
  if (ruleset.enforcement !== 'active') failures.push('enforcement must be active');
  if ((ruleset.bypass_actors?.length ?? 0) !== 0) failures.push('bypass list must be empty');

  const includedRefs = ruleset.conditions?.ref_name?.include ?? [];
  if (!includedRefs.includes('~DEFAULT_BRANCH')) failures.push('default branch must be targeted');
  for (const type of ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']) {
    if (!ruleByType(ruleset, type)) failures.push(`missing ${type} rule`);
  }

  const pullRequest = ruleByType(ruleset, 'pull_request')?.parameters;
  if (pullRequest?.required_approving_review_count !== 0) failures.push('required approvals must be 0');

  const statusParameters = ruleByType(ruleset, 'required_status_checks')?.parameters;
  if (statusParameters?.strict_required_status_checks_policy !== false) {
    failures.push('up-to-date requirement must be disabled');
  }
  const actualChecks = (statusParameters?.required_status_checks ?? []).map(({ context }) => context).sort();
  const expectedChecks = [...REQUIRED_CHECKS].sort();
  if (JSON.stringify(actualChecks) !== JSON.stringify(expectedChecks)) {
    failures.push(`required checks must be exactly: ${REQUIRED_CHECKS.join(', ')}`);
  }
  return failures;
}

function parseRepository(value) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(value ?? '')) {
    throw new Error('GITHUB_REPOSITORY must have the form owner/repository');
  }
  return value;
}

export async function configure({ repository, token, apply = false, fetchImpl = fetch }) {
  const apiRoot = `https://api.github.com/repos/${parseRepository(repository)}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const request = async (path, options = {}) => {
    const response = await fetchImpl(`${apiRoot}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    if (!response.ok) throw new Error(`GitHub API ${options.method ?? 'GET'} ${path}: ${response.status} ${await response.text()}`);
    return response.json();
  };

  const repositoryInfo = await request('');
  const branch = await request(`/branches/${encodeURIComponent(repositoryInfo.default_branch)}`);
  const rulesets = await request('/rulesets');
  const summary = {
    repository,
    defaultBranch: repositoryInfo.default_branch,
    branchProtected: branch.protected,
    existingRuleset: rulesets.find(({ name, target }) => name === RULESET_NAME && target === 'branch') ?? null,
  };
  if (!apply) return summary;
  if (!token) throw new Error('GITHUB_TOKEN with repository Administration write permission is required with --apply');

  const body = JSON.stringify(desiredRuleset());
  const saved = summary.existingRuleset
    ? await request(`/rulesets/${summary.existingRuleset.id}`, { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } })
    : await request('/rulesets', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
  const readBack = await request(`/rulesets/${saved.id}`);
  const failures = verifyRuleset(readBack);
  if (failures.length) throw new Error(`Ruleset read-back verification failed:\n- ${failures.join('\n- ')}`);
  const protectedBranch = await request(`/branches/${encodeURIComponent(repositoryInfo.default_branch)}`);
  if (!protectedBranch.protected) throw new Error(`${repositoryInfo.default_branch} is still reported as unprotected`);
  return { ...summary, action: summary.existingRuleset ? 'updated' : 'created', rulesetId: saved.id, verified: true };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const repository = process.env.GITHUB_REPOSITORY;
  const result = await configure({ repository, token: process.env.GITHUB_TOKEN, apply });
  console.log(JSON.stringify(result, null, 2));
  if (!apply && !result.branchProtected) {
    console.error('Branch protection is not active. Re-run with an authorized GITHUB_TOKEN and --apply.');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
