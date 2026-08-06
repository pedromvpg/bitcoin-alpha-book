/**
 * Annotation validator — fails the build on silent content loss.
 *
 * Checks every src/annotations/*.yaml (except _template.yaml):
 *   - YAML parses
 *   - `file:` matches the annotation filename
 *   - every {{cite:key}} resolves against src/references.yaml or the
 *     chapter's own `sources:` block
 *   - `line:` / `lines:` anchors exist in the referenced source file
 *   - annotation `type` is valid (margin | block | highlight) and the
 *     required fields for that type are present
 *
 * Why this exists: the build silently DROPS annotations it cannot place
 * (e.g. a margin note with no `type:`). Ten uiproject.fbp annotations were
 * missing from the printed book for exactly that reason — this validator
 * makes that class of bug fail loudly instead.
 *
 * Usage:
 *   node scripts/validate-annotations.mjs   (exit 1 on any issue)
 *   npm run validate
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const ANNOTATIONS_DIR = join(ROOT_DIR, 'src', 'annotations');
const SOURCE_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.01', 'src');
const REFERENCES_PATH = join(ROOT_DIR, 'src', 'references.yaml');

const VALID_TYPES = new Set(['margin', 'block', 'highlight']);
const CITE_RE = /\{\{cite:([a-zA-Z0-9][a-zA-Z0-9_-]*)\}\}/g;

function loadGlobalKeys() {
  if (!existsSync(REFERENCES_PATH)) {
    console.warn('Warning: src/references.yaml not found; all cite keys will fail');
    return new Set();
  }
  const refs = yaml.load(readFileSync(REFERENCES_PATH, 'utf8')) || {};
  return new Set(Object.keys(refs));
}

function validateFile(fname, globalKeys) {
  const path = join(ANNOTATIONS_DIR, fname);
  let doc;
  try {
    doc = yaml.load(readFileSync(path, 'utf8'));
  } catch (err) {
    return [`YAML parse error: ${err.message}`];
  }
  if (!doc || typeof doc !== 'object') return ['document is empty or not a mapping'];

  const issues = [];
  const expectedFile = fname.replace(/\.yaml$/, '');

  if (doc.file !== expectedFile) {
    issues.push(`file: "${doc.file}" does not match filename "${expectedFile}"`);
  }

  const localKeys = new Set(
    doc.sources && typeof doc.sources === 'object' ? Object.keys(doc.sources) : [],
  );

  // Citation check over every prose field
  const blobs = [];
  if (doc.introduction) blobs.push(['introduction', doc.introduction]);
  if (doc.conclusion) blobs.push(['conclusion', doc.conclusion]);
  (doc.annotations || []).forEach((a, i) => {
    const at = `annotations[${i}] (line ${a.line ?? (a.lines || []).join('-')})`;
    if (a.text) blobs.push([at, a.text]);
    if (a.title) blobs.push([`${at} title`, a.title]);
  });
  for (const [where, text] of blobs) {
    for (const m of String(text).matchAll(CITE_RE)) {
      if (!globalKeys.has(m[1]) && !localKeys.has(m[1])) {
        issues.push(`unknown cite key "${m[1]}" in ${where}`);
      }
    }
  }

  // Type + required-field checks
  (doc.annotations || []).forEach((a, i) => {
    if (!VALID_TYPES.has(a.type)) {
      issues.push(`annotations[${i}]: unknown or missing type "${a.type}" (build would drop it)`);
    }
    if ((a.type === 'margin' || a.type === 'block') && !a.text) {
      issues.push(`annotations[${i}]: type "${a.type}" missing text`);
    }
    if (a.type === 'highlight' && !a.category) {
      issues.push(`annotations[${i}]: highlight missing category`);
    }
  });

  // Line anchors against the actual source file (skip directories like rc/)
  const srcPath = join(SOURCE_DIR, expectedFile);
  if (existsSync(srcPath)) {
    let lineCount = null;
    try {
      lineCount = readFileSync(srcPath, 'utf8').split('\n').length;
    } catch {
      lineCount = null; // directory or unreadable — nothing to check against
    }
    if (lineCount !== null) {
      (doc.annotations || []).forEach((a, i) => {
        if (a.line !== undefined && (typeof a.line !== 'number' || a.line < 1 || a.line > lineCount)) {
          issues.push(`annotations[${i}]: line ${a.line} out of range (${expectedFile} has ${lineCount} lines)`);
        }
        if (a.lines !== undefined) {
          const [s, e] = a.lines;
          if (typeof s !== 'number' || typeof e !== 'number' || s < 1 || e > lineCount || s > e) {
            issues.push(`annotations[${i}]: lines [${s}, ${e}] invalid (${expectedFile} has ${lineCount} lines)`);
          }
        }
      });
    }
  }

  return issues;
}

function main() {
  const globalKeys = loadGlobalKeys();
  const files = readdirSync(ANNOTATIONS_DIR)
    .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
    .sort();

  let total = 0;
  for (const fname of files) {
    const issues = validateFile(fname, globalKeys);
    if (issues.length) {
      total += issues.length;
      console.log(`✗ ${fname}`);
      for (const issue of issues) console.log(`    - ${issue}`);
    }
  }

  if (total > 0) {
    console.error(`\nAnnotation validation FAILED: ${total} issue(s) in ${files.length} files`);
    process.exit(1);
  }
  console.log(`✓ Annotation validation passed (${files.length} files, ${globalKeys.size} reference keys)`);
}

main();
