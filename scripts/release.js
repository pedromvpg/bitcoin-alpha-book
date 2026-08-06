/**
 * Full Release Builder for Bitcoin Alpha Book
 *
 * Runs the complete pipeline in order:
 *   1. build             — compile HTML
 *   2. pdf               — render book PDF (also writes book-meta.json for spine width)
 *   3. donation          — donation QR (silent payment overrides xpub; env/.env config)
 *   4. cover             — generate cover HTML
 *   5. cover:pdf         — render cover PDF
 *   6. thumbnails        — raw grid PNG/HTML + contact-sheet PNG/HTML
 *
 * Then copies all deliverables into:
 *   releases/YYYY-MM-DD_HH-MM-SS/
 *
 * Refuses to ship any deliverable whose mtime predates this release run
 * (guards against copying stale PDFs/PNGs when a step silently skipped).
 *
 * Usage:
 *   node scripts/release.js
 *   npm run release
 */

import { execSync } from 'child_process';
import { mkdirSync, copyFileSync, existsSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT_DIR   = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

const DELIVERABLES = [
  { src: 'bitcoin-alpha-book.pdf', label: 'book PDF' },
  { src: 'cover.pdf',              label: 'cover PDF' },
  { src: 'thumbnails.png',         label: 'raw thumbnails PNG' },
  { src: 'thumbnails.html',        label: 'raw thumbnails HTML' },
  { src: 'contact-sheet.png',      label: 'contact sheet PNG' },
  { src: 'contact-sheet.html',     label: 'contact sheet HTML' },
  { src: 'book-meta.json',         label: 'book metadata' },
  { src: 'donation-cover.json',    label: 'donation cover payload' },
];

function run(label, npmScript) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶  ${label}`);
  console.log(`${'─'.repeat(60)}`);

  // Drop Cursor sandbox puppeteer cache override so Chrome resolution works.
  const env = { ...process.env };
  if (env.PUPPETEER_CACHE_DIR?.includes('cursor-sandbox-cache')) {
    delete env.PUPPETEER_CACHE_DIR;
  }

  execSync(`npm run ${npmScript}`, { cwd: ROOT_DIR, stdio: 'inherit', env });
}

function datestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${date}_${time}`;
}

function clearDeliverables() {
  console.log(`\n${'─'.repeat(60)}`);
  console.log('▶  Clearing prior deliverables (force fresh outputs)');
  console.log(`${'─'.repeat(60)}`);
  for (const { src, label } of DELIVERABLES) {
    const path = join(OUTPUT_DIR, src);
    if (existsSync(path)) {
      unlinkSync(path);
      console.log(`   ✓ removed stale ${label} (${src})`);
    }
  }
}

function assertFresh(startedAtMs) {
  const stale = [];
  for (const { src, label } of DELIVERABLES) {
    const path = join(OUTPUT_DIR, src);
    if (!existsSync(path)) {
      stale.push(`${src} (${label}) — missing`);
      continue;
    }
    const mtime = statSync(path).mtimeMs;
    if (mtime < startedAtMs) {
      const ageSec = ((startedAtMs - mtime) / 1000).toFixed(0);
      stale.push(`${src} (${label}) — mtime ${ageSec}s before release start`);
    }
  }
  if (stale.length) {
    throw new Error(
      `Stale or missing deliverables — refusing to ship:\n  - ${stale.join('\n  - ')}`,
    );
  }
}

async function release() {
  console.log('📦  Bitcoin Alpha Book — Full Release Build\n');
  const startedAtMs = Date.now();

  clearDeliverables();

  // ── Pipeline ──────────────────────────────────────────────────────────────
  run('Step 1/6 — Build HTML', 'build');
  run('Step 2/6 — Generate book PDF', 'pdf');
  run('Step 3/6 — Donation QR (silent payment overrides xpub)', 'donation');
  run('Step 4/6 — Build cover HTML', 'cover');
  run('Step 5/6 — Generate cover PDF', 'cover:pdf');
  run('Step 6/6 — Generate thumbnails + contact sheet', 'thumbnails');

  console.log(`\n${'─'.repeat(60)}`);
  console.log('▶  Verifying all deliverables are fresh');
  console.log(`${'─'.repeat(60)}`);
  assertFresh(startedAtMs);
  console.log('   ✓ All deliverables newer than release start');

  // ── Collect deliverables ──────────────────────────────────────────────────
  const stamp = datestamp();
  const releaseDir = join(ROOT_DIR, 'releases', stamp);
  mkdirSync(releaseDir, { recursive: true });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶  Copying deliverables → releases/${stamp}/`);
  console.log(`${'─'.repeat(60)}`);

  let copied = 0;
  for (const { src, label } of DELIVERABLES) {
    const srcPath = join(OUTPUT_DIR, src);
    copyFileSync(srcPath, join(releaseDir, src));
    console.log(`   ✓ ${label} (${src})`);
    copied++;
  }

  console.log(`\n✨ Release complete — ${copied}/${DELIVERABLES.length} files`);
  console.log(`   Folder: releases/${stamp}/\n`);
}

release().catch(err => {
  console.error('\n✗ Release failed:', err.message);
  process.exit(1);
});
