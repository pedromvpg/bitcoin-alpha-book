/**
 * Bitcoin Alpha Book Builder
 * 
 * Assembles the Bitcoin v0.1.0 source code into a print-ready PDF book
 * with syntax highlighting and annotations.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import Prism from 'prismjs';
import { getEccPrimerFigures } from './ecc-figures.mjs';
import { getBitcoinPrimerFigures } from './bitcoin-figures.mjs';
import { EDITION, ANNOTATIONS_CREDIT } from './edition.mjs';
import {
  SOURCE_FILE_ORDER as FILE_ORDER,
  chapterIdFromFilename,
} from './source-file-order.mjs';
import { renderRcGalleryHtml } from './rc-gallery.mjs';
import { loadManifest } from './source-manifest.mjs';
import { buildSymbolTable, callersOf, definitionsByFile, resolveStep } from './symbols.mjs';
import { loadOpenSSLManifest, readOpenSSLLines, scanOpenSSLUsage } from './openssl-source.mjs';

// Load additional Prism languages
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-makefile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Directories
const SOURCE_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.01', 'src');
const ANNOTATIONS_DIR = join(ROOT_DIR, 'src', 'annotations');
const REFERENCES_PATH = join(ROOT_DIR, 'src', 'references.yaml');
const READING_PATHS_PATH = join(ROOT_DIR, 'src', 'reading-paths.yaml');
const OPENSSL_APPENDIX_PATH = join(ROOT_DIR, 'src', 'appendix', 'openssl.yaml');
const STYLES_DIR = join(ROOT_DIR, 'styles');
const OUTPUT_DIR = join(ROOT_DIR, 'output');
const PIRATEHASH_LOGO_SVG = readFileSync(join(ROOT_DIR, 'assets', 'PirateHash_vector_black.svg'), 'utf8')
  .replace('<svg ', '<svg class="publisher-logo" role="img" aria-label="PirateHash" ')
  .replace(/ width="\d+" height="\d+"/, '');

// =============================================================================
// CITATIONS / FOOTNOTES
// =============================================================================

/**
 * Load the shared reference registry from src/references.yaml
 */
function loadReferences() {
  if (!existsSync(REFERENCES_PATH)) {
    console.warn('Warning: src/references.yaml not found; citations will warn as unknown keys');
    return {};
  }
  try {
    const content = readFileSync(REFERENCES_PATH, 'utf8');
    const refs = yaml.load(content);
    return refs && typeof refs === 'object' ? refs : {};
  } catch (err) {
    console.warn(`Warning: Could not parse references.yaml: ${err.message}`);
    return {};
  }
}

/**
 * Format a structured reference into footnote HTML body text.
 */
function formatFootnote(ref) {
  if (!ref || typeof ref !== 'object') return '<em>Unknown reference</em>';

  const parts = [];
  if (ref.author) parts.push(escapeHtml(ref.author));
  if (ref.title) {
    parts.push(parts.length ? `, <em>${escapeHtml(ref.title)}</em>` : `<em>${escapeHtml(ref.title)}</em>`);
  }
  if (ref.date) parts.push(` (${escapeHtml(String(ref.date))})`);
  let text = parts.join('') + (parts.length ? '.' : '');

  if (ref.note) {
    text += ` ${escapeHtml(ref.note)}.`;
  }
  if (ref.url) {
    const url = String(ref.url);
    text += ` <a href="${escapeHtml(url)}" class="footnote-url">${escapeHtml(url)}</a>`;
  }
  return text.trim() || '<em>Incomplete reference</em>';
}

/**
 * Per-chapter citation accumulator. Numbers are assigned in order of first appearance.
 */
class CitationContext {
  /**
   * @param {string} chapterId
   * @param {Record<string, object>} refs Merged global + per-chapter sources
   * @param {Set<string>} [localKeys] Keys defined only in the chapter's sources: block
   */
  constructor(chapterId, refs, localKeys = new Set()) {
    this.chapterId = chapterId;
    this.refs = refs;
    this.localKeys = localKeys;
    this.keyToNumber = new Map();
    this.keyOccurrences = new Map(); // key -> how many times cited in this chapter
    this.usedOrder = []; // [{ key, number, ref }]
    this.citedLocalKeys = new Set();
  }

  process(html) {
    if (!html || typeof html !== 'string') return html || '';

    // Fresh regex each call — avoid /g lastIndex carry-over across chapters
    return html.replace(/\{\{cite:([a-zA-Z0-9][a-zA-Z0-9_-]*)\}\}/g, (_match, key) => {
      const ref = this.refs[key];
      if (!ref) {
        console.warn(`   Warning: Unknown cite key "${key}" in ${this.chapterId}`);
        return `<sup class="footnote-ref footnote-missing" title="Unknown citation: ${escapeHtml(key)}">?</sup>`;
      }

      if (!ref.url && !ref.note) {
        console.warn(`   Warning: Reference "${key}" has neither url nor note`);
      }

      let number = this.keyToNumber.get(key);
      if (number == null) {
        number = this.usedOrder.length + 1;
        this.keyToNumber.set(key, number);
        this.usedOrder.push({ key, number, ref });
      }

      const occurrence = (this.keyOccurrences.get(key) || 0) + 1;
      this.keyOccurrences.set(key, occurrence);

      if (this.localKeys.has(key)) {
        this.citedLocalKeys.add(key);
      }

      const fnId = `${this.chapterId}-fn-${number}`;
      // First occurrence keeps the canonical id; later ones stay unique
      const refId = occurrence === 1
        ? `${this.chapterId}-fnref-${number}`
        : `${this.chapterId}-fnref-${number}-${occurrence}`;
      return `<sup><a id="${refId}" href="#${fnId}" class="footnote-ref">${number}</a></sup>`;
    });
  }

  warnUnusedLocalSources() {
    for (const key of this.localKeys) {
      if (!this.citedLocalKeys.has(key)) {
        console.warn(`   Warning: Unused local source "${key}" in ${this.chapterId}`);
      }
    }
  }

  renderFootnotes() {
    this.warnUnusedLocalSources();
    if (this.usedOrder.length === 0) return '';

    const items = this.usedOrder.map(({ number, ref }) => {
      const fnId = `${this.chapterId}-fn-${number}`;
      return `
      <li id="${fnId}" class="footnote" value="${number}">
        <span class="footnote-text">${formatFootnote(ref)}</span>
      </li>`;
    }).join('');

    return `
    <section class="footnotes" id="${this.chapterId}-sources">
      <h4 class="footnotes-title">Sources</h4>
      <ol class="footnotes-list">${items}
      </ol>
    </section>`;
  }
}

/**
 * Build a CitationContext for a chapter, merging global refs with per-chapter sources.
 */
function createCitationContext(chapterId, globalRefs, annotation) {
  const localSources = annotation?.sources && typeof annotation.sources === 'object'
    ? annotation.sources
    : {};
  const localKeys = new Set(Object.keys(localSources));
  const merged = { ...globalRefs, ...localSources };
  return new CitationContext(chapterId, merged, localKeys);
}

/**
 * Expand {{cite:key}} markers inside Part I primer sections and append Sources.
 * Applied to the finished book HTML so primers (hardcoded in the template) get
 * the same footnote treatment as annotation chapters.
 */
function injectPrimerCitations(html) {
  const primerIds = [
    'introduction',
    'prehistory',
    'computer-concepts',
    'cryptography-primer',
    'cpp-primer',
    'bitcoin-primer',
    'what-came-after',
  ];

  for (const id of primerIds) {
    const pattern = new RegExp(
      `(<section\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(<\\/section>)`,
      'i'
    );
    html = html.replace(pattern, (_match, open, body, close) => {
      // Skip if already processed or no cite markers
      if (!/\{\{cite:[a-zA-Z0-9_-]+\}\}/.test(body)) {
        return open + body + close;
      }
      const ctx = createCitationContext(id, GLOBAL_REFERENCES, {});
      const processed = ctx.process(body);
      return open + processed + ctx.renderFootnotes() + close;
    });
  }
  return html;
}

// Global reference registry (loaded at build time)
let GLOBAL_REFERENCES = {};

// =============================================================================
// INDEX TERMS
// =============================================================================
// Terms to be indexed in the book. Each term can have variations and metadata.

const INDEX_TERMS = {
  // Core Concepts
  'blockchain': { category: 'Concepts', variations: ['block chain', 'chain of blocks'] },
  'proof-of-work': { category: 'Concepts', variations: ['proof of work', 'PoW', 'mining'] },
  'double-spend': { category: 'Concepts', variations: ['double spend', 'double spending', 'double-spending'] },
  'transaction': { category: 'Concepts' },
  'block': { category: 'Concepts' },
  'genesis block': { category: 'Concepts' },
  'coinbase': { category: 'Concepts' },
  'nonce': { category: 'Concepts' },
  'difficulty': { category: 'Concepts', variations: ['difficulty target'] },
  'consensus': { category: 'Concepts' },
  'peer-to-peer': { category: 'Concepts', variations: ['P2P', 'peer to peer'] },
  'mempool': { category: 'Concepts', variations: ['memory pool'] },
  'UTXO': { category: 'Concepts', variations: ['unspent transaction output'] },
  'merkle tree': { category: 'Concepts', variations: ['merkle root', 'hash tree'] },
  'orphan block': { category: 'Concepts' },
  'timestamp': { category: 'Concepts' },
  'satoshi': { category: 'Concepts' },
  
  // Cryptography
  'SHA-256': { category: 'Cryptography', variations: ['SHA256', 'SHA 256'] },
  'RIPEMD-160': { category: 'Cryptography', variations: ['RIPEMD160', 'RIPEMD'] },
  'ECDSA': { category: 'Cryptography', variations: ['Elliptic Curve Digital Signature Algorithm'] },
  'secp256k1': { category: 'Cryptography' },
  'private key': { category: 'Cryptography', variations: ['secret key'] },
  'public key': { category: 'Cryptography' },
  'digital signature': { category: 'Cryptography', variations: ['signature'] },
  'hash': { category: 'Cryptography', variations: ['hashing'] },
  'elliptic curve': { category: 'Cryptography', variations: ['ECC', 'elliptic curve cryptography'] },
  'generator point': { category: 'Cryptography' },
  'discrete logarithm': { category: 'Cryptography' },
  'OpenSSL': { category: 'Cryptography' },
  
  // Classes & Data Structures
  'CTransaction': { category: 'Classes', isCode: true },
  'CBlock': { category: 'Classes', isCode: true },
  'CBlockIndex': { category: 'Classes', isCode: true },
  'CKey': { category: 'Classes', isCode: true },
  'CScript': { category: 'Classes', isCode: true },
  'CTxIn': { category: 'Classes', isCode: true },
  'CTxOut': { category: 'Classes', isCode: true },
  'COutPoint': { category: 'Classes', isCode: true },
  'CWallet': { category: 'Classes', isCode: true },
  'CAddress': { category: 'Classes', isCode: true },
  'CNode': { category: 'Classes', isCode: true },
  'CInv': { category: 'Classes', isCode: true },
  'CDataStream': { category: 'Classes', isCode: true },
  'uint256': { category: 'Classes', isCode: true },
  'uint160': { category: 'Classes', isCode: true },
  'CBigNum': { category: 'Classes', isCode: true },
  
  // Key Functions
  'GetHash': { category: 'Functions', isCode: true },
  'CheckBlock': { category: 'Functions', isCode: true },
  'AcceptBlock': { category: 'Functions', isCode: true },
  'ConnectBlock': { category: 'Functions', isCode: true },
  'ProcessBlock': { category: 'Functions', isCode: true },
  'AddToBlockIndex': { category: 'Functions', isCode: true },
  'CheckTransaction': { category: 'Functions', isCode: true },
  'AcceptTransaction': { category: 'Functions', isCode: true },
  'CreateTransaction': { category: 'Functions', isCode: true },
  'SendMoney': { category: 'Functions', isCode: true },
  'GetBalance': { category: 'Functions', isCode: true },
  'BitcoinMiner': { category: 'Functions', isCode: true },
  'ThreadBitcoinMiner': { category: 'Functions', isCode: true },
  'Hash': { category: 'Functions', isCode: true },
  'Hash160': { category: 'Functions', isCode: true },
  'EncodeBase58': { category: 'Functions', isCode: true },
  'DecodeBase58': { category: 'Functions', isCode: true },
  'EvalScript': { category: 'Functions', isCode: true },
  'Solver': { category: 'Functions', isCode: true },
  'Sign': { category: 'Functions', isCode: true },
  'Verify': { category: 'Functions', isCode: true },
  
  // Script Operations
  'OP_CHECKSIG': { category: 'Script', isCode: true },
  'OP_DUP': { category: 'Script', isCode: true },
  'OP_HASH160': { category: 'Script', isCode: true },
  'OP_EQUALVERIFY': { category: 'Script', isCode: true },
  'scriptPubKey': { category: 'Script', isCode: true },
  'scriptSig': { category: 'Script', isCode: true },
  
  // Network & Protocol
  'IRC': { category: 'Network', variations: ['Internet Relay Chat'] },
  'node': { category: 'Network' },
  'socket': { category: 'Network' },
  'message': { category: 'Network' },
  'version': { category: 'Network' },
  'verack': { category: 'Network' },
  'inv': { category: 'Network' },
  'getdata': { category: 'Network' },
  'getblocks': { category: 'Network' },
  'addr': { category: 'Network' },
  
  // Database
  'Berkeley DB': { category: 'Database', variations: ['BerkeleyDB', 'BDB'] },
  'blkindex.dat': { category: 'Database', isCode: true },
  'blk0001.dat': { category: 'Database', isCode: true },
  'wallet.dat': { category: 'Database', isCode: true },
  
  // Files
  'main.cpp': { category: 'Files', isCode: true },
  'main.h': { category: 'Files', isCode: true },
  'script.cpp': { category: 'Files', isCode: true },
  'script.h': { category: 'Files', isCode: true },
  'net.cpp': { category: 'Files', isCode: true },
  'net.h': { category: 'Files', isCode: true },
  'db.cpp': { category: 'Files', isCode: true },
  'db.h': { category: 'Files', isCode: true },
  'key.h': { category: 'Files', isCode: true },
  'serialize.h': { category: 'Files', isCode: true },
  'util.cpp': { category: 'Files', isCode: true },
  'util.h': { category: 'Files', isCode: true },
  'ui.cpp': { category: 'Files', isCode: true },
  'base58.h': { category: 'Files', isCode: true },
  
  // Historical
  'Satoshi Nakamoto': { category: 'Historical' },
  'Hal Finney': { category: 'Historical' },
  'Adam Back': { category: 'Historical' },
  'Wei Dai': { category: 'Historical' },
  'Nick Szabo': { category: 'Historical' },
  'David Chaum': { category: 'Historical' },
  'Hashcash': { category: 'Historical' },
  'b-money': { category: 'Historical' },
  'Bit Gold': { category: 'Historical' },
  'RPOW': { category: 'Historical' },
  'DigiCash': { category: 'Historical' },
  'cypherpunk': { category: 'Historical', variations: ['cypherpunks'] },
  'whitepaper': { category: 'Historical', variations: ['white paper'] },
};

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find all index term occurrences in HTML and track their section locations
 */
function findIndexTermLocations(html) {
  const termLocations = new Map(); // term -> Set of section ids
  
  // Parse HTML to find sections and their content
  const sectionRegex = /<section[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/gi;
  let sectionMatch;
  
  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const sectionId = sectionMatch[1];
    const sectionContent = sectionMatch[2];
    
    // Strip HTML tags for text matching
    const textContent = sectionContent.replace(/<[^>]+>/g, ' ').toLowerCase();
    
    for (const [term, config] of Object.entries(INDEX_TERMS)) {
      const patterns = [term, ...(config.variations || [])];
      
      for (const pattern of patterns) {
        // Create word boundary regex
        const regex = new RegExp(`\\b${escapeRegex(pattern.toLowerCase())}\\b`, 'i');
        
        if (regex.test(textContent)) {
          if (!termLocations.has(term)) {
            termLocations.set(term, new Set());
          }
          termLocations.get(term).add(sectionId);
          break; // Found in this section, move to next term
        }
      }
    }
  }
  
  return termLocations;
}

/**
 * Generate the index section HTML
 */
function generateIndexHtml(termLocations) {
  if (termLocations.size === 0) {
    return '';
  }
  
  // Group terms by first letter
  const alphabetized = {};
  
  for (const [term, sections] of termLocations.entries()) {
    const firstChar = term[0].toUpperCase();
    const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
    
    if (!alphabetized[letter]) {
      alphabetized[letter] = [];
    }
    
    alphabetized[letter].push({
      term,
      sections: Array.from(sections),
      config: INDEX_TERMS[term]
    });
  }
  
  // Sort within each letter group
  for (const letter of Object.keys(alphabetized)) {
    alphabetized[letter].sort((a, b) => 
      a.term.toLowerCase().localeCompare(b.term.toLowerCase())
    );
  }
  
  // Generate HTML
  let indexHtml = `
  <section class="chapter index-section" id="index">
    <span class="section-title">Index</span>
    <h1 class="chapter-title">INDEX</h1>
    <div class="index-columns">`;
  
  const sortedLetters = Object.keys(alphabetized).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });
  
  for (const letter of sortedLetters) {
    indexHtml += `
      <div class="index-letter-group">
        <h2 class="index-letter">${letter}</h2>
        <ul class="index-entries">`;
    
    for (const entry of alphabetized[letter]) {
      const termDisplay = entry.config.isCode 
        ? `<code class="index-code">${escapeHtml(entry.term)}</code>`
        : escapeHtml(entry.term);
      
      // Generate page references - each is a link that will show its page number.
      // A code term defined once in v0.1.0 points at its definition line in the
      // defining chapter (exact page) instead of that chapter's first page.
      const symbols = buildSymbolTable();
      const def = entry.config.isCode
        ? symbols.unique.get(entry.term) || symbols.classes.get(entry.term)
        : null;
      const defSection = def ? chapterIdFromFilename(def.file) : null;
      const pageRefs = entry.sections.map(sectionId => {
        const target = sectionId === defSection ? lineAnchorId(def.file, def.line) : sectionId;
        return `<a class="index-page-ref" href="#${target}"></a>`;
      }).join('');
      
      indexHtml += `
          <li class="index-entry">${termDisplay}, ${pageRefs}</li>`;
    }
    
    indexHtml += `
        </ul>
      </div>`;
  }
  
  indexHtml += `
    </div>
  </section>`;
  
  return indexHtml;
}

/**
 * Determine the Prism language from file extension
 */
function getLanguage(filename) {
  const ext = extname(filename).toLowerCase();
  const name = basename(filename).toLowerCase();
  
  if (name === 'makefile' || name === 'makefile.vc') return 'makefile';
  
  switch (ext) {
    case '.cpp':
    case '.c':
      return 'cpp';
    case '.h':
      return 'cpp';
    case '.txt':
      return 'text';
    case '.rc':
      return 'text';
    case '.fbp':
      return 'xml';
    default:
      return 'text';
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Apply syntax highlighting to code
 */
function highlightCode(code, language) {
  if (language === 'text') {
    return escapeHtml(code);
  }
  
  try {
    const grammar = Prism.languages[language] || Prism.languages.text;
    return Prism.highlight(code, grammar, language);
  } catch (err) {
    console.warn(`Warning: Could not highlight with language "${language}":`, err.message);
    return escapeHtml(code);
  }
}

/**
 * Process code into lines with line numbers and apply annotations
 */
function processCodeWithAnnotations(code, language, annotations = []) {
  const lines = code.split('\n');
  const highlightedLines = [];
  
  // Create a map of line annotations
  const lineAnnotations = new Map();
  const blockAnnotations = [];
  
  if (annotations) {
    for (const ann of annotations) {
      if (ann.type === 'margin' && ann.line) {
        lineAnnotations.set(ann.line, ann);
      } else if (ann.type === 'block' && ann.lines) {
        blockAnnotations.push(ann);
      } else if (ann.type === 'highlight' && ann.lines) {
        for (let i = ann.lines[0]; i <= ann.lines[1]; i++) {
          if (!lineAnnotations.has(i)) {
            lineAnnotations.set(i, { type: 'highlight', category: ann.category });
          }
        }
      }
    }
  }
  
  // Highlight each line
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const lineContent = lines[i];
    const highlighted = highlightCode(lineContent, language);
    
    const annotation = lineAnnotations.get(lineNum);
    let lineClass = 'code-line';
    let marginNote = '';
    
    if (annotation) {
      if (annotation.type === 'highlight') {
        lineClass += ` highlighted ${annotation.category || ''}`;
      } else if (annotation.type === 'margin') {
        lineClass += ' has-margin-note';
        marginNote = `<span class="code-margin-indicator" title="${escapeHtml(annotation.text)}">*</span>`;
      }
    }
    
    highlightedLines.push({
      number: lineNum,
      content: highlighted,
      class: lineClass,
      marginNote
    });
  }
  
  return { lines: highlightedLines, blockAnnotations };
}

/**
 * Line anchors + "Called from" cross-references (scripts/symbols.mjs).
 * Only lines that something links to get an id, keeping the HTML small.
 */
const XREF_MAX_CALLERS = 6;
const XREF_SEP = '<span class="xref-sep"> · </span>'; // explicit: Paged.js drops whitespace-only nodes
const extraLineAnchors = new Map(); // filename -> Set<line> (reading paths, index)
let xrefAnchorCache = null;

function lineAnchorId(filename, line) {
  return `L-${chapterIdFromFilename(filename)}-${line}`;
}

/** Ask for an anchor on a source line; returns its id. Call before chapters render. */
function requestLineAnchor(filename, line) {
  if (!extraLineAnchors.has(filename)) extraLineAnchors.set(filename, new Set());
  extraLineAnchors.get(filename).add(line);
  return lineAnchorId(filename, line);
}

function xrefAnchors() {
  if (xrefAnchorCache) return xrefAnchorCache;
  const map = new Map();
  const add = (file, line) => {
    if (!map.has(file)) map.set(file, new Set());
    map.get(file).add(line);
  };
  for (const [file, defs] of definitionsByFile()) {
    for (const [line, def] of defs) {
      add(file, line);
      for (const c of callersOf(def.name).slice(0, XREF_MAX_CALLERS)) add(c.file, c.line);
    }
  }
  for (const d of buildSymbolTable().unique.values()) add(d.file, d.line);
  for (const c of buildSymbolTable().classes.values()) add(c.file, c.line);
  xrefAnchorCache = map;
  return map;
}

/** "Called from" note placed above a definition's signature line. */
function xrefNoteHtml(def) {
  const callers = callersOf(def.name);
  const shown = callers.slice(0, XREF_MAX_CALLERS).map((c) => {
    const who = c.caller || c.file;
    const where = c.file === def.file ? '' : ` <span class="xref-file">${escapeHtml(c.file)}</span>`;
    return `<span class="xref-item"><code>${escapeHtml(who)}</code>${where} <a class="xref" href="#${lineAnchorId(c.file, c.line)}"></a></span>`;
  });
  const more = callers.length > XREF_MAX_CALLERS
    ? `${XREF_SEP}<span class="xref-more">and ${callers.length - XREF_MAX_CALLERS} more</span>`
    : '';
  return `<div class="xref-note"><span class="xref-label">Called from </span>${shown.join(XREF_SEP)}${more}</div>`;
}

/**
 * Generate HTML for a single code block
 * Uses per-line structure so line numbers stay aligned when code wraps
 * Includes margin notes from annotations
 * @param {CitationContext|null} citationCtx Optional citation context for {{cite:key}} expansion
 * @param {number} firstLine Source line number of the first line of `code` (excerpts)
 */
function generateCodeBlockHtml(filename, code, language, annotations, citationCtx = null, firstLine = 1) {
  const lines = code.split('\n');
  
  // Create a map of line annotations
  const lineAnnotations = new Map();
  if (annotations && Array.isArray(annotations)) {
    for (const ann of annotations) {
      if (ann.type === 'margin' && ann.line) {
        lineAnnotations.set(ann.line, ann);
      }
      if (ann.type === 'highlight' && ann.lines) {
        for (let i = ann.lines[0]; i <= ann.lines[1]; i++) {
          if (!lineAnnotations.has(i)) {
            lineAnnotations.set(i, { type: 'highlight', category: ann.category });
          }
        }
      }
    }
  }
  
  const anchorLines = new Set([
    ...(xrefAnchors().get(filename) || []),
    ...(extraLineAnchors.get(filename) || []),
  ]);
  const xrefDefs = definitionsByFile().get(filename) || new Map();

  // Generate each line as a row with line number + code + optional margin note
  let linesHtml = '';
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + firstLine;
    const lineContent = lines[i];
    const highlightedContent = highlightCode(lineContent, language);
    
    const annotation = lineAnnotations.get(lineNum);
    let lineClass = 'code-line';
    
    if (annotation && annotation.text) {
      lineClass += ' has-annotation';
    }
    if (annotation && annotation.type === 'highlight') {
      lineClass += ` highlighted ${annotation.category || ''}`;
    }

    // Annotation immediately above the referenced line (not after)
    // Note: Don't escape HTML to allow <code> tags for syntax-colored references
    if (annotation && annotation.text) {
      const text = citationCtx ? citationCtx.process(annotation.text) : annotation.text;
      linesHtml += `<div class="annotation-block"><div class="annotation-content">${text}</div></div>`;
    }

    const xrefDef = xrefDefs.get(lineNum);
    if (xrefDef) linesHtml += xrefNoteHtml(xrefDef);

    const idAttr = anchorLines.has(lineNum) ? ` id="${lineAnchorId(filename, lineNum)}"` : '';
    linesHtml += `<div class="${lineClass}"${idAttr}><span class="line-num">${String(lineNum).padStart(4, ' ')}</span><span class="line-code">${highlightedContent}</span></div>`;
  }
  
  const html = `
    <div class="code-container">
      <div class="code-content">
        ${linesHtml}
      </div>
    </div>`;
  
  return html;
}

/**
 * Back-matter Glossary: all chapter Key Terms merged by term (first definition
 * in file order wins), each pointing back to the chapters that define it.
 */
function generateBackGlossaryHtml(glossaryTerms) {
  if (!glossaryTerms.size) return '';
  // Alphabetize by the first letter, so "_WIN32_WINNT" files under W and "#bitcoin" under B
  const sortKey = (t) => t.toLowerCase().replace(/^[^a-z0-9]+/, '');
  const entries = [...glossaryTerms.values()].sort((a, b) => sortKey(a.term).localeCompare(sortKey(b.term)));
  const items = entries.map((e) => {
    const definition = e.definition.replace(/\{\{cite:[^}]+\}\}/g, '');
    const refs = e.chapters
      .map((c) => `<span class="xref-item"><span class="xref-file">${escapeHtml(c.filename)}</span> <a class="xref" href="#keyterms-${c.id}"></a></span>`)
      .join(XREF_SEP);
    return `<div class="glossary-entry"><dt>${escapeHtml(e.term)}</dt><dd>${definition} <span class="glossary-refs">${refs}</span></dd></div>`;
  });
  return `
  <section class="chapter glossary-section" id="glossary">
    <span class="section-title">Glossary</span>
    <h1 class="chapter-title">GLOSSARY</h1>
    <p class="glossary-lead">The Key Terms from every chapter, merged. Page numbers point to the chapter where each term is defined.</p>
    <dl class="glossary-list glossary-back">
      ${items.join('\n      ')}
    </dl>
  </section>`;
}

/**
 * "Where It Lives in the Code" table for the Bitcoin Protocol primer: each row
 * names a definition and links to the page where it begins. Requests line
 * anchors, so it must run before the chapters are rendered.
 */
const PROTOCOL_CODE_MAP = [
  ['Spending rules and double-spend check', { symbol: 'CTransaction::ConnectInputs' }],
  ['Script interpreter', { symbol: 'EvalScript' }],
  ['Standard script templates', { file: 'script.cpp', line: 913, label: 'Solver' }],
  ['Signing an input', { symbol: 'SignSignature' }],
  ['Checking an input', { symbol: 'VerifySignature' }],
  ['Block subsidy and halving', { symbol: 'CBlock::GetBlockValue' }],
  ['Difficulty retarget', { symbol: 'GetNextWorkRequired' }],
  ['Block sanity checks', { symbol: 'CBlock::CheckBlock' }],
  ['Block contextual checks', { symbol: 'CBlock::AcceptBlock' }],
  ['Choosing the best chain', { symbol: 'CBlock::AddToBlockIndex' }],
  ['Switching branches', { symbol: 'Reorganize' }],
  ['Mining loop', { symbol: 'BitcoinMiner' }],
  ['IRC peer discovery', { symbol: 'ThreadIRCSeed' }],
  ['Opening outbound connections', { symbol: 'ThreadOpenConnections2' }],
  ['Message dispatch', { symbol: 'ProcessMessage' }],
  ['Building a payment', { symbol: 'CreateTransaction' }],
  ['Sending a payment', { symbol: 'SendMoney' }],
];

function generateProtocolCodeMapHtml() {
  return PROTOCOL_CODE_MAP.map(([concept, step]) => {
    const r = resolveStep(step);
    if (r.error) {
      console.warn(`Warning: protocol code map "${concept}": ${r.error}`);
      return '';
    }
    const id = requestLineAnchor(r.file, r.line);
    const label = step.label || r.symbol || `${r.file}:${r.line}`;
    return `
        <tr><td>${escapeHtml(concept)}</td><td><code>${escapeHtml(label)}</code></td><td><span class="xref-item"><span class="xref-file">${escapeHtml(r.file)}:${r.line}</span> <a class="xref" href="#${id}"></a></span></td></tr>`;
  }).join('');
}

/**
 * "The Bitcoin Protocol" primer (end of Part I, after the C++ Primer): the
 * protocol as v0.1.0 implements it, illustrated by scripts/bitcoin-figures.mjs.
 */
function generateBitcoinPrimerHtml(btcFigs, codeMapRows) {
  return `
  <!-- BITCOIN PROTOCOL PRIMER -->
  <section class="chapter concepts" id="bitcoin-primer">
    <h1 class="chapter-title">The Bitcoin Protocol</h1>

    <p class="lead">
      A protocol is the set of rules every participant enforces. Bitcoin's rules are not
      written down anywhere except in the code: v0.1.0 <em>is</em> the specification. This
      chapter describes those rules before you read them line by line—how value is
      represented, how a spend is authorized, how blocks are chained and mined, how new
      coins enter circulation, and how nodes find each other and agree on one history. Every
      figure is drawn from the v0.1.0 source and names the function that implements it.
      Much of this has since changed; "What Came After" traces the changes.
    </p>

    <h2>Coins, Not Accounts</h2>
    <p>
      Nowhere in Bitcoin is there a table of balances. The ledger is made of
      <strong>transaction outputs</strong>: each output carries an amount and a condition
      that must be met to spend it. A transaction spends earlier outputs by naming them as
      its <strong>inputs</strong> and proving it meets their conditions, then creates new
      outputs of its own. The whitepaper puts it in one line: "We define an electronic coin
      as a chain of digital signatures."{{cite:nakamoto-whitepaper}}
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>A transaction graph:</strong>
        amounts in BTC. Coinbase transactions create coins from nothing; every other input
        consumes exactly one earlier output, whole. The outputs nothing has consumed yet
        (orange) are the spendable coins, the <em>unspent transaction outputs</em>.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Transaction graph: two coinbase transactions feed three later transactions; the outputs no input has consumed are highlighted as unspent">
        ${btcFigs.utxoGraph}
      </figure>
    </div>
    <p>
      An output is always spent in full. To pay 20 out of a 50-coin output, Tx 1 above
      creates two outputs: 20 to the recipient and 30 back to the sender as
      <strong>change</strong>. What a wallet shows as a balance is simply the sum of the
      unspent outputs it holds keys for (<code>GetBalance()</code> walks the wallet and
      skips anything marked spent).
    </p>
    <p>
      Each node keeps, for every transaction in the chain, a <code>CTxIndex</code> whose
      <code>vSpent</code> vector has one slot per output. A slot is null until a later
      transaction in the chain spends that output; then it records where that spender sits on disk.
      This is how double-spending is stopped: <code>ConnectInputs()</code> refuses any
      input whose slot is already filled ("prev tx already used").
    </p>

    <h2>Anatomy of a Transaction</h2>
    <p>
      In code, a transaction is a <code>CTransaction</code> with four fields, serialized in
      the order shown. Inputs and outputs are small classes of their own, all in
      <code>main.h</code>:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>The transaction classes:</strong>
        an input names the output it spends by <code>COutPoint</code>: the hash of the
        earlier transaction and an index into its <code>vout</code>. Nothing records the
        fee; it is whatever the inputs bring in that the outputs do not pay out.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="CTransaction fields with expanded CTxIn and CTxOut classes and the implicit fee">
        ${btcFigs.txAnatomy}
      </figure>
    </div>
    <p>
      Amounts are 64-bit integers in the smallest unit: <code>COIN</code> is 100,000,000
      and <code>CENT</code> is 1,000,000, so 0.01 BTC is one <code>CENT</code>. (The word
      "satoshi" for the unit came later.) Fees were mostly optional: a transaction under
      10,000 bytes is free while the block being built holds fewer than 100 transactions.
      Otherwise <code>GetMinFee()</code> asks for 0.01 BTC per started kilobyte. Miners
      collect fees by paying themselves the subsidy plus the fees in the block's first
      transaction.
    </p>
    <p>
      The two remaining fields sketch a feature that was later abandoned. A transaction
      whose <code>nLockTime</code> is a block height the chain has not yet passed is not
      <em>final</em>. While it waits in the memory pool, a version with the same inputs and
      higher <code>nSequence</code> numbers may replace it (<code>IsNewerThan()</code>).
      An input with <code>nSequence == UINT_MAX</code> is final. The wallet shows such a
      transaction as "Open for <var>n</var> blocks".
    </p>

    <h2>Locking and Unlocking: Script</h2>
    <p>
      An output's condition is not a public-key field but a tiny program, the
      <code>scriptPubKey</code>. The input that later spends it supplies a second program,
      the <code>scriptSig</code>, which pushes the data the first one needs. The language,
      Script, is stack-based like Forth. Its only control flow is
      <code>OP_IF</code>-style branching, with no loops or backward jumps, so every script
      finishes. Satoshi later said this design allowed a great variety of transaction types
      beyond simple payments.{{cite:nakamoto-script-types}} In practice v0.1.0 writes and
      recognizes only two forms. <code>Solver()</code> in <code>script.cpp</code> matches
      outputs against these templates when the wallet signs or looks for its own coins:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>The two standard templates:</strong>
        orange data is fixed when the output is created; blue data is supplied by whoever
        spends it. <code>OP_PUBKEY</code> and <code>OP_PUBKEYHASH</code> in
        <code>Solver()</code>'s template list are placeholders that match these slots.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Pay-to-public-key and pay-to-public-key-hash scripts as token rows, locking script above unlocking script">
        ${btcFigs.scriptTemplates}
      </figure>
    </div>
    <p>
      <strong>Pay to public key</strong> locks coins directly to a 65-byte public key. v0.1.0
      uses it for coins it generates (<code>BitcoinMiner</code>), for change
      (<code>CreateTransaction</code> sends change to a key that funded the payment), and
      for pay-to-IP transfers. In those, the payee's node answers a
      <code>checkorder</code> message with a fresh key.
    </p>
    <p>
      <strong>Pay to public key hash</strong> is what a Bitcoin address encodes. The address is a
      version byte (0) plus the 20-byte <code>Hash160</code> of a public key, which is
      RIPEMD-160 of SHA-256, all in Base58Check (<code>Hash160ToAddress()</code> in
      <code>base58.h</code>). When you paste an address into the Send dialog,
      <code>ui.cpp</code> builds this script around the decoded hash before calling
      <code>SendMoney()</code>. The spender must then reveal the full public key along with
      the signature.
    </p>

    <h2>Running a Script</h2>
    <p>
      To check an input, <code>VerifySignature()</code> does not run two programs. It
      concatenates them into one: the input's <code>scriptSig</code>, then an
      <code>OP_CODESEPARATOR</code>, then the previous output's <code>scriptPubKey</code>.
      It hands the result to <code>EvalScript()</code>. The spend is valid if the program
      finishes with a true value on top of the stack:
      <code>return (stack.empty() ? false : CastToBool(stack.back()));</code>
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Pay to public key hash, step by step:</strong>
        each column is the stack after one token executes, bottom to top; a heavy border
        marks the item that step produced. <code>OP_EQUALVERIFY</code> aborts the whole
        script unless the two hashes match; <code>OP_CHECKSIG</code> pops the key and
        signature and pushes the verdict.</p>
      <figure class="ecc-figure ecc-figure--xwide" aria-label="Stack snapshots for each of the eight steps of a pay-to-public-key-hash spend">
        ${btcFigs.scriptStackP2PKH}
      </figure>
    </div>
    <p>
      The separator is there for the signature. When <code>OP_CHECKSIG</code> runs, it hashes
      the transaction together with the script from the last <code>OP_CODESEPARATOR</code>
      onward, so the signature covers the locking script but not the unlocking data (a
      signature cannot sign itself). The simpler template takes four steps:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Pay to public key:</strong>
        the key comes from the output, the signature from the input.</p>
      <figure class="ecc-figure ecc-figure--stack-small" aria-label="Stack snapshots for a pay-to-public-key spend">
        ${btcFigs.scriptStackP2PK}
      </figure>
    </div>
    <p>
      Running the spender's code and the owner's code as one program was a mistake. In
      v0.1.0, <code>OP_RETURN</code> simply jumps to the end of the script
      (<code>pc = pend</code>). A <code>scriptSig</code> of <code>OP_TRUE OP_RETURN</code>
      therefore ends execution with true on top before the owner's conditions ever run, and
      it could spend anyone's coins. The flaw went unnoticed until July 2010; v0.3.5 fixed
      it by running the two scripts separately and disabled several risky opcodes at the
      same time.{{cite:cve-2010-5141}}{{cite:opcode-disable-2010}}
    </p>

    <h2>Blocks and the Chain</h2>
    <p>
      Transactions are batched into blocks. A <code>CBlock</code> is a list of transactions,
      <code>vtx</code>, plus a header of six fields that serialize to exactly 80 bytes.
      A block's identity is the double SHA-256 of that header, and each header
      carries the hash of the one before it:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Linked headers:</strong>
        <code>hashPrevBlock</code> commits to the entire previous header, and
        <code>hashMerkleRoot</code> commits to every transaction in this block (see "Merkle
        Trees" in Cryptography Basics). Altering any old transaction changes its block's
        hash, which breaks the link from every block after it.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Three block headers linked by hashPrevBlock, with the transactions of the middle block summarized by a merkle root">
        ${btcFigs.blockChain}
      </figure>
    </div>
    <p>
      The first transaction in every block is the <strong>coinbase</strong>, the only
      transaction with no real inputs. Its single input has a null <code>prevout</code>,
      and its output pays the miner. The first block of all, the genesis block, is
      written directly into <code>main.cpp</code>. Its coinbase input carries a newspaper
      headline as proof it was not mined before January 3, 2009: <em>The Times
      03/Jan/2009 Chancellor on brink of second bailout for banks</em>.{{cite:genesis-block}}
    </p>
    <p>
      A node checks a new block in two passes. <code>CheckBlock()</code> tests what can be
      checked in isolation: size limits, a timestamp no more than two hours in the future,
      exactly one coinbase and it comes first, a header hash that meets its own
      <code>nBits</code> target, and a merkle root that matches the transactions.
      <code>AcceptBlock()</code> then checks the block against its parent: the timestamp
      must be later than the median of the previous eleven blocks, and <code>nBits</code>
      must be exactly what <code>GetNextWorkRequired()</code> demands.
    </p>

    <h2>Mining</h2>
    <p>
      Anyone may propose the next block, but a valid one is expensive to produce: its header
      hash, read as a 256-bit number, must not exceed the <strong>target</strong> encoded in
      <code>nBits</code>. SHA-256 cannot be steered, so the only way to find such a header
      is to try one variation after another. That is the proof of work. In v0.1.0 the
      search runs in <code>BitcoinMiner()</code>, a background thread that "Generate
      Coins" switches on:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>The mining loop:</strong>
        steps 1–4 build a candidate block; the diamond is the proof-of-work test, hashed
        with the prebuilt buffers <code>BlockSHA256()</code> uses for speed. A found block
        goes through <code>ProcessBlock()</code> exactly as if a peer had sent it, and
        <code>AcceptBlock()</code> relays it if it extends the best chain.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Flowchart of BitcoinMiner: choose tip, build coinbase, collect transactions, fill header, then loop over nonces until the hash meets the target">
        ${btcFigs.miningLoop}
      </figure>
    </div>
    <p>
      The 32-bit <code>nNonce</code> runs out quickly, so the miner has a second knob: the
      <code>bnExtraNonce</code> pushed into the coinbase's <code>scriptSig</code>. Each pass
      of the outer loop increments it, which changes the coinbase, so the merkle root changes,
      and the miner gets a fresh nonce space. The coinbase's output is worth
      <code>GetBlockValue(nFees)</code>, the subsidy plus all fees, and pays a newly
      generated key. Before any of that, the loop waits until the node has at least
      one peer: mining alone would only build a private chain.
    </p>

    <h2>Difficulty</h2>
    <p>
      Blocks are meant to arrive every ten minutes (<code>nTargetSpacing</code>). Satoshi
      called this a balance between fast confirmation and network latency: "The algorithm
      aims for an average of 6 blocks per hour."{{cite:nakamoto-block-interval}} Total
      hash power changes, though, so the target must move with it. Every 2,016
      blocks, two weeks' worth at the intended pace, <code>GetNextWorkRequired()</code>
      measures how long the last stretch actually took and scales the target by that
      ratio:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>The retarget rule:</strong>
        new target = old target × <code>nActualTimespan</code> ÷ two weeks. The measured span
        is clamped to between 3.5 and 56 days first, so one adjustment can change
        difficulty by at most a factor of four in either direction.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Chart of new target over old target versus actual timespan, flat at one quarter below 3.5 days, linear through 1 at 14 days, flat at 4 above 56 days">
        ${btcFigs.retargetClamp}
      </figure>
    </div>
    <p>
      A smaller target means fewer acceptable hashes, so it is harder to meet. The code walks back
      <code>nInterval - 1</code> blocks to find the start of the period. It therefore
      times 2,015 block intervals and compares them against a two-week budget sized for
      2,016, a small off-by-one that every later version keeps for compatibility. The
      target is stored in the header as a compact
      <code>nBits</code> value: one byte of exponent and three of mantissa. The genesis
      block's <code>1d00ffff</code> means <code>0x00ffff × 256<sup>(0x1d − 3)</sup></code>.
      It is also <code>bnProofOfWorkLimit</code>, the easiest target the code ever
      allows.
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Epochs and eras:</strong>
        each dot is one 2,016-block difficulty period, laid along a spiral from genesis in
        the spirit of the Anatomy of Bitcoin explorer's helix. Shading changes at every
        halving, roughly every 104 periods.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Spiral of 521 difficulty epochs shaded by subsidy era, with halving boundaries marked">
        ${btcFigs.epochSpiral}
      </figure>
    </div>

    <h2>Money Supply and Halvings</h2>
    <p>
      New coins enter circulation only through coinbase transactions, which the whitepaper
      likens to mining gold: "The steady addition of a constant of amount of new coins is
      analogous to gold miners expending resources to add gold to
      circulation."{{cite:nakamoto-whitepaper}} The whole monetary policy is three lines
      of <code>CBlock::GetBlockValue()</code>:
    </p>
    <pre class="example">int64 nSubsidy = 50 * COIN;

// Subsidy is cut in half every 4 years
nSubsidy >>= (nBestHeight / 210000);

return nSubsidy + nFees;</pre>
    <p>
      Shifting right by one bit halves a number. After every 210,000 blocks, about four years at
      ten minutes each, the shift count goes up by one. The total is a geometric series: 210,000 × 50 ×
      (1 + ½ + ¼ + …) approaches 21 million. Because the shift truncates to whole units,
      the real total falls just short, and the reward reaches zero after 33 halvings. The
      table lists each shift count with the tip heights that produce it:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Subsidy and supply:</strong>
        computed by applying the shift above to every block. Half of all coins are issued
        in the first era, three quarters by the end of the second.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Step chart of block subsidy halving every 210,000 blocks above a curve of cumulative coins approaching 21 million">
        ${btcFigs.subsidySupply}
      </figure>
    </div>
    <table class="color-key halving-schedule">
      <thead>
        <tr><th>Shift</th><th>Tip height</th><th>Subsidy (BTC)</th><th>Issued by era end</th></tr>
      </thead>
      <tbody>${btcFigs.halvingTable}
      </tbody>
    </table>
    <p>
      Two details in that line deserve a second look. First, it reads
      <code>nBestHeight</code>, the height of the current tip, not the height of the block
      being valued. A miner building block 210,001 on a tip at 210,000 is the first to get
      the reduced reward. By v0.3.10 the function takes the block's own height instead.
      Second, shifting a 64-bit integer by 64 or more places is undefined in C++. On
      common hardware the count wraps, and the subsidy would jump back to 50 coins at
      block 13,440,000, centuries from now. BIP 42 closed that hole in
      2014.{{cite:bip-42}}
    </p>

    <h2>The Network</h2>
    <p>
      There is no server. Each node listens on TCP port 8333
      (<code>DEFAULT_PORT</code>) and connects directly to others. The hard part is the
      first contact: how does a fresh install learn a single address? v0.1.0 borrows a
      public meeting place, an IRC channel:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Bootstrapping through IRC:</strong>
        <code>ThreadIRCSeed()</code> joins <code>#bitcoin</code> under a nickname that
        <em>is</em> its address: "u" followed by the Base58Check encoding of its IP and
        port. Every other nickname in the channel decodes to a peer. The IPs shown are
        documentation placeholders.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="A new node joins an IRC channel, decodes other nodes' addresses from their nicknames, then connects to them directly on port 8333">
        ${btcFigs.bootstrapIrc}
      </figure>
    </div>
    <p>
      IRC was scaffolding. Once connected, a node asks its peers for more addresses
      (<code>getaddr</code>), advertises its own (<code>addr</code>), and stores everything
      in <code>addr.dat</code> for next time. As Satoshi later put it: "Bitcoin can get the
      list of IPs from any bitcoin node. In that sense, every node serves as a directory
      server."{{cite:nakamoto-irc-temporary}}
    </p>
    <p>
      Three threads run the network. <code>ThreadSocketHandler</code> accepts connections and moves bytes,
      <code>ThreadOpenConnections2</code> dials out, and <code>ThreadMessageHandler</code>
      processes what arrives. The dialer stops once the node has 15 connections, inbound
      and outbound together. It first picks a random /24 network (a "class C") and only then
      an address inside it, so someone holding a whole block of addresses gets no more
      attention than a lone node elsewhere. Information then spreads by
      <strong>gossip</strong>:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Flooding by inventory:</strong>
        a node announces only a hash (<code>inv</code>). A neighbor that lacks the item asks
        for it (<code>getdata</code>), validates it, and announces it in turn. Duplicate
        announcements cost a few bytes and are ignored.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Peer graph in concentric rings showing a transaction relayed outward hop by hop from its origin">
        ${btcFigs.meshGossip}
      </figure>
    </div>

    <h2>Messages</h2>
    <p>
      Each message on the wire starts with the four magic bytes <code>f9 be b4 d9</code>
      (<code>pchMessageStart</code>), a 12-byte command name, and a payload length. There
      is no checksum yet. <code>ProcessMessage()</code> in <code>main.cpp</code> handles
      twelve commands, and a node must send <code>version</code> before anything else. A
      new connection unfolds like this:
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>A first conversation:</strong>
        the version exchange, address swap, and initial block download, followed later by
        ordinary transaction relay. The left margin names the code that sends or handles
        each step.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Sequence diagram of messages between a new node and a peer: version, addr, getaddr, getblocks, inv, getdata, block, then inv, getdata, tx">
        ${btcFigs.messageSequence}
      </figure>
    </div>
    <p>
      The rest of the command set reflects plans that never took hold.
      <code>checkorder</code>, <code>submitorder</code>, and <code>reply</code> carry the
      pay-to-IP protocol. You connect to the payee's address, it hands you a public key,
      and you pay that key. <code>review</code> belongs to an unfinished marketplace for
      products and user reviews (<code>market.cpp</code>). Pay-to-IP was later removed,
      and the marketplace was never finished.
    </p>

    <h2>Longest Chain Wins</h2>
    <p>
      Two miners can find blocks at nearly the same moment, and the network briefly splits.
      The whitepaper's rule resolves it: "Nodes always consider the longest chain to be
      the correct one and will keep working on extending it."{{cite:nakamoto-whitepaper}}
      In v0.1.0 "longest" is literal. <code>AddToBlockIndex()</code> makes a block the new
      tip if <code>pindexNew-&gt;nHeight &gt; nBestHeight</code>. A tie keeps whichever
      branch arrived first.
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>A reorganization:</strong>
        blocks 4 and 5 were the best chain until a competing branch reached height 6.
        Transactions from the abandoned blocks are not lost: <code>Reorganize()</code>
        collects them in <code>vResurrect</code> and hands them back to the memory pool
        to be mined again.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Fork after block 3: an old branch of blocks 4 and 5 is disconnected and a longer branch of 4', 5', 6' becomes the best chain">
        ${btcFigs.forkReorg}
      </figure>
    </div>
    <p>
      Counting blocks rather than work has a flaw: a long branch of easy blocks could beat
      a shorter branch that took more total work. Later versions compare accumulated
      work (<code>bnChainWork</code>) instead. A block whose parent is unknown is kept in
      <code>mapOrphanBlocks</code>, and the node asks the sender for the missing ancestors
      with <code>getblocks</code>.
    </p>

    <h2>Life of a Payment</h2>
    <p>
      Here is a payment from one end to the other, with the function that does each step.
      Steps 1–4 happen on the sender's machine inside <code>SendMoney()</code>. The rest
      happens on the network.
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>From click to confirmation:</strong>
        the wallet shows "<var>n</var>/unconfirmed" until a transaction is six blocks deep.
        Coins a miner generates wait longer: consensus refuses to spend them until they
        have matured for 100 blocks (<code>COINBASE_MATURITY</code>), and the wallet waits
        20 more before counting them.</p>
      <figure class="ecc-figure ecc-figure--xwide" aria-label="Six-step timeline of a payment from CreateTransaction to confirmation, above a ruler showing coinbase maturity at 100 and 120 blocks">
        ${btcFigs.paymentLifecycle}
      </figure>
    </div>
    <p>
      A confirmation is simply depth: how many blocks sit on top of the one holding your
      transaction. Each block added makes reversing the payment more expensive, because an
      attacker would have to outpace the honest network from that point forward. The
      whitepaper works out how quickly that chance falls with depth.{{cite:nakamoto-whitepaper}}
    </p>

    <h2>Where It Lives in the Code</h2>
    <p>
      Every mechanism in this chapter is a function you can read. The Reading Paths that
      follow string them together into guided tours. This table is the index:
    </p>
    <table class="color-key protocol-code-map">
      <thead>
        <tr><th>Mechanism</th><th>Definition</th><th>Where</th></tr>
      </thead>
      <tbody>${codeMapRows}
      </tbody>
    </table>
  </section>
`;
}

/**
 * "Reading Paths" chapter (end of Part I) from src/reading-paths.yaml: guided
 * tours whose steps link to source lines by page number. Requests line anchors,
 * so it must run before the chapters are rendered.
 */
function generateReadingPathsHtml() {
  if (!existsSync(READING_PATHS_PATH)) return '';
  const doc = yaml.load(readFileSync(READING_PATHS_PATH, 'utf8')) || {};
  const paths = doc.paths || [];
  if (!paths.length) return '';
  const pathsHtml = paths.map((path) => {
    let stepNum = 0;
    const steps = (path.steps || []).map((step) => {
      const r = resolveStep(step);
      if (r.error) {
        console.warn(`Warning: reading path ${path.id}: ${r.error}`);
        return '';
      }
      const id = requestLineAnchor(r.file, r.line);
      const label = r.symbol || `${r.file}:${r.line}`;
      stepNum += 1;
      return `
        <li class="reading-step" value="${stepNum}">
          <div class="reading-step-head"><code>${escapeHtml(label)}</code> <span class="xref-file">${escapeHtml(r.file)}:${r.line}</span> <a class="xref" href="#${id}"></a></div>
          <div class="reading-step-note">${step.note}</div>
        </li>`;
    }).join('');
    return `
    <h2 id="reading-path-${escapeHtml(path.id)}">${escapeHtml(path.title)}</h2>
    ${path.intro ? `<p>${path.intro.trim()}</p>` : ''}
    <ol class="reading-steps">${steps}
    </ol>`;
  }).join('\n');
  return `
  <section class="chapter concepts reading-paths" id="reading-paths">
    <h1 class="chapter-title">Reading Paths</h1>
    <p class="lead">
      The chapters that follow present the source file by file, in alphabetical order, which
      is how the code is organized but not how it runs. These tours follow the execution
      instead: each step names a function, where it lives, and the page where it begins.
      Read a path straight through for the big picture, or keep a finger here and jump.
    </p>
    ${pathsHtml}
  </section>`;
}

/**
 * Appendix "OpenSSL as Bitcoin Used It" from src/appendix/openssl.yaml: prose,
 * a table of every OpenSSL name v0.1.0 uses (scanned from the source, with page
 * links to first uses), and annotated excerpts of OpenSSL 0.9.8h
 * (src/openssl-0.9.8h/, pinned in src/openssl-manifest.json). Requests line
 * anchors, so it must run before the chapters are rendered.
 */
function generateOpenSSLAppendixHtml() {
  if (!existsSync(OPENSSL_APPENDIX_PATH)) return { html: '', glossary: [] };
  const doc = yaml.load(readFileSync(OPENSSL_APPENDIX_PATH, 'utf8')) || {};
  const manifest = loadOpenSSLManifest();
  const id = doc.id || 'openssl-appendix';
  const ctx = createCitationContext(id, GLOBAL_REFERENCES, doc);
  const prose = (text) => (text ? ctx.process(String(text)) : '');
  // Citations are numbered as processed, so process prose in reading order
  const introHtml = prose(doc.introduction);
  const functionsIntroHtml = prose(doc.functions_intro);

  // Function table: groups from the YAML, first use per file from the source scan
  const usage = scanOpenSSLUsage();
  const rows = (doc.functions || []).map((g) => {
    const firstUse = new Map(); // file -> earliest line across the group's names
    for (const name of g.names || []) {
      for (const [file, line] of usage.get(name) || []) {
        if (!firstUse.has(file) || line < firstUse.get(file)) firstUse.set(file, line);
      }
    }
    const usedIn = [...firstUse.keys()].sort().map((file) =>
      `<span class="xref-item"><span class="xref-file">${escapeHtml(file)}</span> <a class="xref" href="#${requestLineAnchor(file, firstUse.get(file))}"></a></span>`,
    ).join('<br>');
    const names = (g.names || []).map((n) => `<code>${escapeHtml(n)}</code>`).join(', ');
    return `
        <tr>
          <td><strong>${escapeHtml(g.group)}</strong><div class="openssl-names">${names}</div></td>
          <td>${prose(g.purpose)}</td>
          <td class="openssl-used-in">${usedIn}</td>
        </tr>`;
  }).join('');
  const nameCount = (doc.functions || []).reduce((n, g) => n + (g.names || []).length, 0);

  const excerptHtml = (ex) => {
    const [start, end] = ex.lines;
    const code = readOpenSSLLines(ex.file).slice(start - 1, end).join('\n');
    const label = start === end ? `line ${start}` : `lines ${start}–${end}`;
    return `
    <div class="openssl-excerpt">
      <div class="openssl-excerpt-head"><code>${escapeHtml(ex.file)}</code> <span class="xref-file">${label}</span></div>
      ${generateCodeBlockHtml(`openssl/${ex.file}`, code, getLanguage(ex.file), ex.annotations || [], ctx, start)}
    </div>`;
  };

  const sectionsHtml = (doc.sections || []).map((sec) => `
    <h2 id="${escapeHtml(`${id}-${sec.id}`)}">${escapeHtml(sec.heading)}</h2>
    ${prose(sec.text)}
    ${(sec.excerpts || []).map(excerptHtml).join('')}
    ${prose(sec.after)}`).join('\n');
  const conclusionHtml = prose(doc.conclusion);

  const glossary = Array.isArray(doc.glossary) ? doc.glossary : [];
  const glossaryHtml = glossary.length ? `
    <div class="annotation-block chapter-glossary" id="keyterms-${id}">
      <h4>Key Terms</h4>
      <dl class="glossary-list">
        ${glossary.map((g) => `<dt>${escapeHtml(String(g.term))}</dt><dd>${prose(g.definition)}</dd>`).join('\n        ')}
      </dl>
    </div>` : '';

  const licenseLines = readOpenSSLLines('LICENSE');
  if (licenseLines[licenseLines.length - 1] === '') licenseLines.pop();
  const licenseHtml = doc.license_intro ? `
    <h2 class="openssl-license-heading" id="${id}-license">OpenSSL License</h2>
    ${prose(doc.license_intro)}
    <div class="openssl-excerpt openssl-license">
      <div class="openssl-excerpt-head"><code>LICENSE</code> <span class="xref-file">OpenSSL ${escapeHtml(manifest?.version || '')}</span></div>
      ${generateCodeBlockHtml('openssl/LICENSE', licenseLines.join('\n'), 'text', [], ctx)}
    </div>` : '';

  const html = `
  <section class="chapter concepts appendix-openssl" id="${id}">
    <h1 class="chapter-title">${escapeHtml(doc.title || 'OpenSSL')}</h1>
    <span class="appendix-label">Appendix</span>
    ${introHtml}

    <h2 id="${id}-functions">What v0.1.0 Calls</h2>
    ${functionsIntroHtml}
    <table class="color-key openssl-functions">
      <thead>
        <tr><th>${nameCount} names</th><th>Used for</th><th>First use</th></tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
    ${sectionsHtml}

    <div class="annotation-block chapter-conclusion">
      <h4>Summary</h4>
      ${conclusionHtml}
    </div>
    ${glossaryHtml}
    ${ctx.renderFootnotes()}
    ${licenseHtml}
  </section>`;
  return { html, glossary, id, title: doc.title };
}

/**
 * Colophon paragraph: SHA-256 tree hash of the printed v0.1.0 source
 * (src/source-manifest.json, verified by npm run validate before every build).
 */
function sourceVerificationHtml() {
  const manifest = loadManifest();
  if (!manifest) return '';
  const groups = manifest.treeHash.match(/.{16}/g).join(' ');
  return `
    <p>
      <strong>Source verification.</strong>
      The ${manifest.fileCount} files of the source tree reproduced here (${manifest.lineCount.toLocaleString('en-US')}
      lines of C++) were checked byte for byte against the Nakamoto Institute archive of the
      January 2009 release before this edition was typeset. Their combined SHA-256 tree hash is
      <code class="source-tree-hash">${groups}</code>.
      Per-file hashes and the recipe are in <code>src/source-manifest.json</code> in the
      project repository; <code>node scripts/source-manifest.mjs</code> recomputes them.
    </p>
${opensslVerificationHtml()}`;
}

/** Colophon paragraph: provenance of the OpenSSL 0.9.8h excerpts in the appendix. */
function opensslVerificationHtml() {
  const m = loadOpenSSLManifest();
  if (!m || !existsSync(OPENSSL_APPENDIX_PATH)) return '';
  return `
    <p>
      The OpenSSL ${escapeHtml(m.version)} excerpts in the appendix are reproduced from the
      OpenSSL Project's release tarball, whose published SHA-1 is
      <code class="source-tree-hash">${escapeHtml(m.tarball.sha1)}</code>. Their per-file
      hashes are in <code>src/openssl-manifest.json</code>;
      <code>node scripts/openssl-source.mjs --tarball openssl-${escapeHtml(m.version)}.tar.gz</code>
      checks them against a downloaded copy.
    </p>
`;
}

function generateBookHtml(files) {
  const eccFigs = getEccPrimerFigures();
  const bitcoinPrimerHtml = generateBitcoinPrimerHtml(getBitcoinPrimerFigures(), generateProtocolCodeMapHtml()); // requests line anchors — before chapters
  const readingPathsHtml = generateReadingPathsHtml(); // requests line anchors — before chapters
  const opensslAppendix = generateOpenSSLAppendixHtml(); // likewise
  const printCss = readFileSync(join(STYLES_DIR, 'print.css'), 'utf8');
  const syntaxCss = readFileSync(join(STYLES_DIR, 'syntax.css'), 'utf8');
  const typefaceCss = readFileSync(join(STYLES_DIR, 'typeface.css'), 'utf8');
  // Rewrite relative font URLs so they resolve correctly from output/ (both file:// and http://)
  const typographyCss = readFileSync(join(STYLES_DIR, 'typography.css'), 'utf8')
    .replace(/url\('fonts\//g, "url('../styles/fonts/");

  // Active typeface pairing (Design System → styles/typeface.css + typefaces.json)
  let googleFontsHref = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  let typefaceMeta = { code: 'Basis Grotesque Mono Pro', body: 'Inter' };
  try {
    const tfCatalog = JSON.parse(readFileSync(join(STYLES_DIR, 'typefaces.json'), 'utf8'));
    const keyFromCss = (typefaceCss.match(/@typeface\s+(\S+)/) || [])[1];
    const pair = tfCatalog.pairs?.[keyFromCss]
      || tfCatalog.pairs?.[tfCatalog.default]
      || null;
    if (pair) {
      typefaceMeta = { code: pair.code, body: pair.body };
      if (pair.google) {
        googleFontsHref = `https://fonts.googleapis.com/css2?${pair.google}&display=swap`;
      }
    }
  } catch { /* keep defaults */ }
  
  // Generate TOC entries - start with intro sections
  let tocHtml = `
      <li class="toc-part-header">Fundamentals</li>
      <li class="toc-item">
        <span class="toc-filename">Introduction</span>
        <span class="toc-page" data-target="introduction"></span>
      </li>
      <li class="toc-item">
        <span class="toc-filename">The Road to Bitcoin</span>
        <span class="toc-page" data-target="prehistory"></span>
      </li>
      <li class="toc-item">
        <span class="toc-filename">Computer Concepts</span>
        <span class="toc-page" data-target="computer-concepts"></span>
      </li>
      <li class="toc-item">
        <span class="toc-filename">Cryptography Basics</span>
        <span class="toc-page" data-target="cryptography-primer"></span>
      </li>
      <li class="toc-item">
        <span class="toc-filename">C++ Primer</span>
        <span class="toc-page" data-target="cpp-primer"></span>
      </li>
      <li class="toc-item">
        <span class="toc-filename">The Bitcoin Protocol</span>
        <span class="toc-page" data-target="bitcoin-primer"></span>
      </li>
      <li class="toc-item">
        <span class="toc-filename">Reading Paths</span>
        <span class="toc-page" data-target="reading-paths"></span>
      </li>
      <li class="toc-part-header">The Source Code</li>
      <li class="toc-item">
        <span class="toc-filename">rc/ (Resources)</span>
        <span class="toc-page" data-target="rc-resources"></span>
      </li>`;

  // Add source files to TOC
  for (const file of files) {
    tocHtml += `
      <li class="toc-item">
        <span class="toc-filename">${escapeHtml(file.filename)}</span>
        <span class="toc-page" data-target="${file.id}"></span>
      </li>`;
  }
  
  // Add reference sections to TOC
  tocHtml += `
      <li class="toc-part-header">Reference</li>
      <li class="toc-item">
        <span class="toc-filename">What Came After</span>
        <span class="toc-page" data-target="what-came-after"></span>
      </li>${opensslAppendix.html ? `
      <li class="toc-item">
        <span class="toc-filename">Appendix: OpenSSL</span>
        <span class="toc-page" data-target="${opensslAppendix.id}"></span>
      </li>` : ''}
      <li class="toc-item">
        <span class="toc-filename">Glossary</span>
        <span class="toc-page" data-target="glossary"></span>
      </li>
      <li class="toc-item">
        <span class="toc-filename">Index</span>
        <span class="toc-page" data-target="index"></span>
      </li>
      <li class="toc-item">
        <span class="toc-filename">Colophon</span>
        <span class="toc-page" data-target="colophon"></span>
      </li>`;

  // Generate chapters
  let chaptersHtml = '';
  const glossaryTerms = new Map(); // lower-cased term -> {term, definition, chapters: [{filename, id}]}
  for (const file of files) {
    const annotation = file.annotation || {};
    const ctx = createCitationContext(file.id, GLOBAL_REFERENCES, annotation);
    const introduction = annotation.introduction ? ctx.process(annotation.introduction) : '';
    const conclusion = annotation.conclusion ? ctx.process(annotation.conclusion) : '';
    // Optional chapter glossary (Key Terms list, rendered after the summary)
    const glossary = Array.isArray(annotation.glossary) ? annotation.glossary : [];
    for (const g of glossary) {
      const key = String(g.term).toLowerCase();
      if (!glossaryTerms.has(key)) {
        glossaryTerms.set(key, { term: String(g.term), definition: String(g.definition), chapters: [] });
      }
      glossaryTerms.get(key).chapters.push({ filename: file.filename, id: file.id });
    }
    const glossaryHtml = glossary.length ? `
      <div class="annotation-block chapter-glossary" id="keyterms-${file.id}">
        <h4>Key Terms</h4>
        <dl class="glossary-list">
          ${glossary.map((g) => `<dt>${escapeHtml(String(g.term))}</dt><dd>${ctx.process(String(g.definition))}</dd>`).join('\n          ')}
        </dl>
      </div>` : '';
    // Re-render code with citations so line-note cites share chapter numbering
    const codeHtml = generateCodeBlockHtml(
      file.filename,
      file.code,
      file.language,
      annotation.annotations || [],
      ctx
    );
    const footnotesHtml = ctx.renderFootnotes();

    // Blank verso before every chapter → blank-left / intro-right opening spread
    chaptersHtml += `\n    <section class="blank-page chapter-verso"></section>`;

    // Add special class for dense/compact files
    const compactFiles = ['uibase.cpp', 'uibase.h', 'ui.cpp', 'ui.h'];
    const extraClass = file.filename === 'uiproject.fbp' ? ' chapter-dense'
                     : compactFiles.includes(file.filename) ? ' chapter-compact'
                     : '';

    chaptersHtml += `
    <section class="chapter${extraClass}" id="${file.id}">
      <span class="section-title">${escapeHtml(file.filename)}</span>
      <span class="chapter-title">Bitcoin v0.1.0</span>
      
      <header class="chapter-header">
        <h1 class="chapter-title">${escapeHtml(file.filename)}</h1>
        
        <div class="chapter-intro">
          <div class="file-info">
            <span class="lines">${file.lineCount} lines</span>
            <span class="language">${file.language.toUpperCase()}</span>
          </div>
          
          ${annotation.title ? `<h2 class="intro-title">${escapeHtml(annotation.title)}</h2>` : ''}
          
          ${introduction ? `<div class="description">${introduction}</div>` : ''}
        </div>
      </header>
      
      ${codeHtml}
      
      ${conclusion ? `
      <div class="annotation-block chapter-conclusion">
        <h4>Summary</h4>
        ${conclusion}
      </div>` : ''}
      ${glossaryHtml}
      ${footnotesHtml}
    </section>`;

  }
  
  for (const g of opensslAppendix.glossary || []) {
    const key = String(g.term).toLowerCase();
    if (!glossaryTerms.has(key)) {
      glossaryTerms.set(key, { term: String(g.term), definition: String(g.definition), chapters: [] });
    }
    glossaryTerms.get(key).chapters.push({ filename: 'Appendix: OpenSSL', id: opensslAppendix.id });
  }
  const backGlossaryHtml = generateBackGlossaryHtml(glossaryTerms);

  // Build intro sections content for index searching
  const introSectionsForIndex = `
    <section id="introduction">introduction bitcoin digital money cryptography Satoshi Nakamoto transactions blocks proof-of-work P2P network consensus main.cpp script.cpp net.cpp key.h sha.cpp double-spending verification node</section>
    <section id="prehistory">SHA-256 RIPEMD-160 merkle tree proof-of-work hashcash difficulty Hal Finney RPOW Adam Back Wei Dai b-money Nick Szabo Bit Gold David Chaum DigiCash whitepaper cypherpunk digital signature</section>
    <section id="computer-concepts">binary hexadecimal memory pointer data hash SHA-256 ECDSA public key private key</section>
    <section id="cryptography-primer">discrete logarithm elliptic curve ECC secp256k1 ECDSA SHA-256 RIPEMD-160 merkle tree proof-of-work generator point OpenSSL digital signature private key public key hash</section>
    <section id="reading-paths">transaction mining block network peer SendMoney CreateTransaction SignSignature EvalScript BitcoinMiner ProcessBlock AcceptBlock StartNode IRC version</section>
    <section id="cpp-primer">CTransaction CBlock CKey uint256 CBigNum vector map CRITICAL_BLOCK BOOST_FOREACH IMPLEMENT_SERIALIZE pointer reference class struct function</section>
    <section id="bitcoin-primer">UTXO unspent output coinbase change scriptSig scriptPubKey OP_CHECKSIG OP_DUP OP_HASH160 OP_EQUALVERIFY OP_CODESEPARATOR OP_RETURN EvalScript Solver P2PK P2PKH address block header hashPrevBlock merkle nBits nNonce target difficulty retarget GetNextWorkRequired halving subsidy GetBlockValue 21 million mining BitcoinMiner extraNonce IRC peer port 8333 gossip inv getdata getblocks version addr reorganization longest chain Reorganize confirmation COINBASE_MATURITY</section>
    <section id="what-came-after">SegWit Taproot Schnorr libsecp256k1 LevelDB Berkeley DB BIP Lightning descriptor wallet JSON-RPC testnet Bitcoin Core version release changelog P2SH bech32 Miniscript Satoshi Gavin Andresen</section>
  `;
  
  // Combine all content for index searching
  const allContentForIndex = introSectionsForIndex + chaptersHtml + opensslAppendix.html;
  const termLocations = findIndexTermLocations(allContentForIndex);
  const indexHtml = generateIndexHtml(termLocations);
  
  console.log(`   Found ${termLocations.size} index terms across ${Array.from(termLocations.values()).reduce((acc, set) => acc + set.size, 0)} locations`);
  
  const bookHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitcoin v0.1.0 — Annotated Edition</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${googleFontsHref}" rel="stylesheet">
  
  <style>
${typefaceCss}

${printCss}

${syntaxCss}

${typographyCss}

/* Additional fixes for Paged.js */
.pagedjs_page {
  background: white;
}

.pagedjs_pages {
  background: white;
}

.section-title,
.chapter-title:not(h1) {
  position: absolute;
  visibility: hidden;
  height: 0;
}
  </style>
  
  <!-- Paged.js for print pagination -->
  <script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>
</head>
<body>
  <script>
  class PageHandler extends Paged.Handler {
    constructor(chunker, polisher, caller) {
      super(chunker, polisher, caller);
    }

    // Paged.js 0.4 measures overflow per letter with floored rects, so a line
    // that exactly fills the column can lose its last letter to the next page
    // ("succeede‑" / "d as prophecy."). Never split inside a word: move the
    // break back to the word start so the whole word carries over unhyphenated.
    onPageLayout(wrapper, breakToken, layout) {
      var proto = layout && Object.getPrototypeOf(layout);
      if (!proto || proto.__wordSafeTextBreak) return;
      var textBreak = proto.textBreak;
      proto.textBreak = function (node) {
        var offset = textBreak.apply(this, arguments);
        var text = node.textContent;
        if (typeof offset === 'number' && offset > 0 &&
            /[\\w\\u00AD]/.test(text[offset - 1]) && /\\w/.test(text[offset] || '')) {
          var start = offset;
          while (start > 0 && /[\\w\\u00AD]/.test(text[start - 1])) start--;
          if (start > 0) offset = start;
        }
        return offset;
      };
      proto.__wordSafeTextBreak = true;
    }

    // A section heading that lands at the very top of a continuation page
    // keeps its margin-top, pushing it below the facing page's first line.
    // Drop the margin so both pages of a spread start on the same top edge.
    // Done at render time (not after layout) so the freed space is refilled.
    renderNode(clone) {
      if (!clone || clone.nodeType !== 1 || !/^H[2-4]$/.test(clone.tagName)) return;
      var content = clone.closest('.pagedjs_page_content');
      var continued = false;
      for (var el = clone; el && el !== content; el = el.parentElement) {
        if (el !== clone && el.hasAttribute('data-split-from')) continued = true;
        for (var prev = el.previousSibling; prev; prev = prev.previousSibling) {
          if (prev.nodeType === 3 && !prev.textContent.trim()) continue;
          if (prev.nodeType === 1 && !prev.textContent.trim() &&
              !prev.querySelector('img, svg, canvas') &&
              !/^(IMG|SVG|CANVAS|HR)$/i.test(prev.tagName)) continue;
          if (prev.nodeType === 8) continue;
          return;
        }
      }
      if (continued) clone.style.marginTop = '0';
    }

    afterRendered(pages) {
      // Fill in TOC page numbers
      var tocPages = document.querySelectorAll('.toc-page[data-target]');
      tocPages.forEach(function(tocPage) {
        var targetId = tocPage.getAttribute('data-target');
        var targetEl = document.getElementById(targetId);
        if (targetEl) {
          var page = targetEl.closest('.pagedjs_page');
          if (page) {
            var pageNum = page.getAttribute('data-page-number');
            tocPage.textContent = pageNum;
          }
        }
      });
      
      // Fill in index page numbers and link to pages
      var indexRefs = document.querySelectorAll('.index-page-ref');
      indexRefs.forEach(function(ref, idx) {
        var href = ref.getAttribute('href');
        if (href) {
          var targetId = href.replace('#', '');
          var targetEl = document.getElementById(targetId);
          if (targetEl) {
            var page = targetEl.closest('.pagedjs_page');
            if (page) {
              var pageNum = page.getAttribute('data-page-number');
              var pageId = page.id;
              // Update href to link to the page itself
              if (pageId) {
                ref.setAttribute('href', '#' + pageId);
              }
              // Add comma separator if not first ref in this entry
              var prevSibling = ref.previousElementSibling;
              var prefix = (prevSibling && prevSibling.classList.contains('index-page-ref')) ? ', ' : '';
              ref.textContent = prefix + pageNum;
            }
          }
        }
      });

      // Fill in cross-reference page numbers (Called from / reading paths)
      document.querySelectorAll('a.xref').forEach(function(ref) {
        var targetEl = document.getElementById((ref.getAttribute('href') || '').replace('#', ''));
        var page = targetEl && targetEl.closest('.pagedjs_page');
        if (!page) return;
        if (page.id) ref.setAttribute('href', '#' + page.id);
        ref.textContent = page.getAttribute('data-page-number');
      });
    }
  }

  Paged.registerHandlers(PageHandler);
  </script>
  <!-- Blank spread: opening endpapers -->
  <section class="blank-page"></section>
  <section class="blank-page"></section>

  <!-- Page 1: TITLE PAGE (right) -->
  <section class="title-page" id="front-matter">
    <div class="title-content">
      <h1 class="book-title">BITCOIN</h1>
      <p class="book-subtitle">v0.1.0</p>
      <p class="book-edition-banner">Annotated edition — ${EDITION}</p>
    </div>
    <div class="footer-content">
      <p class="copyright">Copyright (c) 2009 Satoshi Nakamoto</p>
      <p class="annotations-credit">${ANNOTATIONS_CREDIT}</p>
      ${PIRATEHASH_LOGO_SVG}
    </div>
  </section>

  <!-- Page 2: BLANK (left) -->
  <section class="blank-page"></section>

  <!-- Page 3: DEDICATION PAGE (right) -->
  <section class="dedication-page">
    <p class="dedication-text">To all bitcoiners</p>
  </section>

  <!-- Page 4: BLANK (left) -->
  <section class="blank-page"></section>

  <!-- Page 5: ACKNOWLEDGMENTS PAGE (right) -->
  <section class="acknowledgments-page">
    <h2 class="acknowledgments-title">Acknowledgments</h2>
    <p class="acknowledgments-intro">
      This book was made possible by the following sources and resources:
    </p>
    <ul class="sources-list">
      <li>
        <strong>Original Bitcoin Source Code</strong><br>
        <span class="source-url">satoshi.nakamotoinstitute.org/code</span><br>
        <span class="source-desc">Archive of Bitcoin v0.1.0 source code, preserved by the Satoshi Nakamoto Institute</span>
      </li>
      <li>
        <strong>Bitcoin Whitepaper</strong><br>
        <span class="source-url">bitcoin.org/bitcoin.pdf</span><br>
        <span class="source-desc">Satoshi Nakamoto's original paper describing the Bitcoin protocol</span>
      </li>
      <li>
        <strong>Bitcoin Wiki</strong><br>
        <span class="source-url">en.bitcoin.it</span><br>
        <span class="source-desc">Community-maintained documentation on Bitcoin internals</span>
      </li>
      <li>
        <strong>Learn Me a Bitcoin</strong><br>
        <span class="source-url">learnmeabitcoin.com</span><br>
        <span class="source-desc">Greg Walker's comprehensive Bitcoin technical guides</span>
      </li>
      <li>
        <strong>Bitcoin Stack Exchange</strong><br>
        <span class="source-url">bitcoin.stackexchange.com</span><br>
        <span class="source-desc">Q&A archive of Bitcoin technical discussions</span>
      </li>
      <li>
        <strong>Mastering Bitcoin</strong><br>
        <span class="source-url">github.com/bitcoinbook/bitcoinbook</span><br>
        <span class="source-desc">Andreas Antonopoulos's open source Bitcoin reference</span>
      </li>
      <li>
        <strong>The Genesis Book</strong><br>
        <span class="source-url">thegenesisbook.com</span><br>
        <span class="source-desc">Aaron van Wirdum's history of the people and projects that inspired Bitcoin</span>
      </li>
      <li>
        <strong>Programming Bitcoin</strong><br>
        <span class="source-url">github.com/jimmysong/programmingbitcoin</span><br>
        <span class="source-desc">Jimmy Song's hands-on guide to Bitcoin internals (O'Reilly)</span>
      </li>
    </ul>
    <p class="acknowledgments-footer">
      Special thanks to Satoshi Nakamoto for creating Bitcoin and releasing<br>
      the source code to the world.
    </p>
  </section>

  <!-- Page 6: BLANK (left) -->
  <section class="blank-page"></section>

  <!-- Page 7+: TABLE OF CONTENTS (right) -->
  <section class="toc">
    <nav>
      <ul class="toc-list">
        ${tocHtml}
      </ul>
    </nav>
  </section>

  <!-- Blank spread before Part I -->
  <section class="blank-page"></section>
  <section class="blank-page"></section>

  <!-- PART I DIVIDER (page-break-before: right handles blank page if needed) -->
  <section class="part-divider">
    <h1 class="part-title">Fundamentals</h1>
    <p class="part-subtitle">The history, cryptography, and computer science concepts behind Bitcoin</p>
  </section>

  <!-- INTRODUCTION -->
  <section class="chapter introduction" id="introduction">
    <h1 class="chapter-title">Introduction</h1>

    <p class="lead">
      For three decades before Bitcoin, cryptographers tried to build digital money.
      Every attempt failed. DigiCash went bankrupt.{{cite:chaum-digicash}} e-gold was shut down after federal
      prosecution.{{cite:egold-seizure}} Hashcash never became currency.{{cite:back-hashcash}}
      b-money{{cite:dai-bmoney}} and Bit Gold{{cite:szabo-bit-gold}} were never implemented. The deployed systems all failed the same way:
      someone had to be in charge, and whoever was in charge could be pressured,
      arrested, or simply lose interest.
    </p>

    <p>
      On October 31, 2008,{{cite:nakamoto-mailing-list-announcement}} a pseudonymous figure calling themselves Satoshi Nakamoto
      posted a nine-page paper to the Cryptography Mailing List. The paper described
      "a purely peer-to-peer version of electronic cash"{{cite:nakamoto-whitepaper}} requiring no trusted third
      party. On January 3, 2009,{{cite:genesis-block}} Nakamoto mined the first block, and six days
      later, on January 9, released the software to the public.{{cite:nakamoto-windows-only}}
    </p>

    <p>
      Embedded in that block was a message: "The Times 03/Jan/2009 Chancellor on
      brink of second bailout for banks."{{cite:times-bailout-2009}} The headline from a British newspaper
      served as both a timestamp proof—the block could not have been created before
      that date—and a declaration of intent. The 2008 financial crisis, the bank
      bailouts, the revelation that the global economy depended on institutions that
      had been gambling with depositors' money: these were the conditions that made
      Bitcoin necessary. You will meet the headline again in this book: it sits in
      the source code itself, as the <code>pszTimestamp</code> string in <code>main.cpp</code>.
    </p>

    <p>
      This book contains the complete source code of Bitcoin version 0.1.0, the
      first public release.{{cite:nakamoto-institute-code}}{{cite:readme-v001}} Roughly 20,000 lines of C++ that solved a problem widely
      considered unsolvable: how to prevent double-spending in a digital currency
      without a central authority. The code has been running continuously since
      that January day—producing a block approximately every ten minutes
      for over seventeen years.
    </p>

    <h2>Why This Code Matters</h2>
    <p>
      Every previous digital currency required trust. Trust that the operator
      wouldn't inflate the supply. Trust that they wouldn't freeze accounts. Trust
      that they wouldn't disappear. When trust was violated—or when governments
      decided the experiment had gone far enough—the money ceased to exist.
    </p>
    <p>
      Bitcoin replaced trust with verification. Every node independently validates
      every transaction against the same rules encoded in this source code. No
      company operates the network. No server can be raided to halt it. The rules
      are enforced by mathematics and by the economic self-interest of thousands of
      participants who have no reason to trust each other and don't need to.
    </p>
    <p>
      Satoshi Nakamoto's identity remains unknown. The code is public, and it
      speaks for itself.
    </p>

    <h2>How Bitcoin Works</h2>
    <p>
      The system rests on five interlocking mechanisms:
    </p>
    <ul>
      <li><strong>Transactions</strong> transfer value between addresses, authorized
          by digital signatures that prove ownership of private keys without
          revealing them.</li>
      <li><strong>Blocks</strong> bundle transactions into ordered batches. Each
          block includes the hash of the previous block, forming an append-only
          chain that cannot be altered without redoing the work of every
          subsequent block.</li>
      <li><strong>Proof-of-work</strong> requires miners to find a hash below a
          target value—a process that demands real energy expenditure. This makes
          rewriting history prohibitively expensive.</li>
      <li><strong>Peer-to-peer network</strong> connects nodes directly, with no
          central server. Transactions and blocks propagate through gossip: each
          node relays what it receives to its neighbors, reaching the entire
          network in seconds.</li>
      <li><strong>Consensus</strong> emerges from a simple rule: every node follows
          the longest valid chain—in this first release, simply the one with the
          most blocks (later versions count total work instead). No voting, no
          coordinator, no authority.</li>
    </ul>
    <p>
      The key files that implement this system are:
    </p>
    <ul>
      <li><strong>main.cpp</strong> — Block validation, mining, consensus rules, and the genesis block</li>
      <li><strong>script.cpp</strong> — A stack-based virtual machine for programmable spending conditions</li>
      <li><strong>net.cpp</strong> — Peer-to-peer networking, message relay, and node discovery</li>
      <li><strong>key.h</strong> — A thin wrapper around OpenSSL's elliptic-curve signatures on secp256k1</li>
      <li><strong>sha.cpp</strong> — A fast SHA-256 core, borrowed from Wei Dai's Crypto++ library, that powers the mining loop</li>
    </ul>

    <h2>Reading the Code</h2>
    <p>
      You do not need to be a programmer to read this book. Each source file begins
      with an introduction explaining its role in the system, and margin annotations
      throughout highlight what matters and why. The syntax highlighting makes the
      structure of the code visible at a glance:
    </p>

    <table class="color-key">
      <thead>
        <tr>
          <th>Element</th>
          <th>Example</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Keywords</td>
          <td><code><span class="token keyword">if</span></code> <code><span class="token keyword">int</span></code> <code><span class="token keyword">return</span></code> <code><span class="token keyword">class</span></code></td>
        </tr>
        <tr>
          <td>Functions</td>
          <td><code><span class="token function">GetHash</span>()</code> <code><span class="token function">printf</span>()</code></td>
        </tr>
        <tr>
          <td>Strings</td>
          <td><code><span class="token string">"hello"</span></code> <code><span class="token string">'A'</span></code></td>
        </tr>
        <tr>
          <td>Numbers</td>
          <td><code><span class="token number">42</span></code> <code><span class="token number">0x1F</span></code> <code><span class="token number">3.14</span></code></td>
        </tr>
        <tr>
          <td>Comments</td>
          <td><code><span class="token comment">// Satoshi's notes</span></code></td>
        </tr>
        <tr>
          <td>Operators</td>
          <td><code><span class="token operator">+</span></code> <code><span class="token operator">==</span></code> <code><span class="token operator">&&</span></code> <code><span class="token operator">-></span></code></td>
        </tr>
      </tbody>
    </table>

    <p>
      Pay particular attention to the comments—the gray italic text beginning with
      <code>//</code>. These are Satoshi's own explanations, written as the code
      was developed. They reveal the reasoning behind design decisions that are
      not always obvious from the code alone.
    </p>

    <h2>What You Will Find</h2>
    <p>
      This book is organized to build understanding progressively:
    </p>
    <ul>
      <li><strong>The Road to Bitcoin</strong> traces the cryptographic ideas and
          failed projects that preceded Satoshi's synthesis—from Diffie-Hellman{{cite:diffie-hellman-1976}}
          to DigiCash{{cite:chaum-digicash}} to Hal Finney's RPOW.{{cite:finney-rpow}}</li>
      <li><strong>Computer Concepts</strong> and <strong>Cryptography Basics</strong>
          provide the technical foundation needed to follow the code: binary
          arithmetic, hash functions, elliptic curves, digital signatures.</li>
      <li><strong>C++ Primer</strong> explains the programming language, file
          structure, and idioms you will encounter.</li>
      <li><strong>The Source Code</strong> presents every file from Bitcoin v0.1.0,
          annotated line by line with explanations of what the code does,
          why Satoshi designed it that way, and what happened to it afterward.</li>
    </ul>
    <p>
      Version 0.1.0 is remarkably complete. The fundamental architecture—the UTXO
      model, proof-of-work consensus, peer-to-peer gossip, the 21-million-coin
      halving schedule, and the basic shape of the scripting system—remains
      recognizable after seventeen years and
      over a trillion dollars in value secured. Understanding this code means
      understanding Bitcoin at its deepest level: not what it does, but how and why.
    </p>
  </section>

  <!-- PRE-HISTORY OF BITCOIN -->
  <section class="chapter concepts" id="prehistory">
    <h1 class="chapter-title">The Road to Bitcoin</h1>

    <p class="lead">
      Bitcoin did not emerge from nothing. It stands on three decades of
      cryptographic research and a graveyard of failed digital currencies.
      Each predecessor solved part of the puzzle and failed on the rest.
      Understanding what came before reveals what made Satoshi's synthesis
      different from everything that preceded it.
    </p>

    <h2>The Cypherpunk Dream</h2>
    <p>
      In 1992, a group of cryptographers, programmers, and privacy advocates began
      meeting in the San Francisco Bay Area and communicating over an unmoderated mailing list.
      They called themselves the <strong>cypherpunks</strong>—a portmanteau of
      "cipher" and "cyberpunk." Eric Hughes wrote in "A Cypherpunk's Manifesto" (1993):
      "Privacy is necessary for an open society in the electronic age…
      Cypherpunks write code."{{cite:hughes-cypherpunk-manifesto}}
    </p>
    <p>
      Among their goals was anonymous digital cash—money that couldn't be traced,
      frozen, or confiscated. For the next decade and a half the list's members designed, debated,
      and sometimes built systems to achieve this. Every attempt failed. But their
      failures mapped the problem space that Satoshi would eventually solve.
    </p>

    <h2>Public Key Cryptography (1976)</h2>
    <p>
      In 1976, Whitfield Diffie and Martin Hellman published "New Directions in
      Cryptography,"{{cite:diffie-hellman-1976}} introducing the concept of <strong>public key cryptography</strong>.
      Before this, sharing encrypted messages required both parties to have the same
      secret key—but how do you securely share that key in the first place?
    </p>
    <p>
      Diffie-Hellman solved this with an elegant mathematical trick: each party
      has a private key they never share and a public key they broadcast to the world.
      The math allows two parties to compute a shared secret without ever transmitting it:
    </p>
    <pre class="example">Public: prime p, generator g

Alice (private a):          Bob (private b):
Computes A = g^a mod p      Computes B = g^b mod p
Sends A to Bob              Sends B to Alice
Computes B^a mod p          Computes A^b mod p

Shared secret: g^(ab) mod p (same for both!)</pre>
    <p>
      An eavesdropper sees g, A, and B, but cannot compute g^(ab) mod p without
      knowing either a or b. This insight—that you can publish part of your key without
      compromising your secrets—is the foundation of all cryptocurrency.
    </p>
    <p>
      The Bitcoin whitepaper doesn't cite Diffie and Hellman, but every Bitcoin
      signature descends from their idea. Your Bitcoin public key can be shared with
      the world, yet no one can work backward to your private key: Bitcoin's
      elliptic-curve signatures rest on the same kind of hard problem—the discrete
      logarithm—that protects Diffie-Hellman key exchange.
    </p>

    <h2>David Chaum's DigiCash (1989)</h2>
    <p>
      Cryptographer David Chaum invented <strong>blind signatures</strong> and
      founded DigiCash in 1989—the first attempt at cryptographic digital cash.{{cite:chaum-digicash}}
      His "eCash" system used clever math to make transactions untraceable while
      preventing double-spending.
    </p>
    <p>
      The problem: DigiCash required a central server to validate transactions.
      When the company went bankrupt in 1998, the money system died with it.{{cite:chaum-digicash}}
      <strong>Lesson learned: centralization is a single point of failure.</strong>
    </p>

    <h2>Hashcash (1997)</h2>
    <p>
      Adam Back, a British cryptographer, invented <strong>Hashcash</strong> to
      combat email spam.{{cite:back-hashcash}} The idea: require senders to compute a partial hash
      collision before sending email. Finding such a collision takes CPU work—
      trivial for one email, prohibitive for millions of spam messages.
    </p>
    <pre class="example">Hashcash header: 1:20:060408:adam@cypherspace.org::1QTjaYd7niiQA/sc:ePa

The sender must find a value where SHA1(header) starts with 20 zero bits.
This requires ~2^20 hash computations—about a second of CPU time.

Check it yourself: SHA1 of this exact header begins 00000a4a…
—five zero hex digits, or 20 zero bits.</pre>
    <p>
      The Bitcoin whitepaper explicitly cites Hashcash in its references.{{cite:nakamoto-whitepaper}}{{cite:back-hashcash}} Satoshi
      adapted the concept: instead of proving work to send email, miners prove
      work to add blocks. The difficulty is adjusted so the network collectively
      finds one valid proof every 10 minutes on average. Every 2,016 blocks—about two
      weeks at ten minutes each—v0.1.0 measures how long they actually took and raises
      or lowers the target to match (<code>nTargetSpacing = 10 * 60</code> in
      <code>main.cpp</code>).
    </p>

    <h2>b-money (1998)</h2>
    <p>
      Wei Dai, a cypherpunk and computer scientist, proposed <strong>b-money</strong>—
      a theoretical system for anonymous digital cash.{{cite:dai-bmoney}} His paper describes:
    </p>
    <ul>
      <li>Money created through proof-of-work</li>
      <li>Transactions broadcast to all participants</li>
      <li>A collective ledger maintained by the network</li>
      <li>Contracts enforced by deposits and arbitration</li>
    </ul>
    <p>
      Sound familiar? Wei Dai's b-money was never implemented, but Satoshi cited
      it first in the Bitcoin whitepaper's references.{{cite:nakamoto-whitepaper}}{{cite:dai-bmoney}} In early emails, Satoshi
      told Wei Dai: "I was very interested to read your b-money page. I'm getting
      ready to release a paper that expands on your ideas into a complete working
      system."{{cite:nakamoto-dai-email}}
    </p>
    <p>
      Fittingly, Wei Dai's own code ships inside Bitcoin v0.1.0: the SHA-256 routine
      in <code>sha.cpp</code>, which Bitcoin's miner runs over and over in its search
      for a valid block, comes from his Crypto++ library.
    </p>

    <h2>Bit Gold (1998-2005)</h2>
    <p>
      Nick Szabo was the son of a Hungarian refugee who fled after Soviet troops
      crushed the 1956 revolt. This shaped his distrust of government overreach
      and drew him to Hayek's writings on monetary economics. After studying
      computer science and working at NASA's Jet Propulsion Laboratory, he joined
      the cypherpunks and briefly worked at DigiCash in Amsterdam.{{cite:van-wirdum-genesis-book}}{{cite:chaum-digicash}}
    </p>
    <p>
      At DigiCash, Szabo saw firsthand how easy it was to manipulate balances
      in a centralized system. This led to his influential essay "Trusted Third
      Parties Are Security Holes"{{cite:szabo-trusted-third-parties}}—the insight that any system depending on a
      central party inherits that party's vulnerabilities, whether from hackers,
      rogue employees, or government pressure.
    </p>
    <p>
      Szabo designed <strong>Bit Gold</strong> to eliminate trusted third parties
      entirely.{{cite:szabo-bit-gold}} His system used proof-of-work to create tokens, chained hashes
      together (each valid hash becoming the input for the next), and proposed
      a distributed "property club" to track ownership. It was never implemented,
      but its architecture clearly influenced Bitcoin.{{cite:szabo-bit-gold}}
    </p>

    <h2>Merkle Trees (1979)</h2>
    <p>
      Ralph Merkle invented the <strong>Merkle tree</strong>—a data structure
      that efficiently summarizes large amounts of data into a single hash.{{cite:merkle-1980}}
      His original patent was for digital signatures, but the concept proved
      far more versatile.
    </p>
    <pre class="example">        Merkle Root
           /    \\
       H(AB)    H(CD)
       /  \\    /  \\
     H(A) H(B) H(C) H(D)
      |    |    |    |
     Tx1  Tx2  Tx3  Tx4</pre>
    <p>
      Bitcoin uses Merkle trees to commit to all transactions in a block while
      enabling "light clients" that can verify transaction inclusion without
      downloading the entire blockchain. The whitepaper's Section 7 explicitly
      credits "Protocols for Public Key Cryptosystems" (Merkle, 1980).{{cite:nakamoto-whitepaper}}{{cite:merkle-1980}}
    </p>

    <h2>Timestamping (1991)</h2>
    <p>
      Stuart Haber and W. Scott Stornetta published "How to Time-Stamp a Digital
      Document"{{cite:haber-stornetta-1991}}—a system that proves when a document existed by linking
      each timestamp to the hash of the one before it. Their follow-up work (1993)
      added Merkle trees, so that many documents could be summarized in a single
      hash. Both ideas directly influenced Bitcoin's blockchain structure.
    </p>
    <p>
      The Bitcoin whitepaper cites three Haber-Stornetta papers.{{cite:nakamoto-whitepaper}}{{cite:haber-stornetta-1991}} Their idea of
      chaining hashes together—where each timestamp includes the hash of the
      previous one—is exactly how Bitcoin blocks link together.
    </p>

    <h2>RPOW: Reusable Proof of Work (2004)</h2>
    <p>
      Hal Finney graduated top of his high-school class and studied engineering
      at Caltech, then spent years
      developing video games for Intellivision and Atari before becoming a
      core contributor to PGP.{{cite:van-wirdum-genesis-book}} Unlike some cypherpunks, Finney was a pragmatist.
      He didn't believe cryptography could create an anarchist utopia: "…there
      is no such place as cyberspace. I am not in cyberspace now; I am in
      California. … It is the government in physical space I fear. Its agents
      carry physical guns which shoot real bullets."{{cite:finney-cyberspace-1994}}
    </p>
    <p>
      Still, Finney wanted electronic cash to exist. In 2004, he launched
      <strong>RPOW</strong> (Reusable Proofs of Work).{{cite:finney-rpow}} Users would generate
      a hashcash-style proof-of-work and exchange it for a token. That token
      could then be transferred to others, who would redeem it for a fresh
      token—making the proof of work reusable.
    </p>
    <p>
      To prevent double-spending without trusting the server operator (himself),
      Finney ran RPOW on tamper-proof IBM hardware that could cryptographically
      prove it was running unmodified open-source code.{{cite:finney-rpow}} It was clever, but RPOW
      failed to gain users. The tokens had no reason to hold value—Moore's Law
      would make them cheaper to produce over time—and without users, there was
      nothing to buy.
    </p>
    <p>
      When Satoshi announced Bitcoin on the cryptography mailing list in 2008,{{cite:nakamoto-mailing-list-announcement}}
      Hal Finney was among the first to respond positively. He missed the January 9
      launch; his node joined around block 49 on January 10 (as recorded in a
      <code>debug.log</code> file he later shared when reporting a crash), and on
      January 12 he received the first Bitcoin transaction from one person to
      another: 10 BTC from Satoshi in block 170.{{cite:finney-crash-debuglog-2009}}{{cite:waltz-1stbitcoinminer}}{{cite:finney-first-tx}}
      Finney ran one of the first Bitcoin nodes and contributed code fixes before
      his death in 2014.
    </p>

    <h2>Satoshi's Synthesis</h2>
    <p>
      Every predecessor solved part of the puzzle:
    </p>
    <table class="color-key">
      <thead>
        <tr>
          <th>Innovation</th>
          <th>Contribution</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Diffie-Hellman / RSA</td>
          <td>Cryptographic keys for identity</td>
        </tr>
        <tr>
          <td>DigiCash</td>
          <td>Blind signatures (but centralized)</td>
        </tr>
        <tr>
          <td>Hashcash</td>
          <td>Proof-of-work as rate limiting</td>
        </tr>
        <tr>
          <td>b-money</td>
          <td>Decentralized ledger concept</td>
        </tr>
        <tr>
          <td>Bit Gold</td>
          <td>Chained proof-of-work tokens</td>
        </tr>
        <tr>
          <td>Merkle trees</td>
          <td>Efficient data commitment</td>
        </tr>
        <tr>
          <td>Haber-Stornetta</td>
          <td>Hash-linked timestamping</td>
        </tr>
        <tr>
          <td>RPOW</td>
          <td>Transferable proof-of-work</td>
        </tr>
      </tbody>
    </table>
    <p>
      Satoshi's breakthrough was not any single invention but a synthesis—combining
      these existing pieces with one novel insight:
    </p>
    <figure class="synthesis-diagram" aria-label="Prior innovations converging into Bitcoin via difficulty adjustment">
      <div class="synth-stage synth-prior">
        <div class="synth-stage-label">Prior innovations</div>
        <div class="synth-cols">
          <div class="synth-col">
            <div class="synth-col-head">Identity</div>
            <ul>
              <li>Diffie-Hellman</li>
              <li>RSA, ECC</li>
              <li>Public Keys</li>
            </ul>
          </div>
          <div class="synth-col">
            <div class="synth-col-head">Proof-of-work</div>
            <ul>
              <li>Hashcash</li>
              <li>b-money</li>
              <li>Bit Gold</li>
            </ul>
          </div>
          <div class="synth-col">
            <div class="synth-col-head">History</div>
            <ul>
              <li>Haber-Stornetta</li>
              <li>Merkle Trees</li>
              <li>Hash chains</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="synth-join" aria-hidden="true">
        <div class="synth-join-stems">
          <span></span><span></span><span></span>
        </div>
        <div class="synth-join-bar"></div>
        <div class="synth-join-arrow"></div>
      </div>

      <div class="synth-stage synth-insight">
        <div class="synth-stage-label">Satoshi's insight</div>
        <div class="synth-insight-title">Proof-of-work consensus</div>
        <p class="synth-insight-eq">Proof-of-work + time target = decentralized consensus</p>
        <p class="synth-insight-quote">nTargetSpacing = 10 minutes; retarget every two weeks</p>
      </div>

      <div class="synth-join synth-join-simple" aria-hidden="true">
        <div class="synth-join-arrow"></div>
      </div>

      <div class="synth-stage synth-bitcoin">
        <div class="synth-stage-label">Bitcoin</div>
        <p class="synth-bitcoin-tag">Trustless Digital Cash</p>
      </div>
    </figure>
    <p>
      Use proof-of-work not just to create money, but to reach <strong>consensus</strong>
      about which transactions are valid. The longest valid chain is the true
      history, and a difficulty target adjusted every two weeks keeps new blocks
      arriving at a steady pace. No trusted party needed—just math and economic incentives.
    </p>
    <p>
      As Satoshi wrote: "A lot of people automatically dismiss e-currency as a
      lost cause because of all the companies that failed since the 1990's. I hope
      it's obvious it was only the centrally controlled nature of those systems
      that doomed them."{{cite:nakamoto-central-control-quote}}
    </p>
  </section>

  <section class="blank-page"></section>

  <!-- COMPUTER CONCEPTS -->
  <section class="chapter concepts" id="computer-concepts">
    <h1 class="chapter-title">Computer Concepts</h1>

    <p class="lead">
      Before diving into the code, it helps to understand the fundamental concepts
      that appear throughout Bitcoin's implementation. None of this is difficult,
      but the code will make much more sense with these building blocks in place.
    </p>

    <h2>Bits and Bytes</h2>
    <p>
      A <strong>bit</strong> is the smallest unit of data—a single 0 or 1. 
      Eight bits make a <strong>byte</strong>, which can represent values 
      from 0 to 255. All computer data, from text to images to Bitcoin 
      transactions, is ultimately stored as bytes.
    </p>
    <p>
      Common sizes you'll see in Bitcoin:
    </p>
    <table class="color-key">
      <tr><th>Size</th><th>Usage</th></tr>
      <tr><td><strong>32 bits (4 bytes)</strong></td><td>Standard integers, timestamps</td></tr>
      <tr><td><strong>64 bits (8 bytes)</strong></td><td>Large numbers, Bitcoin amounts (in the smallest unit, 10⁻⁸ BTC—later nicknamed a satoshi)</td></tr>
      <tr><td><strong>160 bits (20 bytes)</strong></td><td>Bitcoin addresses (RIPEMD-160 hash)</td></tr>
      <tr><td><strong>256 bits (32 bytes)</strong></td><td>SHA-256 hashes, private keys</td></tr>
    </table>
    
    <h2>Binary (Base-2)</h2>
    <p>
      Computers think in <strong>binary</strong>—base-2, using only 0 and 1. 
      Each position represents a power of 2:
    </p>
    <pre class="example">Binary:  1 0 1 1 0 1
         │ │ │ │ │ └─ 1 × 1  = 1
         │ │ │ │ └─── 0 × 2  = 0
         │ │ │ └───── 1 × 4  = 4
         │ │ └─────── 1 × 8  = 8
         │ └───────── 0 × 16 = 0
         └─────────── 1 × 32 = 32
                            ────
         Decimal: 45</pre>
    
    <h2>Hexadecimal (Base-16)</h2>
    <p>
      Binary is verbose, so programmers use <strong>hexadecimal</strong> (hex)—base-16. 
      It uses digits 0-9 and letters A-F (where A=10, B=11, ... F=15). Each hex 
      digit represents exactly 4 bits:
    </p>
    <pre class="example">Hex:  0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F
Dec:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15</pre>
    <p>
      Bitcoin hashes are typically shown in hex. A 256-bit hash becomes 64 hex characters:
    </p>
    <pre class="example">000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f</pre>
    <p>
      This is the hash of Bitcoin's genesis block—the first block ever mined.{{cite:genesis-block}}
    </p>
    <p>
      Text is just bytes too. The genesis block coinbase embeds a newspaper
      headline as ASCII—each character is one byte, which you can also write as
      hex or binary. Here is the opening of that message:{{cite:times-bailout-2009}}
    </p>
    <pre class="example">ASCII:  T  h  e     T  i  m  e  s     0  3  /  J  a  n  /  2  0  0  9
Hex:   54 68 65 20 54 69 6d 65 73 20 30 33 2f 4a 61 6e 2f 32 30 30 39

Binary (first four bytes — "The "):
  'T'  = 01010100 = 0x54
  'h'  = 01101000 = 0x68
  'e'  = 01100101 = 0x65
  ' '  = 00100000 = 0x20

Full string: "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"</pre>
    <p>
      Same data, three notations: readable text (ASCII), compact hex, and the
      bits the machine actually stores. The rest of the book flips between these
      views constantly—especially once byte <em>order</em> enters the picture.
    </p>
    
    <h2>Little Endian vs Big Endian</h2>
    <p>
      When storing multi-byte numbers, computers must decide which byte comes first. 
      <strong>Big endian</strong> stores the most significant byte first (like how 
      we write numbers). <strong>Little endian</strong> stores the least significant 
      byte first.
    </p>
    <pre class="example">Number: 0x12345678 (305,419,896 in decimal)

Big Endian:    [12] [34] [56] [78]  (most significant first)
Little Endian: [78] [56] [34] [12]  (least significant first)</pre>
    <p>
      Bitcoin uses little endian for most internal data but big endian for 
      displaying hashes. This can be confusing—the genesis block hash shown 
      above is actually stored in reverse order internally.
    </p>
    
    <h2>Memory and Pointers</h2>
    <p>
      Computer memory is like a vast array of numbered boxes, each holding one byte. 
      The box number is called an <strong>address</strong>. A <strong>pointer</strong> 
      is a variable that stores an address—it "points to" data elsewhere in memory.
    </p>
    <p>
      In C++ code, you'll see:
    </p>
    <ul>
      <li><code>*ptr</code> — The value that ptr points to</li>
      <li><code>&amp;var</code> — The address of var</li>
      <li><code>ptr-&gt;field</code> — Access a field through a pointer</li>
    </ul>
    
    <h2>Data Types</h2>
    <p>
      Bitcoin uses several C++ data types:
    </p>
    <ul>
      <li><code>int</code> — Integer (usually 32 bits)</li>
      <li><code>int64</code> — 64-bit integer (for Bitcoin amounts)</li>
      <li><code>unsigned</code> — Non-negative integers only</li>
      <li><code>char</code> — Single byte, often used for raw data</li>
      <li><code>string</code> — Text or arbitrary byte sequences</li>
      <li><code>vector</code> — Resizable array</li>
      <li><code>map</code> — Key-value dictionary</li>
      <li><code>bool</code> — True or false</li>
    </ul>
    
    <h2>Cryptographic Hashing</h2>
    <p>
      A <strong>hash function</strong> takes any input and produces a fixed-size 
      output (the "hash" or "digest"). Bitcoin primarily uses SHA-256,{{cite:fips-180-2}} which 
      always produces 256 bits.
    </p>
    <p>
      Key properties:
    </p>
    <ul>
      <li><strong>Deterministic</strong> — Same input always gives same output</li>
      <li><strong>One-way</strong> — Cannot reverse a hash to find the input</li>
      <li><strong>Avalanche effect</strong> — Tiny input change completely changes output</li>
      <li><strong>Collision resistant</strong> — Practically impossible to find two inputs with same hash</li>
    </ul>
    <pre class="example">SHA256("Bitcoin") = 
  b4056df6691f8dc72e56302ddad345d65fead3ead9299609a826e2344eb63aa4

SHA256("bitcoin") =  (just lowercase 'b')
  6b88c087247aa2f07ee1c5956b8e1a9f4c7f892a70e324f1bb3d161e05ca107b</pre>
    
    <h2>Public Key Cryptography</h2>
    <p>
      Bitcoin uses <strong>elliptic curve cryptography</strong> for digital signatures. 
      You have two related keys:
    </p>
    <ul>
      <li><strong>Private key</strong> — A secret 256-bit number. Never share this!</li>
      <li><strong>Public key</strong> — Derived from the private key. Safe to share.</li>
    </ul>
    <p>
      The private key can sign messages; anyone with the public key can verify 
      the signature is authentic. This is how Bitcoin proves ownership—only the 
      holder of the private key can sign transactions spending their coins.
    </p>
    
    <h2>Reading C++ Syntax</h2>
    <p>
      Some patterns you'll encounter:
    </p>
    <ul>
      <li><code>// comment</code> — Single-line comment (explanatory text)</li>
      <li><code>/* comment */</code> — Multi-line comment</li>
      <li><code>if (condition) { ... }</code> — Conditional execution</li>
      <li><code>for (init; condition; increment) { ... }</code> — Loop</li>
      <li><code>class Name { ... };</code> — Define a data structure</li>
      <li><code>return value;</code> — Exit function with result</li>
      <li><code>#include</code> — Import another file</li>
      <li><code>#define</code> — Create a constant or macro</li>
    </ul>
  </section>
  
  <section class="blank-page"></section>

  <!-- CRYPTOGRAPHY CONCEPTS -->
  <section class="chapter concepts" id="cryptography-primer">
    <h1 class="chapter-title">Cryptography Basics</h1>
    
    <p class="lead">
      Bitcoin's security rests on mathematical foundations developed over decades
      of cryptographic research. The two pillars—digital signatures and hash
      functions—are not merely implementation details but the reason Bitcoin works
      at all. Understanding them reveals why the system is secure and what would
      have to break for it to fail.
    </p>
    
    <h2>Two Pillars of Bitcoin Cryptography</h2>
    <table class="color-key">
      <thead>
        <tr>
          <th></th>
          <th>ECDSA</th>
          <th>SHA-256</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Purpose</td>
          <td>Proves ownership</td>
          <td>Creates fingerprints</td>
        </tr>
        <tr>
          <td>Used for</td>
          <td>Signing transactions</td>
          <td>Mining, block hashes, Merkle trees</td>
        </tr>
        <tr>
          <td>Property</td>
          <td>Asymmetric (public/private keys)</td>
          <td>One-way (irreversible)</td>
        </tr>
      </tbody>
    </table>
    <p>
      <strong>ECDSA</strong> lets you prove you own coins without revealing your
      private key. <strong>SHA-256</strong> creates a practically unique 256-bit fingerprint
      of any data—change one bit and the hash changes completely.
    </p>
    
    <h2>The Discrete Logarithm Problem</h2>
    <p>
      Many cryptographic systems rely on operations that are easy in one 
      direction but practically impossible to reverse. Consider this:
    </p>
    <pre class="example">Easy:    3^15 mod 17 = 6      (compute in milliseconds)
Hard:    3^? mod 17 = 6       (which exponent gives 6?)</pre>
    <p>
      For small numbers, you can try all possibilities. But with 256-bit
      numbers, there are roughly as many possibilities as atoms in the
      observable universe.
      This asymmetry—easy forward, impossible backward—is the foundation 
      of public key cryptography.
    </p>
    
    <h2>Elliptic Curve Cryptography (ECC)</h2>
    <p>
      Bitcoin uses a specific type of discrete logarithm problem based on 
      <strong>elliptic curves</strong>. An elliptic curve is defined by an 
      equation like:
    </p>
    <pre class="example"><span class="token variable">y</span>² = <span class="token variable">x</span>³ + <span class="token variable">ax</span> + <span class="token variable">b</span>

<span class="token class-name">Bitcoin</span> (<span class="token variable">secp256k1</span>): <span class="token variable">y</span>² = <span class="token variable">x</span>³ + <span class="token number">7</span>   (<span class="token variable">a</span>=<span class="token number">0</span>, <span class="token variable">b</span>=<span class="token number">7</span>)</pre>
    <p>
      The curve has a distinctive shape—symmetric about the x-axis, with a 
      rounded "nose" on the left and extending to infinity on the right. The figure
      below stacks neighboring curves <span class="token variable">y</span>² = <span class="token variable">x</span>³ + <span class="token variable">b</span>
      to show how secp256k1 sits in its family.
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Curve family along z:</strong>
        each slice is <span class="token variable">y</span>² = <span class="token variable">x</span>³ + <span class="token variable">b</span> for <span class="token variable">b</span> = 7 + <span class="token variable">z</span>.
        Red = secp256k1 at <span class="token variable">z</span> = 0 · cyan = smaller <span class="token variable">b</span> · orange = larger <span class="token variable">b</span>.</p>
      <figure class="ecc-figure ecc-figure--narrow" aria-label="Family of real elliptic curves y squared equals x cubed plus seven plus z, with secp256k1 highlighted at z equals zero">
        ${eccFigs.curveSpatial}
      </figure>
    </div>
    <pre class="example"><span class="token class-name">Weierstrass family</span>
<span class="token variable">y</span>² = <span class="token variable">x</span>³ + (7 + <span class="token variable">z</span>)   ·  slices Δ<span class="token variable">z</span> = <span class="token number">1</span>
<span class="token variable">z</span> = <span class="token number">0</span>  →  secp256k1: <span class="token variable">y</span>² = <span class="token variable">x</span>³ + <span class="token number">7</span>
<span class="token variable">z</span> &lt; <span class="token number">0</span>  →  smaller <span class="token variable">b</span> (cyan)   ·  <span class="token variable">z</span> &gt; <span class="token number">0</span>  →  larger <span class="token variable">b</span> (orange)</pre>
    <p>
      In real cryptography the coordinates are not arbitrary-precision reals: they live
      in a <strong>finite field</strong> <span class="token variable">𝔽<sub>p</sub></span>
      (for secp256k1, a huge prime <span class="token variable">p</span>). Addition
      still follows chord-and-tangent, but values wrap modulo <span class="token variable">p</span>.
      A tiny field makes the pattern visible—each valid <span class="token variable">(x, y)</span>
      pair below satisfies <span class="token variable">y</span>² ≡ <span class="token variable">x</span>³ + 7 (mod 17):
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>𝔽<sub>17</sub> schematic grid:</strong>
        each ● is an integer pair (<span class="token variable">x</span>, <span class="token variable">y</span>) with
        <span class="token variable">y</span>² ≡ <span class="token variable">x</span>³ + 7 (mod 17).
        Orange midline = <span class="token variable">y</span> = <span class="token variable">p</span>/2 (negation mirror).</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Toy elliptic curve points over the field with seventeen elements">
        ${eccFigs.finiteFieldToy}
      </figure>
    </div>
    <pre class="example"><span class="token class-name">Modular picture</span> (toy field)
Prime <span class="token variable">p</span> = <span class="token number">17</span>. Integer pairs (<span class="token variable">x</span>, <span class="token variable">y</span>) with <span class="token variable">y</span>² ≡ <span class="token variable">x</span>³ + <span class="token number">7</span> (mod <span class="token variable">p</span>).
Negation (<span class="token variable">x</span>, <span class="token variable">y</span>) ↦ (<span class="token variable">x</span>, −<span class="token variable">y</span>) reflects across <span class="token variable">y</span> = <span class="token variable">p</span>/<span class="token number">2</span> (orange).</pre>
    <p>
      Raise the prime and the same equation just plants more dots on a finer lattice—
      still discrete, still mirrored across <span class="token variable">y</span> = <span class="token variable">p</span>/2.
      Bitcoin’s field is so large that a literal plot is impossible; the right panel is only a
      density schematic.
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>Same curve, larger fields:</strong>
        𝔽<sub>17</sub> → 𝔽<sub>251</sub> (real points) → secp256k1 schematic
        (<span class="token variable">p</span> ≈ 2²⁵⁶, ~10⁷⁷ points — faked density so the scale jump is visible).
        Orange midline = negation in every panel.</p>
      <figure class="ecc-figure ecc-figure--wide" aria-label="Scale comparison of elliptic curve points over F17, F251, and secp256k1">
        ${eccFigs.finiteFieldScale}
      </figure>
    </div>
    <p>
      The scatter plot looks nothing like the smooth curve over ℝ — and that is
      the point. Because both <span class="token variable">x</span>
      and <span class="token variable">y</span> wrap at <span class="token variable">p</span>
      (0 and <span class="token variable">p</span> are the same value), it helps to picture
      the grid with its top edge glued to its bottom and its left edge glued to its
      right—like a Pac-Man screen. Gluing one pair of opposite edges gives a cylinder;
      gluing both pairs gives a <strong>torus</strong>. This is a visualization aid, not
      literal geometry—though, fittingly, over the complex numbers an elliptic curve
      really is a torus.
    </p>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>From flat square to torus:</strong> identifying opposite edges.
        <span class="token variable">a</span> = cyan · <span class="token variable">b</span> = red — roll the sheet until the <span class="token variable">a</span>-edges meet (cylinder), then bend and glue <span class="token variable">b</span>.</p>
      <figure class="ecc-figure ecc-figure--xwide" aria-label="Step-by-step: flat square to torus by identifying opposite edges">
        ${eccFigs.planeToTorus}
      </figure>
    </div>
    <div class="ecc-block">
      <p class="ecc-caption"><strong>From flat grid to torus:</strong> modular wrapping in both axes.
        𝔽<sub>17</sub> (<span class="token variable">p</span> = 17); ● = <span class="token variable">y</span>² ≡ <span class="token variable">x</span>³ + 7 (mod 17).
        <span class="token variable">a</span> = top/bottom (cyan) · <span class="token variable">b</span> = left/right (red).
        Torus maps the same curve points — secp256k1 uses <span class="token variable">p</span> ≈ 2²⁵⁶ (same topology, vastly larger).</p>
      <figure class="ecc-figure ecc-figure--xwide" aria-label="How the flat finite field grid wraps into a torus">
        ${eccFigs.torus}
      </figure>
    </div>
    <p>
      For any point <span class="token variable">P</span> = (<span class="token variable">x</span>, <span class="token variable">y</span>) on the curve, negation is reflection across the
      horizontal midline: −<span class="token variable">P</span> = (<span class="token variable">x</span>, −<span class="token variable">y</span> mod <span class="token variable">p</span>).
      On the torus this flips each cross-section circle top-to-bottom.
      Addition still follows chord-and-tangent — but now the "line" wraps modulo <span class="token variable">p</span>.
    </p>
    <p>
      The points on an elliptic curve form a group under a geometric operation
      called <strong>point addition</strong> (chord-and-tangent).{{cite:song-programming-bitcoin}}
      Over ℝ the picture is easy to draw; over 𝔽<sub>p</sub> the same algebra holds with
      modular arithmetic. The rules in brief:
    </p>
    <ul>
      <li><strong>Identity</strong> 𝒪 (the point at infinity): <span class="token variable">P</span> ⊕ 𝒪 = <span class="token variable">P</span>.</li>
      <li><strong>Negation</strong>: −<span class="token variable">P</span> = (<span class="token variable">x</span>, −<span class="token variable">y</span>). The vertical line through <span class="token variable">P</span> and −<span class="token variable">P</span> meets the curve at 𝒪, so <span class="token variable">P</span> ⊕ (−<span class="token variable">P</span>) = 𝒪.</li>
      <li><strong>Addition</strong> <span class="token variable">P</span> ⊕ <span class="token variable">Q</span> (<span class="token variable">P</span> ≠ <span class="token variable">Q</span>): draw the line through both points; it hits the curve again at <span class="token variable">R′</span>; reflect across the x-axis to get <span class="token variable">R</span> = <span class="token variable">P</span> ⊕ <span class="token variable">Q</span>.</li>
      <li><strong>Doubling</strong> 2<span class="token variable">P</span> = <span class="token variable">P</span> ⊕ <span class="token variable">P</span>: same idea with the <em>tangent</em> at <span class="token variable">P</span>.</li>
      <li><strong>Subtraction</strong>: <span class="token variable">P</span> − <span class="token variable">Q</span> := <span class="token variable">P</span> ⊕ (−<span class="token variable">Q</span>).</li>
    </ul>
    <div class="ecc-block ecc-block--sheet">
      <p class="ecc-caption"><strong>Group law on y² = x³ + 7:</strong>
        (a) chord through <span class="token variable">P</span>, <span class="token variable">Q</span> → reflect <span class="token variable">R′</span> → <span class="token variable">R</span>;
        (b) tangent at <span class="token variable">P</span> → 2<span class="token variable">P</span>;
        (c) vertical line → identity 𝒪;
        (d) subtract by adding −<span class="token variable">Q</span>.</p>
      <figure class="ecc-figure ecc-figure--xwide" aria-label="Elliptic curve group law: addition, doubling, inverse, and subtraction">
        ${eccFigs.pointOpsGrid}
      </figure>
    </div>
    <p>
      Over 𝔽<sub>17</sub> the same recipe is pure arithmetic. Take two dots from
      the toy grid, <span class="token variable">P</span> = (5, 8) and
      <span class="token variable">Q</span> = (6, 6). The usual chord formulas apply,
      with every result reduced mod 17:
    </p>
    <pre class="example">slope  s  = (6 − 8) / (6 − 5) = −2 ≡ 15         (mod 17)
x₃ = s² − x₁ − x₂ = 225 − 5 − 6 = 214 ≡ 10       (mod 17)
y₃ = s(x₁ − x₃) − y₁ = 15·(5 − 10) − 8 = −83 ≡ 2 (mod 17)

P ⊕ Q = (10, 2)     check: 2² = 4,  10³ + 7 = 1007 ≡ 4 (mod 17) ✓</pre>
    <p>
      Using these operations, you can compute kG (adding G to itself k times):
    </p>
    <pre class="example"><span class="token class-name">G</span> + <span class="token class-name">G</span> = <span class="token number">2</span><span class="token class-name">G</span>
<span class="token number">2</span><span class="token class-name">G</span> + <span class="token class-name">G</span> = <span class="token number">3</span><span class="token class-name">G</span>
...
<span class="token variable">k</span><span class="token class-name">G</span> = <span class="token class-name">P</span>    (add <span class="token class-name">G</span> to itself <span class="token variable">k</span> times)</pre>
    <p>
      Given G and P, finding k is the <strong>elliptic curve discrete logarithm 
      problem</strong>—believed to be computationally infeasible for large k.
    </p>
    <p>
      Bitcoin uses the <strong>secp256k1</strong> curve, where k is your private 
      key and P is your public key. Anyone can verify that P = kG, but nobody 
      can determine k from P alone.
    </p>
    
    <h3>The Generator Point G</h3>
    <p>
      The generator point G is a specific point on the secp256k1 curve that serves
      as the starting point for all key derivations. It's a publicly known constant—
      everyone uses the same G. The secp256k1 generator point coordinates are:
    </p>
    <pre class="example"><span class="token class-name">G</span>.<span class="token variable">x</span> = <span class="token number">0x79BE667EF9DCBBAC55A06295CE870B07</span>
       <span class="token number">029BFCDB2DCE28D959F2815B16F81798</span>

<span class="token class-name">G</span>.<span class="token variable">y</span> = <span class="token number">0x483ADA7726A3C4655DA4FBFC0E1108A8</span>
       <span class="token number">FD17B448A68554199C47D08FFB10D4B8</span></pre>
    <p>
      These coordinates look random, and their derivation was never publicly
      explained—but the curve's other parameters are deliberately simple:
      the prime p = 2²⁵⁶ − 2³² − 977, and the coefficients a = 0, b = 7.
      (The choice of G doesn't affect security—any generator of the group is
      equally hard to attack.) Contrast NIST's P-256 curve, whose coefficients
      come from an unexplained random seed; after the 2013 Dual_EC_DRBG
      revelations, secp256k1's transparent, "nothing up my sleeve" parameters
      looked prescient.{{cite:dual-ec-drbg}} Satoshi didn't define G in Bitcoin's code; he used OpenSSL's built-in
      <code class="token variable">NID_secp256k1</code> curve identifier, which includes G and all other
      curve parameters.{{cite:openssl-license}}
    </p>
    <p>
      When you generate a Bitcoin key pair:
    </p>
    <pre class="example"><span class="token comment">// Your private key: a random 256-bit number</span>
<span class="token variable">k</span> = <span class="token number">0x1</span> <span class="token keyword">to</span> <span class="token number">0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFE</span>
    <span class="token number">BAAEDCE6AF48A03BBFD25E8CD0364140</span>

<span class="token comment">// Your public key: k times G (point multiplication)</span>
<span class="token class-name">P</span> = <span class="token variable">k</span> × <span class="token class-name">G</span>

<span class="token comment">// Computing P from k: ~0.001 seconds</span>
<span class="token comment">// Computing k from P: longer than the age of the universe (all computers on Earth)</span></pre>
    <p>
      This asymmetry—trivial to compute forward, impossible to reverse—is why
      your public key (and Bitcoin address) can be safely shared while your
      private key must remain secret.
    </p>
    
    <h3>A Note on the Source Code</h3>
    <p>
      You won't find elliptic curve math in Bitcoin's source code. Satoshi 
      delegated all the elliptic-curve cryptography to <strong>OpenSSL</strong>,{{cite:openssl-license}}
      a battle-tested library. (The one exception elsewhere: the miner's inner loop
      uses a public-domain SHA-256 routine borrowed from Wei Dai's Crypto++, in
      <code>sha.cpp</code>.) In <code>key.h</code>, the entire CKey class 
      is a thin wrapper around OpenSSL functions:
    </p>
    <pre class="example"><span class="token comment">// Condensed from key.h - Satoshi's entire ECC implementation:</span>
<span class="token class-name">EC_KEY</span><span class="token operator">*</span> <span class="token variable">pkey</span> <span class="token operator">=</span> <span class="token function">EC_KEY_new_by_curve_name</span>(<span class="token variable">NID_secp256k1</span>);  <span class="token comment">// Create key</span>
<span class="token function">EC_KEY_generate_key</span>(<span class="token variable">pkey</span>);                           <span class="token comment">// Generate keypair</span>
<span class="token function">ECDSA_sign</span>(...);                                     <span class="token comment">// Sign data</span>
<span class="token function">ECDSA_verify</span>(...);                                   <span class="token comment">// Verify signature</span></pre>
    <p>
      The point addition, scalar multiplication, and all the complex curve 
      arithmetic live inside OpenSSL's compiled libraries. This was wise—
      cryptographic code is notoriously difficult to implement securely, and
      using a well-audited library avoided potential vulnerabilities.
      The appendix at the back of the book, <em>OpenSSL as Bitcoin Used It</em>,
      follows these calls into the library's own source.
    </p>
    
    <h2>Digital Signatures (ECDSA)</h2>
    <p>
      Bitcoin uses the <strong>Elliptic Curve Digital Signature Algorithm</strong> 
      (ECDSA) to prove ownership. When you spend bitcoins, you create a 
      signature that proves you know the private key without revealing it.
    </p>
    <pre class="example">Signing (private key k, message m):
1. Pick a fresh secret random nonce j
2. Compute R = jG; let r = R.x mod n
3. Compute s = (hash(m) + r × k) / j   (all mod n)
4. Signature is (r, s)

Verification (public key P, message m, signature (r, s)):
1. u1 = hash(m) / s,  u2 = r / s   (mod n)
2. Compute the point u1×G + u2×P
3. Valid if its x-coordinate equals r</pre>
    <p>
      Here n is the number of points in the group generated by G, and
      "dividing" means multiplying by a modular inverse.
      The signature proves you know k (private key) because only someone
      who knows k could produce an s that satisfies the verification equation.
    </p>
    <p>
      The nonce j must be secret and never reused: sign two messages with the
      same nonce and anyone can solve for your private key. Signing is only as
      strong as its randomness—in August 2013, a weakness in Android's secure
      random number generator forced an urgent security alert for every Bitcoin
      wallet app on that platform.{{cite:android-securerandom-2013}}
    </p>
    
    <h2>Hash Functions in Bitcoin</h2>
    <p>
      Bitcoin uses several hash functions for different purposes:
    </p>
    
    <h3>SHA-256 (Secure Hash Algorithm)</h3>
    <p>
      The primary hash function.{{cite:fips-180-2}} Takes any input and produces a 256-bit output.
      Used for:
    </p>
    <ul>
      <li>Block hashes (proof-of-work mining)</li>
      <li>Transaction IDs</li>
      <li>Merkle tree construction</li>
    </ul>

    <h4>How SHA-256 Works (Step by Step)</h4>
    <p>
      SHA-256 processes input through four main steps:
    </p>

    <h4>Step 1: Padding</h4>
    <p>
      The message is padded to a multiple of 512 bits: append a '1' bit, 
      then '0' bits, then the original length as a 64-bit integer.
    </p>
    
    <h4>Step 2: Initialize Hash Values</h4>
    <p>
      Eight 32-bit words are initialized from the square roots of the 
      first 8 primes:
    </p>
    <pre class="example">H0 = 0x6a09e667   H4 = 0x510e527f
H1 = 0xbb67ae85   H5 = 0x9b05688c
H2 = 0x3c6ef372   H6 = 0x1f83d9ab
H3 = 0xa54ff53a   H7 = 0x5be0cd19</pre>
    
    <h4>Step 3: Process Blocks (64 Rounds)</h4>
    <p>
      For each 512-bit block, run 64 rounds of compression. Each round:
    </p>
    <pre class="example">T1 = h + S1(e) + Ch(e,f,g) + K[t] + W[t]
T2 = S0(a) + Maj(a,b,c)

Then rotate: h=g, g=f, f=e, e=d+T1, d=c, c=b, b=a, a=T1+T2</pre>
    <p>
      The operations mix bits thoroughly:
    </p>
    <ul>
      <li><strong>Ch</strong> (Choose): if e then f else g</li>
      <li><strong>Maj</strong> (Majority): majority vote of a,b,c</li>
      <li><strong>S0, S1</strong>: rotate and XOR operations</li>
      <li><strong>K[t]</strong>: 64 constants from cube roots of primes</li>
      <li><strong>W[t]</strong>: message schedule derived from input</li>
    </ul>
    
    <h4>Step 4: Output</h4>
    <p>
      Concatenate the final H0-H7 values to produce 256 bits (64 hex chars):
    </p>
    <pre class="example">SHA256("Bitcoin") = b4056df6691f8dc72e56302ddad345d65...</pre>
    <p>
      The key insight: every bit of input affects every bit of output through
      64 rounds of mixing. The constants K[0..63] are derived from cube roots
      of the first 64 primes—nothing up anyone's sleeve.
    </p>
    <p>
      Bitcoin often uses <strong>double SHA-256</strong> (SHA256(SHA256(x))).
      Satoshi never explained why; a common reading is that it guards against
      length-extension attacks.
    </p>

    <h3>The Avalanche Effect</h3>
    <p>
      A critical property of cryptographic hash functions is the <strong>avalanche effect</strong>:
      changing even a single character in the input produces a completely different hash.
      This makes it impossible to predict or reverse-engineer the output:
    </p>
    <pre class="example"><span class="token keyword">Input:</span>  <span class="token string">"The Times 03/Jan/2009"</span>
<span class="token function">SHA256:</span> <span class="token number">99fc2183119bc964034d6da7acdee6b4a0c379da75e076edb8f66a78a345afc8</span>

<span class="token keyword">Input:</span>  <span class="token string">"The Times 03/Jan/2008"</span>  <span class="token comment">// Changed 2009 → 2008</span>
<span class="token function">SHA256:</span> <span class="token number">55a253ca0bca02e1e5c2f1924b59fa626aecda10ae2d844937fa9868bc9cea5c</span>

<span class="token keyword">Input:</span>  <span class="token string">"the Times 03/Jan/2009"</span>  <span class="token comment">// Changed T → t</span>
<span class="token function">SHA256:</span> <span class="token number">d91f6a7a6095c6c936748d7fbd31171f8831538947e782ac1eeb6f648129afc5</span></pre>
    <p>
      Notice how changing just one digit (2009→2008) or one letter's case (T→t)
      produces a hash that shares virtually nothing with the original. Because the
      hash commits to every byte, the headline can't be altered after the fact
      without producing a completely different block hash. That is what makes
      Satoshi's embedded Times headline a timestamp: the block couldn't have been
      created before that headline existed.{{cite:times-bailout-2009}}{{cite:genesis-block}}
    </p>
    
    <h3>RIPEMD-160</h3>
    <p>
      A 160-bit hash function used in combination with SHA-256 to create 
      Bitcoin addresses:
    </p>
    <pre class="example">Public Key (65 bytes)
    ↓ SHA-256
256-bit hash
    ↓ RIPEMD-160
160-bit hash (20 bytes)
    ↓ Base58Check encoding
Bitcoin Address (e.g., 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa)</pre>
    <p>
      RIPEMD-160 shortens the result to 20 bytes, keeping addresses compact.
      Satoshi never explained why he paired two different hash functions; a
      common reading is defense in depth, since an attacker would have to
      defeat both to forge a matching public key.
    </p>
    
    <h2>Merkle Trees</h2>
    <p>
      A <strong>Merkle tree</strong> is a data structure that efficiently 
      summarizes many items into a single hash.{{cite:merkle-1980}} Each Bitcoin block contains 
      a Merkle root that commits to all transactions in the block.
    </p>
    <pre class="example">        Merkle Root
           /    \\
       H(AB)    H(CD)
       /  \\    /  \\
     H(A) H(B) H(C) H(D)
      |    |    |    |
     Tx1  Tx2  Tx3  Tx4</pre>
    <p>
      To prove Tx2 is in the block, you need only Tx2 itself, H(A), and
      H(CD): hash upward and compare with the Merkle root—not all four
      transactions. This enables "light clients" 
      that verify transactions without downloading the entire blockchain.
    </p>
    
    <h2>Proof of Work</h2>
    <p>
      Mining is a cryptographic lottery.{{cite:back-hashcash}} Miners must find a number (nonce) 
      such that the block's hash starts with many zeros:
    </p>
    <pre class="example">Target (v0.1.0 minimum difficulty): hash must be less than
        00000000ffff0000000000000000000000000000000000000000000000000000

Miner tries (hash = double SHA-256 of the block header):
  nonce=0: hash = 7f3a2b... (too high)
  nonce=1: hash = 9c4d5e... (too high)
  nonce=2: hash = 1b8f7a... (too high)
  ...billions of attempts...
  nonce=2083236893: hash =
    000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f (valid!)</pre>
    <p>
      That last line is real: it is the nonce and hash of the genesis block.{{cite:genesis-block}}
      Because SHA-256 is unpredictable, the only way to find a valid nonce
      is trial and error. The difficulty adjusts so that the network finds
      a block approximately every 10 minutes, regardless of total computing power.
      In v0.1.0 this is <code>nTargetSpacing = 10 * 60</code> seconds, and the target
      is recalculated every two weeks' worth of blocks (14 days ÷ 10 minutes =
      2,016 blocks), not continuously.
    </p>
    
    <h2>Why This Matters</h2>
    <p>
      These cryptographic primitives work together to create Bitcoin's 
      security model:
    </p>
    <ul>
      <li><strong>Private keys</strong> prove ownership (discrete log is hard)</li>
      <li><strong>Signatures</strong> authorize transactions (ECDSA)</li>
      <li><strong>Hashes</strong> create unique identifiers and commitments</li>
      <li><strong>Merkle trees</strong> efficiently verify inclusion</li>
      <li><strong>Proof of work</strong> makes history tamper-proof</li>
    </ul>
    <p>
      No trusted authority is needed—mathematics provides the guarantees.
    </p>
  </section>

  <section class="blank-page"></section>

  <section class="blank-page"></section>

  <!-- C++ PRIMER -->
  <section class="chapter concepts" id="cpp-primer">
    <h1 class="chapter-title">C++ Primer</h1>

    <p class="lead">
      Bitcoin is written in C++, a language that gives the programmer direct control
      over memory, performance, and system resources—at the cost of considerable
      complexity. This primer covers the syntax, patterns, and file organization
      you will encounter in the source code. You do not need to understand every
      line to follow the annotations, but knowing these basics will make the
      architecture visible.
    </p>

    <h2>File and Directory Structure</h2>
    <p>
      Bitcoin v0.1.0 follows traditional C++ project conventions. Understanding
      the file organization helps you navigate the codebase and understand how
      the pieces fit together.
    </p>

    <h3>Header Files (.h) vs Source Files (.cpp)</h3>
    <p>
      C++ splits code into two file types for a crucial reason: <strong>separate
      compilation</strong>. A large project like Bitcoin would take forever to
      compile if every change required recompiling everything.
    </p>
    <ul>
      <li>
        <strong>Header files (.h)</strong> — Contain <em>declarations</em>: class
        definitions, function signatures, constants, and type definitions. They
        describe <em>what</em> exists without providing implementation details.
        Headers are "included" by other files that need to use those declarations.
      </li>
      <li>
        <strong>Source files (.cpp)</strong> — Contain <em>implementations</em>:
        the actual code for functions declared in headers. Each .cpp file is
        compiled independently into an "object file," then all object files are
        linked together into the final executable.
      </li>
    </ul>
    <pre class="example"><span class="token comment">// main.h (header - declarations)</span>
<span class="token keyword">class</span> <span class="token class-name">CBlock</span> <span class="token punctuation">{</span>
<span class="token keyword">public</span><span class="token punctuation">:</span>
    <span class="token keyword">int</span> nVersion<span class="token punctuation">;</span>
    uint256 <span class="token function">GetHash</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>  <span class="token comment">// declared but not implemented</span>
<span class="token punctuation">}</span><span class="token punctuation">;</span>

<span class="token comment">// main.cpp (source - implementations)</span>
<span class="token keyword">#include</span> <span class="token string">"main.h"</span>

uint256 <span class="token class-name">CBlock</span><span class="token punctuation">::</span><span class="token function">GetHash</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token comment">// actual implementation here</span>
    <span class="token keyword">return</span> <span class="token function">Hash</span><span class="token punctuation">(</span><span class="token function">BEGIN</span><span class="token punctuation">(</span>nVersion<span class="token punctuation">)</span><span class="token punctuation">,</span> <span class="token function">END</span><span class="token punctuation">(</span>nNonce<span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span></pre>
    <p>
      This separation means changing a function's implementation (in .cpp) only
      requires recompiling that one file. Changing a header requires recompiling
      everything that includes it—which is why headers change less frequently.
    </p>

    <h3>The #include Directive</h3>
    <p>
      The <code>#include</code> directive literally copies the contents of another
      file into the current file before compilation:
    </p>
    <pre class="example"><span class="token keyword">#include</span> <span class="token string">"main.h"</span>      <span class="token comment">// Local file (in same project)</span>
<span class="token keyword">#include</span> <span class="token operator">&lt;</span>vector<span class="token operator">&gt;</span>      <span class="token comment">// System/library file</span>
<span class="token keyword">#include</span> <span class="token operator">&lt;</span>openssl<span class="token operator">/</span>sha<span class="token punctuation">.</span>h<span class="token operator">&gt;</span>  <span class="token comment">// External library</span></pre>
    <p>
      Quotes ("") search the local directory first; angle brackets (&lt;&gt;) search
      system include paths. Bitcoin's <code>headers.h</code> is a "precompiled header"
      that includes all commonly needed files in one place—a pattern that speeds up
      compilation.
    </p>

    <div style="break-before: page;"></div>
    <h3>Bitcoin v0.1.0 File Organization</h3>
    <table class="color-key">
      <thead>
        <tr><th>File</th><th>Purpose</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Core Logic</strong></td>
          <td></td>
        </tr>
        <tr>
          <td>main.cpp / main.h</td>
          <td>Blockchain, consensus, mining, transactions</td>
        </tr>
        <tr>
          <td>script.cpp / script.h</td>
          <td>Script interpreter for spending conditions</td>
        </tr>
        <tr>
          <td>net.cpp / net.h</td>
          <td>P2P networking and message handling</td>
        </tr>
        <tr>
          <td>market.cpp / market.h</td>
          <td>Peer-to-peer marketplace: signed product listings and reviews (unfinished)</td>
        </tr>
        <tr>
          <td>db.cpp / db.h</td>
          <td>Berkeley DB persistence layer{{cite:bdb-license}}</td>
        </tr>
        <tr>
          <td><strong>Cryptography</strong></td>
          <td></td>
        </tr>
        <tr>
          <td>key.h</td>
          <td>Elliptic curve key management (secp256k1)</td>
        </tr>
        <tr>
          <td>sha.cpp / sha.h</td>
          <td>SHA-256 hash implementation</td>
        </tr>
        <tr>
          <td>bignum.h</td>
          <td>Arbitrary-precision arithmetic (wraps OpenSSL)</td>
        </tr>
        <tr>
          <td>uint256.h</td>
          <td>256-bit unsigned integer for hashes</td>
        </tr>
        <tr>
          <td>base58.h</td>
          <td>Base58Check encoding for addresses</td>
        </tr>
        <tr>
          <td><strong>Infrastructure</strong></td>
          <td></td>
        </tr>
        <tr>
          <td>serialize.h</td>
          <td>Binary serialization for network/disk</td>
        </tr>
        <tr>
          <td>util.cpp / util.h</td>
          <td>Utility functions, logging, argument parsing</td>
        </tr>
        <tr>
          <td>irc.cpp / irc.h</td>
          <td>IRC-based peer discovery (bootstrap)</td>
        </tr>
        <tr>
          <td>headers.h</td>
          <td>Precompiled header (includes everything)</td>
        </tr>
        <tr>
          <td><strong>User Interface</strong></td>
          <td></td>
        </tr>
        <tr>
          <td>ui.cpp / ui.h</td>
          <td>wxWidgets GUI application code{{cite:wxwidgets-license}}</td>
        </tr>
        <tr>
          <td>uibase.cpp / uibase.h</td>
          <td>Auto-generated GUI base classes</td>
        </tr>
        <tr>
          <td><strong>Build &amp; Config</strong></td>
          <td></td>
        </tr>
        <tr>
          <td>makefile</td>
          <td>MinGW GCC build instructions (Windows)</td>
        </tr>
        <tr>
          <td>makefile.vc</td>
          <td>Windows Visual C++ build instructions</td>
        </tr>
        <tr>
          <td>ui.rc</td>
          <td>Windows resource file (icons, metadata)</td>
        </tr>
        <tr>
          <td>rc/</td>
          <td>Icon and toolbar bitmap files referenced by ui.rc</td>
        </tr>
        <tr>
          <td>uiproject.fbp</td>
          <td>wxFormBuilder project (GUI designer)</td>
        </tr>
      </tbody>
    </table>
    <div style="break-after: page;"></div>

    <h3>Why Header-Only Files?</h3>
    <p>
      Some Bitcoin files are "header-only" (no corresponding .cpp file):
      <code>key.h</code>, <code>bignum.h</code>, <code>uint256.h</code>,
      <code>base58.h</code>, <code>serialize.h</code>. This pattern is used when:
    </p>
    <ul>
      <li>The code is mostly <strong>template</strong> code (must be in headers due to C++ rules)</li>
      <li>The code is <strong>small enough</strong> that inline compilation is efficient</li>
      <li>The code <strong>wraps external libraries</strong> (like OpenSSL) with thin adapters</li>
    </ul>
    <p>
      Header-only code is simpler to use (just #include it) but increases compile
      time since it's recompiled in every file that includes it.
    </p>

    <h3>The Makefile</h3>
    <p>
      The <code>makefile</code> tells the compiler how to build the project. It
      specifies which files to compile, what compiler flags to use, and what
      libraries to link:
    </p>
    <pre class="example"># Abridged from the v0.1.0 makefile

# Precompile the shared header once
headers.h.gch: headers.h $(HEADERS) net.h irc.h market.h uibase.h ui.h
    g++ -c $(CFLAGS) -o $@ $&lt;

# Compile main.cpp into obj/main.o (object file)
obj/main.o: main.cpp $(HEADERS) net.h market.h sha.h
    g++ -c $(CFLAGS) -o $@ $&lt;

# Link all object files into the final executable
bitcoin.exe: headers.h.gch $(OBJS)
    g++ $(CFLAGS) -mwindows ... -o $@ $(LIBPATHS) $(OBJS) $(LIBS)

# $(LIBS) includes -l db_cxx (Berkeley DB), -l eay32 (OpenSSL), wxWidgets ...</pre>
    <p>
      Bitcoin v0.1.0 includes two makefiles: <code>makefile</code> for MinGW GCC
      and <code>makefile.vc</code> for Microsoft's Visual C++. Both target
      Windows—the only platform v0.1.0 supported.{{cite:nakamoto-windows-only}}
    </p>

    <h3>Resource and Project Files</h3>
    <ul>
      <li>
        <strong>ui.rc</strong> — Windows resource file. Defines the application
        icon, version info, and other Windows-specific metadata that gets embedded
        in the .exe file.
      </li>
      <li>
        <strong>uiproject.fbp</strong> — wxFormBuilder project file (XML format).
        Satoshi used this visual designer to create the GUI, then generated
        <code>uibase.cpp</code> and <code>uibase.h</code> from it. The .fbp file
        is the "source" for the GUI layout.
      </li>
    </ul>

    <h2>Basic Syntax</h2>
    <p>
      Every C++ statement ends with a semicolon. Blocks of code are grouped 
      with curly braces:
    </p>
    <pre class="example"><span class="token keyword">int</span> x <span class="token operator">=</span> <span class="token number">5</span><span class="token punctuation">;</span>              <span class="token comment">// statement ends with ;</span>
<span class="token keyword">if</span> <span class="token punctuation">(</span>x <span class="token operator">&gt;</span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>            <span class="token comment">// block starts with {</span>
    <span class="token function">DoSomething</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
    <span class="token function">DoSomethingElse</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span>                       <span class="token comment">// block ends with }</span></pre>
    <p>
      Comments explain code without affecting execution:
    </p>
    <pre class="example"><span class="token comment">// This is a single-line comment</span>

<span class="token comment">/* This is a
   multi-line comment */</span></pre>
    
    <h2>Variables and Data Types</h2>
    <p>
      Variables store data. You must declare their type:
    </p>
    <pre class="example"><span class="token keyword">int</span> count <span class="token operator">=</span> <span class="token number">10</span><span class="token punctuation">;</span>           <span class="token comment">// integer (whole number)</span>
<span class="token keyword">double</span> price <span class="token operator">=</span> <span class="token number">19.99</span><span class="token punctuation">;</span>     <span class="token comment">// floating-point (decimal)</span>
<span class="token keyword">char</span> letter <span class="token operator">=</span> <span class="token string">'A'</span><span class="token punctuation">;</span>        <span class="token comment">// single character</span>
<span class="token keyword">bool</span> isValid <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>      <span class="token comment">// boolean (true/false)</span>
<span class="token keyword">string</span> name <span class="token operator">=</span> <span class="token string">"Satoshi"</span><span class="token punctuation">;</span>  <span class="token comment">// text string</span></pre>
    
    <h3>Signed vs Unsigned</h3>
    <p>
      Integers can be <strong>signed</strong> (positive or negative) or 
      <strong>unsigned</strong> (non-negative only). Unsigned integers can 
      store larger positive values:
    </p>
    <pre class="example"><span class="token keyword">int</span> balance <span class="token operator">=</span> <span class="token operator">-</span><span class="token number">100</span><span class="token punctuation">;</span>            <span class="token comment">// signed: -2B to +2B</span>
<span class="token keyword">unsigned int</span> amount <span class="token operator">=</span> <span class="token number">4000000000</span><span class="token punctuation">;</span>  <span class="token comment">// unsigned: 0 to 4B</span>

<span class="token comment">// Bitcoin uses specific-width types:</span>
<span class="token keyword">int64</span> nValue<span class="token punctuation">;</span>        <span class="token comment">// 64-bit signed (-9e18 to +9e18)</span>
<span class="token keyword">uint64</span> nAmount<span class="token punctuation">;</span>      <span class="token comment">// 64-bit unsigned (0 to 18e18)</span>
<span class="token keyword">unsigned char</span> byte<span class="token punctuation">;</span>  <span class="token comment">// 8-bit unsigned (0 to 255)</span></pre>
    <p>
      Bitcoin amounts are stored as <code>int64</code> in satoshis (1 BTC = 
      100,000,000 satoshis), allowing for 8 decimal places of precision.
    </p>
    
    <h3>Type Casting</h3>
    <p>
      Converting between types is called <strong>casting</strong>:
    </p>
    <pre class="example"><span class="token keyword">int</span> a <span class="token operator">=</span> <span class="token number">5</span><span class="token punctuation">;</span>
<span class="token keyword">int</span> b <span class="token operator">=</span> <span class="token number">2</span><span class="token punctuation">;</span>
<span class="token keyword">double</span> result <span class="token operator">=</span> <span class="token punctuation">(</span><span class="token keyword">double</span><span class="token punctuation">)</span>a <span class="token operator">/</span> b<span class="token punctuation">;</span>  <span class="token comment">// Cast a to double: 2.5</span>
                                <span class="token comment">// Without cast: 2 (integer division)</span>

<span class="token comment">// C++ style casts (more explicit):</span>
int64 n <span class="token operator">=</span> <span class="token keyword">static_cast</span><span class="token operator">&lt;</span>int64<span class="token operator">&gt;</span><span class="token punctuation">(</span>value<span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// Pointer casts (reinterpret raw bytes):</span>
<span class="token keyword">unsigned</span> <span class="token keyword">char</span><span class="token operator">*</span> pch <span class="token operator">=</span> <span class="token punctuation">(</span><span class="token keyword">unsigned</span> <span class="token keyword">char</span><span class="token operator">*</span><span class="token punctuation">)</span><span class="token operator">&amp;</span>nValue<span class="token punctuation">;</span></pre>
    
    <h2>Operators</h2>
    <pre class="example"><span class="token comment">// Arithmetic</span>
a <span class="token operator">+</span> b    <span class="token comment">// addition</span>
a <span class="token operator">-</span> b    <span class="token comment">// subtraction</span>
a <span class="token operator">*</span> b    <span class="token comment">// multiplication</span>
a <span class="token operator">/</span> b    <span class="token comment">// division</span>
a <span class="token operator">%</span> b    <span class="token comment">// modulo (remainder)</span>

<span class="token comment">// Comparison (return true/false)</span>
a <span class="token operator">==</span> b   <span class="token comment">// equal</span>
a <span class="token operator">!=</span> b   <span class="token comment">// not equal</span>
a <span class="token operator">&lt;</span> b    <span class="token comment">// less than</span>
a <span class="token operator">&gt;</span> b    <span class="token comment">// greater than</span>
a <span class="token operator">&lt;=</span> b   <span class="token comment">// less than or equal</span>
a <span class="token operator">&gt;=</span> b   <span class="token comment">// greater than or equal</span>

<span class="token comment">// Logical</span>
a <span class="token operator">&amp;&amp;</span> b   <span class="token comment">// AND (both true)</span>
a <span class="token operator">||</span> b   <span class="token comment">// OR (either true)</span>
<span class="token operator">!</span>a       <span class="token comment">// NOT (invert)</span>

<span class="token comment">// Bitwise (operate on individual bits)</span>
a <span class="token operator">&amp;</span> b    <span class="token comment">// AND</span>
a <span class="token operator">|</span> b    <span class="token comment">// OR</span>
a <span class="token operator">^</span> b    <span class="token comment">// XOR</span>
<span class="token operator">~</span>a       <span class="token comment">// NOT (complement)</span>
a <span class="token operator">&lt;&lt;</span> n   <span class="token comment">// left shift (multiply by 2^n)</span>
a <span class="token operator">&gt;&gt;</span> n   <span class="token comment">// right shift (divide by 2^n)</span>

<span class="token comment">// Assignment</span>
a <span class="token operator">=</span> b    <span class="token comment">// assign</span>
a <span class="token operator">+=</span> b   <span class="token comment">// add and assign (a = a + b)</span>
a<span class="token operator">++</span>      <span class="token comment">// increment (a = a + 1)</span>
a<span class="token operator">--</span>      <span class="token comment">// decrement (a = a - 1)</span></pre>
    
    <h2>Control Flow</h2>
    
    <h3>Conditionals</h3>
    <pre class="example"><span class="token keyword">if</span> <span class="token punctuation">(</span>condition<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token comment">// executed if condition is true</span>
<span class="token punctuation">}</span> <span class="token keyword">else if</span> <span class="token punctuation">(</span>other_condition<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token comment">// executed if other_condition is true</span>
<span class="token punctuation">}</span> <span class="token keyword">else</span> <span class="token punctuation">{</span>
    <span class="token comment">// executed if all conditions are false</span>
<span class="token punctuation">}</span>

<span class="token comment">// Ternary operator (compact if-else):</span>
<span class="token keyword">int</span> max <span class="token operator">=</span> <span class="token punctuation">(</span>a <span class="token operator">&gt;</span> b<span class="token punctuation">)</span> <span class="token operator">?</span> a <span class="token operator">:</span> b<span class="token punctuation">;</span>  <span class="token comment">// if a>b then a, else b</span></pre>
    
    <h3>Loops</h3>
    <pre class="example"><span class="token comment">// For loop: init; condition; increment</span>
<span class="token keyword">for</span> <span class="token punctuation">(</span><span class="token keyword">int</span> i <span class="token operator">=</span> <span class="token number">0</span><span class="token punctuation">;</span> i <span class="token operator">&lt;</span> <span class="token number">10</span><span class="token punctuation">;</span> i<span class="token operator">++</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token function">printf</span><span class="token punctuation">(</span><span class="token string">"%d\\n"</span><span class="token punctuation">,</span> i<span class="token punctuation">)</span><span class="token punctuation">;</span>  <span class="token comment">// prints 0 through 9</span>
<span class="token punctuation">}</span>

<span class="token comment">// While loop: repeat while condition is true</span>
<span class="token keyword">while</span> <span class="token punctuation">(</span>count <span class="token operator">&gt;</span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>
    count<span class="token operator">--</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span>

<span class="token comment">// Do-while: execute at least once</span>
<span class="token keyword">do</span> <span class="token punctuation">{</span>
    <span class="token function">TryConnect</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span> <span class="token keyword">while</span> <span class="token punctuation">(</span><span class="token operator">!</span>connected<span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// Loop control:</span>
<span class="token keyword">break</span><span class="token punctuation">;</span>     <span class="token comment">// exit loop immediately</span>
<span class="token keyword">continue</span><span class="token punctuation">;</span>  <span class="token comment">// skip to next iteration</span></pre>
    
    <h3>Switch</h3>
    <pre class="example"><span class="token keyword">switch</span> <span class="token punctuation">(</span>opcode<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token keyword">case</span> OP_ADD<span class="token operator">:</span>
        result <span class="token operator">=</span> a <span class="token operator">+</span> b<span class="token punctuation">;</span>
        <span class="token keyword">break</span><span class="token punctuation">;</span>
    <span class="token keyword">case</span> OP_SUB<span class="token operator">:</span>
        result <span class="token operator">=</span> a <span class="token operator">-</span> b<span class="token punctuation">;</span>
        <span class="token keyword">break</span><span class="token punctuation">;</span>
    <span class="token keyword">default</span><span class="token operator">:</span>
        error <span class="token operator">=</span> <span class="token boolean">true</span><span class="token punctuation">;</span>
        <span class="token keyword">break</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span></pre>
    
    <h2>Functions</h2>
    <p>
      Functions encapsulate reusable code:
    </p>
    <pre class="example"><span class="token comment">// Declaration: return_type name(parameters)</span>
<span class="token keyword">int</span> <span class="token function">Add</span><span class="token punctuation">(</span><span class="token keyword">int</span> a<span class="token punctuation">,</span> <span class="token keyword">int</span> b<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token keyword">return</span> a <span class="token operator">+</span> b<span class="token punctuation">;</span>
<span class="token punctuation">}</span>

<span class="token comment">// Calling the function:</span>
<span class="token keyword">int</span> sum <span class="token operator">=</span> <span class="token function">Add</span><span class="token punctuation">(</span><span class="token number">3</span><span class="token punctuation">,</span> <span class="token number">5</span><span class="token punctuation">)</span><span class="token punctuation">;</span>  <span class="token comment">// sum = 8</span>

<span class="token comment">// Void functions return nothing:</span>
<span class="token keyword">void</span> <span class="token function">PrintMessage</span><span class="token punctuation">(</span><span class="token keyword">string</span> msg<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token function">printf</span><span class="token punctuation">(</span><span class="token string">"%s\\n"</span><span class="token punctuation">,</span> msg<span class="token punctuation">.</span><span class="token function">c_str</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span>

<span class="token comment">// Default parameters:</span>
<span class="token keyword">void</span> <span class="token function">Connect</span><span class="token punctuation">(</span><span class="token keyword">string</span> host<span class="token punctuation">,</span> <span class="token keyword">int</span> port <span class="token operator">=</span> <span class="token number">8333</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token comment">// port defaults to 8333 if not specified</span>
<span class="token punctuation">}</span></pre>
    
    <h2>Classes and Structs</h2>
    <p>
      Classes bundle data and functions together:
    </p>
    <pre class="example"><span class="token keyword">class</span> <span class="token class-name">CTransaction</span> <span class="token punctuation">{</span>
<span class="token keyword">public</span><span class="token operator">:</span>                    <span class="token comment">// accessible from outside</span>
    <span class="token keyword">int</span> nVersion<span class="token punctuation">;</span>
    <span class="token keyword">vector</span><span class="token operator">&lt;</span>CTxIn<span class="token operator">&gt;</span> vin<span class="token punctuation">;</span>     <span class="token comment">// inputs</span>
    <span class="token keyword">vector</span><span class="token operator">&lt;</span>CTxOut<span class="token operator">&gt;</span> vout<span class="token punctuation">;</span>   <span class="token comment">// outputs</span>
    <span class="token keyword">int</span> nLockTime<span class="token punctuation">;</span>

    <span class="token keyword">uint256</span> <span class="token function">GetHash</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token keyword">const</span> <span class="token punctuation">{</span>  <span class="token comment">// member function</span>
        <span class="token keyword">return</span> <span class="token function">SerializeHash</span><span class="token punctuation">(</span><span class="token operator">*</span><span class="token keyword">this</span><span class="token punctuation">)</span><span class="token punctuation">;</span>  <span class="token comment">// hash the serialized bytes</span>
    <span class="token punctuation">}</span>

<span class="token keyword">protected</span><span class="token operator">:</span>                 <span class="token comment">// only accessible inside class (and subclasses)</span>
    <span class="token keyword">bool</span> <span class="token function">AddToMemoryPool</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">;</span>

<span class="token comment">// Creating and using objects:</span>
<span class="token class-name">CTransaction</span> tx<span class="token punctuation">;</span>
tx<span class="token punctuation">.</span>nVersion <span class="token operator">=</span> <span class="token number">1</span><span class="token punctuation">;</span>
<span class="token keyword">uint256</span> hash <span class="token operator">=</span> tx<span class="token punctuation">.</span><span class="token function">GetHash</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span></pre>
    <p>
      <strong>Structs</strong> are like classes but default to public access.
      Bitcoin v0.1.0 almost always uses <code>class</code> with an explicit
      <code>public:</code> section; <code>struct</code> appears only a handful of times.
    </p>
    
    <h2>Pointers and References</h2>
    <p>
      <strong>Pointers</strong> store memory addresses:
    </p>
    <pre class="example"><span class="token keyword">int</span> value <span class="token operator">=</span> <span class="token number">42</span><span class="token punctuation">;</span>
<span class="token keyword">int</span><span class="token operator">*</span> ptr <span class="token operator">=</span> <span class="token operator">&amp;</span>value<span class="token punctuation">;</span>   <span class="token comment">// ptr points to value's address</span>
<span class="token operator">*</span>ptr <span class="token operator">=</span> <span class="token number">100</span><span class="token punctuation">;</span>          <span class="token comment">// dereference: now value = 100</span>

<span class="token comment">// Null pointer (points to nothing):</span>
<span class="token keyword">int</span><span class="token operator">*</span> p <span class="token operator">=</span> <span class="token constant">NULL</span><span class="token punctuation">;</span>
<span class="token keyword">if</span> <span class="token punctuation">(</span>p <span class="token operator">!=</span> <span class="token constant">NULL</span><span class="token punctuation">)</span> <span class="token punctuation">{</span> <span class="token punctuation">.</span><span class="token punctuation">.</span><span class="token punctuation">.</span> <span class="token punctuation">}</span>

<span class="token comment">// Arrow operator for pointer to struct/class:</span>
<span class="token class-name">CBlock</span><span class="token operator">*</span> pblock <span class="token operator">=</span> <span class="token keyword">new</span> <span class="token class-name">CBlock</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
pblock<span class="token operator">-&gt;</span>nVersion <span class="token operator">=</span> <span class="token number">1</span><span class="token punctuation">;</span>   <span class="token comment">// same as (*pblock).nVersion</span></pre>
    <p>
      <strong>References</strong> are aliases for existing variables:
    </p>
    <pre class="example"><span class="token keyword">int</span> value <span class="token operator">=</span> <span class="token number">42</span><span class="token punctuation">;</span>
<span class="token keyword">int</span><span class="token operator">&amp;</span> ref <span class="token operator">=</span> value<span class="token punctuation">;</span>    <span class="token comment">// ref IS value (same memory)</span>
ref <span class="token operator">=</span> <span class="token number">100</span><span class="token punctuation">;</span>           <span class="token comment">// now value = 100</span>

<span class="token comment">// Common use: efficient function parameters</span>
<span class="token keyword">void</span> <span class="token function">ProcessBlock</span><span class="token punctuation">(</span><span class="token class-name">CBlock</span><span class="token operator">&amp;</span> block<span class="token punctuation">)</span> <span class="token punctuation">{</span>  <span class="token comment">// no copy made</span>
    block<span class="token punctuation">.</span>nNonce<span class="token operator">++</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span></pre>
    
    <h2>Arrays and Vectors</h2>
    <pre class="example"><span class="token comment">// Fixed-size array:</span>
<span class="token keyword">int</span> numbers<span class="token punctuation">[</span><span class="token number">5</span><span class="token punctuation">]</span> <span class="token operator">=</span> <span class="token punctuation">{</span><span class="token number">1</span><span class="token punctuation">,</span> <span class="token number">2</span><span class="token punctuation">,</span> <span class="token number">3</span><span class="token punctuation">,</span> <span class="token number">4</span><span class="token punctuation">,</span> <span class="token number">5</span><span class="token punctuation">}</span><span class="token punctuation">;</span>
numbers<span class="token punctuation">[</span><span class="token number">0</span><span class="token punctuation">]</span> <span class="token operator">=</span> <span class="token number">10</span><span class="token punctuation">;</span>     <span class="token comment">// access by index (0-based)</span>

<span class="token comment">// Vector (dynamic array from STL):</span>
vector<span class="token operator">&lt;</span><span class="token keyword">int</span><span class="token operator">&gt;</span> v<span class="token punctuation">;</span>
v<span class="token punctuation">.</span><span class="token function">push_back</span><span class="token punctuation">(</span><span class="token number">1</span><span class="token punctuation">)</span><span class="token punctuation">;</span>      <span class="token comment">// add element</span>
v<span class="token punctuation">.</span><span class="token function">push_back</span><span class="token punctuation">(</span><span class="token number">2</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token keyword">int</span> size <span class="token operator">=</span> v<span class="token punctuation">.</span><span class="token function">size</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span> <span class="token comment">// number of elements</span>
<span class="token keyword">int</span> first <span class="token operator">=</span> v<span class="token punctuation">[</span><span class="token number">0</span><span class="token punctuation">]</span><span class="token punctuation">;</span>    <span class="token comment">// access by index</span>

<span class="token comment">// Iterating:</span>
<span class="token keyword">for</span> <span class="token punctuation">(</span><span class="token keyword">int</span> i <span class="token operator">=</span> <span class="token number">0</span><span class="token punctuation">;</span> i <span class="token operator">&lt;</span> v<span class="token punctuation">.</span><span class="token function">size</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span> i<span class="token operator">++</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token function">printf</span><span class="token punctuation">(</span><span class="token string">"%d\\n"</span><span class="token punctuation">,</span> v<span class="token punctuation">[</span>i<span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span>

<span class="token comment">// Range-based (C++11 — not in v0.1.0, which predates it</span>
<span class="token comment">// and uses the foreach macro instead):</span>
<span class="token keyword">for</span> <span class="token punctuation">(</span><span class="token keyword">int</span> n <span class="token punctuation">:</span> v<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token function">printf</span><span class="token punctuation">(</span><span class="token string">"%d\\n"</span><span class="token punctuation">,</span> n<span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span></pre>
    
    <h2>Maps (Dictionaries)</h2>
    <pre class="example"><span class="token comment">// Key-value storage:</span>
map<span class="token operator">&lt;</span>string<span class="token punctuation">,</span> <span class="token keyword">int</span><span class="token operator">&gt;</span> balances<span class="token punctuation">;</span>
balances<span class="token punctuation">[</span><span class="token string">"Alice"</span><span class="token punctuation">]</span> <span class="token operator">=</span> <span class="token number">100</span><span class="token punctuation">;</span>
balances<span class="token punctuation">[</span><span class="token string">"Bob"</span><span class="token punctuation">]</span> <span class="token operator">=</span> <span class="token number">50</span><span class="token punctuation">;</span>

<span class="token comment">// Lookup:</span>
<span class="token keyword">int</span> aliceBalance <span class="token operator">=</span> balances<span class="token punctuation">[</span><span class="token string">"Alice"</span><span class="token punctuation">]</span><span class="token punctuation">;</span>

<span class="token comment">// Check if key exists:</span>
<span class="token keyword">if</span> <span class="token punctuation">(</span>balances<span class="token punctuation">.</span><span class="token function">count</span><span class="token punctuation">(</span><span class="token string">"Charlie"</span><span class="token punctuation">)</span> <span class="token operator">&gt;</span> <span class="token number">0</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token comment">// Charlie exists in map</span>
<span class="token punctuation">}</span>

<span class="token comment">// Iterate over all entries:</span>
<span class="token keyword">for</span> <span class="token punctuation">(</span>map<span class="token operator">&lt;</span>string<span class="token punctuation">,</span> <span class="token keyword">int</span><span class="token operator">&gt;</span><span class="token punctuation">::</span>iterator it <span class="token operator">=</span> balances<span class="token punctuation">.</span><span class="token function">begin</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
     it <span class="token operator">!=</span> balances<span class="token punctuation">.</span><span class="token function">end</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span> <span class="token operator">++</span>it<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token function">printf</span><span class="token punctuation">(</span><span class="token string">"%s: %d\\n"</span><span class="token punctuation">,</span> it<span class="token operator">-&gt;</span>first<span class="token punctuation">.</span><span class="token function">c_str</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">,</span> it<span class="token operator">-&gt;</span>second<span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span></pre>
    
    <h2>The Preprocessor</h2>
    <p>
      Lines starting with <code>#</code> are processed before compilation:
    </p>
    <pre class="example"><span class="token comment">// Include another file's contents:</span>
<span class="token keyword">#include</span> <span class="token string">"main.h"</span>        <span class="token comment">// local file</span>
<span class="token keyword">#include</span> <span class="token operator">&lt;</span>vector<span class="token operator">&gt;</span>        <span class="token comment">// system file</span>

<span class="token comment">// Define constants (v0.1.0 prefers typed constants to #define):</span>
<span class="token keyword">static const</span> int64 COIN <span class="token operator">=</span> <span class="token number">100000000</span><span class="token punctuation">;</span>            <span class="token comment">// 1 BTC in satoshis</span>
<span class="token keyword">static const unsigned int</span> MAX_SIZE <span class="token operator">=</span> <span class="token number">0x02000000</span><span class="token punctuation">;</span>  <span class="token comment">// 32 MB size cap</span>

<span class="token comment">// Conditional compilation:</span>
<span class="token keyword">#ifdef</span> WIN32
    <span class="token comment">// Windows-specific code</span>
<span class="token keyword">#else</span>
    <span class="token comment">// Unix/Linux code</span>
<span class="token keyword">#endif</span>

<span class="token comment">// Macros (inline code substitution), from v0.1.0's util.h:</span>
<span class="token keyword">#define</span> foreach  BOOST_FOREACH          <span class="token comment">// shorter name</span>
<span class="token keyword">#define</span> loop     <span class="token keyword">for</span> <span class="token punctuation">(</span><span class="token punctuation">;</span><span class="token punctuation">;</span><span class="token punctuation">)</span>              <span class="token comment">// loop forever</span>
<span class="token keyword">#define</span> <span class="token function">BEGIN</span><span class="token punctuation">(</span>a<span class="token punctuation">)</span> <span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token keyword">char</span><span class="token operator">*</span><span class="token punctuation">)</span><span class="token operator">&amp;</span><span class="token punctuation">(</span>a<span class="token punctuation">)</span><span class="token punctuation">)</span>
<span class="token keyword">#define</span> <span class="token function">END</span><span class="token punctuation">(</span>a<span class="token punctuation">)</span>   <span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token keyword">char</span><span class="token operator">*</span><span class="token punctuation">)</span><span class="token operator">&amp;</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token operator">&amp;</span><span class="token punctuation">(</span>a<span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">[</span><span class="token number">1</span><span class="token punctuation">]</span><span class="token punctuation">)</span><span class="token punctuation">)</span></pre>
    <p>
      <code>BEGIN(a)</code> and <code>END(a)</code> give the address of a
      variable's first byte and of the byte just past its last. That is how
      <code>CBlock::GetHash()</code>, shown earlier, hashes
      <code>BEGIN(nVersion)</code> through <code>END(nNonce)</code>: the six
      header fields sit next to each other in memory, so the range covers
      exactly the 80-byte block header. The trick only works for fields laid
      out contiguously—a transaction, whose inputs and outputs live in
      separately allocated vectors, is hashed by serializing it first
      (<code>SerializeHash(*this)</code>).
    </p>
    
    <h2>Common Bitcoin Patterns</h2>
    <p>
      Patterns you'll see throughout the code{{cite:boost-license}}:
    </p>
    <pre class="example"><span class="token comment">// CRITICAL_BLOCK: Thread-safe access</span>
<span class="token function">CRITICAL_BLOCK</span><span class="token punctuation">(</span>cs_main<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token comment">// Only one thread can execute this at a time</span>
<span class="token punctuation">}</span>

<span class="token comment">// foreach (alias for BOOST_FOREACH): Iterate over collections</span>
<span class="token function">foreach</span><span class="token punctuation">(</span><span class="token keyword">const</span> <span class="token class-name">CTransaction</span><span class="token operator">&amp;</span> tx<span class="token punctuation">,</span> vtx<span class="token punctuation">)</span>     <span class="token comment">// from CBlock::CheckBlock()</span>
    <span class="token keyword">if</span> <span class="token punctuation">(</span><span class="token operator">!</span>tx<span class="token punctuation">.</span><span class="token function">CheckTransaction</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span>
        <span class="token keyword">return</span> <span class="token function">error</span><span class="token punctuation">(</span><span class="token string">"CheckBlock() : CheckTransaction failed"</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// Serialization: IMPLEMENT_SERIALIZE</span>
<span class="token function">IMPLEMENT_SERIALIZE</span><span class="token punctuation">(</span>
    <span class="token function">READWRITE</span><span class="token punctuation">(</span>nVersion<span class="token punctuation">)</span><span class="token punctuation">;</span>
    <span class="token function">READWRITE</span><span class="token punctuation">(</span>vin<span class="token punctuation">)</span><span class="token punctuation">;</span>
    <span class="token function">READWRITE</span><span class="token punctuation">(</span>vout<span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">)</span>

<span class="token comment">// Error handling:</span>
<span class="token keyword">if</span> <span class="token punctuation">(</span><span class="token operator">!</span><span class="token function">CheckTransaction</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span>
    <span class="token keyword">return</span> <span class="token function">error</span><span class="token punctuation">(</span><span class="token string">"Invalid transaction"</span><span class="token punctuation">)</span><span class="token punctuation">;</span>

<span class="token comment">// Logging:</span>
<span class="token function">printf</span><span class="token punctuation">(</span><span class="token string">"ProcessBlock: %s\\n"</span><span class="token punctuation">,</span> hash<span class="token punctuation">.</span><span class="token function">ToString</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">.</span><span class="token function">c_str</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span></pre>
    
    <h2>Memory Management</h2>
    <pre class="example"><span class="token comment">// Allocate on heap (must manually free):</span>
<span class="token class-name">CBlock</span><span class="token operator">*</span> pblock <span class="token operator">=</span> <span class="token keyword">new</span> <span class="token class-name">CBlock</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token comment">// ... use pblock ...</span>
<span class="token keyword">delete</span> pblock<span class="token punctuation">;</span>  <span class="token comment">// free memory</span>

<span class="token comment">// Automatic cleanup with smart pointers:</span>
auto_ptr<span class="token operator">&lt;</span><span class="token class-name">CBlock</span><span class="token operator">&gt;</span> <span class="token function">pblock</span><span class="token punctuation">(</span><span class="token keyword">new</span> <span class="token class-name">CBlock</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token comment">// automatically deleted when out of scope</span>
<span class="token comment">// (v0.1.0 does this in main.cpp; C++11 later deprecated auto_ptr)</span>

<span class="token comment">// Stack allocation (automatic cleanup):</span>
<span class="token class-name">CBlock</span> block<span class="token punctuation">;</span>  <span class="token comment">// created on stack</span>
<span class="token comment">// deleted automatically when function returns</span></pre>
  </section>
${bitcoinPrimerHtml}
${readingPathsHtml}
  <!-- Blank page before Part II -->
  <section class="blank-page"></section>

  <!-- PART II DIVIDER -->
  <section class="part-divider">
    <h1 class="part-title">The Source Code</h1>
    <p class="part-subtitle">Bitcoin v0.1.0 — annotated and explained</p>
  </section>

  <!-- RESOURCES CHAPTER -->
  <section class="blank-page chapter-verso"></section>
  ${generateResourcesChapter()}

  <!-- CHAPTERS -->
  ${chaptersHtml}

  <!-- WHAT CAME AFTER -->
  <section class="chapter concepts" id="what-came-after">
    <h1 class="chapter-title">What Came After</h1>
    
    <p class="lead">
      You've now studied Bitcoin at its origin—the pristine v0.1.0 code that launched
      a monetary revolution. But Bitcoin didn't stop evolving on January 9, 2009.{{cite:bitcoin-core-history}}{{cite:nakamoto-windows-only}}
      Over seventeen years, the codebase has grown from roughly 20,000 lines of C++ to
      more than 300,000 (counting tests and bundled libraries), with hundreds of contributors refining Satoshi's vision. Here's a chronological
      guide to what came next, so you know which versions to study for specific improvements.
    </p>

    <h2>The Satoshi Era (2009–2011)</h2>
    
    <p>
      Satoshi personally maintained Bitcoin for its first two years, releasing incremental
      improvements while communicating with early adopters on forums and mailing lists.{{cite:bitcoin-core-history}}
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.1.0</strong></td>
          <td>Jan 9, 2009</td>
          <td>First public release (this book). Windows only.{{cite:nakamoto-windows-only}} IRC-based peer discovery.{{cite:nakamoto-irc-temporary}} First transaction, Satoshi to Hal Finney, in block 170 (Jan 12).{{cite:finney-first-tx}}</td>
        </tr>
        <tr>
          <td><strong>v0.1.5</strong></td>
          <td>Feb 4, 2009</td>
          <td>Bug fixes.</td>
        </tr>
        <tr>
          <td><strong>v0.2.0</strong></td>
          <td>Dec 16, 2009</td>
          <td><strong>Linux support</strong>. Numerous optimizations.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.3.0</strong></td>
          <td>Jul 6, 2010</td>
          <td><strong>Mac OS X support</strong>. JSON-RPC API and daemon mode begin.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.3.1</strong></td>
          <td>Jul 2010</td>
          <td><strong>1 MB block size limit</strong> added quietly by Satoshi (widely understood as an anti-spam/DoS measure; no rationale was posted). Originally temporary, became contentious years later.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.3.5</strong></td>
          <td>Jul 2010</td>
          <td><strong>OP_RETURN bug fixed</strong> after discovery of a critical script bug allowing anyone to spend any coins. scriptSig and scriptPubKey now run separately; OP_CAT and other risky opcodes disabled. Satoshi's emergency soft fork.{{cite:cve-2010-5141}}{{cite:opcode-disable-2010}}</td>
        </tr>
        <tr>
          <td><strong>v0.3.10</strong></td>
          <td>Aug 15, 2010</td>
          <td><strong>Value overflow fix</strong>. Block 74638 exploited integer overflow to create 184 billion BTC. The patched client shipped within five hours; the corrected chain overtook the bad one the next day.{{cite:overflow-bug-2010}}</td>
        </tr>
        <tr>
          <td><strong>v0.3.14</strong></td>
          <td>Oct 21, 2010</td>
          <td><strong>Testnet</strong> introduced by Gavin Andresen for development testing without real value.{{cite:nakamoto-0-3-14}}</td>
        </tr>
        <tr>
          <td><strong>v0.3.19</strong></td>
          <td>Dec 2010</td>
          <td>Satoshi's final release (DoS protections). He stepped away from public development by April 2011, leaving Bitcoin to the community.{{cite:bitcoin-client-wiki}}{{cite:nakamoto-farewell-2011}}{{cite:nakamoto-bitcointalk-set-in-stone}}</td>
        </tr>
        <tr>
          <td><strong>v0.3.21</strong></td>
          <td>Apr 27, 2011</td>
          <td>First major release under Gavin Andresen. UPnP, and <strong>DNS seeding</strong> for finding peers—the beginning of the end for v0.1.0's IRC bootstrap.{{cite:gavin-0-3-21}}</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You want to trace Satoshi's thinking as
      he responded to real-world usage. The JSON-RPC API (v0.3.0+) enabled the first
      exchanges and services. The testnet idea (v0.3.14) lives on in its successors,
      testnet3 (v0.7) and testnet4 (v28).
    </p>

    <h2>Early Community Development (2011–2013)</h2>

    <p>
      After Satoshi's departure,{{cite:nakamoto-farewell-2011}} Gavin Andresen became lead maintainer. The project
      moved to GitHub, adopted a more formal release process, and began professionalizing.{{cite:bitcoin-core-history}}
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.4.0</strong></td>
          <td>Sep 23, 2011</td>
          <td><strong>Encrypted wallets</strong>. AES-256-CBC encryption protects private keys.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.5.0</strong></td>
          <td>Nov 21, 2011</td>
          <td><strong>New Qt GUI</strong>. Better address book. "Bitcoin-Qt" naming begins.{{cite:bitcoin-core-history}}{{cite:qt-lgpl-2009}}</td>
        </tr>
        <tr>
          <td><strong>v0.6.0</strong></td>
          <td>Mar 30, 2012</td>
          <td><strong>Compressed public keys</strong> (33-byte) for smaller transactions. QR codes for addresses.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.7.0</strong></td>
          <td>Sep 17, 2012</td>
          <td>Reduced memory usage. Better fee handling. Implements BIPs 22, 34, 35 (block templates, height in coinbase).{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.8.0</strong></td>
          <td>Feb 18, 2013</td>
          <td><strong>LevelDB</strong> replaces Berkeley DB for UTXO set. Bloom filters (BIP 37) for SPV clients. Parallel signature checking.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.8.1</strong></td>
          <td>Mar 18, 2013</td>
          <td><strong>Chain split fix</strong>. BerkeleyDB lock limit caused v0.7 nodes to reject valid blocks that v0.8 accepted. 6-hour fork resolved by emergency downgrade.{{cite:bip-50}}</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You're interested in wallet encryption (v0.4),
      SPV/light-client support via Bloom filters (v0.8), or the database architecture (v0.8). The March 2013 chain split{{cite:bip-50}}
      is a critical lesson in consensus-critical code changes—even "non-consensus" changes can break consensus.
    </p>

    <h2>Maturation & Rebranding (2014–2016)</h2>

    <p>
      The project rebranded to "Bitcoin Core" to distinguish it from the broader
      Bitcoin ecosystem.{{cite:bitcoin-core-history}} Development became more rigorous, with extensive review
      processes and a focus on security.
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.9.0</strong></td>
          <td>Mar 19, 2014</td>
          <td><strong>Rebranded to "Bitcoin Core"</strong>. OP_RETURN outputs allowed (40-byte data limit). Payment protocol (BIP 70).{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.10.0</strong></td>
          <td>Feb 16, 2015</td>
          <td><strong>Headers-first sync</strong>. Download block headers before blocks for faster IBD. Signing moves from OpenSSL to libsecp256k1.{{cite:bitcoin-core-history}}{{cite:core-0-10-release-notes}}</td>
        </tr>
        <tr>
          <td><strong>v0.11.0</strong></td>
          <td>Jul 12, 2015</td>
          <td><strong>Block pruning</strong>. OP_RETURN limit raised to 80 bytes.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.12.0</strong></td>
          <td>Feb 23, 2016</td>
          <td><strong>Opt-in RBF</strong> (Replace-By-Fee). Memory pool limiting. Signature validation moves to <strong>libsecp256k1</strong>—over five times faster on x86_64.{{cite:bitcoin-core-history}}{{cite:core-0-12-release-notes}}</td>
        </tr>
        <tr>
          <td><strong>v0.13.0</strong></td>
          <td>Aug 23, 2016</td>
          <td><strong>SegWit preparation</strong> (BIPs 141, 143, 144). Compact blocks (BIP 152).{{cite:bitcoin-core-history}}</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You want to understand modern sync
      strategies (v0.10), the libsecp256k1 library (v0.10–v0.12), or prepare for SegWit.
      The shift from OpenSSL to libsecp256k1 is a masterclass in security-focused refactoring.
    </p>

    <h2>SegWit & Scaling Debates (2017–2019)</h2>

    <p>
      Segregated Witness (SegWit) was the most significant protocol upgrade since
      the beginning.{{cite:bitcoin-core-history}} It fixed transaction malleability, enabled the Lightning Network,
      and increased effective block capacity—all through a soft fork.
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.14.0</strong></td>
          <td>Mar 8, 2017</td>
          <td>Performance optimizations. Manual pruning. Improved fee estimation.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.15.0</strong></td>
          <td>Sep 14, 2017</td>
          <td><strong>Better fee estimation</strong>. Multi-wallet support. Script caching.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.16.0</strong></td>
          <td>Feb 26, 2018</td>
          <td><strong>Full SegWit wallet support</strong>. Native bech32 addresses (bc1...).{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.17.0</strong></td>
          <td>Oct 3, 2018</td>
          <td><strong>Partial Spend Avoidance</strong>. Branch and Bound coin selection. Scantxoutset RPC.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.18.0</strong></td>
          <td>May 2, 2019</td>
          <td><strong>Output descriptors</strong>. Hardware wallet support via HWI.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.19.0</strong></td>
          <td>Nov 24, 2019</td>
          <td><strong>BIP 158 block filters</strong> (Neutrino). CPFP carve-out for Lightning.{{cite:bitcoin-core-history}}</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You want to understand SegWit implementation
      (v0.13–v0.16), coin selection algorithms (v0.17), or output descriptors (v0.18).
      The descriptor wallet model fundamentally changed how Bitcoin Core manages keys.
    </p>

    <h2>Modern Bitcoin Core (2020–Present)</h2>

    <p>
      Recent development has focused on Taproot (the largest upgrade since SegWit),{{cite:bitcoin-core-history}}
      privacy improvements, and hardening against sophisticated attacks.
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.20.0</strong></td>
          <td>Jun 3, 2020</td>
          <td><strong>ASMap</strong> for BGP attack resistance. Remove BIP 70 payment protocol.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v0.21.0</strong></td>
          <td>Jan 14, 2021</td>
          <td><strong>Descriptor wallets (experimental)</strong>. Tor V3 support. Signet test network.{{cite:bitcoin-core-history}}{{cite:core-0-21-release-notes}}</td>
        </tr>
        <tr>
          <td><strong>v22.0</strong></td>
          <td>Sep 13, 2021</td>
          <td><strong>Taproot</strong> (BIPs 340, 341, 342) activates on mainnet at block 709632 in November 2021; the activation logic shipped in 0.21.1. Version numbering change.{{cite:bitcoin-core-history}}{{cite:core-0-21-1-release-notes}}</td>
        </tr>
        <tr>
          <td><strong>v23.0</strong></td>
          <td>Apr 25, 2022</td>
          <td><strong>Descriptor wallets become default</strong>. Taproot wallet support (bech32m addresses). CJDNS network support. Tracepoints for debugging.{{cite:bitcoin-core-history}}{{cite:core-23-release-notes}}</td>
        </tr>
        <tr>
          <td><strong>v24.0</strong></td>
          <td>Nov 25, 2022</td>
          <td><strong>Full RBF option</strong> (mempoolfullrbf). Watch-only descriptor wallets.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v25.0</strong></td>
          <td>May 26, 2023</td>
          <td><strong>Miniscript</strong> for complex spending conditions. Improved coin selection.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v26.0</strong></td>
          <td>Dec 6, 2023</td>
          <td><strong>V2 transport protocol</strong> (BIP 324), opt-in and experimental. Encrypted P2P connections.{{cite:bitcoin-core-history}}{{cite:core-26-release-notes}}</td>
        </tr>
        <tr>
          <td><strong>v27.0</strong></td>
          <td>Apr 17, 2024</td>
          <td><strong>V2 encrypted transport on by default</strong>. CoinGrinder coin selection. libbitcoinconsensus deprecated.{{cite:bitcoin-core-history}}{{cite:core-27-release-notes}}</td>
        </tr>
        <tr>
          <td><strong>v28.0</strong></td>
          <td>Oct 2, 2024</td>
          <td>Testnet4. Package relay groundwork (1P1C). Full TRUC/V3 transaction support.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v29.0</strong></td>
          <td>Apr 14, 2025</td>
          <td><strong>CMake migration</strong>—Autotools build system retired.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>v30.0</strong></td>
          <td>Oct 10, 2025</td>
          <td>Qt 6 GUI. New unified <code>bitcoin</code> command. Legacy BDB wallets removed. <code>-datacarriersize</code> default raised to 100,000 bytes, effectively uncapping OP_RETURN data.{{cite:bitcoin-core-history}}{{cite:core-30-release-notes}}</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You want to understand Schnorr signatures
      and Taproot (v0.21.1–v22), Miniscript (v25), or encrypted P2P (v26–v27). The libbitcoinkernel
      project (ongoing) is modularizing the consensus code for use by other implementations.
    </p>

    <h2>Notable Bugs & Incidents</h2>

    <p>
      Bitcoin's history includes several critical bugs that tested the network's resilience.
      Studying these incidents reveals how consensus systems fail and recover:
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>Jul 2010</strong></td>
          <td>OP_RETURN Bug</td>
          <td><em>Introduced by: Satoshi (v0.1.0)</em> — A flaw in script evaluation let anyone spend anyone's coins using OP_RETURN. Present since day one but undiscovered. Fixed in v0.3.5 by running scriptSig and scriptPubKey separately; Satoshi also disabled multiple opcodes in the same emergency soft fork.{{cite:cve-2010-5141}}{{cite:opcode-disable-2010}}</td>
        </tr>
        <tr>
          <td><strong>Aug 2010</strong></td>
          <td>Value Overflow</td>
          <td><em>Introduced by: Satoshi (v0.1.0)</em> — Integer overflow created 184 billion BTC in block 74638. Missing overflow check in transaction validation. A patched client (v0.3.10) was released within five hours; the corrected chain overtook the bad one the next day.{{cite:overflow-bug-2010}}</td>
        </tr>
        <tr>
          <td><strong>Mar 2013</strong></td>
          <td>BDB Lock Crisis</td>
          <td><em>Root cause: Berkeley DB lock limits in all pre-0.8 versions</em> — Version 0.8's switch to LevelDB removed an undocumented limit that had silently become a consensus rule. A large block accepted by 0.8 was rejected by 0.7 nodes. 6-hour chain split resolved by miners downgrading.{{cite:bip-50}}</td>
        </tr>
        <tr>
          <td><strong>Jul 2015</strong></td>
          <td>BIP 66 Fork</td>
          <td><em>Introduced by: miners (SPV mining)</em> — Miners signaling BIP 66 (strict DER) weren't actually validating blocks. Brief fork when an invalid block was extended. Exposed risks of mining on headers without full validation.{{cite:bitcoin-core-history}}</td>
        </tr>
        <tr>
          <td><strong>Sep 2018</strong></td>
          <td>CVE-2018-17144</td>
          <td><em>Introduced by: Core developers (v0.14)</em> — Optimization to skip duplicate input checking: in v0.14 it caused a crash; from v0.15 it allowed inflation via a duplicated input within a single block. Silently patched in v0.16.3. Most critical vulnerability since 2010.{{cite:cve-2018-17144}}</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Key lessons:</strong> (1) Even Satoshi's original code contained critical bugs—peer review is essential. 
      (2) Consensus code changes require extreme caution—even database backends can affect consensus. 
      (3) Quick community response is crucial. (4) Silent patching of critical bugs is sometimes necessary 
      to prevent exploitation before nodes upgrade.
    </p>

    <h2>Key Architectural Changes</h2>

    <p>
      Looking at the big picture, these are the most significant architectural
      departures from the v0.1.0 code you just studied:
    </p>

    <table class="color-key">
      <thead>
        <tr>
          <th>Component</th>
          <th>v0.1.0</th>
          <th>Modern Bitcoin Core</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Cryptography</td>
          <td>OpenSSL (ECDSA)</td>
          <td>libsecp256k1, Schnorr signatures</td>
        </tr>
        <tr>
          <td>Database</td>
          <td>Berkeley DB</td>
          <td>LevelDB (UTXO), SQLite (wallet)</td>
        </tr>
        <tr>
          <td>Peer Discovery</td>
          <td>IRC channel, plus addr gossip</td>
          <td>DNS seeds, addr gossip</td>
        </tr>
        <tr>
          <td>Script</td>
          <td>Basic opcodes</td>
          <td>P2SH, SegWit, Tapscript</td>
        </tr>
        <tr>
          <td>Addresses</td>
          <td>Raw public keys (P2PK, used by coinbase and pay-to-IP) and 1... (P2PKH)</td>
          <td>3... (P2SH), bc1q... (SegWit), bc1p... (Taproot)</td>
        </tr>
        <tr>
          <td>Wallet</td>
          <td>Loose key collection</td>
          <td>HD wallets, descriptors</td>
        </tr>
        <tr>
          <td>GUI</td>
          <td>wxWidgets{{cite:wxwidgets-license}}</td>
          <td>Qt Framework{{cite:qt-lgpl-2009}}</td>
        </tr>
        <tr>
          <td>Build System</td>
          <td>Makefiles (hand-written)</td>
          <td>CMake (as of v29)</td>
        </tr>
        <tr>
          <td>Code Size</td>
          <td>~20,000 lines</td>
          <td>300,000+ lines (with tests and bundled libraries)</td>
        </tr>
      </tbody>
    </table>

    <h2>Recommended Study Path</h2>

    <p>
      Having mastered v0.1.0, here's a suggested progression based on your interests:
    </p>

    <ul>
      <li><strong>Consensus Rules:</strong> v0.3.10 (overflow fix) → v0.8.1 (DB fork) → v22.0 (Taproot)</li>
      <li><strong>Cryptography:</strong> v0.12.0 (libsecp256k1 validation) → v22.0 (Schnorr/Taproot)</li>
      <li><strong>Wallet Development:</strong> v0.4.0 (encryption) → v0.18.0 (descriptors) → v0.21.0 (descriptor wallets) → v23.0 (descriptor default)</li>
      <li><strong>Networking:</strong> v0.3.0 (daemon) → v0.8.0 (Bloom filters) → v26.0 (encrypted P2P)</li>
      <li><strong>Script/Smart Contracts:</strong> v0.6.0 (P2SH) → v0.13.0 (SegWit) → v22.0 (Tapscript) → v25.0 (Miniscript)</li>
      <li><strong>Lightning Prerequisites:</strong> v0.13.0 (SegWit) → v0.19.0 (CPFP carve-out) → v24.0 (full RBF)</li>
      <li><strong>Security & Bugs:</strong> v0.3.5 (OP_RETURN){{cite:cve-2010-5141}} → v0.3.10 (overflow){{cite:overflow-bug-2010}} → v0.8.1 (BDB){{cite:bip-50}} → v0.16.3 (CVE-2018-17144){{cite:cve-2018-17144}}</li>
    </ul>

    <h2>Resources for Continued Study</h2>

    <ul>
      <li><strong>Bitcoin Core GitHub:</strong> github.com/bitcoin/bitcoin — Full commit history since 2009</li>
      <li><strong>Bitcoin Improvement Proposals:</strong> github.com/bitcoin/bips — All protocol specifications</li>
      <li><strong>Bitcoin Optech:</strong> bitcoinops.org — Weekly technical newsletter since 2018</li>
      <li><strong>Bitcoin Stack Exchange:</strong> bitcoin.stackexchange.com — Q&A for technical questions</li>
      <li><strong>Chaincode Labs Seminars:</strong> chaincode.com — Free courses on Bitcoin/Lightning development</li>
      <li><strong>Learning Bitcoin from the Command Line:</strong> github.com/BlockchainCommons — Hands-on tutorials</li>
    </ul>

    <p>
      The code you've studied in this book is where it all began. Every feature,
      every optimization, every security fix in modern Bitcoin Core traces back
      to these 20,000 lines. Satoshi wrote: "I'm sure that in 20 years there will
      either be very large transaction volume or no volume."{{cite:nakamoto-20-years-volume}} Seventeen years in,
      the code keeps evolving—and now you know where to look.
    </p>
  </section>

  <!-- APPENDIX — OpenSSL as Bitcoin used it (src/appendix/openssl.yaml) -->
  ${opensslAppendix.html}

  <!-- GLOSSARY — every chapter's Key Terms, merged -->
  ${backGlossaryHtml}

  <!-- INDEX — starts on left side of spread -->
  ${indexHtml}

  <!-- COLOPHON — break-before: right handled by .chapter CSS -->
  <section class="chapter colophon" id="colophon">
    <span class="section-title">Colophon</span>
    <h1 class="chapter-title">COLOPHON</h1>

    <p>
      <strong>Book edition: ${EDITION}.</strong>
    </p>

    <p>
      <strong>About this edition.</strong>
      <em>Bitcoin v0.1.0 — Annotated Edition</em> presents the first public Bitcoin release
      (January 2009) as a single volume: original C++ source and headers with inline commentary,
      introductory primers, and reference material. The line-by-line annotations are designed for
      continuous reading alongside the code, not as a bare source listing.
    </p>

    <p>
      <strong>Source material.</strong>
      Program text is reproduced from Satoshi Nakamoto’s v0.1.0 tree. Source code is
      copyright © 2009 Satoshi Nakamoto and licensed under the MIT/X11 License unless noted
      in individual files. Commentary, selection, and book design are additional material to
      that release.
    </p>
${sourceVerificationHtml()}
    <p>
      <strong>Copyright and license.</strong>
      The annotations, introductory primers, selection, and book design are © 2026 PirateHash
      and, like the code they accompany, are released under the MIT License. The commentary
      was drafted with AI assistance and revised through human and machine review (see
      <em>Credits</em> below).
    </p>

    <p>
      <strong>Typography.</strong>
      Body and annotations are set in <strong>${typefaceMeta.body}</strong>. Code listings, headings, and UI
      labels use <strong>${typefaceMeta.code}</strong> (with a monospaced fallback stack for print).
    </p>

    <p>
      <strong>Production.</strong>
      This volume was generated from a structured HTML manuscript: syntax highlighting via
      Prism, pagination via Paged.js, and PDF output via headless Chromium (Puppeteer). The
      toolchain is Node.js-based and open source.
    </p>

    <p>
      <strong>Intended print specification.</strong>
      Trim <strong>7″ × 10″</strong> (executive), black text, perfect-bound paperback; body
      stock typically <strong>60#</strong> uncoated white or equivalent; cover per printer
      profile (e.g. gloss or matte laminate). Exact stock and binding may vary by print vendor.
    </p>

    <p>
      <strong>Credits.</strong>
      ${ANNOTATIONS_CREDIT}.
      Publisher mark: <strong>PirateHash</strong>.
    </p>

    <p>
      <strong>Errata and updates.</strong>
      This edition is version-controlled: corrections are recorded in the project’s public
      repository (github.com/pedromvpg/bitcoin-alpha-book) and released as incremented
      editions. The edition string on the title page and this page (${EDITION}) identifies
      the content of a given printing; the repository’s tags and release history provide
      the errata trail between printings.
    </p>
  </section>

  <section class="blank-page"></section>

  <script>
  /* When ?section=<id> is present, keep only that chapter so Paged.js
     paginates a single section (used by home page chapter cards). */
  (function () {
    var params = new URLSearchParams(window.location.search);
    var id = params.get('section');
    if (!id || !/^[a-z0-9-]+$/.test(id)) return;

    // Front matter: everything before the Introduction chapter
    if (id === 'front-matter') {
      var pastFront = false;
      Array.from(document.body.children).forEach(function (el) {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') return;
        if (el.id === 'introduction') pastFront = true;
        if (pastFront) el.remove();
      });
      document.title = 'Front Matter — Bitcoin v0.1.0';
      return;
    }

    var keep = document.getElementById(id);
    if (!keep) return;

    var keepSet = new Set([keep]);
    var sources = document.getElementById(id + '-sources');
    if (sources) keepSet.add(sources);
    if (id === 'rc-resources') {
      document.querySelectorAll('section.rc-resources-grid').forEach(function (el) {
        keepSet.add(el);
      });
    }

    Array.from(document.body.children).forEach(function (el) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') return;
      if (keepSet.has(el)) return;
      el.remove();
    });

    var titleEl = keep.querySelector('h1.chapter-title, h1');
    if (titleEl) {
      document.title = titleEl.textContent.trim() + ' — Bitcoin v0.1.0';
    }
  })();
  </script>
</body>
</html>`;

  return injectPrimerCitations(bookHtml);
}

/**
 * Generate the resources chapter with icons/bitmaps
 */
function generateResourcesChapter() {
  const rcAnnotation = loadAnnotation('rc');
  const rcDir = join(SOURCE_DIR, 'rc');
  const ctx = createCitationContext('rc-resources', GLOBAL_REFERENCES, rcAnnotation || {});
  const introduction = rcAnnotation?.introduction ? ctx.process(rcAnnotation.introduction) : '';
  const conclusion = rcAnnotation?.conclusion ? ctx.process(rcAnnotation.conclusion) : '';
  const footnotesHtml = ctx.renderFootnotes();

  const resourcesHtml = renderRcGalleryHtml(rcDir);

  return `
    <section class="chapter" id="rc-resources">
      <span class="section-title">rc/ (Resources)</span>
      <span class="chapter-title">Bitcoin v0.1.0</span>

      <header class="chapter-header">
        <h1 class="chapter-title">rc/ (Resources)</h1>

        <div class="chapter-intro">
          <div class="file-info">
            <span class="lines">11 files</span>
            <span class="language">ICONS &amp; BITMAPS</span>
          </div>

          ${rcAnnotation?.title ? `<h2 class="intro-title">${rcAnnotation.title}</h2>` : ''}

          ${introduction ? `<div class="description">${introduction}</div>` : ''}
        </div>
      </header>
    </section>

    <section class="blank-page"></section>

    <section class="chapter rc-resources-grid">
      <span class="section-title">rc/ (Resources)</span>
      <span class="chapter-title">Bitcoin v0.1.0</span>

      ${resourcesHtml}

      ${conclusion ? `
      <div class="annotation-block chapter-conclusion">
        <h4>Summary</h4>
        ${conclusion}
      </div>` : ''}
      ${footnotesHtml}
    </section>`;
}

/**
 * Load annotation file if it exists
 */
function loadAnnotation(filename) {
  const annotationPath = join(ANNOTATIONS_DIR, `${filename}.yaml`);
  
  if (existsSync(annotationPath)) {
    try {
      const content = readFileSync(annotationPath, 'utf8');
      return yaml.load(content);
    } catch (err) {
      console.warn(`Warning: Could not parse annotation for ${filename}:`, err.message);
    }
  }
  
  return null;
}

/**
 * Get all source files in order
 */
function getSourceFiles() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Error: Source directory not found: ${SOURCE_DIR}`);
    console.log('Run "npm run fetch" first to download the Bitcoin source code.');
    process.exit(1);
  }
  
  const allFiles = readdirSync(SOURCE_DIR, { recursive: true })
    .filter(f => {
      const ext = extname(f).toLowerCase();
      const name = basename(f).toLowerCase();
      return ['.cpp', '.c', '.h', '.txt', '.rc', '.fbp'].includes(ext) ||
             name === 'makefile' || name === 'makefile.vc';
    });
  
  // Sort by our defined order, then alphabetically for anything else
  const orderedFiles = [];
  
  for (const targetFile of FILE_ORDER) {
    const found = allFiles.find(f => basename(f).toLowerCase() === targetFile.toLowerCase());
    if (found) {
      orderedFiles.push(found);
    }
  }
  
  // Add any remaining files
  for (const f of allFiles) {
    if (!orderedFiles.includes(f)) {
      orderedFiles.push(f);
    }
  }
  
  return orderedFiles;
}

/**
 * Main build function
 */
async function build() {
  console.log('📚 Bitcoin Alpha Book Builder\n');
  
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load shared citation registry
  console.log('📖 Loading references...');
  GLOBAL_REFERENCES = loadReferences();
  console.log(`   ${Object.keys(GLOBAL_REFERENCES).length} references in registry\n`);
  
  // Get source files
  console.log('📁 Reading source files...');
  const sourceFiles = getSourceFiles();
  console.log(`   Found ${sourceFiles.length} files\n`);
  
  // Process each file
  console.log('🔧 Processing files...');
  const processedFiles = [];
  
  for (const relativePath of sourceFiles) {
    const filename = basename(relativePath);
    const filePath = join(SOURCE_DIR, relativePath);
    
    if (!existsSync(filePath)) {
      console.warn(`   Skipping missing file: ${filename}`);
      continue;
    }
    
    const code = readFileSync(filePath, 'utf8');
    const language = getLanguage(filename);
    const annotation = loadAnnotation(filename);
    const lineCount = code.split('\n').length;
    
    // Highlighted code HTML is rendered with citations in generateBookHtml
    // so chapter footnote numbers stay ordered (intro → lines → conclusion).
    const codeHtml = generateCodeBlockHtml(
      filename,
      code,
      language,
      annotation?.annotations || []
    );
    
    processedFiles.push({
      id: chapterIdFromFilename(filename),
      filename,
      language,
      lineCount,
      annotation,
      code,
      codeHtml
    });
    
    process.stdout.write(`   ✓ ${filename}\n`);
  }
  
  console.log(`\n📝 Generating HTML...`);
  const bookHtml = generateBookHtml(processedFiles);
  
  // Write HTML output
  const htmlPath = join(OUTPUT_DIR, 'bitcoin-alpha-book.html');
  writeFileSync(htmlPath, bookHtml, 'utf8');
  console.log(`   ✓ Written to ${htmlPath}`);
  
  // Check if we should generate PDF
  const generatePdf = process.argv.includes('--pdf');
  
  if (generatePdf) {
    console.log('\n📄 Generating PDF...');
    await generatePDF(htmlPath);
  } else {
    console.log('\n💡 Run with --pdf flag to generate PDF:');
    console.log('   npm run pdf');
  }
  
  console.log('\n✨ Build complete!');
}

/**
 * Generate PDF using Puppeteer
 */
async function generatePDF(htmlPath) {
  try {
    const puppeteer = await import('puppeteer');
    
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Load the HTML file
    await page.goto(`file://${htmlPath}`, {
      waitUntil: 'networkidle0',
      timeout: 120000
    });
    
    // Wait for Paged.js to finish rendering
    await page.waitForFunction(() => {
      return window.PagedPolyfill && window.PagedPolyfill.ready;
    }, { timeout: 120000 });
    
    // Additional wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');
    
    // Generate PDF
    const pdfPath = join(OUTPUT_DIR, 'bitcoin-alpha-book.pdf');
    await page.pdf({
      path: pdfPath,
      width: '7in',
      height: '10in',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    
    await browser.close();
    
    console.log(`   ✓ PDF saved to ${pdfPath}`);
  } catch (err) {
    console.error('   ✗ PDF generation failed:', err.message);
    console.log('   Make sure puppeteer is installed: npm install');
  }
}

// Run build
build().catch(console.error);
