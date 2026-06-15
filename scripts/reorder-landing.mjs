// One-off: reorder landing sections into results -> process -> offer flow.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'landing/index.html');
let html = readFileSync(file, 'utf8');

const M = {
  HERO: '<!-- ░░ HERO ░░ -->',
  PROBLEM: '<!-- ░░ PROBLEM ░░ -->',
  HOW: '<!-- ░░ HOW ░░ -->',
  CAPABILITIES: '<!-- ░░ CAPABILITIES (bento) ░░ -->',
  CUSTOMIZED: '<!-- ░░ CUSTOMIZED / BUILT-ON ░░ -->',
  SHOWCASE: '<!-- ░░ PRODUCT MOCKUPS ░░ -->',
  WHY: '<!-- ░░ WHY (compare) ░░ -->',
  CALC: '<!-- ░░ ROI CALCULATOR ░░ -->',
  CTA: '<!-- ░░ DEMO / CTA ░░ -->',
  FAQ: '<!-- ░░ FAQ ░░ -->',
};
const DESIRED = ['HERO', 'PROBLEM', 'CALC', 'CAPABILITIES', 'SHOWCASE', 'WHY', 'HOW', 'CUSTOMIZED', 'CTA', 'FAQ'];

const found = Object.entries(M).map(([key, marker]) => {
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error(`marker not found: ${key} (${marker})`);
  return { key, idx };
});
const mainEnd = html.indexOf('</main>');
if (mainEnd === -1) throw new Error('</main> not found');

const sorted = [...found].sort((a, b) => a.idx - b.idx);
const blocks = {};
for (let i = 0; i < sorted.length; i++) {
  const start = sorted[i].idx;
  const end = i + 1 < sorted.length ? sorted[i + 1].idx : mainEnd;
  blocks[sorted[i].key] = html.slice(start, end);
}

if (Object.keys(blocks).length !== DESIRED.length) throw new Error('block count mismatch');

const prefix = html.slice(0, sorted[0].idx);
const suffix = html.slice(mainEnd);
const reordered = prefix + DESIRED.map((k) => blocks[k]).join('') + suffix;

writeFileSync(file, reordered, 'utf8');
console.log('Reordered sections ->', DESIRED.join(' '));
