/**
 * Quote checker — verifies that every quotation attributed to Satoshi Nakamoto
 * matches the primary source word for word.
 *
 * A "quote" is a "…" / “…” span in book prose followed (in the same prose
 * field, within ~240 chars) by a {{cite:key}} whose reference author is
 * Satoshi Nakamoto. Prose = annotation YAML text fields + scripts/build.js.
 *
 * Corpus (offline, gitignored research clones):
 *   src/nakamotoinstitute.org/server/data/emails.json        (mailing lists)
 *   src/nakamotoinstitute.org/server/data/forum_posts.json   (BitcoinTalk, P2P Foundation)
 *   src/nakamotoinstitute.org/server/content/library/bitcoin.en.md  (whitepaper)
 *   src/bitcoin-0.01/src/*                                   (v0.1.0 code, UI strings, readme)
 *
 * Each quote is split on ellipses; every fragment must appear, in order, in a
 * single corpus document. Results:
 *   VERBATIM          exact substring match
 *   NORMALIZED        matches after normalizing quotes/dashes/whitespace/case
 *   NOT IN CORPUS     cited source isn't in the local corpus (e.g. Hearn emails)
 *   NOT FOUND         cited source should be in the corpus but the text isn't → exit 1
 *
 * Usage: npm run check:quotes [-- --verbose]
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const NI_DIR = join(ROOT_DIR, 'src', 'nakamotoinstitute.org', 'server');
const SOURCE_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.01', 'src');
const ANNOTATIONS_DIR = join(ROOT_DIR, 'src', 'annotations');
const VERBOSE = process.argv.includes('--verbose');

/** URL patterns whose documents the local corpus contains. */
const CORPUS_URL_RE = [
  /bitcoin\.org\/bitcoin\.pdf/,
  /metzdowd\.com\/pipermail\/cryptography/,
  /satoshi\.nakamotoinstitute\.org\/(emails\/(cryptography|bitcoin-list|p2p-research)|posts)\//,
  /bitcointalk\.org\//,
  /p2pfoundation\.ning\.com\//,
];

/**
 * Quoted phrases that are not quotations of Satoshi (examples, terms, titles)
 * even though a Satoshi citation follows them. Keep the reason next to each.
 */
const NOT_QUOTES = new Map([
  ['pay Alice OR (pay Bob after timeout)', 'illustrative script, not a quotation'],
]);
const MIN_WORDS = 4; // shorter quoted spans are terms or scare quotes ("light clients")

const QUOTE_RE = /(?<![=\w])(?:"([^"<>]{12,}?)"|“([^”<>]{12,}?)”)/g;
const CITE_RE = /\{\{cite:([a-zA-Z0-9][a-zA-Z0-9_-]*)\}\}/g;

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Plain text: strip tags/markdown emphasis, decode entities, collapse whitespace. */
function plain(s) {
  return decodeEntities(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Loose form for NORMALIZED matching. */
function loose(s) {
  return plain(s)
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/^[\s.,;:'"-]+|[\s.,;:'"-]+$/g, '')
    .toLowerCase();
}

function splitFragments(quote) {
  return quote
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\]|\[…\])\s*/)
    .map((f) => f.trim())
    .filter((f) => f.replace(/[^a-z0-9]/gi, '').length >= 3);
}

function inOrder(doc, frags, norm) {
  let at = 0;
  for (const f of frags) {
    const needle = norm(f);
    const i = doc.indexOf(needle, at);
    if (i < 0) return false;
    at = i + needle.length;
  }
  return true;
}

function loadCorpus() {
  const docs = [];
  const emails = join(NI_DIR, 'data', 'emails.json');
  const posts = join(NI_DIR, 'data', 'forum_posts.json');
  const paper = join(NI_DIR, 'content', 'library', 'bitcoin.en.md');
  if (!existsSync(emails) || !existsSync(posts)) return null;

  for (const e of JSON.parse(readFileSync(emails, 'utf8'))) {
    if (e.satoshi_id == null && !/nakamoto/i.test(e.sent_from || '')) continue;
    docs.push({ label: `email ${e.source} #${e.source_id} "${e.subject}"`, text: e.text });
  }
  for (const p of JSON.parse(readFileSync(posts, 'utf8'))) {
    if (p.satoshi_id == null && !/nakamoto/i.test(p.poster_name || '')) continue;
    docs.push({ label: `post ${p.url || p.id} "${p.subject}"`, text: p.text });
  }
  if (existsSync(paper)) {
    docs.push({ label: 'whitepaper (bitcoin.en.md)', text: readFileSync(paper, 'utf8').replace(/^---[\s\S]*?---/, '') });
  }
  if (existsSync(SOURCE_DIR)) {
    for (const name of readdirSync(SOURCE_DIR).filter((n) => /\.(cpp|h|txt|fbp|rc)$/.test(n))) {
      const text = readFileSync(join(SOURCE_DIR, name), 'latin1').replace(/\\n/g, ' ');
      docs.push({ label: `v0.1.0 ${name}`, text });
    }
  }
  return docs.map((d) => ({ ...d, plain: plain(d.text), loose: loose(d.text) }));
}

/** Prose blobs: [{where, text}] from annotation YAML and build.js. */
function loadProse() {
  const blobs = [];
  for (const f of readdirSync(ANNOTATIONS_DIR).filter((n) => n.endsWith('.yaml') && !n.startsWith('_')).sort()) {
    const doc = yaml.load(readFileSync(join(ANNOTATIONS_DIR, f), 'utf8')) || {};
    const at = `src/annotations/${f}`;
    if (doc.introduction) blobs.push({ where: `${at} introduction`, text: doc.introduction, sources: doc.sources });
    if (doc.conclusion) blobs.push({ where: `${at} conclusion`, text: doc.conclusion, sources: doc.sources });
    (doc.annotations || []).forEach((a) => {
      const loc = a.line ?? (a.lines || []).join('-');
      if (a.text) blobs.push({ where: `${at} line ${loc}`, text: a.text, sources: doc.sources });
    });
    (doc.glossary || []).forEach((g) => {
      if (g && g.definition) blobs.push({ where: `${at} glossary "${g.term}"`, text: g.definition, sources: doc.sources });
    });
  }
  // build.js prose: split into paragraphs so a quote only pairs with its own cite
  const buildSrc = readFileSync(join(ROOT_DIR, 'scripts', 'build.js'), 'utf8');
  const lines = buildSrc.split('\n');
  let para = [];
  let start = 1;
  lines.forEach((line, i) => {
    if (/<\/?p[\s>]|<\/li>|<\/blockquote>/.test(line) && para.length) {
      blobs.push({ where: `scripts/build.js:${start}`, text: para.join(' ') });
      para = [];
    }
    if (!para.length) start = i + 1;
    para.push(line);
  });
  if (para.length) blobs.push({ where: `scripts/build.js:${start}`, text: para.join(' ') });
  return blobs;
}

function main() {
  const corpus = loadCorpus();
  if (!corpus) {
    console.warn(`⚠ Quote check skipped: corpus not found at ${relative(ROOT_DIR, NI_DIR)}`);
    console.warn('  (clone github.com/NakamotoInstitute/nakamotoinstitute.org into src/nakamotoinstitute.org)');
    return;
  }
  const refs = yaml.load(readFileSync(join(ROOT_DIR, 'src', 'references.yaml'), 'utf8')) || {};

  const results = [];
  for (const blob of loadProse()) {
    const text = String(blob.text);
    const cites = [...text.matchAll(CITE_RE)].map((m) => ({ key: m[1], index: m.index }));
    for (const m of text.matchAll(QUOTE_RE)) {
      const quote = plain(m[1] ?? m[2]);
      if (NOT_QUOTES.has(quote) || quote.split(/\s+/).length < MIN_WORDS) continue;
      const after = m.index + m[0].length;
      const cite = cites.find((c) => c.index >= after && c.index - after <= 240);
      if (!cite) continue;
      const ref = (blob.sources && blob.sources[cite.key]) || refs[cite.key];
      if (!ref || !/nakamoto|satoshi/i.test(ref.author || '')) continue;
      const frags = splitFragments(quote);
      if (!frags.length) continue;

      let status;
      let match = corpus.find((d) => inOrder(d.plain, frags, (s) => s));
      if (match) status = 'VERBATIM';
      else if ((match = corpus.find((d) => inOrder(d.loose, frags, loose)))) status = 'NORMALIZED';
      else if (ref.url && CORPUS_URL_RE.some((re) => re.test(ref.url))) status = 'NOT FOUND';
      else status = 'NOT IN CORPUS';
      results.push({ status, quote, key: cite.key, where: blob.where, match: match?.label, url: ref.url });
    }
  }

  const order = ['NOT FOUND', 'NORMALIZED', 'NOT IN CORPUS', 'VERBATIM'];
  results.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const counts = Object.fromEntries(order.map((s) => [s, results.filter((r) => r.status === s).length]));

  for (const r of results) {
    if (r.status === 'VERBATIM' && !VERBOSE) continue;
    const mark = { 'NOT FOUND': '✗', NORMALIZED: '~', 'NOT IN CORPUS': '?', VERBATIM: '✓' }[r.status];
    console.log(`${mark} ${r.status.padEnd(13)} ${r.where}  [${r.key}]`);
    console.log(`    "${r.quote.length > 160 ? r.quote.slice(0, 157) + '...' : r.quote}"`);
    if (r.match) console.log(`    ↳ ${r.match}`);
    else if (r.status !== 'VERBATIM') console.log(`    ↳ ${r.url || '(no url)'}`);
  }

  console.log(
    `\nQuotes checked: ${results.length} — ${counts.VERBATIM} verbatim, ${counts.NORMALIZED} normalized, ` +
      `${counts['NOT IN CORPUS']} not in corpus, ${counts['NOT FOUND']} not found`,
  );
  if (counts['NOT FOUND']) {
    console.error('Quote check FAILED: some Satoshi quotes do not match their primary source');
    process.exit(1);
  }
}

main();
