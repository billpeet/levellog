// Generates the PWA icon set from the favicon SVG using sharp.
// Run with: bun scripts/generate-pwa-icons.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = resolve(root, 'static');

const PAPER = '#f1ecde';
const INK = '#1f1d18';

// Plain icon: scaled-up surveyor benchmark mark on a paper background.
// Uses the same vocabulary as static/favicon.svg so the install icon
// reads as a sibling of the in-app favicon.
const plainSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
	<rect width="32" height="32" fill="${PAPER}"/>
	<g stroke="${INK}" fill="none">
		<path d="M 4 9 L 16 25 L 28 9 Z" stroke-width="1.6"/>
		<path d="M 1 9 L 31 9" stroke-width="1.2"/>
		<circle cx="16" cy="14" r="3.4" stroke-width="1.1"/>
		<path d="M 16 11 L 16 17 M 13 14 L 19 14" stroke-width="0.9"/>
	</g>
</svg>`;

// Maskable icon: same mark inside the safe zone (centre 80% of canvas)
// so launcher mask shapes (circle, squircle, rounded square) don't clip it.
const maskableSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
	<rect width="100" height="100" fill="${PAPER}"/>
	<g transform="translate(30 30) scale(1.25)" stroke="${INK}" fill="none">
		<path d="M 4 9 L 16 25 L 28 9 Z" stroke-width="1.6"/>
		<path d="M 1 9 L 31 9" stroke-width="1.2"/>
		<circle cx="16" cy="14" r="3.4" stroke-width="1.1"/>
		<path d="M 16 11 L 16 17 M 13 14 L 19 14" stroke-width="0.9"/>
	</g>
</svg>`;

async function render(svg, outName, size) {
	const out = resolve(staticDir, outName);
	await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
	console.log(`wrote ${outName} (${size}×${size})`);
}

await mkdir(staticDir, { recursive: true });
await render(plainSvg(192), 'icon-192.png', 192);
await render(plainSvg(512), 'icon-512.png', 512);
await render(maskableSvg(512), 'icon-maskable-512.png', 512);
await render(plainSvg(180), 'apple-touch-icon.png', 180);

// Sanity: keep the source SVG around for designers / future regen.
await writeFile(resolve(staticDir, 'icon.svg'), plainSvg(512).trim() + '\n');
console.log('wrote icon.svg');
