#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const [policyPath = 'security-waivers.json', ignoreFile] = process.argv.slice(2);
const policy = JSON.parse(await readFile(policyPath, 'utf8'));

if (policy.version !== 1 || !Array.isArray(policy.waivers)) {
  throw new Error('Security waiver policy must have version 1 and a waivers array');
}

const today = new Date().toISOString().slice(0, 10);
const ids = new Set();
for (const [index, waiver] of policy.waivers.entries()) {
  const label = `waivers[${index}]`;
  for (const field of ['id', 'owner', 'reason', 'expires']) {
    if (typeof waiver[field] !== 'string' || waiver[field].trim() === '') {
      throw new Error(`${label}.${field} must be a non-empty string`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(waiver.expires)) {
    throw new Error(`${label}.expires must be an ISO date`);
  }
  if (ids.has(waiver.id)) throw new Error(`${label}.id must be unique`);
  ids.add(waiver.id);
}

// An expired waiver lapses instead of failing unrelated PRs: it is left out of the
// ignore file, so the scanner itself blocks again only if the finding is still real.
const active = policy.waivers.filter(({ expires }) => expires >= today);
for (const waiver of policy.waivers) {
  if (waiver.expires < today) console.warn(`Security waiver ${waiver.id} expired on ${waiver.expires} and is no longer applied`);
}

if (ignoreFile) {
  await writeFile(ignoreFile, `${active.map(({ id }) => id).join('\n')}\n`);
}

console.log(`Validated ${active.length} active security waiver(s)`);
