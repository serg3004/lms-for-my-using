import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulesRoot = resolve(apiRoot, 'src/modules');
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'));
}

const violations = [];
const dependencies = new Map();

for (const file of sourceFiles(modulesRoot)) {
  const relativeFile = relative(modulesRoot, file);
  const [sourceModule] = relativeFile.split(sep);
  const source = readFileSync(file, 'utf8');

  if (file.endsWith('.controller.ts') && /(?:from\s+['"][^'"]*database\/|PrismaService)/.test(source)) {
    violations.push(`${relativeFile}: controllers must delegate persistence instead of importing Prisma/database code`);
  }

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    const crossModule = /^\.\.\/([^./][^/]*)\/(.+)$/.exec(specifier);
    if (!crossModule) continue;

    const [, targetModule, targetPath] = crossModule;
    if (targetModule === sourceModule) continue;
    dependencies.set(sourceModule, new Set([...(dependencies.get(sourceModule) ?? []), targetModule]));

    const isPublicApi = targetPath === 'public.js';
    const isNestModule = targetPath === `${targetModule}.module.js` && file.endsWith('.module.ts');
    if (!isPublicApi && !isNestModule) {
      violations.push(
        `${relativeFile}: cross-module import "${specifier}" must use ../${targetModule}/public.js` +
        ` (Nest module composition may import ${targetModule}.module.js)`,
      );
    }
  }
}

function findCycle(module, path = []) {
  if (path.includes(module)) return [...path.slice(path.indexOf(module)), module];
  for (const dependency of dependencies.get(module) ?? []) {
    const cycle = findCycle(dependency, [...path, module]);
    if (cycle) return cycle;
  }
  return null;
}

for (const module of dependencies.keys()) {
  const cycle = findCycle(module);
  if (cycle) {
    violations.push(`module dependency cycle: ${cycle.join(' -> ')}`);
    break;
  }
}

if (violations.length > 0) {
  console.error(`Module boundary check failed:\n${violations.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Module boundaries: ${dependencies.size} modules checked; no internal cross-imports or cycles.`);
}
