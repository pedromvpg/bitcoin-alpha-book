/**
 * Full Release Builder for Bitcoin Alpha Book
 *
 * Runs the complete pipeline in order:
 *   1. build             — compile HTML
 *   2. pdf               — render book PDF (also writes book-meta.json for spine width)
 *   3. donation:derive   — new bc1 address from BITCOIN_DONATION_XPUB (optional env)
 *   4. cover             — generate cover HTML
 *   5. cover:pdf         — render cover PDF
 *   6. thumbnails        — raw grid PNG/HTML + contact-sheet PNG/HTML
 *
 * Then copies all deliverables into:
 *   releases/YYYY-MM-DD_HH-MM-SS/
 *
 * Usage:
 *   node scripts/release.js
 *   npm run release
 */

import { execSync } from 'child_process';
import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT_DIR   = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

function run(label, npmScript) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶  ${label}`);
  console.log(`${'─'.repeat(60)}`);
  execSync(`npm run ${npmScript}`, { cwd: ROOT_DIR, stdio: 'inherit' });
}

function datestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${date}_${time}`;
}

async function release() {
  console.log('📦  Bitcoin Alpha Book — Full Release Build\n');

  // ── Pipeline ──────────────────────────────────────────────────────────────
  run('Step 1/6 — Build HTML', 'build');
  run('Step 2/6 — Generate book PDF', 'pdf');
  run('Step 3/6 — Donation address + QR (BITCOIN_DONATION_XPUB)', 'donation:derive');
  run('Step 4/6 — Build cover HTML', 'cover');
  run('Step 5/6 — Generate cover PDF', 'cover:pdf');
  run('Step 6/6 — Generate thumbnails + contact sheet', 'thumbnails');

  // ── Collect deliverables ──────────────────────────────────────────────────
  const deliverables = [
    { src: 'bitcoin-alpha-book.pdf',       label: 'book PDF' },
    { src: 'cover.pdf',                    label: 'cover PDF' },
    { src: 'thumbnails.png',               label: 'raw thumbnails PNG' },
    { src: 'thumbnails.html',              label: 'raw thumbnails HTML' },
    { src: 'contact-sheet.png',            label: 'contact sheet PNG' },
    { src: 'contact-sheet.html',           label: 'contact sheet HTML' },
    { src: 'book-meta.json',               label: 'book metadata' },
    { src: 'donation-cover.json',          label: 'donation cover payload' },
  ];

  const stamp = datestamp();
  const releaseDir = join(ROOT_DIR, 'releases', stamp);
  mkdirSync(releaseDir, { recursive: true });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶  Copying deliverables → releases/${stamp}/`);
  console.log(`${'─'.repeat(60)}`);

  let copied = 0;
  for (const { src, label } of deliverables) {
    const srcPath = join(OUTPUT_DIR, src);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, join(releaseDir, src));
      console.log(`   ✓ ${label} (${src})`);
      copied++;
    } else {
      console.log(`   ⚠ missing: ${src} (${label})`);
    }
  }

  console.log(`\n✨ Release complete — ${copied}/${deliverables.length} files`);
  console.log(`   Folder: releases/${stamp}/\n`);
}

release().catch(err => {
  console.error('\n✗ Release failed:', err.message);
  process.exit(1);
});
