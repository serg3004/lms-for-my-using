import { describe, expect, it } from 'vitest';

import ruCommon from './locales/ru/common.json';
import { loginResources } from './loginResources.js';
import { passwordResetResources } from './passwordResetResources.js';

// Mirrors index.ts's runtime merge: `login.*`/`passwordReset.*` live in their own resource files,
// not ru/common.json, so a bare `common.json` lookup would misreport them as missing.
const ru = { ...ruCommon, login: loginResources.ru, passwordReset: passwordResetResources.ru };

/**
 * PR 316 (UI refresh): the checklist module's 0.3 audit found several `t(...)` calls whose keys
 * were never added to `ru/common.json`, so those screens fell back to the literal English default
 * text at runtime in `ru-RU` -- a defect no locale-parity test can see, since a fallback string is
 * a perfectly well-formed (English) value, not a missing key. This scans every non-spec source
 * file of the checklist module (builder, sessions list/wizard/conduct, learner sessions, manager
 * dashboard, report, reviews) for literal `t('a.b.c', ...)` calls and asserts each such key exists
 * in the merged ru translation bundle. It can only see literal string keys, not a templated one
 * built at runtime (e.g. a key joined from a variable) -- those need their own targeted test, same
 * as any other dynamic key.
 *
 * `import.meta.glob` (Vite/Vitest-native, eager + `?raw`) reads the module's own file contents as
 * plain strings without a Node `fs` dependency -- this package's tsconfig deliberately has no
 * Node types, since its `src` is browser-only code.
 */
const moduleFiles = {
  ...import.meta.glob(['../app/*[Cc]hecklist*.tsx', '../app/*[Cc]hecklist*.ts'], { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob(['../features/admin-checklists/*.tsx', '../features/admin-checklists/*.ts'], { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob(['../features/admin-checklist-sessions/*.tsx', '../features/admin-checklist-sessions/*.ts'], { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

/** Every literal `t('...')`/`t("...")` first-argument key referenced anywhere in `source`. A
 *  templated key (backtick with `${`) never matches this pattern and is silently skipped. */
function extractTranslationKeys(source: string): string[] {
  const keys: string[] = [];
  const pattern = /\bt\(\s*['"]([\w.]+)['"]/g;
  for (const match of source.matchAll(pattern)) keys.push(match[1]!);
  return keys;
}

function hasPath(locale: unknown, key: string): boolean {
  let cursor: unknown = locale;
  for (const segment of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(segment in cursor)) return false;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return true;
}

// i18next's `t(key, ..., { count })` never stores `key` itself for a pluralized entry -- only its
// CLDR-suffixed variants (`key_one`, `key_few`, ...). A bare `hasPath(locale, key)` would always
// report those as "missing", so also accept the entry if any plural suffix of it exists.
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];
function hasKey(locale: unknown, key: string): boolean {
  return hasPath(locale, key) || PLURAL_SUFFIXES.some((suffix) => hasPath(locale, key + suffix));
}

describe('checklist module i18n key coverage (UI refresh PR 316)', () => {
  it('has a ru translation entry for every literal t(...) key referenced in the module', () => {
    const paths = Object.keys(moduleFiles).filter((path) => !/\.spec\.tsx?$/.test(path));
    expect(paths.length).toBeGreaterThan(10); // sanity check the glob actually found the module

    const missing: string[] = [];
    for (const path of paths) {
      const source = moduleFiles[path]!;
      for (const key of extractTranslationKeys(source)) {
        if (!hasKey(ru, key)) missing.push(`${key} (${path.split('/').pop()})`);
      }
    }

    expect(missing).toEqual([]);
  });
});
