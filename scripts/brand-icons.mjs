// Writes Womanie's icons from the brand mark (src/components/brand/Logo.tsx):
//   public/favicon.svg, public/favicon-32x32.png, public/apple-touch-icon.png,
//   public/pwa-192x192.png, public/pwa-512x512.png (also the maskable icon).
// Usage: node scripts/brand-icons.mjs   (uses the Playwright already in node_modules)
//
// LOOP_PATH / DOT must match Logo.tsx; src/components/brand/Logo.test.tsx
// checks that public/favicon.svg carries the same path.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const LOOP_PATH =
  'M12.4 6.9C18.6 4.5 26.1 8.4 26.4 15.3C26.7 22.1 21.5 26.7 15.5 26.4C9.3 26.1 5.5 21.1 5.8 15.5C6.1 10.2 9.8 6.5 15.4 6.1';
const DOT = { cx: 23.6, cy: 22.6 };
const INK = '#1A1A19';
const RASPBERRY = '#C2286A'; // hsl(336 66% 46%) = --primary
const PORCELAIN = '#F7ECE9'; // --background / manifest theme colour

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// scale: how much of the 32-unit canvas the mark fills (1 = as drawn).
// rx: tile corner radius (0 = full bleed, the platform masks it).
function svg({ scale = 1, rx = 0, sw = 2.4, dotR = 3.2 } = {}) {
  const t = (32 - 32 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rx}" fill="${PORCELAIN}"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    <path d="${LOOP_PATH}" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${DOT.cx}" cy="${DOT.cy}" r="${dotR}" fill="${RASPBERRY}" stroke="${PORCELAIN}" stroke-width="${sw * 0.7}"/>
  </g>
</svg>
`;
}

// Browser tab: a porcelain tile so the ink loop stays visible on dark tab bars;
// a heavier line because it is mostly seen at 16 px.
const favicon = svg({ scale: 1.08, rx: 7, sw: 2.9, dotR: 3.5 });
writeFileSync(join(pub, 'favicon.svg'), favicon);

const pngs = [
  { file: 'favicon-32x32.png', px: 32, markup: favicon },
  // iOS rounds the corners itself: full-bleed square.
  { file: 'apple-touch-icon.png', px: 180, markup: svg({ scale: 0.72, sw: 2.1, dotR: 3.1 }) },
  { file: 'pwa-192x192.png', px: 192, markup: svg({ scale: 0.64, sw: 2.2, dotR: 3.2 }) },
  // Also the maskable icon: the loop stays inside the central 80 % safe zone.
  { file: 'pwa-512x512.png', px: 512, markup: svg({ scale: 0.64, sw: 2, dotR: 3.1 }) },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { file, px, markup } of pngs) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<html><body style="margin:0">${markup.replace('<svg ', `<svg width="${px}" height="${px}" `)}</body></html>`,
  );
  await page.locator('svg').screenshot({ path: join(pub, file), omitBackground: true });
  console.log('wrote', file);
}
await browser.close();
