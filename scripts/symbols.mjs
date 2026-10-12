/**
 * Symbol table for the v0.1.0 source — top-level function definitions and the
 * places that call them, for the book's "Called from" cross-references.
 *
 * v0.1.0 is written in Allman style: a file-scope definition is a signature at
 * column 0 followed by a line that is exactly "{", and its body ends at the next
 * "}" in column 0. That makes a reliable, dependency-free extractor:
 *
 *   defs     every top-level definition {name, qualified, file, line, endLine}
 *   callers  Map<name, [{file, line, caller}]> — call sites of unambiguous names
 *            (direct calls, plus thread entry points passed to _beginthread)
 *   classes  Map<name, {name, file, line}> — class/struct definitions
 *
 * Names defined more than once (overloads, same method on several classes such
 * as CTransaction::AcceptTransaction / CMerkleTx::AcceptTransaction) cannot be
 * resolved from a call site without type information, so they get no
 * cross-references rather than wrong ones.
 *
 *   node scripts/symbols.mjs --report [Name ...]   print defs + callers
 */

import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, '..', 'src', 'bitcoin-0.01', 'src');

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'sizeof', 'catch', 'foreach',
  'CRITICAL_BLOCK', 'TRY_CRITICAL_BLOCK', 'IMPLEMENT_SERIALIZE', 'loop',
]);

/** Names too generic to cross-reference usefully even if defined once. */
const STOPLIST = new Set(['main', 'WinMain', 'OnInit', 'OnExit', 'operator']);

// "<ret> [Class::]Name(" at column 0 — the return type is required, which
// excludes constructors/destructors (their "callers" are object creations).
const SIGNATURE_RE =
  /^(?!static\s+const|typedef|#|\/\/|class\b|struct\b|using\b|template\b)[A-Za-z_][\w<>,*&: ]*?[\s*&]+(?:([A-Za-z_]\w*)::)?([A-Za-z_]\w*)\s*\(/;

// Constructors/destructors "Class::Class(" at column 0 — enclosing scopes only
const CTOR_RE = /^([A-Za-z_]\w*)::(~?[A-Za-z_]\w*)\s*\(/;

/** Blank out comments, string and char literals, keeping column positions. */
function stripLine(line, state) {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const n = line[i + 1];
    if (state.block) {
      if (c === '*' && n === '/') { state.block = false; out += '  '; i++; } else out += ' ';
      continue;
    }
    if (c === '/' && n === '*') { state.block = true; out += '  '; i++; continue; }
    if (c === '/' && n === '/') break;
    if (c === '"' || c === "'") {
      const q = c;
      out += ' ';
      for (i++; i < line.length && line[i] !== q; i++) {
        if (line[i] === '\\') { out += ' '; i++; }
        out += ' ';
      }
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

export function sourceFiles() {
  return readdirSync(SOURCE_DIR).filter((f) => /\.(cpp|h)$/.test(f)).sort();
}

let cached = null;

/** Build (once per process) the definition table and caller map. */
export function buildSymbolTable() {
  if (cached) return cached;

  const files = {};
  for (const file of sourceFiles()) {
    const raw = readFileSync(join(SOURCE_DIR, file), 'latin1').split('\n').map((l) => l.replace(/\r$/, ''));
    const state = { block: false };
    files[file] = { raw, code: raw.map((l) => stripLine(l, state)) };
  }

  // 1. Top-level definitions (+ constructor scopes, which are never xref targets)
  const defs = [];
  const scopes = [];
  for (const [file, { raw, code }] of Object.entries(files)) {
    for (let i = 0; i < code.length - 1; i++) {
      let m = SIGNATURE_RE.exec(code[i]);
      let ctor = false;
      if (!m) {
        const c = CTOR_RE.exec(code[i]);
        if (c && c[2].replace('~', '') === c[1]) {
          m = [null, c[1], c[2]];
          ctor = true;
        }
      }
      if (!m || KEYWORDS.has(m[2])) continue;
      // Signature may wrap; find the "{" line within a few lines
      let open = -1;
      for (let j = i; j < Math.min(i + 4, code.length); j++) {
        if (code[j].trim() === '{') { open = j; break; }
        if (j > i && SIGNATURE_RE.test(code[j])) break;
        if (/;\s*$/.test(code[j])) break; // prototype, not a definition
      }
      if (open < 0 || !/^\{/.test(raw[open])) continue;
      let end = open + 1;
      while (end < code.length && !/^\}/.test(code[end])) end++;
      const def = {
        name: m[2],
        qualified: m[1] ? `${m[1]}::${m[2]}` : m[2],
        file,
        line: i + 1,
        endLine: end + 1,
      };
      (ctor ? scopes : defs).push(def);
      i = end;
    }
  }

  // Class/struct definitions at column 0 (index targets; not call targets)
  const classes = new Map();
  for (const [file, { code }] of Object.entries(files)) {
    code.forEach((text, i) => {
      const m = /^(?:class|struct)\s+([A-Za-z_]\w*)\s*(?::[^;]*)?$/.exec(text.trimEnd());
      if (!m || (code[i + 1] || '').trim() !== '{') return;
      if (classes.has(m[1])) classes.set(m[1], null); // defined twice — ambiguous
      else classes.set(m[1], { name: m[1], file, line: i + 1 });
    });
  }
  for (const [k, v] of classes) if (!v) classes.delete(k);

  const byName = new Map();
  for (const d of defs) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push(d);
  }
  const unique = new Map(
    [...byName].filter(([name, ds]) => ds.length === 1 && !STOPLIST.has(name)).map(([n, ds]) => [n, ds[0]]),
  );

  // 2. Call sites of unambiguous names
  const enclosing = (file, line) =>
    defs.find((d) => d.file === file && line >= d.line && line <= d.endLine) ||
    scopes.find((d) => d.file === file && line >= d.line && line <= d.endLine) ||
    null;
  // Inline method bodies in class definitions: label the call by its class
  const classAt = (file, line) => {
    const { code } = files[file];
    for (let i = line - 1; i >= 0; i--) {
      const m = /^(?:class|struct)\s+([A-Za-z_]\w*)\b(?!.*;\s*$)/.exec(code[i]);
      if (m) return m[1];
      if (/^\};/.test(code[i]) && i < line - 1) return null;
    }
    return null;
  };
  const names = [...unique.keys()].join('|');
  // A direct call "Name(" — or a thread entry point "_beginthread(Name, ...)"
  const callRe = new RegExp(`(?<![\\w~])(${names})\\s*\\(|_beginthread\\(\\s*(${names})\\b`, 'g');
  const callers = new Map();
  for (const [file, { code }] of Object.entries(files)) {
    code.forEach((text, idx) => {
      const lineNum = idx + 1;
      for (const m of text.matchAll(callRe)) {
        const def = unique.get(m[1] || m[2]);
        if (def.file === file && def.line === lineNum) continue; // the definition itself
        const before = text.slice(0, m.index);
        if (/\b(?:class|struct)\s+\w*$/.test(before)) continue;
        // Skip prototypes/declarations: "<type> Name(...);" at file or class scope
        const enc = enclosing(file, lineNum);
        if (!enc && /^\s*(?:extern\s+|static\s+|virtual\s+)?[\w<>:*& ,]+[\s*&]$/.test(before)) continue;
        if (enc && enc.name === def.name) continue; // recursion
        if (!callers.has(def.name)) callers.set(def.name, []);
        // One-line definitions: "void A::B(...)  { Call(...); }"
        const oneLine = enc ? null : SIGNATURE_RE.exec(text) || CTOR_RE.exec(text);
        const oneLineName = oneLine && oneLine.index === 0 && /\{.*\}/.test(text)
          ? (oneLine[1] ? `${oneLine[1]}::${oneLine[2]}` : oneLine[2])
          : null;
        if (oneLineName === def.qualified) continue;
        const cls = enc || oneLineName ? null : classAt(file, lineNum);
        callers.get(def.name).push({ file, line: lineNum, caller: enc ? enc.qualified : oneLineName || (cls ? `${cls} (inline)` : null) });
      }
    });
  }

  cached = { defs, unique, callers, classes };
  return cached;
}

/**
 * "Called from" entries for one definition: one per distinct calling function
 * (first call line), then file-scope/inline-method call sites per file.
 */
export function callersOf(name) {
  const { callers } = buildSymbolTable();
  const seen = new Set();
  const out = [];
  for (const c of callers.get(name) || []) {
    const key = c.caller ? `fn:${c.caller}` : `file:${c.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Definitions (by file) that get a "Called from" note. */
export function definitionsByFile() {
  const { unique } = buildSymbolTable();
  const map = new Map();
  for (const d of unique.values()) {
    if (!callersOf(d.name).length) continue;
    if (!map.has(d.file)) map.set(d.file, new Map());
    map.get(d.file).set(d.line, d);
  }
  return map;
}

function report(names) {
  const { defs, unique } = buildSymbolTable();
  const list = names.length ? defs.filter((d) => names.includes(d.name)) : defs;
  let withCallers = 0;
  for (const d of list) {
    const cs = unique.has(d.name) ? callersOf(d.name) : null;
    if (cs && cs.length) withCallers++;
    if (!names.length && !(cs && cs.length)) continue;
    console.log(`${d.qualified}  ${d.file}:${d.line}-${d.endLine}${cs ? '' : '  (ambiguous name — no xrefs)'}`);
    for (const c of cs || []) console.log(`    ← ${c.caller || '(file scope)'}  ${c.file}:${c.line}`);
  }
  console.log(`\n${defs.length} top-level definitions, ${unique.size} unambiguous, ${withCallers} with callers`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2).filter((a) => a !== '--report');
  report(args);
}

/**
 * Resolve a reading-path step ({symbol} or {file, line}) to {file, line}.
 * `symbol` must equal a definition's qualified name ("CBlock::AcceptBlock").
 * Returns {error} when it cannot be resolved.
 */
export function resolveStep(step) {
  if (step.symbol) {
    const matches = buildSymbolTable().defs.filter((d) => d.qualified === step.symbol);
    if (matches.length !== 1) {
      return { error: `symbol "${step.symbol}" ${matches.length ? 'is ambiguous' : 'not found as a top-level definition'}` };
    }
    return { file: matches[0].file, line: matches[0].line, symbol: step.symbol };
  }
  if (step.file && Number.isInteger(step.line)) {
    let count = 0;
    try {
      count = readFileSync(join(SOURCE_DIR, step.file), 'latin1').split('\n').length;
    } catch {
      return { error: `file "${step.file}" not found` };
    }
    if (step.line < 1 || step.line > count) return { error: `line ${step.line} out of range in ${step.file}` };
    return { file: step.file, line: step.line };
  }
  return { error: 'step needs symbol: or file: + line:' };
}
