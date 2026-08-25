#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PROTECTED_BRANCHES = new Set(['main', 'master', 'develop']);

function defaultRun(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

export function evaluatePreflight({ branch, headSha, mainSha, ahead, behind }) {
  const failures = [];

  if (!branch) failures.push('current branch could not be determined');
  if (PROTECTED_BRANCHES.has(branch)) failures.push(`refusing to work directly on protected branch "${branch}"`);
  if (behind > 0) failures.push(`branch is ${behind} commit(s) behind origin/main; sync with main before continuing`);

  return {
    branch,
    headSha,
    mainSha,
    ahead,
    behind,
    ok: failures.length === 0,
    failures,
  };
}

export function inspectRepository({ run = defaultRun } = {}) {
  run('git', ['fetch', '--quiet', '--no-tags', 'origin', 'main']);

  const branch = run('git', ['branch', '--show-current']);
  const headSha = run('git', ['rev-parse', 'HEAD']);
  const mainSha = run('git', ['rev-parse', 'origin/main']);
  const counts = run('git', ['rev-list', '--left-right', '--count', 'HEAD...origin/main']).split(/\s+/).map(Number);
  const [ahead, behind] = counts;

  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
    throw new Error('could not parse ahead/behind counts from git rev-list');
  }

  return evaluatePreflight({ branch, headSha, mainSha, ahead, behind });
}

async function main() {
  const result = inspectRepository();
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error(`Agent preflight failed:\n- ${result.failures.join('\n- ')}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Agent preflight failed: ${error.message}`);
    process.exitCode = 1;
  });
}
