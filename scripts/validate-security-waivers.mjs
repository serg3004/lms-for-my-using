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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(waiver.expires) || waiver.expires < today) {
    throw new Error(`${label}.expires must be today or a future ISO date`);
  }
  if (ids.has(waiver.id)) throw new Error(`${label}.id must be unique`);
  ids.add(waiver.id);
}

if (ignoreFile) {
  await writeFile(ignoreFile, `${policy.waivers.map(({ id }) => id).join('\n')}\n`);
}

console.log(`Validated ${policy.waivers.length} active security waiver(s)`);
