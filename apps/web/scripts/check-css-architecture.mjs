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

console.log(`CSS architecture: ${files.length} layered stylesheets, ${customPropertyDefinitions.size} unique tokens.`);
