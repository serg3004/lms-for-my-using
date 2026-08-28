import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const defaultRepoRoot = fileURLToPath(new URL('../', import.meta.url));
export const defaultOwnershipPath = resolve(defaultRepoRoot, 'docs/_meta/ownership.json');

function unique(values) {
  return [...new Set(values)];
}

function sorted(values) {
  return [...values].sort();
}

function escapeRegexChar(char) {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
}

export function globToRegExp(pattern) {
  let regex = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char !== '*') {
      regex += char === '?' ? '[^/]' : escapeRegexChar(char);
      continue;
    }

    const next = pattern[index + 1];
    if (next !== '*') {
      regex += '[^/]*';
      continue;
    }

    index += 1;
    if (pattern[index + 1] === '/') {
      index += 1;
      regex += '(?:.*/)?';
    } else {
      regex += '.*';
    }
  }
  return new RegExp(`${regex}$`);
}

export function matchesGlob(path, pattern) {
  return globToRegExp(pattern).test(path);
}

export function runGit(args, { repoRoot = defaultRepoRoot } = {}) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed\n${result.stderr || result.stdout || ''}`.trim());
  }
  return result.stdout ?? '';
}

export function listTrackedFiles(repoRoot = defaultRepoRoot) {
  return runGit(['ls-files', '-z'], { repoRoot }).split('\0').filter(Boolean);
}

function assertStringArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array of non-empty strings`);
  }
}

function assertCurrentManualTarget(path) {
  if (!path.startsWith('docs/')) throw new Error(`manual target must be under docs/: ${path}`);
  for (const forbidden of ['docs/generated/', 'docs/archive/', 'docs/evidence/']) {
    if (path.startsWith(forbidden)) throw new Error(`manual target must be current non-generated documentation: ${path}`);
  }
}

export function validateOwnership(config, { repoRoot = defaultRepoRoot, trackedFiles = listTrackedFiles(repoRoot) } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('ownership config must be an object');
  if (config.version !== 1) throw new Error('ownership config version must be 1');
  assertStringArray(config.generatedArtifacts, 'generatedArtifacts', { allowEmpty: false });
  if (!Array.isArray(config.mappings) || config.mappings.length === 0) throw new Error('mappings must be a non-empty array');

  const generatedArtifacts = unique(config.generatedArtifacts);
  if (generatedArtifacts.length !== config.generatedArtifacts.length) throw new Error('generatedArtifacts contains duplicates');

  const actualGeneratedArtifacts = trackedFiles
    .filter((path) => path.startsWith('docs/generated/') && path.endsWith('.md') && path !== 'docs/generated/README.md');
  if (JSON.stringify(sorted(generatedArtifacts)) !== JSON.stringify(sorted(actualGeneratedArtifacts))) {
    throw new Error(
      `generatedArtifacts must exactly declare tracked generated Markdown files\nexpected: ${sorted(actualGeneratedArtifacts).join(', ')}\nactual: ${sorted(generatedArtifacts).join(', ')}`,
    );
  }

  for (const target of generatedArtifacts) {
    if (!existsSync(resolve(repoRoot, target))) throw new Error(`generated artifact does not exist: ${target}`);
  }

  const seenIds = new Set();
  const seenGlobs = new Map();
  const sourceOwners = new Map();
  const validatedMappings = [];

  for (const mapping of config.mappings) {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('each mapping must be an object');
    if (typeof mapping.id !== 'string' || !mapping.id.trim()) throw new Error('mapping id must be a non-empty string');
    if (seenIds.has(mapping.id)) throw new Error(`duplicate mapping id: ${mapping.id}`);
    seenIds.add(mapping.id);

    assertStringArray(mapping.sourceGlobs, `${mapping.id}.sourceGlobs`, { allowEmpty: false });
    assertStringArray(mapping.generatedTargets ?? [], `${mapping.id}.generatedTargets`);
    assertStringArray(mapping.manualTargets, `${mapping.id}.manualTargets`, { allowEmpty: false });
    for (const field of ['reason', 'scope']) {
      if (mapping[field] !== undefined && (typeof mapping[field] !== 'string' || !mapping[field].trim())) {
        throw new Error(`${mapping.id}.${field} must be a non-empty string when provided`);
      }
    }

    const sourceFiles = new Set();
    for (const sourceGlob of mapping.sourceGlobs) {
      const duplicateOwner = seenGlobs.get(sourceGlob);
      if (duplicateOwner) throw new Error(`source glob conflict: ${sourceGlob} is declared by ${duplicateOwner} and ${mapping.id}`);
      seenGlobs.set(sourceGlob, mapping.id);

      const matches = trackedFiles.filter((path) => matchesGlob(path, sourceGlob));
      if (matches.length === 0) throw new Error(`source glob has zero tracked matches: ${mapping.id}: ${sourceGlob}`);
      for (const path of matches) sourceFiles.add(path);
    }

    for (const sourceFile of sourceFiles) {
      const previousOwner = sourceOwners.get(sourceFile);
      if (previousOwner) throw new Error(`mapping conflict: ${sourceFile} matches both ${previousOwner} and ${mapping.id}`);
      sourceOwners.set(sourceFile, mapping.id);
    }

    for (const target of mapping.generatedTargets ?? []) {
      if (!generatedArtifacts.includes(target)) throw new Error(`generated target is not declared in generatedArtifacts: ${mapping.id}: ${target}`);
    }

    for (const target of mapping.manualTargets) {
      assertCurrentManualTarget(target);
      if (!trackedFiles.includes(target) || !existsSync(resolve(repoRoot, target))) {
        throw new Error(`manual target does not exist as a tracked file: ${mapping.id}: ${target}`);
      }
    }

    validatedMappings.push({ ...mapping, sourceFiles: sorted(sourceFiles) });
  }

  return { ...config, generatedArtifacts, mappings: validatedMappings };
}

export function parseReviewedNoChange(body) {
  const match = String(body ?? '').match(/^Docs-Impact:\s*reviewed-no-change\s*(?:—|-)\s*(.+)$/im);
  if (!match) return null;
  const reason = match[1].trim();
  if (!reason || /^(?:n\/?a|none|not applicable|todo|tbd|-+)$/i.test(reason)) return null;
  return reason;
}

export function evaluateImpact(validatedOwnership, changedFiles, prBody = '') {
  const changed = new Set(changedFiles);
  const reviewedNoChange = parseReviewedNoChange(prBody);
  const triggered = [];
  const failures = [];

  for (const mapping of validatedOwnership.mappings) {
    const changedSources = mapping.sourceFiles.filter((path) => changed.has(path));
    if (changedSources.length === 0) continue;

    const changedManualTargets = mapping.manualTargets.filter((path) => changed.has(path));
    const satisfiedBy = changedManualTargets.length > 0 ? 'manual-target' : reviewedNoChange ? 'reviewed-no-change' : null;
    const result = { mapping, changedSources, changedManualTargets, satisfiedBy, reviewedNoChange };
    triggered.push(result);
    if (!satisfiedBy) failures.push(result);
  }

  return { triggered, failures, reviewedNoChange };
}

export function changedFilesBetween(baseSha, headSha, { repoRoot = defaultRepoRoot } = {}) {
  if (!baseSha || !headSha) throw new Error('pull request base/head SHA are required');
  runGit(['cat-file', '-e', `${baseSha}^{commit}`], { repoRoot });
  runGit(['cat-file', '-e', `${headSha}^{commit}`], { repoRoot });
  return runGit(['diff', '--no-renames', '--name-only', '--diff-filter=ACDMRT', `${baseSha}...${headSha}`, '--'], { repoRoot })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function readImpactContext({ eventPath = process.env.GITHUB_EVENT_PATH } = {}) {
  if (!eventPath) return { mode: 'local' };
  if (!existsSync(eventPath)) throw new Error(`GITHUB_EVENT_PATH does not exist: ${eventPath}`);
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  if (!event.pull_request) return { mode: 'push', event };

  const baseSha = event.pull_request.base?.sha;
  const headSha = event.pull_request.head?.sha;
  if (!baseSha || !headSha) throw new Error('pull_request event is missing base/head SHA');
  return { mode: 'pull_request', baseSha, headSha, body: event.pull_request.body ?? '', event };
}

export function formatFailures(failures) {
  return failures.map(({ mapping, changedSources }) => [
    `mapping ${mapping.id} was triggered by:`,
    ...changedSources.map((path) => `  - ${path}`),
    'expected at least one manual owner-doc change:',
    ...mapping.manualTargets.map((path) => `  - ${path}`),
    'or PR body line: Docs-Impact: reviewed-no-change — <specific reason>',
  ].join('\n')).join('\n\n');
}

export function main({ repoRoot = defaultRepoRoot, ownershipPath = resolve(repoRoot, 'docs/_meta/ownership.json') } = {}) {
  const config = JSON.parse(readFileSync(ownershipPath, 'utf8'));
  const validatedOwnership = validateOwnership(config, { repoRoot });
  const context = readImpactContext();

  if (context.mode !== 'pull_request') {
    console.log(`docs impact: ownership schema/paths valid (${context.mode}); PR metadata review not required`);
    return;
  }

  const changedFiles = changedFilesBetween(context.baseSha, context.headSha, { repoRoot });
  const result = evaluateImpact(validatedOwnership, changedFiles, context.body);
  if (result.failures.length > 0) {
    throw new Error(`documentation impact review is required\n${formatFailures(result.failures)}`);
  }

  if (result.triggered.length === 0) {
    console.log('docs impact: no mapped public source changes');
    return;
  }

  for (const entry of result.triggered) {
    const detail = entry.satisfiedBy === 'manual-target'
      ? `manual docs changed: ${entry.changedManualTargets.join(', ')}`
      : `reviewed-no-change: ${entry.reviewedNoChange}`;
    console.log(`docs impact: ${entry.mapping.id} satisfied (${detail})`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
      process.stderr.write(`::error title=Documentation impact review::${escaped}\n`);
    }
    process.exit(1);
  }
}
