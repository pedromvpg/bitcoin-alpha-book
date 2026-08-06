/**
 * Fetch Bitcoin Core source trees for every version referenced by the book's
 * "What Came After" chapter. Downloads GitHub tag archives and extracts them
 * to src/versions/<tag>/ (gitignored reference material — not shipped).
 *
 * Idempotent: versions already extracted are skipped, so reruns resume.
 *
 * Usage:
 *   node scripts/fetch-versions.js            # all missing versions
 *   node scripts/fetch-versions.js v0.8.0     # a single version
 */

import { createWriteStream, existsSync, mkdirSync, rmSync, readdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import https from 'https';
import AdmZip from 'adm-zip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const OUT_DIR = join(ROOT_DIR, 'src', 'versions');
const TMP_DIR = join(ROOT_DIR, 'src', 'versions', '.tmp');

/** Versions named in the book's version-history tables (v0.1.0 lives in src/bitcoin-0.01). */
const VERSIONS = [
  'v0.1.5',
  'v0.2.0',
  'v0.3.0', 'v0.3.1', 'v0.3.9', 'v0.3.10', 'v0.3.14', 'v0.3.21',
  'v0.4.0', 'v0.5.0', 'v0.6.0', 'v0.7.0', 'v0.8.0', 'v0.8.1',
  'v0.9.0', 'v0.10.0', 'v0.11.0', 'v0.12.0', 'v0.13.0', 'v0.14.0',
  'v0.15.0', 'v0.16.0', 'v0.17.0', 'v0.18.0', 'v0.19.0',
  'v0.20.0', 'v0.21.0',
  'v22.0', 'v23.0', 'v24.0', 'v25.0', 'v26.0', 'v27.0', 'v28.0', 'v29.0', 'v30.0',
];

/**
 * Versions with no tag in the GitHub mirror. v0.3.9 shipped on 2010-08-15 but
 * was superseded by v0.3.10 within hours (the block-74638 overflow patch) and
 * was never tagged in the SVN->Git import, so no archive exists to download.
 */
const KNOWN_UNTAGGED = new Map([
  ['v0.3.9', 'never tagged in the git import (superseded same-day by v0.3.10)'],
]);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, redirectsLeft = 5) => {
      https
        .get(u, { headers: { 'User-Agent': 'bitcoin-alpha-book' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
            res.resume();
            return get(res.headers.location, redirectsLeft - 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          }
          const file = createWriteStream(dest);
          pipeline(res, file).then(resolve, reject);
        })
        .on('error', reject);
    };
    get(url);
  });
}

async function fetchVersion(tag) {
  const destDir = join(OUT_DIR, tag);
  if (existsSync(destDir)) {
    console.log(`   ✓ ${tag} already present — skipping`);
    return 'skipped';
  }
  const zipPath = join(TMP_DIR, `${tag}.zip`);
  const url = `https://github.com/bitcoin/bitcoin/archive/refs/tags/${tag}.zip`;
  console.log(`   ⬇ ${tag} — ${url}`);
  await download(url, zipPath);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(TMP_DIR, true);
  // Archives extract to a single bitcoin-<version>/ directory whose exact name
  // varies with the tag format (e.g. bitcoin-28.0 for tag v28.0) — accept
  // whatever single directory the archive produced.
  rmSync(zipPath, { force: true });
  const dirs = readdirSync(TMP_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (dirs.length !== 1) throw new Error(`unexpected archive layout for ${tag} (${dirs.map((d) => d.name).join(', ') || 'none'})`);
  renameSync(join(TMP_DIR, dirs[0].name), destDir);
  const files = readdirSync(destDir).length;
  console.log(`   ✓ ${tag} extracted (${files} top-level entries)`);
  return 'fetched';
}

async function main() {
  const only = process.argv[2];
  const wanted = only ? VERSIONS.filter((v) => v === only) : VERSIONS;
  if (only && wanted.length === 0) {
    console.error(`Unknown version "${only}". Known: ${VERSIONS.join(', ')}`);
    process.exit(1);
  }
  mkdirSync(TMP_DIR, { recursive: true });

  let fetched = 0, skipped = 0, failed = 0;
  for (const tag of wanted) {
    if (KNOWN_UNTAGGED.has(tag)) {
      console.log(`   – ${tag} skipped: ${KNOWN_UNTAGGED.get(tag)}`);
      skipped++;
      continue;
    }
    try {
      const result = await fetchVersion(tag);
      if (result === 'fetched') fetched++;
      else skipped++;
    } catch (err) {
      failed++;
      console.error(`   ✗ ${tag} FAILED: ${err.message}`);
    }
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
  console.log(`\nDone: ${fetched} fetched, ${skipped} already present, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
