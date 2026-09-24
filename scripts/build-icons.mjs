// Renders the CADDAIE app icon SVG into the PNG sizes iOS/Android/PWA need.
// Uses the Playwright Chromium already required for e2e tests — no image deps.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

// Maskable: keep the artwork inside the central 80% safe zone.
const maskable = svg
  .replace('<rect width="512" height="512" fill="url(#bg)"/>', '<rect width="512" height="512" fill="url(#bg)"/><g transform="translate(51.2 51.2) scale(0.8)">')
  .replace('</svg>', '</g></svg>');

const targets = [
  { file: 'icon-192.png', size: 192, src: svg },
  { file: 'icon-512.png', size: 512, src: svg },
  { file: 'apple-touch-icon.png', size: 180, src: svg },
  { file: 'maskable-512.png', size: 512, src: maskable },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${t.size}px;height:${t.size}px}</style>${t.src}`);
  writeFileSync(new URL(t.file, out), await page.screenshot({ omitBackground: false }));
}
await browser.close();

// Favicon: rounded version of the same mark.
writeFileSync(new URL('favicon.svg', out), svg.replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="112"'));
console.log('icons written:', targets.map((t) => t.file).join(', '), '+ favicon.svg');
