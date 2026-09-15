/**
 * Regenerates every raster favicon from `public/favicon.svg`.
 *
 * ---------------------------------------------------------------------------
 * Why this script exists
 * ---------------------------------------------------------------------------
 * The SVG is the master and the only file anyone edits. The five PNGs and the
 * ICO beside it are derivatives that no build step touches, which is exactly
 * how the original indigo-to-violet gradient survived four rounds of palette
 * changes: a favicon is the one asset nobody looks at while working on the
 * page it belongs to.
 *
 * Run it whenever `favicon.svg` changes, then bump the `?v=` query in
 * `src/layouts/Layout.astro`. Favicons are cached far past a hard reload, so
 * without that bump a returning visitor keeps the old icon for days.
 *
 * ---------------------------------------------------------------------------
 * Running it
 * ---------------------------------------------------------------------------
 *     npm run favicons
 *
 * `sharp` and `png-to-ico` are devDependencies. Fetching them on demand with
 * `npx --package=` was tried first and does not work: npx puts a package on
 * the PATH for its binaries, not on the ESM resolver's search path, so a plain
 * `import` from a script it launches still fails. Declaring them is the
 * reproducible option, and they are dev-only — nothing ships to the browser.
 *
 * ---------------------------------------------------------------------------
 * Density, not just resize
 * ---------------------------------------------------------------------------
 * `density` is set per output size. sharp rasterises an SVG at a DPI and then
 * scales the bitmap, so a 512px icon rendered at the default 72 DPI and scaled
 * up is a blurred 96px image. Deriving the density from the target keeps every
 * size rendered at its own resolution instead.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public', 'favicon.svg');

/** The PNGs, and the `<link>` or manifest entry each one answers. */
const PNG_TARGETS = [
  { file: 'favicon-16x16.png', size: 16 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

/**
 * Sizes packed into favicon.ico.
 *
 * Three, because a .ico is a container and Windows picks from it by context:
 * 16 for the tab, 32 for the taskbar, 48 for a desktop shortcut. Shipping only
 * 16 leaves the larger contexts to upscale it.
 */
const ICO_SIZES = [16, 32, 48];

/** The SVG's own viewBox is 64 units square; density scales from that. */
const SVG_UNITS = 64;

async function rasterise(svg, size) {
  return sharp(svg, { density: Math.ceil((size / SVG_UNITS) * 72) })
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const svg = await readFile(source);

for (const { file, size } of PNG_TARGETS) {
  const output = path.join(root, 'public', file);
  await writeFile(output, await rasterise(svg, size));
  console.log(`${file.padEnd(24)} ${size}x${size}`);
}

const icoBuffers = await Promise.all(ICO_SIZES.map((size) => rasterise(svg, size)));
await writeFile(path.join(root, 'public', 'favicon.ico'), await pngToIco(icoBuffers));
console.log(`${'favicon.ico'.padEnd(24)} ${ICO_SIZES.join(', ')}`);

console.log('\nListo. Sube el ?v= en src/layouts/Layout.astro para romper la caché.');
