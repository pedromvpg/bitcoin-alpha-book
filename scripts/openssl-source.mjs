/**
 * OpenSSL 0.9.8h excerpts — the handful of OpenSSL source files the appendix
 * ("OpenSSL as Bitcoin Used It") quotes, committed verbatim under
 * src/openssl-0.9.8h/ and pinned in src/openssl-manifest.json.
 *
 * v0.1.0 links OpenSSL 0.9.8h (src/readme.txt) but ships only the compiled
 * libeay32.dll, so the excerpts come from the official release tarball. The
 * manifest records the tarball's published SHA-1, its SHA-256, and the SHA-256
 * of every committed file, so line anchors in src/appendix/openssl.yaml are
 * meaningful against exactly the code that was compiled into that DLL.
 *
 *   node scripts/openssl-source.mjs                    verify committed files
 *   node scripts/openssl-source.mjs --tarball <path>   also check them against a
 *                                                      downloaded tarball
 *   node scripts/openssl-source.mjs --write            regenerate the file hashes
 *
 * Also exports scanOpenSSLUsage(): every OpenSSL identifier the v0.1.0 tree
 * uses, with the first line it appears on in each file (the appendix table).
 */

import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { SOURCE_TREE_DIR } from './source-manifest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
export const OPENSSL_DIR = join(ROOT_DIR, 'src', 'openssl-0.9.8h');
export const OPENSSL_MANIFEST_PATH = join(ROOT_DIR, 'src', 'openssl-manifest.json');

const sha = (alg, buf) => createHash(alg).update(buf).digest('hex');

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out.sort();
}

export function loadOpenSSLManifest() {
  if (!existsSync(OPENSSL_MANIFEST_PATH)) return null;
  return JSON.parse(readFileSync(OPENSSL_MANIFEST_PATH, 'utf8'));
}

/** Lines of a committed OpenSSL file (1-based access via [n - 1]). */
export function readOpenSSLLines(path) {
  return readFileSync(join(OPENSSL_DIR, path), 'latin1').split('\n');
}

/** Committed files vs manifest. Returns a list of problems (empty = verified). */
export function verifyOpenSSL() {
  const manifest = loadOpenSSLManifest();
  if (!manifest) return [`missing ${relative(ROOT_DIR, OPENSSL_MANIFEST_PATH)}`];
  if (!existsSync(OPENSSL_DIR)) return [`missing ${relative(ROOT_DIR, OPENSSL_DIR)}`];
  const problems = [];
  const actual = listFiles(OPENSSL_DIR);
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (!actual.includes(path)) problems.push(`missing file: ${path}`);
    else if (sha('sha256', readFileSync(join(OPENSSL_DIR, path))) !== hash) problems.push(`hash mismatch: ${path}`);
  }
  for (const path of actual) {
    if (!(path in manifest.files)) problems.push(`unexpected file: ${path}`);
  }
  return problems;
}

/** Check the tarball's hashes, then that every committed file is byte-identical to its copy inside. */
function verifyAgainstTarball(tarball) {
  const manifest = loadOpenSSLManifest();
  const buf = readFileSync(tarball);
  const problems = [];
  if (sha('sha1', buf) !== manifest.tarball.sha1) problems.push('tarball SHA-1 does not match the published value');
  if (sha('sha256', buf) !== manifest.tarball.sha256) problems.push('tarball SHA-256 does not match the manifest');
  const tmp = mkdtempSync(join(tmpdir(), 'openssl-0.9.8h-'));
  try {
    execFileSync('tar', ['xzf', tarball, '-C', tmp]);
    const root = join(tmp, manifest.tarball.root);
    for (const path of Object.keys(manifest.files)) {
      const inTar = join(root, path);
      if (!existsSync(inTar)) problems.push(`not in tarball: ${path}`);
      else if (!readFileSync(inTar).equals(readFileSync(join(OPENSSL_DIR, path)))) problems.push(`differs from tarball: ${path}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// OpenSSL usage in the v0.1.0 tree
// ---------------------------------------------------------------------------

// Prefixed API names plus the few un-prefixed ones v0.1.0 calls. sha.cpp is
// Crypto++ (Wei Dai), not OpenSSL, and is skipped; Script opcode names
// (OP_SHA256, OP_RIPEMD160) never match because of the \b before the name.
const OPENSSL_IDENT_RE =
  /\b(?:(?:BN|EC_KEY|ECDSA|SHA256|RAND|CRYPTO|OPENSSL)_[A-Za-z0-9_]+|[ido]2[ido]_EC[A-Za-z]+|NID_secp256k1|BIGNUM|BN_CTX|EC_KEY|SHA256_CTX|(?:SHA256|RIPEMD160)(?=\s*\())/g;
const SKIP_FILES = new Set(['sha.cpp', 'sha.h']);

/** Strip // and block comments (column positions don't matter here). */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

/**
 * Map<identifier, Map<file, firstLine>> over v0.1.0's .cpp/.h files.
 * #include lines are ignored (headers.h only pulls the headers in).
 */
export function scanOpenSSLUsage(dir = SOURCE_TREE_DIR) {
  const usage = new Map();
  const files = readdirSync(dir).filter((f) => /\.(cpp|h)$/.test(f) && !SKIP_FILES.has(f)).sort();
  for (const file of files) {
    const lines = stripComments(readFileSync(join(dir, file), 'latin1')).split('\n');
    lines.forEach((line, i) => {
      if (/^\s*#\s*include/.test(line)) return;
      for (const m of line.matchAll(OPENSSL_IDENT_RE)) {
        if (!usage.has(m[0])) usage.set(m[0], new Map());
        const byFile = usage.get(m[0]);
        if (!byFile.has(file)) byFile.set(file, i + 1);
      }
    });
  }
  return usage;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--write')) {
    const prev = loadOpenSSLManifest() || {};
    const files = Object.fromEntries(
      listFiles(OPENSSL_DIR).map((p) => [p, sha('sha256', readFileSync(join(OPENSSL_DIR, p)))]),
    );
    const manifest = { ...prev, algorithm: 'sha256', fileCount: Object.keys(files).length, files };
    writeFileSync(OPENSSL_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Wrote ${relative(ROOT_DIR, OPENSSL_MANIFEST_PATH)} (${manifest.fileCount} files)`);
    return;
  }

  const problems = verifyOpenSSL();
  const tIdx = args.indexOf('--tarball');
  if (!problems.length && tIdx >= 0) problems.push(...verifyAgainstTarball(args[tIdx + 1]));
  if (problems.length) {
    console.error('✗ OpenSSL excerpts do not verify:');
    for (const p of problems) console.error(`    - ${p}`);
    process.exit(1);
  }
  const m = loadOpenSSLManifest();
  console.log(`✓ OpenSSL ${m.version} excerpts verified (${m.fileCount} files${tIdx >= 0 ? ', matched against the release tarball' : ''})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
