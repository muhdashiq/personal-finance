#!/usr/bin/env node
/**
 * Renders the app icon set from apps/mobile/assets/brand/mark.svg.
 * Requires Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
 *
 *   node scripts/render-icons.mjs
 *
 * Outputs (apps/mobile/assets):
 *   icon.png                     1024² iOS / default icon (opaque, no rounding — the OS masks it)
 *   android-icon-foreground.png  1024² adaptive foreground, mark inside the 66 % safe zone
 *   android-icon-background.png  1024² adaptive background
 *   android-icon-monochrome.png  1024² themed-icon silhouette (Android 13+)
 *   splash-icon.png              1024² rounded tile on transparent (works on light and dark splash)
 *   favicon.png                  48² web favicon
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'mobile', 'assets');
const mark = readFileSync(join(assets, 'brand', 'mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

const INDIGO_TOP = '#333E8C';
const INDIGO_BOTTOM = '#1E2558';
const background = `
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${INDIGO_TOP}"/><stop offset="1" stop-color="${INDIGO_BOTTOM}"/>
  </linearGradient></defs>`;
const colorStyle = `<style>#mark{color:#FFFFFF}.bar1{fill:#8FA8F8}.bar2{fill:#B9C6FF}.bar3{fill:#4CC38A}</style>`;
const whiteStyle = `<style>#mark{color:#FFFFFF}.bar1,.bar2,.bar3{fill:#FFFFFF}</style>`;

// Centre of the mark's bounding box is (512, 522); scale around it.
const scaled = (s) => `<g transform="translate(512 512) scale(${s}) translate(-512 -522)">${mark}</g>`;
const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${body}</svg>`;

const variants = {
  'icon.png': { size: 1024, body: `${background}${colorStyle}<rect width="1024" height="1024" fill="url(#bg)"/>${scaled(0.92)}` },
  'android-icon-background.png': { size: 1024, body: `${background}<rect width="1024" height="1024" fill="url(#bg)"/>` },
  'android-icon-foreground.png': { size: 1024, body: `${colorStyle}${scaled(0.68)}` },
  'android-icon-monochrome.png': { size: 1024, body: `${whiteStyle}${scaled(0.68)}` },
  'splash-icon.png': { size: 1024, body: `${background}${colorStyle}<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>${scaled(0.92)}` },
  'favicon.png': { size: 48, body: `${background}${colorStyle}<rect width="1024" height="1024" rx="220" fill="url(#bg)"/>${scaled(1.12)}` },
};

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, { size, body }] of Object.entries(variants)) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, body)}</body></html>`);
  await page.locator('svg').screenshot({ path: join(assets, file), omitBackground: true });
  console.log(`wrote ${file} (${size}×${size})`);
}
await browser.close();
