/**
 * Fetch Bitcoin v0.1.0 source code
 *
 * Copies the committed Nakamoto Institute archive of bitcoin-0.1.0 (January 3,
 * 2009) into src/bitcoin-0.01/ and verifies it against src/source-manifest.json.
 *
 * Earlier versions downloaded github.com/trottier/original-bitcoin — but that
 * repo's master branch is v0.1.3, not v0.1.0 (net.cpp alone differs by ~140
 * lines), so annotations anchored to v0.1.0 line numbers drifted in CI and on
 * Netlify. The committed archive is the canonical source; no network needed.
 *
 * An existing tree that already verifies is left untouched (src/bitcoin-0.01/
 * may be a local git clone — its .git is never removed).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SOURCE_TREE_DIR, verifyTree, loadManifest } from './source-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const ARCHIVE_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.1.0 January 3, 2009 Alpha Nakamoto Institute');
const OUTPUT_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.01');

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (name === '.DS_Store') continue;
    const src = join(from, name);
    const dest = join(to, name);
    if (statSync(src).isDirectory()) copyTree(src, dest);
    else copyFileSync(src, dest);
  }
}

function main() {
  console.log('🪙  Bitcoin v0.1.0 Source Fetcher\n');

  if (existsSync(SOURCE_TREE_DIR) && verifyTree(SOURCE_TREE_DIR).length === 0) {
    console.log(`✅ src/bitcoin-0.01/src already verified (tree ${loadManifest().treeHash})`);
    return;
  }

  if (!existsSync(ARCHIVE_DIR)) {
    console.error(`❌ Missing committed archive: ${ARCHIVE_DIR}`);
    process.exit(1);
  }

  const archiveProblems = verifyTree(join(ARCHIVE_DIR, 'src'));
  if (archiveProblems.length) {
    console.error('❌ Committed archive does not match src/source-manifest.json:');
    for (const p of archiveProblems) console.error(`    - ${p}`);
    process.exit(1);
  }

  if (existsSync(SOURCE_TREE_DIR)) {
    console.log('📁 Replacing src/bitcoin-0.01/src (did not match the manifest)...');
    rmSync(SOURCE_TREE_DIR, { recursive: true });
  }

  console.log('📦 Copying bitcoin-0.1.0 source from the committed archive...');
  copyTree(join(ARCHIVE_DIR, 'src'), SOURCE_TREE_DIR);
  for (const name of ['license.txt', 'readme.txt']) {
    copyFileSync(join(ARCHIVE_DIR, name), join(OUTPUT_DIR, name));
  }

  const problems = verifyTree(SOURCE_TREE_DIR);
  if (problems.length) {
    console.error('❌ Copied tree failed verification:');
    for (const p of problems) console.error(`    - ${p}`);
    process.exit(1);
  }
  console.log(`\n🎉 Bitcoin v0.1.0 source ready in src/bitcoin-0.01/ (tree ${loadManifest().treeHash})`);
}

main();
