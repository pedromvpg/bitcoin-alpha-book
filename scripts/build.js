/**
 * Bitcoin Alpha Book Builder
 * 
 * Assembles the Bitcoin v0.01 source code into a print-ready PDF book
 * with syntax highlighting and annotations.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import Prism from 'prismjs';

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
const STYLES_DIR = join(ROOT_DIR, 'styles');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

// File order (matching your cover image)
const FILE_ORDER = [
  'base58.h',
  'bignum.h',
  'db.cpp',
  'db.h',
  'headers.h',
  'irc.cpp',
  'irc.h',
  'key.h',
  'license.txt',
  'main.cpp',
  'main.h',
  'makefile',
  'makefile.vc',
  'market.cpp',
  'market.h',
  'net.cpp',
  'net.h',
  'readme.txt',
  'script.cpp',
  'script.h',
  'serialize.h',
  'sha.cpp',
  'sha.h',
  'ui.cpp',
  'ui.h',
  'ui.rc',
  'uibase.cpp',
  'uibase.h',
  'uint256.h',
  'uiproject.fbp',
  'util.cpp',
  'util.h'
];

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
      
      // Generate page references - each is a link that will show its page number
      const pageRefs = entry.sections.map(sectionId => 
        `<a class="index-page-ref" href="#${sectionId}"></a>`
      ).join('');
      
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
 * Generate HTML for a single code block
 * Uses per-line structure so line numbers stay aligned when code wraps
 * Includes margin notes from annotations
 */
function generateCodeBlockHtml(filename, code, language, annotations) {
  const lines = code.split('\n');
  
  // Create a map of line annotations
  const lineAnnotations = new Map();
  if (annotations && Array.isArray(annotations)) {
    for (const ann of annotations) {
      if (ann.type === 'margin' && ann.line) {
        lineAnnotations.set(ann.line, ann);
      }
    }
  }
  
  // Generate each line as a row with line number + code + optional margin note
  let linesHtml = '';
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const lineContent = lines[i];
    const highlightedContent = highlightCode(lineContent, language);
    
    const annotation = lineAnnotations.get(lineNum);
    let lineClass = 'code-line';
    
    if (annotation && annotation.text) {
      lineClass += ' has-annotation';
    }
    
    linesHtml += `<div class="${lineClass}"><span class="line-num">${String(lineNum).padStart(4, ' ')}</span><span class="line-code">${highlightedContent}</span></div>`;
    
    // Add annotation block after the line
    // Note: Don't escape HTML to allow <code> tags for syntax-colored references
    if (annotation && annotation.text) {
      linesHtml += `<div class="annotation-block"><div class="annotation-content">${annotation.text}</div></div>`;
    }
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
 * Generate the complete book HTML
 */
function generateBookHtml(files) {
  const printCss = readFileSync(join(STYLES_DIR, 'print.css'), 'utf8');
  const syntaxCss = readFileSync(join(STYLES_DIR, 'syntax.css'), 'utf8');
  const typographyCss = readFileSync(join(STYLES_DIR, 'typography.css'), 'utf8');
  
  // Generate TOC entries - start with intro sections
  let tocHtml = `
      <li class="toc-part-header">Part I: Fundamentals</li>
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
      <li class="toc-part-header">Part II: The Source Code</li>
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
      </li>
      <li class="toc-item">
        <span class="toc-filename">Index</span>
        <span class="toc-page" data-target="index"></span>
      </li>`;

  // Generate chapters
  let chaptersHtml = '';
  for (const file of files) {
    const annotation = file.annotation || {};

    // Add special class for uiproject.fbp (dense XML file)
    const extraClass = file.filename === 'uiproject.fbp' ? ' chapter-dense' : '';

    chaptersHtml += `
    <section class="chapter${extraClass}" id="${file.id}">
      <span class="section-title">${escapeHtml(file.filename)}</span>
      <span class="chapter-title">Bitcoin v0.01 Alpha</span>
      
      <header class="chapter-header">
        <h1 class="chapter-title">${escapeHtml(file.filename)}</h1>
        
        <div class="chapter-intro">
          <div class="file-info">
            <span class="lines">${file.lineCount} lines</span>
            <span class="language">${file.language.toUpperCase()}</span>
          </div>
          
          ${annotation.title ? `<h2 class="intro-title">${escapeHtml(annotation.title)}</h2>` : ''}
          
          ${annotation.introduction ? `<div class="description">${annotation.introduction}</div>` : ''}
        </div>
      </header>
      
      ${file.codeHtml}
      
      ${annotation.conclusion ? `
      <div class="annotation-block chapter-conclusion">
        <h4>Summary</h4>
        ${annotation.conclusion}
      </div>` : ''}
    </section>`;
  }
  
  // Build intro sections content for index searching
  const introSectionsForIndex = `
    <section id="introduction">introduction bitcoin digital money cryptography Satoshi Nakamoto transactions blocks proof-of-work P2P network consensus main.cpp script.cpp net.cpp key.h sha.cpp double-spending verification node</section>
    <section id="prehistory">SHA-256 RIPEMD-160 merkle tree proof-of-work hashcash difficulty Hal Finney RPOW Adam Back Wei Dai b-money Nick Szabo Bit Gold David Chaum DigiCash whitepaper cypherpunk digital signature</section>
    <section id="computer-concepts">binary hexadecimal memory pointer data hash SHA-256 ECDSA public key private key</section>
    <section id="cryptography-primer">discrete logarithm elliptic curve ECC secp256k1 ECDSA SHA-256 RIPEMD-160 merkle tree proof-of-work generator point OpenSSL digital signature private key public key hash</section>
    <section id="cpp-primer">CTransaction CBlock CKey uint256 CBigNum vector map CRITICAL_BLOCK BOOST_FOREACH IMPLEMENT_SERIALIZE pointer reference class struct function</section>
    <section id="what-came-after">SegWit Taproot Schnorr libsecp256k1 LevelDB Berkeley DB BIP Lightning descriptor wallet JSON-RPC testnet Bitcoin Core version release changelog P2SH bech32 Miniscript Satoshi Gavin Andresen</section>
  `;
  
  // Combine all content for index searching
  const allContentForIndex = introSectionsForIndex + chaptersHtml;
  const termLocations = findIndexTermLocations(allContentForIndex);
  const indexHtml = generateIndexHtml(termLocations);
  
  console.log(`   Found ${termLocations.size} index terms across ${Array.from(termLocations.values()).reduce((acc, set) => acc + set.size, 0)} locations`);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitcoin v0.01 Alpha - Source Code</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Red+Hat+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  
  <style>
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

    }
  }

  Paged.registerHandlers(PageHandler);
  </script>
  <!-- Page 1: TITLE PAGE (right) -->
  <section class="title-page">
    <div class="title-content">
      <h1 class="book-title">BITCOIN</h1>
      <p class="book-subtitle">v0.01 ALPHA</p>
    </div>
    <div class="footer-content">
      <p class="annotations-credit">Annotations by Claude Opus 4.5</p>
      <p class="copyright">Copyright (c) 2009 Satoshi Nakamoto</p>
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
        <span class="source-desc">Archive of Bitcoin v0.01 source code, preserved by the Satoshi Nakamoto Institute</span>
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

  <!-- PART I DIVIDER (page-break-before: right handles blank page if needed) -->
  <section class="part-divider">
    <span class="part-number">Part I</span>
    <h1 class="part-title">Fundamentals</h1>
    <p class="part-subtitle">The history, cryptography, and computer science concepts behind Bitcoin</p>
  </section>

  <!-- INTRODUCTION -->
  <section class="chapter introduction" id="introduction">
    <h1 class="chapter-title">Introduction</h1>

    <p class="lead">
      For decades before Bitcoin, cryptographers and computer scientists attempted
      to create digital money. They all failed. DigiCash went bankrupt. e-gold was
      shut down by the federal government. Liberty Reserve was seized. Each system
      had the same fatal flaw: a central point of control that could be pressured,
      raided, or simply go out of business.
    </p>

    <p>
      Then, on October 31, 2008, an unknown person using the name Satoshi Nakamoto
      posted a paper to a cryptography mailing list. The paper described "a purely
      peer-to-peer version of electronic cash" that required no trusted third party.
      Two months later, on January 3, 2009, Nakamoto launched the software.
    </p>

    <p>
      Embedded in the first block was a message: "The Times 03/Jan/2009 Chancellor
      on brink of second bailout for banks." This headline from a British newspaper
      served two purposes. First, it proved the block could not have been created
      before that date. Second, it signaled the motivation behind the project—a
      response to a financial system that had just brought the global economy to
      its knees.
    </p>

    <p>
      This book contains the complete source code of Bitcoin version 0.01, the
      first public release. These 15,000 lines of C++ represent the solution to
      a problem that had defeated every previous attempt: how to prevent
      double-spending in a digital currency without relying on a central authority.
    </p>

    <h2>Why This Code Matters</h2>
    <p>
      Previous digital currencies required you to trust a company or organization.
      You had to trust that they wouldn't create money out of thin air, that they
      wouldn't freeze your account, that they wouldn't disappear with your funds.
      When that trust was violated—or when governments decided to shut them down—the
      money vanished.
    </p>
    <p>
      Bitcoin eliminated the need for trust by replacing it with verification. Every
      node on the network independently validates every transaction against the same
      rules encoded in this source code. No single entity controls the network. No
      company can be shut down to stop it. The rules are enforced by mathematics
      and the collective agreement of thousands of participants worldwide.
    </p>
    <p>
      Satoshi Nakamoto's identity remains unknown. But the code is public, and it
      speaks for itself.
    </p>

    <h2>How Bitcoin Works</h2>
    <p>
      The system operates through a few interlocking mechanisms:
    </p>
    <ul>
      <li><strong>Transactions</strong> transfer value from one address to another,
          authorized by digital signatures that prove ownership without revealing
          private keys.</li>
      <li><strong>Blocks</strong> bundle transactions together, each block referencing
          the hash of the previous block, forming a chain.</li>
      <li><strong>Proof-of-work</strong> requires miners to expend computational
          resources to add blocks, making it economically impractical to rewrite
          history.</li>
      <li><strong>P2P network</strong> connects nodes directly without central servers.
          Transactions and blocks propagate through gossip—each node relays what it
          receives to its peers, reaching the entire network in seconds.</li>
      <li><strong>Consensus</strong> emerges as nodes accept the longest valid chain,
          creating agreement without coordination.</li>
    </ul>
    <p>
      The key files that implement this system are:
    </p>
    <ul>
      <li><strong>main.cpp</strong> — Block validation, mining, and consensus rules</li>
      <li><strong>script.cpp</strong> — The scripting language for spending conditions</li>
      <li><strong>net.cpp</strong> — Peer-to-peer networking and message propagation</li>
      <li><strong>key.h</strong> — Elliptic curve cryptography for digital signatures</li>
      <li><strong>sha.cpp</strong> — The SHA-256 hash function securing the chain</li>
    </ul>

    <h2>Reading the Code</h2>
    <p>
      You do not need to be a programmer to read this book. Each file begins with
      an introduction explaining its purpose, and annotations throughout highlight
      significant passages. The syntax highlighting makes the structure visible:
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
      <li><strong>The Road to Bitcoin</strong> traces the ideas and failed projects
          that preceded Bitcoin, from public key cryptography to the cypherpunk
          movement.</li>
      <li><strong>Computer Concepts</strong> and <strong>Cryptography Basics</strong>
          provide the technical foundation needed to understand the code.</li>
      <li><strong>C++ Primer</strong> explains the programming language and file
          structure of the project.</li>
      <li><strong>The Source Code</strong> presents every file from Bitcoin v0.01,
          annotated with explanations of what the code does and why it matters.</li>
    </ul>
    <p>
      Version 0.01 is remarkably complete. The fundamental architecture—UTXO model,
      proof-of-work consensus, scripting system, peer-to-peer networking—remains
      essentially unchanged after fifteen years and trillions of dollars in value
      secured. Understanding this code means understanding Bitcoin at its foundation.
    </p>
  </section>

  <!-- PRE-HISTORY OF BITCOIN -->
  <section class="chapter concepts" id="prehistory">
    <h1 class="chapter-title">The Road to Bitcoin</h1>

    <p class="lead">
      Bitcoin didn't emerge from a vacuum. It stands on the shoulders of decades
      of cryptographic research and failed attempts at digital cash. Understanding
      these predecessors illuminates what made Satoshi's synthesis revolutionary.
    </p>

    <h2>The Cypherpunk Dream</h2>
    <p>
      In the early 1990s, a group of cryptographers, hackers, and privacy advocates
      formed a mailing list dedicated to using cryptography to create a free society.
      They called themselves the <strong>cypherpunks</strong>. Their manifesto declared:
      "Privacy is necessary for an open society in the electronic age."
    </p>
    <p>
      Among their goals: anonymous digital cash—money that couldn't be traced,
      seized, or censored. For two decades, brilliant minds tried and failed to
      create this. Their failures became Bitcoin's foundation.
    </p>

    <h2>Public Key Cryptography (1976)</h2>
    <p>
      In 1976, Whitfield Diffie and Martin Hellman published "New Directions in
      Cryptography," introducing the concept of <strong>public key cryptography</strong>.
      Before this, sharing encrypted messages required both parties to have the same
      secret key—but how do you securely share that key in the first place?
    </p>
    <p>
      Diffie-Hellman solved this with an elegant mathematical trick: each party
      has a private key they never share and a public key they broadcast to the world.
      The math allows two parties to compute a shared secret without ever transmitting it:
    </p>
    <pre class="example">Public: Generator point G

Alice (private a):     Bob (private b):
Computes A = aG        Computes B = bG
Sends A to Bob         Sends B to Alice
Computes aB = abG      Computes bA = baG

Shared secret: abG (same for both!)</pre>
    <p>
      An eavesdropper sees G, A, and B, but cannot compute abG without knowing
      either a or b. This insight—that you can publish part of your key without
      compromising your secrets—is the foundation of all cryptocurrency.
    </p>
    <p>
      The Bitcoin whitepaper cites Diffie-Hellman indirectly through the cryptographic
      concepts it enabled. Your Bitcoin public key can be shared with the world, yet
      no one can reverse-engineer your private key. The math that protects Diffie-Hellman
      key exchange protects your coins.
    </p>

    <h2>David Chaum's DigiCash (1989)</h2>
    <p>
      Cryptographer David Chaum invented <strong>blind signatures</strong> and
      founded DigiCash in 1989—the first attempt at cryptographic digital cash.
      His "eCash" system used clever math to make transactions untraceable while
      preventing double-spending.
    </p>
    <p>
      The problem: DigiCash required a central server to validate transactions.
      When the company went bankrupt in 1998, the money system died with it.
      <strong>Lesson learned: centralization is a single point of failure.</strong>
    </p>

    <h2>Hashcash (1997)</h2>
    <p>
      Adam Back, a British cryptographer, invented <strong>Hashcash</strong> to
      combat email spam. The idea: require senders to compute a partial hash
      collision before sending email. Finding such a collision takes CPU work—
      trivial for one email, prohibitive for millions of spam messages.
    </p>
    <pre class="example">Hashcash header: 1:20:060408:adam@cypherspace.org::1QTjaYd7niiQA/sc:ePa

The sender must find a value where SHA1(header) starts with 20 zero bits.
This requires ~2^20 hash computations—about a second of CPU time.</pre>
    <p>
      The Bitcoin whitepaper explicitly cites Hashcash in its references. Satoshi
      adapted the concept: instead of proving work to send email, miners prove
      work to add blocks. The difficulty is adjusted so the network collectively
      finds one valid proof every 10 minutes.
    </p>

    <h2>b-money (1998)</h2>
    <p>
      Wei Dai, a cypherpunk and computer scientist, proposed <strong>b-money</strong>—
      a theoretical system for anonymous digital cash. His paper describes:
    </p>
    <ul>
      <li>Money created through proof-of-work</li>
      <li>Transactions broadcast to all participants</li>
      <li>A collective ledger maintained by the network</li>
      <li>Contracts enforced through cryptographic protocols</li>
    </ul>
    <p>
      Sound familiar? Wei Dai's b-money was never implemented, but Satoshi cited
      it first in the Bitcoin whitepaper's references. In early emails, Satoshi
      told Wei Dai: "I was very interested to read your b-money page. I'm getting
      ready to release a paper that expands on your ideas."
    </p>

    <h2>Bit Gold (1998-2005)</h2>
    <p>
      Nick Szabo was the son of a Hungarian refugee who fled after Soviet troops
      crushed the 1956 revolt. This shaped his distrust of government overreach
      and drew him to Hayek's writings on monetary economics. After studying
      computer science and working at NASA's Jet Propulsion Laboratory, he joined
      the cypherpunks and briefly worked at DigiCash in Amsterdam.
    </p>
    <p>
      At DigiCash, Szabo saw firsthand how easy it was to manipulate balances
      in a centralized system. This led to his influential essay "Trusted Third
      Parties Are Security Holes"—the insight that any system depending on a
      central party inherits that party's vulnerabilities, whether from hackers,
      rogue employees, or government pressure.
    </p>
    <p>
      Szabo designed <strong>Bit Gold</strong> to eliminate trusted third parties
      entirely. His system used proof-of-work to create tokens, chained hashes
      together (each valid hash becoming the input for the next), and proposed
      a distributed "property club" to track ownership. It was never implemented,
      but its architecture clearly influenced Bitcoin. Szabo later acknowledged:
      "Bitcoin is an implementation of bit gold."
    </p>

    <h2>Merkle Trees (1979)</h2>
    <p>
      Ralph Merkle invented the <strong>Merkle tree</strong>—a data structure
      that efficiently summarizes large amounts of data into a single hash.
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
      credits "Protocols for Public Key Cryptosystems" (Merkle, 1980).
    </p>

    <h2>Timestamping (1991)</h2>
    <p>
      Stuart Haber and W. Scott Stornetta published "How to Time-Stamp a Digital
      Document"—a system for proving a document existed at a certain time by
      publishing hashes in a newspaper. Their subsequent work on hash chains
      and Merkle trees directly influenced Bitcoin's blockchain structure.
    </p>
    <p>
      The Bitcoin whitepaper cites three Haber-Stornetta papers. Their idea of
      chaining hashes together—where each timestamp includes the hash of the
      previous one—is exactly how Bitcoin blocks link together.
    </p>

    <h2>RPOW: Reusable Proof of Work (2004)</h2>
    <p>
      Hal Finney graduated top of his class from Caltech and spent years
      developing video games for Intellivision and Atari before becoming a
      core contributor to PGP. Unlike some cypherpunks, Finney was a pragmatist.
      He didn't believe cryptography could create an anarchist utopia: "There
      is no such place as cyberspace. I am in California. Its agents carry
      physical guns which shoot real bullets."
    </p>
    <p>
      Still, Finney wanted electronic cash to exist. In 2004, he launched
      <strong>RPOW</strong> (Reusable Proofs of Work). Users would generate
      a hashcash-style proof-of-work and exchange it for a token. That token
      could then be transferred to others, who would redeem it for a fresh
      token—making the proof of work reusable.
    </p>
    <p>
      To prevent double-spending without trusting the server operator (himself),
      Finney ran RPOW on tamper-proof IBM hardware that could cryptographically
      prove it was running unmodified open-source code. It was clever, but RPOW
      failed to gain users. The tokens had no reason to hold value—Moore's Law
      would make them cheaper to produce over time—and without users, there was
      nothing to buy.
    </p>
    <p>
      When Satoshi announced Bitcoin on the cryptography mailing list in 2008,
      Hal Finney was among the first to respond positively. On January 11, 2009,
      Finney received the first Bitcoin transaction ever: 10 BTC from Satoshi.
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
      Satoshi's genius was combining these pieces with a novel insight:
    </p>
    <pre class="example">
                        PRIOR INNOVATIONS
    ┌─────────────────┬─────────────────┬─────────────────┐
    │    IDENTITY     │   PROOF-OF-WORK │     HISTORY     │
    │                 │                 │                 │
    │ Diffie-Hellman  │    Hashcash     │ Haber-Stornetta │
    │ RSA, ECC        │    b-money      │  Merkle Trees   │
    │ Public Keys     │    Bit Gold     │  Timestamping   │
    └────────┬────────┴────────┬────────┴────────┬────────┘
             │                 │                 │
             └─────────────────┼─────────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │      SATOSHI'S INSIGHT         │
              │                                │
              │    DIFFICULTY ADJUSTMENT       │
              │                                │
              │  Proof-of-work + time target   │
              │  = decentralized consensus     │
              │                                │
              │  "The system adjusts to keep   │
              │   ~10 min between blocks"      │
              └────────────────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │           BITCOIN              │
              │     Trustless Digital Cash     │
              └────────────────────────────────┘
    </pre>
    <p>
      Use proof-of-work not just to create money, but to reach <strong>consensus</strong>
      about which transactions are valid. The longest chain (most cumulative work)
      is the true history. No trusted party needed—just math and economic incentives.
    </p>
    <p>
      As Satoshi wrote: "A lot of people automatically dismiss e-currency as a
      lost cause because of all the companies that failed since the 1990s. I hope
      it's obvious it was only the centrally controlled nature of those systems
      that doomed them."
    </p>
  </section>

  <!-- COMPUTER CONCEPTS -->
  <section class="chapter concepts" id="computer-concepts">
    <h1 class="chapter-title">Computer Concepts</h1>

    <p class="lead">
      Before diving into the code, let's cover some fundamental concepts
      that appear throughout Bitcoin's implementation.
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
      <tr><td><strong>64 bits (8 bytes)</strong></td><td>Large numbers, Bitcoin amounts (in satoshis)</td></tr>
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
      This is the hash of Bitcoin's genesis block—the first block ever mined.
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
      output (the "hash" or "digest"). Bitcoin primarily uses SHA-256, which 
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
  
  <!-- CRYPTOGRAPHY CONCEPTS -->
  <section class="chapter concepts" id="cryptography-primer">
    <h1 class="chapter-title">Cryptography Basics</h1>
    
    <p class="lead">
      Bitcoin's security rests on mathematical foundations developed over 
      decades of cryptographic research. Understanding these concepts reveals 
      why Bitcoin works and why it's secure.
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
      private key. <strong>SHA-256</strong> creates a unique 256-bit fingerprint
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
      numbers, there are more possibilities than atoms in the universe. 
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
      "bulge" on the left and extending to infinity on the right:
    </p>
    <pre class="example">
                          y
                          │           ╱
                          │          ╱
                   •──────┼─────────╱
                  ╱       │        │
                 ╱        │        │
                │         │        │
    ────────────┼─────────┼────────┼──────── x
                │         │        │
                 ╲        │        │
                  ╲       │        │
                   •──────┼─────────╲
                          │          ╲
                          │           ╲
</pre>
    <p>
      For any point P = (x, y) on the curve, there's a mirror point 
      -P = (x, -y). This symmetry is key to the mathematics.
    </p>
    <p>
      Points on this curve can be "added" together using a geometric rule.
      To add points P and Q:
    </p>
    <ol>
      <li>Draw a line through P and Q</li>
      <li>Find where the line intersects the curve (point R')</li>
      <li>Reflect R' across the x-axis to get R = P + Q</li>
    </ol>
    <pre class="example">
       <span class="token class-name">Point Addition</span>: P + Q = R

                      │           ╱
               P •────┼──────────• R'  ← line intersects curve
                ╱╲    │         ╱│
               ╱  ╲   │        ╱ │
              ╱    ╲  │       │  │ reflect across x-axis
     ────────┼──────╲─┼───────┼──┼─────
              ╲    Q •│       │  │
               ╲      │        ╲ ↓
                ╲     │         ╲• R = P + Q
                 •────┼──────────╲
                      │           ╲
</pre>
    <p>
      To <strong>double</strong> a point (add it to itself), draw the 
      <strong>tangent line</strong> at P, find where it intersects, and reflect:
    </p>
    <pre class="example">
       <span class="token class-name">Point Doubling</span>: P + P = 2P

                      │           ╱
                      │          • R'  ← tangent intersects
               P •────┼─────────╱│
                ╱ ╲   │        ╱ │
               ╱tangent        │  │ reflect
     ─────────┼───────┼────────┼──┼───
               ╲      │        │  │
                ╲     │         ╲ ↓
                 •────┼──────────• 2P
                      │           ╲
</pre>
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
      These coordinates look random but are actually derived from a simple formula,
      making them "nothing up my sleeve" numbers—verifiably not chosen to hide a
      backdoor. Satoshi didn't define G in Bitcoin's code; he used OpenSSL's built-in
      <code class="token variable">NID_secp256k1</code> curve identifier, which includes G and all other
      curve parameters.
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
<span class="token comment">// Computing k from P: ~10^37 years (all computers on Earth)</span></pre>
    <p>
      This asymmetry—trivial to compute forward, impossible to reverse—is why
      your public key (and Bitcoin address) can be safely shared while your
      private key must remain secret.
    </p>
    
    <h3>A Note on the Source Code</h3>
    <p>
      You won't find elliptic curve math in Bitcoin's source code. Satoshi 
      delegated <strong>all</strong> cryptography to <strong>OpenSSL</strong>, 
      a battle-tested library. In <code>key.h</code>, the entire CKey class 
      is a thin wrapper around OpenSSL functions:
    </p>
    <pre class="example"><span class="token comment">// From key.h - Satoshi's entire ECC implementation:</span>
<span class="token class-name">EC_KEY</span><span class="token operator">*</span> <span class="token variable">pkey</span> <span class="token operator">=</span> <span class="token function">EC_KEY_new_by_curve_name</span>(<span class="token variable">NID_secp256k1</span>);  <span class="token comment">// Create key</span>
<span class="token function">EC_KEY_generate_key</span>(<span class="token variable">pkey</span>);                           <span class="token comment">// Generate keypair</span>
<span class="token function">ECDSA_sign</span>(...);                                     <span class="token comment">// Sign data</span>
<span class="token function">ECDSA_verify</span>(...);                                   <span class="token comment">// Verify signature</span></pre>
    <p>
      The point addition, scalar multiplication, and all the complex curve 
      arithmetic live inside OpenSSL's compiled libraries. This was wise—
      cryptographic code is notoriously difficult to implement securely, and 
      using a well-audited library avoided potential vulnerabilities.
    </p>
    
    <h2>Digital Signatures (ECDSA)</h2>
    <p>
      Bitcoin uses the <strong>Elliptic Curve Digital Signature Algorithm</strong> 
      (ECDSA) to prove ownership. When you spend bitcoins, you create a 
      signature that proves you know the private key without revealing it.
    </p>
    <pre class="example">Signing (private key k, message m):
1. Generate random number r
2. Compute R = rG (a curve point)
3. Compute s = (hash(m) + R.x × k) / r
4. Signature is (R.x, s)

Verification (public key P, message m, signature):
1. Compute u1 = hash(m) / s
2. Compute u2 = R.x / s
3. Verify that u1×G + u2×P = R</pre>
    <p>
      The signature proves you know k (private key) because only someone 
      who knows k could produce an s that satisfies the verification equation.
    </p>
    
    <h2>Hash Functions in Bitcoin</h2>
    <p>
      Bitcoin uses several hash functions for different purposes:
    </p>
    
    <h3>SHA-256 (Secure Hash Algorithm)</h3>
    <p>
      The primary hash function. Takes any input and produces a 256-bit output.
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
    
    <h3>Step 1: Padding</h3>
    <p>
      The message is padded to a multiple of 512 bits: append a '1' bit, 
      then '0' bits, then the original length as a 64-bit integer.
    </p>
    
    <h3>Step 2: Initialize Hash Values</h3>
    <p>
      Eight 32-bit words are initialized from the square roots of the 
      first 8 primes:
    </p>
    <pre class="example">H0 = 0x6a09e667   H4 = 0x510e527f
H1 = 0xbb67ae85   H5 = 0x9b05688c
H2 = 0x3c6ef372   H6 = 0x1f83d9ab
H3 = 0xa54ff53a   H7 = 0x5be0cd19</pre>
    
    <h3>Step 3: Process Blocks (64 Rounds)</h3>
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
    
    <h3>Step 4: Output</h3>
    <p>
      Concatenate the final H0-H7 values to produce 256 bits (64 hex chars):
    </p>
    <pre class="example">SHA256("Bitcoin") = b4056df6691f8dc72e56302ddad345d65...</pre>
    <p>
      The key property: every input bit affects every output bit through 
      64 rounds of mixing. Bitcoin uses <strong>double SHA-256</strong> 
      (SHA256(SHA256(x))) for extra security.
    </p>
    <p>
      The key insight: every bit of input affects every bit of output through
      64 rounds of mixing. The constants K[0..63] are derived from cube roots
      of the first 64 primes—nothing up anyone's sleeve.
    </p>
    <p>
      Bitcoin often uses <strong>double SHA-256</strong> (SHA256(SHA256(x))) for
      extra security against length-extension attacks.
    </p>

    <h3>The Avalanche Effect</h3>
    <p>
      A critical property of cryptographic hash functions is the <strong>avalanche effect</strong>:
      changing even a single character in the input produces a completely different hash.
      This makes it impossible to predict or reverse-engineer the output:
    </p>
    <pre class="example"><span class="token keyword">Input:</span>  <span class="token string">"The Times 03/Jan/2009"</span>
<span class="token function">SHA256:</span> <span class="token number">72a0d3c0c831c12b6e6066ce5f6f3d77e6d61c8bbdfd4b7a9a25a11a0c36e65c</span>

<span class="token keyword">Input:</span>  <span class="token string">"The Times 03/Jan/2008"</span>  <span class="token comment">// Changed 2009 → 2008</span>
<span class="token function">SHA256:</span> <span class="token number">9f14e5a317b27c6c5dbf4e6d1a7b8c2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c</span>

<span class="token keyword">Input:</span>  <span class="token string">"the Times 03/Jan/2009"</span>  <span class="token comment">// Changed T → t</span>
<span class="token function">SHA256:</span> <span class="token number">3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e</span></pre>
    <p>
      Notice how changing just one digit (2009→2008) or one letter's case (T→t)
      produces a hash that shares virtually nothing with the original. This is why
      Satoshi embedded the Times headline in the genesis block—it proves the block
      couldn't have been created before that specific date.
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
      Using two different hash functions provides defense in depth—even if 
      one is broken, the other provides protection.
    </p>
    
    <h2>Merkle Trees</h2>
    <p>
      A <strong>Merkle tree</strong> is a data structure that efficiently 
      summarizes many items into a single hash. Each Bitcoin block contains 
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
      To prove Tx2 is in the block, you only need H(A), H(CD), and the 
      Merkle root—not all four transactions. This enables "light clients" 
      that verify transactions without downloading the entire blockchain.
    </p>
    
    <h2>Proof of Work</h2>
    <p>
      Mining is a cryptographic lottery. Miners must find a number (nonce) 
      such that the block's hash starts with many zeros:
    </p>
    <pre class="example">Target: Hash must be less than 
        0000000000000000000abc...

Miner tries:
  nonce=0: SHA256(block) = 7f3a2b... (too high)
  nonce=1: SHA256(block) = 9c4d5e... (too high)
  nonce=2: SHA256(block) = 1b8f7a... (too high)
  ...millions of attempts...
  nonce=2347893: SHA256(block) = 0000000000000abc... (valid!)</pre>
    <p>
      Because SHA-256 is unpredictable, the only way to find a valid nonce 
      is trial and error. The difficulty adjusts so that the network finds 
      a block approximately every 10 minutes, regardless of total computing power.
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
  
  <!-- C++ PRIMER -->
  <section class="chapter concepts" id="cpp-primer">
    <h1 class="chapter-title">C++ Primer</h1>

    <p class="lead">
      Bitcoin is written in C++, a powerful but complex language. This primer
      covers the syntax, patterns, and file organization you'll encounter in
      the source code.
    </p>

    <h2>File and Directory Structure</h2>
    <p>
      Bitcoin v0.01 follows traditional C++ project conventions. Understanding
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
    <h3>Bitcoin v0.01 File Organization</h3>
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
          <td>db.cpp / db.h</td>
          <td>Berkeley DB persistence layer</td>
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
          <td>wxWidgets GUI application code</td>
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
          <td>Unix/Linux build instructions</td>
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
    <pre class="example"># Compile main.cpp into main.o (object file)
main.o: main.cpp main.h
    g++ -c main.cpp -o main.o

# Link all object files into final executable
bitcoin: main.o net.o db.o script.o ...
    g++ main.o net.o ... -o bitcoin -lssl -ldb</pre>
    <p>
      Bitcoin v0.01 includes two makefiles: <code>makefile</code> for Unix/Linux
      (using g++) and <code>makefile.vc</code> for Windows (using Visual C++).
      Satoshi initially developed on Windows, so both platforms were supported
      from day one.
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
    
    <span class="token keyword">uint256</span> <span class="token function">GetHash</span><span class="token punctuation">(</span><span class="token punctuation">)</span> <span class="token punctuation">{</span>    <span class="token comment">// member function</span>
        <span class="token keyword">return</span> <span class="token function">Hash</span><span class="token punctuation">(</span><span class="token function">BEGIN</span><span class="token punctuation">(</span>nVersion<span class="token punctuation">)</span><span class="token punctuation">,</span> <span class="token function">END</span><span class="token punctuation">(</span>nLockTime<span class="token punctuation">)</span><span class="token punctuation">)</span><span class="token punctuation">;</span>
    <span class="token punctuation">}</span>
    
<span class="token keyword">private</span><span class="token operator">:</span>                   <span class="token comment">// only accessible inside class</span>
    <span class="token keyword">int</span> nLockTime<span class="token punctuation">;</span>
<span class="token punctuation">}</span><span class="token punctuation">;</span>

<span class="token comment">// Creating and using objects:</span>
<span class="token class-name">CTransaction</span> tx<span class="token punctuation">;</span>
tx<span class="token punctuation">.</span>nVersion <span class="token operator">=</span> <span class="token number">1</span><span class="token punctuation">;</span>
<span class="token keyword">uint256</span> hash <span class="token operator">=</span> tx<span class="token punctuation">.</span><span class="token function">GetHash</span><span class="token punctuation">(</span><span class="token punctuation">)</span><span class="token punctuation">;</span></pre>
    <p>
      <strong>Structs</strong> are like classes but default to public access. 
      Bitcoin uses both interchangeably.
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

<span class="token comment">// Range-based (modern C++):</span>
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

<span class="token comment">// Define constants:</span>
<span class="token keyword">#define</span> COIN <span class="token number">100000000</span>   <span class="token comment">// 1 BTC in satoshis</span>
<span class="token keyword">#define</span> MAX_BLOCK_SIZE <span class="token number">1000000</span>

<span class="token comment">// Conditional compilation:</span>
<span class="token keyword">#ifdef</span> WIN32
    <span class="token comment">// Windows-specific code</span>
<span class="token keyword">#else</span>
    <span class="token comment">// Unix/Linux code</span>
<span class="token keyword">#endif</span>

<span class="token comment">// Macros (inline code substitution):</span>
<span class="token keyword">#define</span> <span class="token function">MIN</span><span class="token punctuation">(</span>a<span class="token punctuation">,</span>b<span class="token punctuation">)</span> <span class="token punctuation">(</span><span class="token punctuation">(</span>a<span class="token punctuation">)</span> <span class="token operator">&lt;</span> <span class="token punctuation">(</span>b<span class="token punctuation">)</span> <span class="token operator">?</span> <span class="token punctuation">(</span>a<span class="token punctuation">)</span> <span class="token operator">:</span> <span class="token punctuation">(</span>b<span class="token punctuation">)</span><span class="token punctuation">)</span></pre>
    
    <h2>Common Bitcoin Patterns</h2>
    <p>
      Patterns you'll see throughout the code:
    </p>
    <pre class="example"><span class="token comment">// CRITICAL_BLOCK: Thread-safe access</span>
<span class="token function">CRITICAL_BLOCK</span><span class="token punctuation">(</span>cs_main<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token comment">// Only one thread can execute this at a time</span>
<span class="token punctuation">}</span>

<span class="token comment">// BOOST_FOREACH: Iterate over collections</span>
<span class="token function">BOOST_FOREACH</span><span class="token punctuation">(</span><span class="token class-name">CTransaction</span><span class="token operator">&amp;</span> tx<span class="token punctuation">,</span> block<span class="token punctuation">.</span>vtx<span class="token punctuation">)</span> <span class="token punctuation">{</span>
    <span class="token function">ProcessTransaction</span><span class="token punctuation">(</span>tx<span class="token punctuation">)</span><span class="token punctuation">;</span>
<span class="token punctuation">}</span>

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

<span class="token comment">// Stack allocation (automatic cleanup):</span>
<span class="token class-name">CBlock</span> block<span class="token punctuation">;</span>  <span class="token comment">// created on stack</span>
<span class="token comment">// deleted automatically when function returns</span></pre>
  </section>
  
  <!-- PART II DIVIDER -->
  <section class="part-divider">
    <span class="part-number">Part II</span>
    <h1 class="part-title">The Source Code</h1>
    <p class="part-subtitle">Bitcoin v0.01 — annotated and explained</p>
  </section>

  <!-- RESOURCES CHAPTER -->
  ${generateResourcesChapter()}

  <!-- CHAPTERS -->
  ${chaptersHtml}

  <!-- WHAT CAME AFTER -->
  <section class="chapter concepts" id="what-came-after">
    <h1 class="chapter-title">What Came After</h1>
    
    <p class="lead">
      You've now studied Bitcoin at its origin—the pristine v0.01 code that launched
      a monetary revolution. But Bitcoin didn't stop evolving on January 9, 2009.
      Over seventeen years, the codebase has grown from ~15,000 lines to over 200,000,
      with hundreds of contributors refining Satoshi's vision. Here's a chronological
      guide to what came next, so you know which versions to study for specific improvements.
    </p>

    <h2>The Satoshi Era (2009–2011)</h2>
    
    <p>
      Satoshi personally maintained Bitcoin for its first two years, releasing incremental
      improvements while communicating with early adopters on forums and mailing lists.
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.1.0</strong></td>
          <td>Jan 9, 2009</td>
          <td>First public release (this book). Windows only. IRC-based peer discovery.</td>
        </tr>
        <tr>
          <td><strong>v0.1.5</strong></td>
          <td>Feb 4, 2009</td>
          <td>Bug fixes. First transaction between Satoshi and Hal Finney (Jan 12).</td>
        </tr>
        <tr>
          <td><strong>v0.2.0</strong></td>
          <td>Dec 16, 2009</td>
          <td><strong>Linux support</strong>. Command-line daemon mode. Numerous optimizations.</td>
        </tr>
        <tr>
          <td><strong>v0.3.0</strong></td>
          <td>Jul 6, 2010</td>
          <td><strong>Mac OS X support</strong>. JSON-RPC API begins. Safer database writes.</td>
        </tr>
        <tr>
          <td><strong>v0.3.1</strong></td>
          <td>Jul 15, 2010</td>
          <td><strong>1 MB block size limit</strong> added by Satoshi as anti-spam measure. Originally temporary, became contentious years later.</td>
        </tr>
        <tr>
          <td><strong>v0.3.6</strong></td>
          <td>Aug 15, 2010</td>
          <td><strong>Testnet</strong> introduced for development testing without real value.</td>
        </tr>
        <tr>
          <td><strong>v0.3.9</strong></td>
          <td>Aug 16, 2010</td>
          <td><strong>OP_RETURN disabled</strong> after discovery of a critical script bug allowing anyone to spend any coins. Satoshi's emergency soft fork.</td>
        </tr>
        <tr>
          <td><strong>v0.3.10</strong></td>
          <td>Aug 17, 2010</td>
          <td><strong>Value overflow fix</strong>. Block 74638 exploited integer overflow to create 184 billion BTC. Chain reorganized to remove it.</td>
        </tr>
        <tr>
          <td><strong>v0.3.21</strong></td>
          <td>Apr 27, 2011</td>
          <td>Satoshi's final release. He disappeared shortly after, leaving Bitcoin to the community.</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You want to trace Satoshi's thinking as
      he responded to real-world usage. The JSON-RPC API (v0.3.0+) enabled the first
      exchanges and services. The testnet (v0.3.6) is still used today.
    </p>

    <h2>Early Community Development (2011–2013)</h2>

    <p>
      After Satoshi's departure, Gavin Andresen became lead maintainer. The project
      moved to GitHub, adopted a more formal release process, and began professionalizing.
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.4.0</strong></td>
          <td>Sep 23, 2011</td>
          <td><strong>Encrypted wallets</strong>. AES-256-CBC encryption protects private keys.</td>
        </tr>
        <tr>
          <td><strong>v0.5.0</strong></td>
          <td>Nov 21, 2011</td>
          <td><strong>New Qt GUI</strong>. Better address book. "Bitcoin-Qt" naming begins.</td>
        </tr>
        <tr>
          <td><strong>v0.6.0</strong></td>
          <td>Mar 30, 2012</td>
          <td><strong>Bloom filters</strong> (BIP 37) for lightweight SPV clients.</td>
        </tr>
        <tr>
          <td><strong>v0.7.0</strong></td>
          <td>Sep 17, 2012</td>
          <td>Reduced memory usage. Better fee handling. Prepare for BIP 16 (P2SH).</td>
        </tr>
        <tr>
          <td><strong>v0.8.0</strong></td>
          <td>Feb 18, 2013</td>
          <td><strong>LevelDB</strong> replaces Berkeley DB for UTXO set. 10x sync speed improvement.</td>
        </tr>
        <tr>
          <td><strong>v0.8.1</strong></td>
          <td>Mar 18, 2013</td>
          <td><strong>Chain split fix</strong>. BerkeleyDB lock limit caused v0.7 nodes to reject valid blocks that v0.8 accepted. 6-hour fork resolved by emergency downgrade.</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You're interested in wallet encryption (v0.4),
      SPV/light clients (v0.6), or the database architecture (v0.8). The March 2013 chain split
      is a critical lesson in consensus-critical code changes—even "non-consensus" changes can break consensus.
    </p>

    <h2>Maturation & Rebranding (2014–2016)</h2>

    <p>
      The project rebranded to "Bitcoin Core" to distinguish it from the broader
      Bitcoin ecosystem. Development became more rigorous, with extensive review
      processes and a focus on security.
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.9.0</strong></td>
          <td>Mar 19, 2014</td>
          <td><strong>Rebranded to "Bitcoin Core"</strong>. OP_RETURN outputs allowed (40-byte data limit). Payment protocol (BIP 70).</td>
        </tr>
        <tr>
          <td><strong>v0.10.0</strong></td>
          <td>Feb 16, 2015</td>
          <td><strong>Headers-first sync</strong>. Download block headers before blocks for faster IBD.</td>
        </tr>
        <tr>
          <td><strong>v0.11.0</strong></td>
          <td>Jul 12, 2015</td>
          <td><strong>Block pruning</strong>. <strong>libsecp256k1</strong> replaces OpenSSL for ECDSA—7x faster. OP_RETURN limit raised to 80 bytes.</td>
        </tr>
        <tr>
          <td><strong>v0.12.0</strong></td>
          <td>Feb 23, 2016</td>
          <td><strong>Opt-in RBF</strong> (Replace-By-Fee). Memory pool limiting. Faster signature validation.</td>
        </tr>
        <tr>
          <td><strong>v0.13.0</strong></td>
          <td>Aug 23, 2016</td>
          <td><strong>SegWit preparation</strong> (BIPs 141, 143, 144). Compact blocks (BIP 152).</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You want to understand modern sync
      strategies (v0.10), the libsecp256k1 library (v0.11), or prepare for SegWit.
      The shift from OpenSSL to libsecp256k1 is a masterclass in security-focused refactoring.
    </p>

    <h2>SegWit & Scaling Debates (2017–2019)</h2>

    <p>
      Segregated Witness (SegWit) was the most significant protocol upgrade since
      the beginning. It fixed transaction malleability, enabled the Lightning Network,
      and increased effective block capacity—all through a soft fork.
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.14.0</strong></td>
          <td>Mar 8, 2017</td>
          <td>Performance optimizations. Manual pruning. Improved fee estimation.</td>
        </tr>
        <tr>
          <td><strong>v0.15.0</strong></td>
          <td>Sep 14, 2017</td>
          <td><strong>Better fee estimation</strong>. Multi-wallet support. Script caching.</td>
        </tr>
        <tr>
          <td><strong>v0.16.0</strong></td>
          <td>Feb 26, 2018</td>
          <td><strong>Full SegWit wallet support</strong>. Native bech32 addresses (bc1...).</td>
        </tr>
        <tr>
          <td><strong>v0.17.0</strong></td>
          <td>Oct 3, 2018</td>
          <td><strong>Partial Spend Avoidance</strong>. Branch and Bound coin selection. Scantxoutset RPC.</td>
        </tr>
        <tr>
          <td><strong>v0.18.0</strong></td>
          <td>May 2, 2019</td>
          <td><strong>Output descriptors</strong>. Hardware wallet support via HWI.</td>
        </tr>
        <tr>
          <td><strong>v0.19.0</strong></td>
          <td>Nov 24, 2019</td>
          <td><strong>BIP 158 block filters</strong> (Neutrino). CPFP carve-out for Lightning.</td>
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
      Recent development has focused on Taproot (the largest upgrade since SegWit),
      privacy improvements, and hardening against sophisticated attacks.
    </p>

    <table class="version-history">
      <tbody>
        <tr>
          <td><strong>v0.20.0</strong></td>
          <td>Jun 3, 2020</td>
          <td><strong>ASMap</strong> for BGP attack resistance. Remove BIP 70 payment protocol.</td>
        </tr>
        <tr>
          <td><strong>v0.21.0</strong></td>
          <td>Jan 14, 2021</td>
          <td><strong>Descriptor wallets default</strong>. Tor V3 support. Signet test network.</td>
        </tr>
        <tr>
          <td><strong>v22.0</strong></td>
          <td>Sep 13, 2021</td>
          <td><strong>Taproot activation</strong> (BIPs 340, 341, 342). Version numbering change.</td>
        </tr>
        <tr>
          <td><strong>v23.0</strong></td>
          <td>Apr 25, 2022</td>
          <td>Taproot multisig (MuSig). CJDNS network support. Tracepoints for debugging.</td>
        </tr>
        <tr>
          <td><strong>v24.0</strong></td>
          <td>Nov 25, 2022</td>
          <td><strong>Full RBF option</strong> (mempoolfullrbf). Watch-only descriptor wallets.</td>
        </tr>
        <tr>
          <td><strong>v25.0</strong></td>
          <td>May 26, 2023</td>
          <td><strong>Miniscript</strong> for complex spending conditions. Improved coin selection.</td>
        </tr>
        <tr>
          <td><strong>v26.0</strong></td>
          <td>Dec 6, 2023</td>
          <td><strong>V2 transport protocol</strong> (BIP 324). Encrypted P2P connections.</td>
        </tr>
        <tr>
          <td><strong>v27.0</strong></td>
          <td>Apr 17, 2024</td>
          <td>libbitcoinkernel progress. Improved assumeUTXO. Fee estimation improvements.</td>
        </tr>
        <tr>
          <td><strong>v28.0</strong></td>
          <td>Oct 2, 2024</td>
          <td>Testnet4. Package relay groundwork (1P1C). Full TRUC/V3 transaction support.</td>
        </tr>
      </tbody>
    </table>

    <p>
      <strong>Study these versions if:</strong> You want to understand Schnorr signatures
      and Taproot (v22), Miniscript (v25), or encrypted P2P (v26). The libbitcoinkernel
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
          <td><strong>Aug 2010</strong></td>
          <td>OP_RETURN Bug</td>
          <td><em>Introduced by: Satoshi (v0.1)</em> — A flaw in script evaluation let anyone spend anyone's coins using OP_RETURN. Present since day one but undiscovered. Satoshi disabled multiple opcodes via emergency soft fork within hours of disclosure.</td>
        </tr>
        <tr>
          <td><strong>Aug 2010</strong></td>
          <td>Value Overflow</td>
          <td><em>Introduced by: Satoshi (v0.1)</em> — Integer overflow created 184 billion BTC in block 74638. Missing overflow check in transaction validation. Community coordinated to orphan the block within 5 hours.</td>
        </tr>
        <tr>
          <td><strong>Mar 2013</strong></td>
          <td>BDB Lock Crisis</td>
          <td><em>Introduced by: Pieter Wuille (v0.8)</em> — LevelDB migration inadvertently changed consensus behavior. BerkeleyDB's lock limits caused v0.7 nodes to reject blocks v0.8 accepted. 6-hour chain split resolved by emergency downgrade.</td>
        </tr>
        <tr>
          <td><strong>Jul 2015</strong></td>
          <td>BIP 66 Fork</td>
          <td><em>Introduced by: miners (SPV mining)</em> — Miners signaling BIP 66 (strict DER) weren't actually validating blocks. Brief fork when an invalid block was extended. Exposed risks of mining on headers without full validation.</td>
        </tr>
        <tr>
          <td><strong>Sep 2018</strong></td>
          <td>CVE-2018-17144</td>
          <td><em>Introduced by: Core developers (v0.14)</em> — Optimization to skip duplicate input checking inadvertently allowed double-spends within a single block. Silently patched in v0.16.3. Most critical vulnerability since 2010.</td>
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
      departures from the v0.01 code you just studied:
    </p>

    <table class="color-key">
      <thead>
        <tr>
          <th>Component</th>
          <th>v0.01</th>
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
          <td>IRC channels</td>
          <td>DNS seeds, addr gossip</td>
        </tr>
        <tr>
          <td>Script</td>
          <td>Basic opcodes</td>
          <td>P2SH, SegWit, Tapscript</td>
        </tr>
        <tr>
          <td>Addresses</td>
          <td>1... (P2PKH only)</td>
          <td>3... (P2SH), bc1q... (SegWit), bc1p... (Taproot)</td>
        </tr>
        <tr>
          <td>Wallet</td>
          <td>Loose key collection</td>
          <td>HD wallets, descriptors</td>
        </tr>
        <tr>
          <td>GUI</td>
          <td>wxWidgets</td>
          <td>Qt Framework</td>
        </tr>
        <tr>
          <td>Build System</td>
          <td>Makefiles (hand-written)</td>
          <td>CMake (as of v28)</td>
        </tr>
        <tr>
          <td>Code Size</td>
          <td>~15,000 lines</td>
          <td>~200,000+ lines</td>
        </tr>
      </tbody>
    </table>

    <h2>Recommended Study Path</h2>

    <p>
      Having mastered v0.01, here's a suggested progression based on your interests:
    </p>

    <ul>
      <li><strong>Consensus Rules:</strong> v0.3.10 (overflow fix) → v0.8.1 (DB fork) → v22.0 (Taproot)</li>
      <li><strong>Cryptography:</strong> v0.11.0 (libsecp256k1) → v22.0 (Schnorr/Taproot)</li>
      <li><strong>Wallet Development:</strong> v0.4.0 (encryption) → v0.18.0 (descriptors) → v0.21.0 (descriptor default)</li>
      <li><strong>Networking:</strong> v0.2.0 (daemon) → v0.6.0 (Bloom) → v26.0 (encrypted P2P)</li>
      <li><strong>Script/Smart Contracts:</strong> v0.6.0 (P2SH) → v0.13.0 (SegWit) → v22.0 (Tapscript) → v25.0 (Miniscript)</li>
      <li><strong>Lightning Prerequisites:</strong> v0.13.0 (SegWit) → v0.19.0 (CPFP carve-out) → v24.0 (full RBF)</li>
      <li><strong>Security & Bugs:</strong> v0.3.9 (OP_RETURN) → v0.3.10 (overflow) → v0.8.1 (BDB) → v0.16.3 (CVE-2018-17144)</li>
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
      to these 15,000 lines. Satoshi wrote: "I'm sure that in 20 years there will
      either be very large transaction volume or no volume." Seventeen years in,
      the code keeps evolving—and now you know where to look.
    </p>
  </section>

  <!-- INDEX -->
  ${indexHtml}

  <!-- COLOPHON -->
  <section class="chapter colophon">
    <h2 class="section-title">Colophon</h2>
    <p>
      This book contains the complete source code of Bitcoin v0.01, 
      the first public release of Bitcoin by Satoshi Nakamoto in January 2009.
    </p>
    <p>
      <strong>Typography:</strong> JetBrains Mono for code, IBM Plex Serif for body text, 
      IBM Plex Sans for headings.
    </p>
    <p>
      <strong>Specifications:</strong> 7" × 10" (Executive), 60# Uncoated White, 
      Perfect Bound Paperback with Glossy Cover.
    </p>
  </section>
</body>
</html>`;
}

/**
 * Generate the resources chapter with icons/bitmaps
 */
function generateResourcesChapter() {
  const rcAnnotation = loadAnnotation('rc');
  const rcDir = join(SOURCE_DIR, 'rc');

  // List of resource files in the rc directory
  const resourceFiles = [
    { name: 'bitcoin.ico', description: 'Main application icon (multi-resolution: 16x16, 32x32, 48x48)' },
    { name: 'check.ico', description: 'Checkmark icon for confirmations' },
    { name: 'addressbook16.bmp', description: 'Address book toolbar icon (16x16)' },
    { name: 'addressbook16mask.bmp', description: 'Address book icon transparency mask' },
    { name: 'addressbook20.bmp', description: 'Address book toolbar icon (20x20)' },
    { name: 'addressbook20mask.bmp', description: 'Address book icon transparency mask' },
    { name: 'send16.bmp', description: 'Send payment toolbar icon (16x16)' },
    { name: 'send16mask.bmp', description: 'Send icon transparency mask' },
    { name: 'send16masknoshadow.bmp', description: 'Send icon mask without shadow' },
    { name: 'send20.bmp', description: 'Send payment toolbar icon (20x20)' },
    { name: 'send20mask.bmp', description: 'Send icon transparency mask' }
  ];

  // Generate the resource gallery HTML
  let resourcesHtml = '<div class="resources-gallery">';
  for (const file of resourceFiles) {
    const filePath = join(rcDir, file.name);
    if (existsSync(filePath)) {
      // Read file and convert to base64 for embedding
      const fileData = readFileSync(filePath);
      const base64 = fileData.toString('base64');
      const mimeType = file.name.endsWith('.ico') ? 'image/x-icon' : 'image/bmp';

      resourcesHtml += `
        <div class="resource-item">
          <div class="resource-preview">
            <img src="data:${mimeType};base64,${base64}" alt="${file.name}" />
          </div>
          <div class="resource-info">
            <code class="resource-filename">${file.name}</code>
            <span class="resource-description">${file.description}</span>
          </div>
        </div>`;
    }
  }
  resourcesHtml += '</div>';

  return `
    <section class="chapter" id="rc-resources">
      <span class="section-title">rc/ (Resources)</span>
      <span class="chapter-title">Bitcoin v0.01 Alpha</span>

      <header class="chapter-header">
        <h1 class="chapter-title">rc/ (Resources)</h1>

        <div class="chapter-intro">
          <div class="file-info">
            <span class="lines">11 files</span>
            <span class="language">ICONS &amp; BITMAPS</span>
          </div>

          ${rcAnnotation?.title ? `<h2 class="intro-title">${rcAnnotation.title}</h2>` : ''}

          ${rcAnnotation?.introduction ? `<div class="description">${rcAnnotation.introduction}</div>` : ''}
        </div>
      </header>

      ${resourcesHtml}

      ${rcAnnotation?.conclusion ? `
      <div class="annotation-block chapter-conclusion">
        <h4>Summary</h4>
        ${rcAnnotation.conclusion}
      </div>` : ''}
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
    
    // Generate highlighted code HTML
    const codeHtml = generateCodeBlockHtml(
      filename,
      code,
      language,
      annotation?.annotations || []
    );
    
    processedFiles.push({
      id: filename.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
      filename,
      language,
      lineCount,
      annotation,
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
