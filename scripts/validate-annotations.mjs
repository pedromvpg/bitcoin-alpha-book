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
 *   - `glossary:` entries are {term, definition} (missing glossary = warning)
 *   - every step in src/reading-paths.yaml resolves to a source line
 *
 * Before any of that, the source tree itself is verified against the committed
 * src/source-manifest.json (scripts/source-manifest.mjs) — line anchors are
 * only meaningful against the exact v0.1.0 bytes.
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
import { verifyTree } from './source-manifest.mjs';
import { resolveStep } from './symbols.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const ANNOTATIONS_DIR = join(ROOT_DIR, 'src', 'annotations');
const SOURCE_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.01', 'src');
const REFERENCES_PATH = join(ROOT_DIR, 'src', 'references.yaml');
const READING_PATHS_PATH = join(ROOT_DIR, 'src', 'reading-paths.yaml');

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

function validateFile(fname, globalKeys, warnings = []) {
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

  // Glossary ("Key Terms") shape; a chapter without one is only a warning
  if (doc.glossary === undefined || (Array.isArray(doc.glossary) && doc.glossary.length === 0)) {
    warnings.push('no glossary: (Key Terms) entries');
  } else if (!Array.isArray(doc.glossary)) {
    issues.push('glossary: must be a list of {term, definition}');
  } else {
    doc.glossary.forEach((g, i) => {
      if (!g || typeof g.term !== 'string' || typeof g.definition !== 'string') {
        issues.push(`glossary[${i}]: needs string term and definition`);
        return;
      }
      for (const m of g.definition.matchAll(CITE_RE)) {
        if (!globalKeys.has(m[1]) && !localKeys.has(m[1])) {
          issues.push(`unknown cite key "${m[1]}" in glossary[${i}]`);
        }
      }
    });
  }

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
  const sourceProblems = verifyTree();
  if (sourceProblems.length) {
    console.log('✗ src/bitcoin-0.01/src does not match src/source-manifest.json (run npm run fetch)');
    for (const p of sourceProblems) console.log(`    - ${p}`);
    console.error('\nAnnotation validation FAILED: source tree is not the verified v0.1.0 release');
    process.exit(1);
  }

  const globalKeys = loadGlobalKeys();
  const files = readdirSync(ANNOTATIONS_DIR)
    .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
    .sort();

  let total = 0;
  let warned = 0;
  for (const fname of files) {
    const warnings = [];
    const issues = validateFile(fname, globalKeys, warnings);
    if (issues.length) {
      total += issues.length;
      console.log(`✗ ${fname}`);
      for (const issue of issues) console.log(`    - ${issue}`);
    }
    if (warnings.length) {
      warned += warnings.length;
      console.log(`! ${fname}`);
      for (const w of warnings) console.log(`    - warning: ${w}`);
    }
  }

  // Reading paths: every step must resolve to a definition or source line
  if (existsSync(READING_PATHS_PATH)) {
    const issues = [];
    let doc = null;
    try {
      doc = yaml.load(readFileSync(READING_PATHS_PATH, 'utf8'));
    } catch (err) {
      issues.push(`YAML parse error: ${err.message}`);
    }
    for (const path of doc?.paths || []) {
      if (!path.id || !path.title) issues.push('path missing id or title');
      (path.steps || []).forEach((step, i) => {
        const r = resolveStep(step);
        if (r.error) issues.push(`${path.id} step ${i + 1}: ${r.error}`);
        if (!step.note) issues.push(`${path.id} step ${i + 1}: missing note`);
      });
    }
    if (issues.length) {
      total += issues.length;
      console.log('✗ reading-paths.yaml');
      for (const issue of issues) console.log(`    - ${issue}`);
    }
  }

  if (total > 0) {
    console.error(`\nAnnotation validation FAILED: ${total} issue(s) in ${files.length} files`);
    process.exit(1);
  }
  const warnNote = warned ? `, ${warned} warning(s)` : '';
  console.log(`✓ Annotation validation passed (${files.length} files, ${globalKeys.size} reference keys${warnNote})`);
}

main();
