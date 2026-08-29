import { readdir, stat } from 'node:fs/promises';

const assetDirectory = new URL('../dist/assets/', import.meta.url);
// Bumped 80 KiB -> 84 KiB for PR 270 (Department Tree UI): the prior budget had only ~19 B of
// headroom left on main, not enough for any new page's CSS. The department tree/detail layout
// added here was kept lean (reusing existing admin-card/Badge/admin-form__hint/admin-membership-list
// rules instead of introducing parallel ones) before resorting to this bump.
const maximumCssBytes = 84 * 1024;

const cssAssets = (await readdir(assetDirectory)).filter((file) => file.endsWith('.css'));

if (cssAssets.length === 0) {
  throw new Error('No generated CSS asset was found in dist/assets.');
}

const sizes = await Promise.all(
  cssAssets.map(async (file) => ({
    file,
    bytes: (await stat(new URL(file, assetDirectory))).size,
  })),
);
const totalBytes = sizes.reduce((total, asset) => total + asset.bytes, 0);

console.log(
  `CSS bundle: ${sizes.map(({ file, bytes }) => `${file} (${bytes} B)`).join(', ')}; total ${totalBytes} B`,
);

if (totalBytes > maximumCssBytes) {
  throw new Error(`CSS bundle exceeds the ${maximumCssBytes} B budget by ${totalBytes - maximumCssBytes} B.`);
}
