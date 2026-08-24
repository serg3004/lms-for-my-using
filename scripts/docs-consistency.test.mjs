import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { URL } from 'node:url';

const appModule = readFileSync(new URL('../apps/api/src/app.module.ts', import.meta.url), 'utf8');
const architecture = readFileSync(new URL('../docs/ARCHITECTURE_MODULE_BOUNDARIES.md', import.meta.url), 'utf8');
const rbac = readFileSync(new URL('../docs/API_RBAC_MATRIX.md', import.meta.url), 'utf8');

function sorted(values) {
  return [...values].sort();
}

test('architecture inventory contains every production AppModule import exactly once', () => {
  const importsBlock = appModule.match(/@Module\(\{\s*imports:\s*\[([\s\S]*?)\n\s*\],\s*\n\}\)/)?.[1];
  assert.ok(importsBlock, 'AppModule imports array was not found');

  const productionModules = [...importsBlock.matchAll(/^\s*([A-Z][A-Za-z]+Module)(?:\.forRoot\([\s\S]*?^\s*\}\),|,)/gm)].map(
    ([, name]) => name,
  );
  const inventorySection = architecture.match(/Current production `AppModule` imports[\s\S]*?\nEach API domain module/)?.[0];
  assert.ok(inventorySection, 'checked architecture inventory section was not found');
  const documentedModules = [...inventorySection.matchAll(/^\| `([A-Z][A-Za-z]+Module)` \|/gm)].map(([, name]) => name);

  assert.deepEqual(sorted(documentedModules), sorted(productionModules));
  assert.equal(new Set(documentedModules).size, documentedModules.length, 'architecture inventory has duplicate modules');
});

test('RBAC course-scope controller count and list match CourseAccessGuard usage', () => {
  const paragraph = rbac.match(/alongside the role guards on (\d+) controllers:\n([\s\S]*?)\.\n\n-/);
  assert.ok(paragraph, 'RBAC course-scope controller inventory was not found');
  const documentedCount = Number(paragraph[1]);
  const documentedControllers = [...paragraph[2].matchAll(/`([a-z][a-z-]+)`/g)].map(([, name]) => name);

  const modulesDirectory = new URL('../apps/api/src/modules/', import.meta.url);
  const guardedControllers = readdirSync(modulesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => readdirSync(new URL(`${entry.name}/`, modulesDirectory))
      .filter((file) => file.endsWith('.controller.ts'))
      .some((file) => readFileSync(new URL(`${entry.name}/${file}`, modulesDirectory), 'utf8').includes('CourseAccessGuard')))
    .map((entry) => entry.name);

  assert.equal(documentedControllers.length, documentedCount);
  assert.deepEqual(sorted(documentedControllers), sorted(guardedControllers));
});
