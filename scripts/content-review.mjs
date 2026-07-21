/**
 * Content Review — continuous scroll manuscript for proofing.
 * - White UI + print typography/syntax styles (no Paged.js)
 * - Front/back matter + primers from the last book build (when present)
 * - Source chapters live from YAML (intros, line notes, conclusions)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import Prism from 'prismjs';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-makefile.js';
import 'prismjs/components/prism-markup.js';
import {
  EDITION,
  ANNOTATIONS_CREDIT,
  editionKey,
  syncEditionInHtml,
} from './edition.mjs';
import {
  SOURCE_FILE_ORDER as FILE_ORDER,
  chapterIdFromFilename,
} from './source-file-order.mjs';
import { renderRcGalleryHtml } from './rc-gallery.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const SOURCE_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.01', 'src');
const ANNOTATIONS_DIR = join(ROOT_DIR, 'src', 'annotations');
const REFERENCES_PATH = join(ROOT_DIR, 'src', 'references.yaml');
const BOOK_HTML_PATH = join(ROOT_DIR, 'output', 'bitcoin-alpha-book.html');

/** Prose / front / back sections taken from the built book HTML when available */
const PROSE_FROM_BUILD = [
  { id: 'front-matter', label: 'Title page', group: 'front', match: /id="front-matter"/ },
  { id: 'dedication', label: 'Dedication', group: 'front', match: /class="[^"]*dedication-page/ },
  { id: 'acknowledgments', label: 'Acknowledgments', group: 'front', match: /class="[^"]*acknowledgments-page/ },
  { id: 'toc', label: 'Table of contents', group: 'front', match: /class="[^"]*\btoc\b/ },
  {
    id: 'part-fundamentals',
    label: 'Fundamentals',
    group: 'divider-primer',
    match: /class="[^"]*part-divider[^"]*"[^>]*>[\s\S]{0,200}?part-title">Fundamentals/,
  },
  { id: 'introduction', label: 'Introduction', group: 'primer', match: /id="introduction"/ },
  { id: 'prehistory', label: 'The Road to Bitcoin', group: 'primer', match: /id="prehistory"/ },
  { id: 'computer-concepts', label: 'Computer Concepts', group: 'primer', match: /id="computer-concepts"/ },
  { id: 'cryptography-primer', label: 'Cryptography Basics', group: 'primer', match: /id="cryptography-primer"/ },
  { id: 'cpp-primer', label: 'C++ Primer', group: 'primer', match: /id="cpp-primer"/ },
  {
    id: 'part-source',
    label: 'The Source Code',
    group: 'divider-source',
    match: /class="[^"]*part-divider[^"]*"[^>]*>[\s\S]{0,200}?part-title">The Source Code/,
  },
  { id: 'what-came-after', label: 'What Came After', group: 'back', match: /id="what-came-after"/ },
  { id: 'index', label: 'Index', group: 'back', match: /id="index"/ },
  { id: 'colophon', label: 'Colophon', group: 'back', match: /id="colophon"/ },
];

const FALLBACK_PART_DIVIDERS = {
  'part-fundamentals': {
    id: 'part-fundamentals',
    label: 'Fundamentals',
    group: 'divider-primer',
    annCount: 0,
    html: `
      <section class="part-divider chapter" id="part-fundamentals">
        <h1 class="part-title">Fundamentals</h1>
        <p class="part-subtitle">The history, cryptography, and computer science concepts behind Bitcoin</p>
      </section>`,
  },
  'part-source': {
    id: 'part-source',
    label: 'The Source Code',
    group: 'divider-source',
    annCount: 0,
    html: `
      <section class="part-divider chapter" id="part-source">
        <h1 class="part-title">The Source Code</h1>
        <p class="part-subtitle">Bitcoin v0.01 — annotated and explained</p>
      </section>`,
  },
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function loadReferences() {
  if (!existsSync(REFERENCES_PATH)) return {};
  try {
    const refs = yaml.load(readFileSync(REFERENCES_PATH, 'utf8'));
    return refs && typeof refs === 'object' ? refs : {};
  } catch {
    return {};
  }
}

function formatFootnote(ref) {
  if (!ref || typeof ref !== 'object') return '<em>Unknown reference</em>';
  const parts = [];
  if (ref.author) parts.push(escapeHtml(ref.author));
  if (ref.title) {
    parts.push(parts.length ? `, <em>${escapeHtml(ref.title)}</em>` : `<em>${escapeHtml(ref.title)}</em>`);
  }
  if (ref.date) parts.push(` (${escapeHtml(String(ref.date))})`);
  let text = parts.join('') + (parts.length ? '.' : '');
  if (ref.note) text += ` ${escapeHtml(ref.note)}.`;
  if (ref.url) {
    const url = String(ref.url);
    text += ` <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
  }
  return text.trim() || '<em>Incomplete reference</em>';
}

class CitationContext {
  constructor(chapterId, refs) {
    this.chapterId = chapterId;
    this.refs = refs;
    this.keyToNumber = new Map();
    this.usedOrder = [];
  }

  process(html) {
    if (!html || typeof html !== 'string') return html || '';
    return html.replace(/\{\{cite:([a-zA-Z0-9][a-zA-Z0-9_-]*)\}\}/g, (_m, key) => {
      const ref = this.refs[key];
      if (!ref) {
        return `<sup class="cite-missing" title="Unknown: ${escapeHtml(key)}">?</sup>`;
      }
      let number = this.keyToNumber.get(key);
      if (number == null) {
        number = this.usedOrder.length + 1;
        this.keyToNumber.set(key, number);
        this.usedOrder.push({ key, number, ref });
      }
      return `<sup><a id="${this.chapterId}-fnref-${number}" href="#${this.chapterId}-fn-${number}" class="cite-ref">${number}</a></sup>`;
    });
  }

  footnotes() {
    if (!this.usedOrder.length) return '';
    const items = this.usedOrder.map(({ number, ref }) => `
      <li id="${this.chapterId}-fn-${number}" value="${number}">
        ${formatFootnote(ref)}
        <a href="#${this.chapterId}-fnref-${number}" class="cite-back">↩</a>
      </li>`).join('');
    return `<section class="footnotes"><h4 class="footnotes-title">Sources</h4><ol class="footnotes-list">${items}</ol></section>`;
  }
}

function loadAnnotation(filename) {
  const annotationPath = join(ANNOTATIONS_DIR, `${filename}.yaml`);
  if (!existsSync(annotationPath)) return null;
  try {
    return yaml.load(readFileSync(annotationPath, 'utf8'));
  } catch (err) {
    console.warn(`Content review: could not parse ${filename}.yaml:`, err.message);
    return null;
  }
}

function getLanguage(filename) {
  const ext = extname(filename).toLowerCase();
  const name = basename(filename).toLowerCase();
  if (name === 'makefile' || name === 'makefile.vc') return 'makefile';
  if (['.cpp', '.c', '.h'].includes(ext)) return 'cpp';
  if (ext === '.fbp') return 'markup';
  return 'text';
}

function highlightLine(line, language) {
  if (language === 'text') return escapeHtml(line);
  try {
    const grammar = Prism.languages[language] || Prism.languages.markup || Prism.languages.text;
    return Prism.highlight(line, grammar, language === 'markup' ? 'markup' : language);
  } catch {
    return escapeHtml(line);
  }
}

function getSourceFiles() {
  if (!existsSync(SOURCE_DIR)) return [];
  const allFiles = readdirSync(SOURCE_DIR, { recursive: true }).filter(f => {
    const ext = extname(f).toLowerCase();
    const name = basename(f).toLowerCase();
    return ['.cpp', '.c', '.h', '.txt', '.rc', '.fbp'].includes(ext)
      || name === 'makefile' || name === 'makefile.vc';
  });
  const ordered = [];
  for (const target of FILE_ORDER) {
    const found = allFiles.find(f => basename(f).toLowerCase() === target.toLowerCase());
    if (found) ordered.push(found);
  }
  for (const f of allFiles) {
    if (!ordered.includes(f)) ordered.push(f);
  }
  return ordered;
}

function indexAnnotations(annotations = []) {
  const byLine = new Map();
  const blocks = [];
  for (const ann of annotations) {
    if ((ann.type === 'margin' || ann.type === 'block' || !ann.type) && ann.line && ann.text) {
      byLine.set(ann.line, ann);
    } else if (ann.type === 'block' && ann.lines && ann.text) {
      blocks.push(ann);
    } else if (ann.type === 'highlight' && ann.lines) {
      for (let i = ann.lines[0]; i <= ann.lines[1]; i++) {
        if (!byLine.has(i)) byLine.set(i, { type: 'highlight', category: ann.category });
      }
    }
  }
  return { byLine, blocks };
}

function renderCodeWithAnnotations(code, language, annotations, ctx) {
  const lines = code.split('\n');
  const { byLine, blocks } = indexAnnotations(annotations);
  const blockStarts = new Map();
  for (const b of blocks) blockStarts.set(b.lines[0], b);

  let html = '';
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const ann = byLine.get(lineNum);
    let cls = 'code-line';
    if (ann?.text) cls += ' has-annotation';
    if (ann?.type === 'highlight') cls += ` highlighted ${escapeHtml(ann.category || '')}`;

    const block = blockStarts.get(lineNum);
    if (block) {
      const title = block.title ? `<strong class="ann-title">${escapeHtml(block.title)}</strong> ` : '';
      const range = block.lines ? `<span class="ann-range">L${block.lines[0]}–${block.lines[1]}</span>` : '';
      html += `<div class="annotation-block annotation-block--range">${range}${title}<div class="annotation-content">${ctx.process(block.text)}</div></div>`;
    }

    // Line notes sit immediately above the referenced line
    if (ann?.text) {
      html += `<div class="annotation-block"><div class="annotation-content">${ctx.process(ann.text)}</div></div>`;
    }

    html += `<div class="${cls}"><span class="line-num">${String(lineNum).padStart(4, ' ')}</span><span class="line-code">${highlightLine(lines[i], language)}</span></div>`;
  }
  return html;
}

/** Extract top-level <section>…</section> blocks from book HTML (handles nested sections). */
function extractTopLevelSections(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  const sections = [];
  const re = /<section\b/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const start = m.index;
    let depth = 0;
    let i = start;
    let end = -1;
    while (i < body.length) {
      const nextOpen = body.indexOf('<section', i);
      const nextClose = body.indexOf('</section>', i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 8;
      } else {
        depth -= 1;
        i = nextClose + 10;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    const raw = body.slice(start, end);
    re.lastIndex = end;
    if (/class="[^"]*blank-page/.test(raw)) continue;
    if (/id="introduction"[^>]*>introduction bitcoin digital money/.test(raw) && raw.length < 800) continue;
    if (/id="what-came-after"[^>]*>SegWit Taproot/.test(raw) && raw.length < 800) continue;
    sections.push(raw);
  }
  return sections;
}

function findBuiltSection(sections, spec) {
  return sections.find(s => spec.match.test(s.slice(0, 400))) || null;
}

function prepareProseHtml(raw, id) {
  let h = raw;
  if (/\bid="/.test(h.slice(0, 280))) {
    h = h.replace(/\bid="[^"]*"/, `id="${id}"`);
  } else {
    h = h.replace(/<section\b/, `<section id="${id}"`);
  }
  if (/\bclass="/.test(h.slice(0, 280))) {
    h = h.replace(/\bclass="/, 'class="chapter review-prose ');
  } else {
    h = h.replace(/<section\b/, '<section class="chapter review-prose"');
  }
  // Book print TOC uses class "toc" — rename so it doesn't collide with the review sidebar
  if (id === 'toc') {
    h = h.replace(/\bclass="([^"]*)\btoc\b([^"]*)"/, 'class="$1book-toc$2"');
  }
  return syncEditionInHtml(h);
}

function loadBuiltProseChapters() {
  if (!existsSync(BOOK_HTML_PATH)) {
    return {
      chapters: Object.values(FALLBACK_PART_DIVIDERS),
      fromBuild: false,
    };
  }
  // Stale builds may still say v0.2 — rewrite to edition.mjs before extract
  const html = syncEditionInHtml(readFileSync(BOOK_HTML_PATH, 'utf8'));
  const sections = extractTopLevelSections(html);
  const chapters = [];
  for (const spec of PROSE_FROM_BUILD) {
    const raw = findBuiltSection(sections, spec);
    if (!raw) {
      if (FALLBACK_PART_DIVIDERS[spec.id]) {
        chapters.push(FALLBACK_PART_DIVIDERS[spec.id]);
      }
      continue;
    }
    chapters.push({
      id: spec.id,
      label: spec.label,
      group: spec.group,
      annCount: 0,
      html: prepareProseHtml(raw, spec.id),
    });
  }
  // Ensure part dividers exist even if older builds omit them
  for (const [id, fallback] of Object.entries(FALLBACK_PART_DIVIDERS)) {
    if (!chapters.some(c => c.id === id)) chapters.push(fallback);
  }
  return { chapters, fromBuild: chapters.some(c => c.group === 'front' || c.group === 'primer') };
}

/** Build ordered chapter list (full HTML included). */
function buildAllChapters() {
  const globalRefs = loadReferences();
  const { chapters: proseChapters, fromBuild } = loadBuiltProseChapters();
  const sourceChapters = loadLiveSourceChapters(globalRefs);
  const front = proseChapters.filter(c => c.group === 'front');
  const partFundamentals = proseChapters.filter(c => c.group === 'divider-primer');
  const primers = proseChapters.filter(c => c.group === 'primer');
  const partSource = proseChapters.filter(c => c.group === 'divider-source');
  const back = proseChapters.filter(c => c.group === 'back');
  // Part I → primers → Part II → source → back
  const chapters = [
    ...front,
    ...partFundamentals,
    ...primers,
    ...partSource,
    ...sourceChapters,
    ...back,
  ];
  return {
    chapters,
    front,
    partFundamentals,
    primers,
    partSource,
    sourceChapters,
    back,
    fromBuild,
  };
}

function loadLiveSourceChapters(globalRefs) {
  const chapters = [];

  const rcAnn = loadAnnotation('rc');
  if (rcAnn) {
    const id = 'rc-resources';
    const ctx = new CitationContext(id, { ...globalRefs, ...(rcAnn.sources || {}) });
    const intro = rcAnn.introduction ? ctx.process(rcAnn.introduction) : '';
    const outro = rcAnn.conclusion ? ctx.process(rcAnn.conclusion) : '';
    const gallery = renderRcGalleryHtml(join(SOURCE_DIR, 'rc'));
    chapters.push({
      id,
      label: 'rc/ (Resources)',
      group: 'source',
      annCount: (rcAnn.annotations || []).length,
      html: `
        <article class="chapter" id="${id}">
          <header class="chapter-header">
            <h1 class="chapter-title">rc/ (Resources)</h1>
            <div class="chapter-intro">
              <div class="file-info">
                <span class="lines">11 files</span>
                <span class="language">ICONS &amp; BITMAPS</span>
              </div>
              ${rcAnn.title ? `<h2 class="intro-title">${escapeHtml(rcAnn.title)}</h2>` : ''}
              ${intro ? `<div class="description">${intro}</div>` : ''}
            </div>
          </header>
          ${gallery}
          ${outro ? `<div class="annotation-block chapter-conclusion"><h4>Summary</h4><div class="annotation-content">${outro}</div></div>` : ''}
          ${ctx.footnotes()}
        </article>`,
    });
  }

  for (const relativePath of getSourceFiles()) {
    const filename = basename(relativePath);
    const filePath = join(SOURCE_DIR, relativePath);
    if (!existsSync(filePath)) continue;

    const code = readFileSync(filePath, 'utf8');
    const language = getLanguage(filename);
    const annotation = loadAnnotation(filename) || {};
    const id = chapterIdFromFilename(filename);
    const local = annotation.sources && typeof annotation.sources === 'object' ? annotation.sources : {};
    const ctx = new CitationContext(id, { ...globalRefs, ...local });
    const anns = annotation.annotations || [];
    const lineCount = code.split('\n').length;
    const codeHtml = renderCodeWithAnnotations(code, language, anns, ctx);
    const intro = annotation.introduction ? ctx.process(annotation.introduction) : '';
    const outro = annotation.conclusion ? ctx.process(annotation.conclusion) : '';
    const noteCount = anns.filter(a => a.text).length;

    chapters.push({
      id,
      label: filename,
      group: 'source',
      annCount: noteCount,
      html: `
        <article class="chapter" id="${id}">
          <header class="chapter-header">
            <h1 class="chapter-title">${escapeHtml(filename)}</h1>
            <div class="chapter-intro">
              <div class="file-info">
                <span class="lines">${lineCount} lines</span>
                <span class="language">${language.toUpperCase()}</span>
                <span class="notes">${noteCount} notes</span>
              </div>
              ${annotation.title ? `<h2 class="intro-title">${escapeHtml(annotation.title)}</h2>` : ''}
              ${intro
                ? `<div class="description">${intro}</div>`
                : '<p class="missing-intro"><em>No introduction in YAML.</em></p>'}
            </div>
          </header>
          <div class="code-container"><div class="code-content">${codeHtml}</div></div>
          ${outro
            ? `<div class="annotation-block chapter-conclusion"><h4>Summary</h4><div class="annotation-content">${outro}</div></div>`
            : '<p class="missing-outro"><em>No conclusion in YAML.</em></p>'}
          ${ctx.footnotes()}
        </article>`,
    });
  }

  return chapters;
}

function reviewChromeCss() {
  return `
    /* Review chrome — white manuscript surface */
    html { scroll-behavior: smooth; }
    body.review-app {
      margin: 0;
      background: #ffffff;
      color: #1a1a1f;
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 10pt;
      line-height: 1.5;
    }
    .topbar {
      position: sticky; top: 0; z-index: 40;
      height: 48px; display: flex; align-items: center; gap: 16px;
      padding: 0 20px; background: #ffffff;
      border-bottom: 1px solid #dddddd;
    }
    .topbar-brand {
      font-family: var(--font-code, monospace); font-size: 11px; font-weight: 700;
      letter-spacing: 0.16em; text-transform: uppercase; text-decoration: none; color: #1a1a1f;
    }
    .topbar-meta {
      font-family: var(--font-code, monospace); font-size: 10px; color: #666;
    }
    .topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .topbar-actions a, .topbar-actions button {
      font-family: var(--font-code, monospace); font-size: 10px; font-weight: 600;
      letter-spacing: 0.1em; text-transform: uppercase; text-decoration: none;
      padding: 7px 12px; border: 1px solid #ccc; background: #fff;
      color: #555; cursor: pointer;
    }
    .topbar-actions a:hover, .topbar-actions button:hover { color: #111; border-color: #999; }
    .topbar-actions button:disabled { opacity: 0.55; cursor: wait; }
    .topbar-actions .primary { background: #1a1a1f; color: #fff; border-color: #1a1a1f; }
    .topbar-actions .primary:hover { background: #000; }
    .topbar-actions .primary:disabled:hover { background: #1a1a1f; }
    .topbar-rebuild-status { font-family: var(--font-code, monospace); font-size: 10px; color: #888; min-width: 5em; }
    .topbar-rebuild-status.err { color: #c0392b; }

    .layout {
      display: grid; grid-template-columns: 260px 1fr;
      min-height: calc(100vh - 48px);
      background: #ffffff;
    }
    .review-nav {
      position: sticky; top: 48px; align-self: start;
      height: calc(100vh - 48px); overflow: auto;
      overscroll-behavior: contain;
      background: #ffffff; border-right: 1px solid #dddddd;
      padding: 20px 0 80px;
    }
    .review-nav-group {
      font-family: var(--font-code, monospace); font-size: 9px; letter-spacing: 0.18em;
      text-transform: uppercase; color: #888; padding: 12px 18px 8px;
    }
    .review-nav-group { padding-top: 18px; border-top: 1px solid #eee; margin-top: 8px; }
    .review-nav-group:first-of-type { border-top: none; margin-top: 0; }
    .review-nav a {
      display: flex; justify-content: space-between; gap: 8px;
      padding: 6px 18px; text-decoration: none;
      font-family: var(--font-code, monospace); font-size: 11px; color: #555;
      border-left: 2px solid transparent;
    }
    .review-nav a:hover, .review-nav a.active { color: #111; background: #f5f5f5; border-left-color: #1a1a1f; }
    .review-nav .count { color: #999; font-size: 10px; }
    .review-nav-hint {
      margin: 16px 18px 0; padding-top: 14px; border-top: 1px solid #eee;
      font-size: 11px; color: #888; line-height: 1.5;
    }
    .review-nav-hint code { font-size: 10px; color: #555; }

    .flow {
      background: #ffffff; color: #1a1a1f;
      padding: 40px 56px 120px; max-width: 48rem;
      min-width: 0;
    }
    .flow-banner {
      font-family: var(--font-code, monospace); font-size: 10px; color: #666;
      letter-spacing: 0.06em; margin-bottom: 36px; padding-bottom: 16px;
      border-bottom: 1px solid #dddddd;
    }
    .flow-banner.warn { color: #986801; }

    /* Continuous manuscript — neutralize print pagination */
    .flow .blank-page { display: none !important; }
    .flow .part-divider {
      min-height: 0 !important; padding: 2.5rem 0 !important;
      page-break-before: auto !important; page-break-after: auto !important;
      border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;
      margin: 2rem 0;
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      text-align: center; background: #fafafa;
    }
    .flow .part-divider .part-title {
      font-size: 22pt; letter-spacing: 0.05em; margin: 0 0 0.4em;
    }
    .flow .part-divider .part-subtitle {
      font-size: 10pt; color: #666; max-width: 36em; margin: 0;
    }
    .flow article.chapter,
    .flow section.chapter,
    .flow .review-prose {
      scroll-margin-top: 64px;
      margin-bottom: 4rem;
      page-break-before: auto !important;
      page-break-after: auto !important;
      position: static !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
    .flow .book-toc,
    .flow .book-toc .toc-item,
    .flow .book-toc .toc-page {
      position: static !important;
      height: auto !important;
      overflow: visible !important;
    }
    .flow .chapter-header h1.chapter-title {
      /* Match print: filename is the hero — typography.css already sizes it */
      margin-bottom: 0.35em;
      padding-bottom: 0.35em;
      border-bottom: 1px solid #dddddd;
    }
    .flow .chapter-intro {
      break-after: auto !important;
      page-break-after: auto !important;
      margin: 0 0 1.5rem;
      max-width: 68ch;
    }
    .flow .chapter-intro .file-info {
      font-family: var(--font-code, monospace);
      font-size: var(--font-size-xs, 8pt);
      color: var(--color-text-muted, #666);
      margin-bottom: 0.75em;
    }
    .flow .chapter-intro .file-info span { margin-right: 1.5em; }
    .flow .chapter-intro .intro-title {
      font-family: var(--font-heading, var(--font-code, monospace));
      font-size: var(--font-size-lg, 13pt);
      font-weight: 600;
      margin: 0 0 0.5em;
      color: var(--color-text, #1a1a1f);
    }
    .flow .chapter-intro .description {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: 10pt;
      line-height: 1.5;
      color: #1a1a1f;
    }
    .flow .missing-intro, .flow .missing-outro {
      font-size: 9pt; color: #999; margin: 0.75rem 0 1.25rem;
    }
    .flow .annotation-block--range {
      border-left: 3px solid #888; padding-left: 0.75em;
    }
    .flow .ann-range {
      font-family: var(--font-code, monospace); font-size: 8pt;
      letter-spacing: 0.08em; text-transform: uppercase; color: #888; margin-right: 0.5em;
    }
    .flow .cite-ref, .flow .cite-back { color: #555; text-decoration: none; }
    .flow .cite-missing { color: #d73a49; }

    .chapter-mount {
      scroll-margin-top: 64px;
      margin-bottom: 4rem;
      min-height: 4rem;
    }
    .chapter-mount[data-state="pending"] .chapter-placeholder,
    .chapter-mount[data-state="loading"] .chapter-placeholder {
      font-family: var(--font-code, monospace); font-size: 10px; color: #999;
      letter-spacing: 0.08em; text-transform: uppercase;
      padding: 2rem 0; border-bottom: 1px dashed #e5e5e5;
    }
    .chapter-mount[data-state="error"] .chapter-placeholder { color: #d73a49; }

    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .review-nav { position: relative; top: 0; height: auto; max-height: 40vh; }
      .flow { padding: 28px 20px 80px; }
    }
  `;
}

function tocGroupHtml(title, items) {
  if (!items.length) return '';
  const links = items.map(c => `
    <a href="#${c.id}" data-id="${c.id}">
      <span>${escapeHtml(c.label)}</span>
      ${c.annCount ? `<span class="count">${c.annCount}</span>` : ''}
    </a>`).join('');
  return `<div class="review-nav-group">${escapeHtml(title)}</div>${links}`;
}

const chapterHtmlCache = new Map(); // id → { html, builtAt }
let shellHtmlCache = null;
let cachedEditionKey = null;

function invalidateIfEditionChanged(bypassCache = false) {
  const key = editionKey();
  if (bypassCache || cachedEditionKey !== key) {
    chapterHtmlCache.clear();
    shellHtmlCache = null;
    cachedEditionKey = key;
  }
}

/**
 * Render one chapter's HTML. Cached until process restart / Reload /
 * edition.mjs change. Always re-syncs edition strings on the way out.
 */
export function renderReviewChapterHtml(id, { bypassCache = false } = {}) {
  invalidateIfEditionChanged(bypassCache);
  if (chapterHtmlCache.has(id)) {
    return syncEditionInHtml(chapterHtmlCache.get(id).html);
  }
  const { chapters } = buildAllChapters();
  for (const c of chapters) {
    chapterHtmlCache.set(c.id, { html: c.html, builtAt: Date.now() });
  }
  const hit = chapterHtmlCache.get(id);
  if (!hit) return null;
  return syncEditionInHtml(hit.html);
}

export function clearReviewChapterCache() {
  chapterHtmlCache.clear();
  shellHtmlCache = null;
  cachedEditionKey = null;
}

/**
 * Lightweight shell — chapters load on demand (~KB vs ~14MB monolith).
 * Pass bypassCache (Reload) to pick up YAML / build changes.
 * Edition strings always match edition.mjs (even if the last book build is stale).
 */
export function renderContentReviewHtml({ bypassCache = false } = {}) {
  invalidateIfEditionChanged(bypassCache);
  if (shellHtmlCache) return syncEditionInHtml(shellHtmlCache);

  const {
    chapters,
    front,
    partFundamentals,
    primers,
    partSource,
    sourceChapters,
    back,
    fromBuild,
  } = buildAllChapters();
  for (const c of chapters) {
    chapterHtmlCache.set(c.id, { html: c.html, builtAt: Date.now() });
  }

  const totalNotes = sourceChapters.reduce((n, c) => n + c.annCount, 0);
  const banner = fromBuild
    ? `Continuous manuscript · chapters load as you scroll · front/back + primers from last build · source live from YAML · ${EDITION}`
    : `Continuous manuscript · chapters load as you scroll · hit <strong>Rebuild</strong> once to include front/back matter and primers`;

  const toc = [
    tocGroupHtml('Front matter', front),
    tocGroupHtml('Fundamentals', [...partFundamentals, ...primers]),
    tocGroupHtml('The Source Code', [...partSource, ...sourceChapters]),
    tocGroupHtml('Reference', back),
  ].join('');

  const mounts = chapters.map(c => `
    <div class="chapter-mount" id="${escapeHtml(c.id)}" data-id="${escapeHtml(c.id)}" data-state="pending">
      <div class="chapter-placeholder">Loading ${escapeHtml(c.label)}…</div>
    </div>`).join('\n');

  const chapterIdsJson = JSON.stringify(chapters.map(c => c.id));

  shellHtmlCache = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Review — Bitcoin Alpha Book</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles/typeface.css">
  <link rel="stylesheet" href="/styles/typography.css">
  <link rel="stylesheet" href="/styles/syntax.css">
  <style>${reviewChromeCss()}</style>
</head>
<body class="review-app">
  <header class="topbar">
    <a class="topbar-brand" href="/">Bitcoin Alpha Book</a>
    <span class="topbar-meta">Content review · ${escapeHtml(EDITION)}</span>
    <div class="topbar-actions">
      <span class="topbar-rebuild-status" id="review-rebuild-status" aria-live="polite"></span>
      <button type="button" class="primary" id="review-rebuild">Rebuild</button>
      <a href="/book">Print preview</a>
      <a href="/">Home</a>
    </div>
  </header>
  <div class="layout">
    <nav class="review-nav" aria-label="Table of contents">
      ${toc}
      <p class="review-nav-hint">${totalNotes} line notes in source chapters · ${escapeHtml(ANNOTATIONS_CREDIT)}. <strong>Rebuild</strong> runs <code>npm run build</code>, refreshes primers/front/back/colophon, then reloads live YAML.</p>
    </nav>
    <main class="flow">
      <p class="flow-banner${fromBuild ? '' : ' warn'}">${banner}</p>
      ${mounts || '<p>No content found. Run <code>npm run fetch</code> then <strong>Rebuild</strong>.</p>'}
    </main>
  </div>
  <script>
  (function () {
    const chapterIds = ${chapterIdsJson};
    const loaded = new Set();
    const inflight = new Map();
    const links = [...document.querySelectorAll('.review-nav a[data-id]')];

    const rebuildBtn = document.getElementById('review-rebuild');
    const rebuildStatus = document.getElementById('review-rebuild-status');
    rebuildBtn?.addEventListener('click', async () => {
      rebuildBtn.disabled = true;
      rebuildStatus.classList.remove('err');
      rebuildStatus.textContent = 'building…';
      try {
        const res = await fetch('/api/review/rebuild', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || res.statusText || 'Rebuild failed');
        rebuildStatus.textContent = 'done';
        location.href = '/review?reload=1' + (location.hash || '');
      } catch (err) {
        rebuildStatus.textContent = 'failed';
        rebuildStatus.classList.add('err');
        rebuildBtn.disabled = false;
        console.error(err);
      }
    });

    // One-shot cache bust — don't keep ?reload=1 on subsequent refreshes
    if (/[?&]reload=/.test(location.search)) {
      history.replaceState(null, '', '/review' + (location.hash || ''));
    }

    async function loadChapter(id) {
      if (loaded.has(id)) return;
      if (inflight.has(id)) {
        await inflight.get(id);
        return;
      }
      const mount = document.getElementById(id);
      if (!mount) return;
      mount.dataset.state = 'loading';
      const job = (async () => {
        try {
          const res = await fetch('/api/review/chapter/' + encodeURIComponent(id));
          if (!res.ok) throw new Error(res.statusText || String(res.status));
          const html = await res.text();
          mount.innerHTML = html;
          mount.dataset.state = 'ready';
          loaded.add(id);
          observeActive(mount);
        } catch (err) {
          mount.dataset.state = 'error';
          mount.innerHTML = '<div class="chapter-placeholder">Failed to load ' + id + ': ' + String(err.message || err) + '</div>';
        } finally {
          inflight.delete(id);
        }
      })();
      inflight.set(id, job);
      await job;
    }

    /** TOC / hash jumps: load every chapter above the target first so
     *  scrollIntoView isn't aiming at a short-placeholder offset. */
    async function goToChapter(id) {
      const idx = chapterIds.indexOf(id);
      if (idx < 0) return;
      history.replaceState(null, '', '#' + id);

      const through = chapterIds.slice(0, idx + 1);
      const hadGaps = through.some(cid => !loaded.has(cid));
      await Promise.all(through.map(cid => loadChapter(cid)));

      // Wait for layout after large innerHTML inserts
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({
        behavior: hadGaps ? 'auto' : 'smooth',
        block: 'start',
      });

      if (idx < chapterIds.length - 1) loadChapter(chapterIds[idx + 1]);
    }

    function observeActive(el) {
      activeIo.observe(el);
    }

    const activeIo = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const id = visible.target.dataset.id || visible.target.id;
      links.forEach(a => a.classList.toggle('active', a.dataset.id === id));
    }, { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.1, 0.25] });

    const loadIo = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = e.target.dataset.id;
        if (id) loadChapter(id);
      }
    }, { rootMargin: '800px 0px' });

    document.querySelectorAll('.chapter-mount').forEach(m => {
      loadIo.observe(m);
      activeIo.observe(m);
    });

    links.forEach(a => {
      a.addEventListener('click', (ev) => {
        const id = a.dataset.id;
        if (!id) return;
        ev.preventDefault();
        goToChapter(id);
      });
    });

    const hash = location.hash.slice(1);
    if (hash && chapterIds.includes(hash)) {
      goToChapter(hash);
    } else if (chapterIds[0]) {
      loadChapter(chapterIds[0]);
      if (chapterIds[1]) loadChapter(chapterIds[1]);
    }
  })();
  </script>
</body>
</html>`;

  return syncEditionInHtml(shellHtmlCache);
}
