import { readFile, readdir } from 'node:fs/promises';

const stylesDirectory = new URL('../src/styles/', import.meta.url);
const entryPath = new URL('index.css', stylesDirectory);
const tokensPath = new URL('tokens.css', stylesDirectory);
const files = (await readdir(stylesDirectory)).filter((file) => file.endsWith('.css'));
const entry = await readFile(entryPath, 'utf8');

const layerOrder = '@layer tokens, base, layout, components, features, utilities, overrides;';
if (!entry.includes(layerOrder)) {
  throw new Error('The canonical cascade layer order is missing from styles/index.css.');
}

for (const file of files.filter((file) => file !== 'index.css')) {
  const importPattern = new RegExp(
    `@import\\s+url\\(['\"]\\./${file.replace('.', '\\.')}['\"]\\)\\s+layer\\([a-z-]+\\);`,
    'g',
  );
  if ((entry.match(importPattern) ?? []).length !== 1) {
    throw new Error(`${file} must be imported exactly once into a named cascade layer.`);
  }
}

const customPropertyDefinitions = new Map();
for (const file of files) {
  const contents = await readFile(new URL(file, stylesDirectory), 'utf8');
  for (const match of contents.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)) {
    const previousFile = customPropertyDefinitions.get(match[1]);
    if (previousFile) {
      throw new Error(`${match[1]} is defined in both ${previousFile} and ${file}.`);
    }
    customPropertyDefinitions.set(match[1], file);
  }
}

for (const [token, file] of customPropertyDefinitions) {
  if (file !== 'tokens.css') {
    throw new Error(`${token} is defined in ${file}; design tokens belong in tokens.css.`);
  }
}

const tokens = await readFile(tokensPath, 'utf8');
if (customPropertyDefinitions.size === 0 || !tokens.includes(':root')) {
  throw new Error('tokens.css must define the application design tokens on :root.');
}

// PR 443: `input { width: 100% }` is for text fields; a box or a radio must never stretch over its row (it pushed the caption away).
const globalCss = await readFile(new URL('global.css', stylesDirectory), 'utf8');
const textFieldWidth = globalCss.search(/input,\s*select,\s*textarea\s*\{\s*width:\s*100%/);
const ownWidth = globalCss.search(/input\[type='checkbox'\],\s*input\[type='radio'\]\s*\{\s*width:\s*auto;\s*flex:\s*none;/);
if (textFieldWidth < 0 || ownWidth < textFieldWidth) {
  throw new Error("global.css must keep input[type='checkbox'], input[type='radio'] at width: auto right after the text-field width rule.");
}

// PR 444: the rows of a drop-down list state their own text and fill colours.
if (!/select option\s*\{[^}]*color:\s*var\(--color-text\);[^}]*background-color:\s*var\(--color-surface\)/.test(globalCss)) {
  throw new Error('global.css must give `select option` its own text colour and fill.');
}
if (!/select option\s*\{[^}]*font:[^;]*system-ui/.test(globalCss)) {
  throw new Error('global.css must give `select option` a system font (the web font drew empty rows in the Windows popup).');
}

// PR 452: `overflow-x: hidden` on both `html` and `body` made the body a scroll container and broke every `position: sticky`
// (the learner sidebar scrolled away). `body` clips with `overflow-x: clip` (after a `hidden` fallback) and never sets overflow-y.
const bodyRule = /(?:^|\n)body\s*\{([^}]*)\}/.exec(globalCss)?.[1] ?? '';
if (/overflow-y\s*:/.test(bodyRule) || (/overflow-x\s*:\s*hidden/.test(bodyRule) && !/overflow-x\s*:\s*clip/.test(bodyRule))) {
  throw new Error('global.css: `body` may only clip with `overflow-x: clip` (a bare `overflow-x: hidden` breaks position: sticky).');
}

console.log(`CSS architecture: ${files.length} layered stylesheets, ${customPropertyDefinitions.size} unique tokens.`);
