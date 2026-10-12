/**
 * Source manifest — SHA-256 of every file in the Bitcoin v0.1.0 source tree the
 * book is built from (src/bitcoin-0.01/src/), plus a single tree hash over all
 * of them. The manifest (src/source-manifest.json) is committed, so anyone can
 * check that the code printed in the book is byte-for-byte the January 2009
 * release.
 *
 *   node scripts/source-manifest.mjs           verify src/bitcoin-0.01/src
 *   node scripts/source-manifest.mjs --write   regenerate the manifest
 *   node scripts/source-manifest.mjs --dir X   verify another copy of the tree
 *
 * treeHash = SHA-256 over the sorted lines "<path>\0<sha256>\n".
 */

import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
export const SOURCE_TREE_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.01', 'src');
export const MANIFEST_PATH = join(ROOT_DIR, 'src', 'source-manifest.json');

const IGNORED = new Set(['.DS_Store', 'Thumbs.db']);

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (IGNORED.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Hash every file under `dir`; returns { files: {path: sha256}, treeHash, lineCount }. */
export function hashTree(dir = SOURCE_TREE_DIR) {
  const files = {};
  let lineCount = 0;
  for (const full of listFiles(dir)) {
    const rel = relative(dir, full).split(sep).join('/');
    const buf = readFileSync(full);
    files[rel] = sha256(buf);
    if (/\.(cpp|h)$/i.test(rel)) {
      const text = buf.toString('latin1');
      lineCount += (text.match(/\n/g) || []).length;
    }
  }
  const sorted = Object.keys(files).sort();
  const ordered = Object.fromEntries(sorted.map((k) => [k, files[k]]));
  const treeHash = sha256(sorted.map((k) => `${k}\0${files[k]}\n`).join(''));
  return { files: ordered, treeHash, lineCount };
}

export function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

/**
 * Compare a tree against the committed manifest.
 * Returns a list of human-readable problems (empty = verified).
 */
export function verifyTree(dir = SOURCE_TREE_DIR) {
  const manifest = loadManifest();
  if (!manifest) return [`missing ${relative(ROOT_DIR, MANIFEST_PATH)}`];
  if (!existsSync(dir)) return [`missing source tree ${relative(ROOT_DIR, dir)}`];
  const actual = hashTree(dir);
  const problems = [];
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (!(path in actual.files)) problems.push(`missing file: ${path}`);
    else if (actual.files[path] !== hash) problems.push(`hash mismatch: ${path}`);
  }
  for (const path of Object.keys(actual.files)) {
    if (!(path in manifest.files)) problems.push(`unexpected file: ${path}`);
  }
  if (!problems.length && actual.treeHash !== manifest.treeHash) {
    problems.push('tree hash mismatch');
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const dirIdx = args.indexOf('--dir');
  const dir = dirIdx >= 0 ? join(process.cwd(), args[dirIdx + 1]) : SOURCE_TREE_DIR;

  if (args.includes('--write')) {
    const { files, treeHash, lineCount } = hashTree(dir);
    const prev = loadManifest() || {};
    const manifest = {
      description: prev.description ||
        'SHA-256 of every file in the Bitcoin v0.1.0 (January 2009) source tree printed in this book.',
      origin: prev.origin || '',
      algorithm: 'sha256',
      treeHashRecipe: 'sha256 over sorted lines "<path>\\0<sha256>\\n"',
      fileCount: Object.keys(files).length,
      lineCount,
      treeHash,
      files,
    };
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Wrote ${relative(ROOT_DIR, MANIFEST_PATH)} (${manifest.fileCount} files, tree ${treeHash})`);
    return;
  }

  const problems = verifyTree(dir);
  if (problems.length) {
    console.error(`✗ Source tree does not match ${relative(ROOT_DIR, MANIFEST_PATH)}:`);
    for (const p of problems) console.error(`    - ${p}`);
    process.exit(1);
  }
  console.log(`✓ Source verified: tree ${loadManifest().treeHash}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
