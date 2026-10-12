/**
 * Static web site assembler (Netlify).
 *
 * Collects the built book + cover from output/ into dist/ and generates a
 * small landing page. Everything served publicly is static — the Express
 * preview server (npm run preview) stays the local-only DTP tool.
 *
 * Expects `npm run build` (and ideally `npm run cover`) to have run first.
 * Missing optional artifacts (cover, sheets) are skipped with a warning so
 * the book itself always deploys.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EDITION, ANNOTATIONS_CREDIT } from './edition.mjs';
import { loadManifest } from './source-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');
const DIST_DIR = join(ROOT_DIR, 'dist');

const REPO_URL = 'https://github.com/pedromvpg/bitcoin-alpha-book';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readPageCount() {
  const metaPath = join(OUTPUT_DIR, 'book-meta.json');
  if (!existsSync(metaPath)) return null;
  try {
    const { pageCount } = JSON.parse(readFileSync(metaPath, 'utf8'));
    return Number.isFinite(pageCount) ? pageCount : null;
  } catch {
    return null;
  }
}

function buildLandingHtml({ pageCount, hasCover, hasSheet, treeHash, hasSums }) {
  const pagesStat = pageCount
    ? `<div class="stat"><span class="stat-num">${pageCount}</span><span class="stat-label">Pages</span></div>`
    : '';
  const coverCard = hasCover
    ? `<a class="card" href="/cover">
         <span class="card-k">Cover</span>
         <span class="card-t">Wraparound cover</span>
         <span class="card-d">Front, spine, and back with donation QR — rendered from the same edition data as the book.</span>
       </a>`
    : '';
  const sheet = hasSheet
    ? `<figure class="sheet">
         <a href="/contact-sheet.png"><img src="/contact-sheet.png" alt="Contact sheet — page spreads and full cover" loading="lazy"></a>
         <figcaption>Contact sheet — print spreads + wraparound cover</figcaption>
       </figure>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitcoin v0.1.0 — Annotated Edition</title>
  <meta name="description" content="The complete annotated source code of Bitcoin v0.1.0 (Satoshi Nakamoto, January 2009) — a print-ready book, readable online.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0a; --bg-1: #111111; --border: #1e1e1e; --border-3: #3a3a3a;
      --text-0: #f0f0f0; --text-1: #999999; --text-2: #555555; --text-3: #2a2a2a;
      --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg); color: var(--text-1);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px; line-height: 1.6; overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    .hero {
      min-height: 92vh; display: flex; flex-direction: column; justify-content: flex-end;
      padding: 48px 64px 72px; position: relative; overflow: hidden;
      border-bottom: 1px solid var(--border);
    }
    .hero::before {
      content: ''; position: absolute; inset: 0; pointer-events: none;
      background-image:
        linear-gradient(var(--border) 1px, transparent 1px),
        linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: radial-gradient(ellipse 90% 90% at 50% 40%, black 20%, transparent 75%);
      opacity: 0.5;
    }
    .hero-ghost {
      position: absolute; right: 48px; bottom: 48px;
      font-family: var(--mono);
      font-size: clamp(180px, 28vw, 400px); font-weight: 700;
      line-height: 1; letter-spacing: -0.05em;
      color: transparent; -webkit-text-stroke: 1px var(--border-3);
      pointer-events: none; user-select: none;
    }
    .hero-body { position: relative; }
    .hero-eyebrow {
      display: flex; align-items: center; gap: 12px;
      font-family: var(--mono); font-size: 10px; letter-spacing: 0.28em;
      text-transform: uppercase; color: var(--text-2); margin-bottom: 20px;
    }
    .hero-eyebrow::before { content: ''; width: 28px; height: 1px; background: var(--border-3); }
    h1 {
      font-family: var(--mono);
      font-size: clamp(48px, 9vw, 112px); font-weight: 700; line-height: 0.9;
      letter-spacing: -0.025em; color: var(--text-0); margin-bottom: 24px;
    }
    h1 .version { display: block; font-size: 0.5em; color: var(--text-1); letter-spacing: 0.01em; }
    .hero-desc { max-width: 560px; color: var(--text-2); line-height: 1.75; margin-bottom: 14px; }
    .hero-meta {
      font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em;
      color: var(--text-2); margin-bottom: 36px;
    }
    .hero-meta .edition { color: var(--text-1); font-weight: 500; display: block; }
    .hero-meta .credit { color: var(--text-2); display: block; }
    .hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 52px; }
    .btn {
      font-family: var(--mono); font-size: 10px; font-weight: 600;
      letter-spacing: 0.12em; text-transform: uppercase;
      padding: 12px 22px; border: 1px solid var(--border-3);
      color: var(--text-2); background: transparent;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .btn:hover { color: var(--text-0); border-color: var(--text-2); }
    .btn-primary { background: var(--text-0); color: var(--bg); border-color: var(--text-0); }
    .btn-primary:hover { background: #fff; color: var(--bg); }
    .hero-stats { display: flex; flex-wrap: wrap; gap: 0 44px; border-top: 1px solid var(--border); padding-top: 26px; }
    .stat { display: flex; flex-direction: column; gap: 5px; }
    .stat-num { font-family: var(--mono); font-size: 28px; font-weight: 700; color: var(--text-0); line-height: 1; }
    .stat-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-3); }
    section { padding: 72px 64px; border-bottom: 1px solid var(--border); }
    .section-eyebrow {
      font-family: var(--mono); font-size: 10px; letter-spacing: 0.28em;
      text-transform: uppercase; color: var(--text-2); margin-bottom: 28px;
    }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); }
    .card { background: var(--bg-1); padding: 24px; display: flex; flex-direction: column; gap: 8px; }
    .card:hover { background: #161616; }
    .card-k { font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-3); }
    .card-t { font-family: var(--mono); font-size: 15px; font-weight: 600; color: var(--text-0); }
    .card-d { font-size: 12px; color: var(--text-2); line-height: 1.65; }
    .sheet { margin: 0; }
    .sheet img { display: block; width: 100%; border: 1px solid var(--border); }
    .sheet figcaption {
      font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--text-2); padding-top: 10px;
    }
    footer {
      padding: 36px 64px; display: flex; flex-wrap: wrap; gap: 16px;
      justify-content: space-between; align-items: center;
      font-family: var(--mono); font-size: 10px; letter-spacing: 0.06em; color: var(--text-3);
    }
    footer .links { display: flex; gap: 22px; }
    footer a { text-transform: uppercase; letter-spacing: 0.12em; }
    footer a:hover { color: var(--text-1); }
    @media (max-width: 720px) {
      .hero, section, footer { padding-left: 24px; padding-right: 24px; }
      .hero-ghost { right: 12px; }
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="hero-ghost" aria-hidden="true">01</div>
    <div class="hero-body">
      <div class="hero-eyebrow">Annotated Edition</div>
      <h1>BITCOIN<span class="version">v0.1.0</span></h1>
      <p class="hero-desc">The original Bitcoin source code — 32 files, roughly 20,000 lines of C++ — released by Satoshi Nakamoto in January 2009. Annotated line by line for developers, historians, and the Bitcoin-curious.</p>
      <p class="hero-meta">
        <span class="edition">Annotated edition — ${escapeHtml(EDITION)}</span>
        <span class="credit">${escapeHtml(ANNOTATIONS_CREDIT)}</span>
      </p>
      <div class="hero-actions">
        <a href="/book" class="btn btn-primary">Read the book →</a>
        ${hasCover ? '<a href="/cover" class="btn">View cover</a>' : ''}
        <a href="${REPO_URL}/releases" class="btn">PDF releases</a>
        <a href="${REPO_URL}" class="btn">Source</a>
      </div>
      <div class="hero-stats">
        ${pagesStat}
        <div class="stat"><span class="stat-num">32</span><span class="stat-label">Source Files</span></div>
        <div class="stat"><span class="stat-num">7 × 10</span><span class="stat-label">Print Format (in)</span></div>
      </div>
    </div>
  </div>

  <section>
    <div class="section-eyebrow">The Project</div>
    <div class="cards">
      <a class="card" href="/book">
        <span class="card-k">Book</span>
        <span class="card-t">Read online</span>
        <span class="card-d">The complete annotated source in one HTML file — primers, margin notes, highlights, and index. Print stylesheets included: your browser's Print dialog reproduces the book.</span>
      </a>
      ${coverCard}
      <a class="card" href="${REPO_URL}/releases">
        <span class="card-k">Print</span>
        <span class="card-t">PDF releases</span>
        <span class="card-d">Edition-stamped print PDFs (book + cover) are attached to every GitHub release, ready for a 7×10&#8202;in print run.</span>
      </a>
      <a class="card" href="${REPO_URL}">
        <span class="card-k">Build</span>
        <span class="card-t">Fully reproducible</span>
        <span class="card-d">Chapters are generated from YAML annotation files over the fetched v0.1.0 tree. <span style="font-family:var(--mono)">npm run build</span> regenerates everything on this site.</span>
      </a>
      ${treeHash ? `<a class="card" href="/source-manifest.json">
        <span class="card-k">Verify</span>
        <span class="card-t">Byte-for-byte source</span>
        <span class="card-d">Every printed file is hashed against the January 2009 release. SHA-256 tree hash: <span style="font-family:var(--mono);word-break:break-all">${escapeHtml(treeHash)}</span>${hasSums ? ' — release PDF checksums in <span style="font-family:var(--mono)">SHA256SUMS</span>.' : '.'}</span>
      </a>` : ''}
    </div>
  </section>

  ${sheet ? `<section><div class="section-eyebrow">Overview</div>${sheet}</section>` : ''}

  <footer>
    <span>Bitcoin v0.1.0 — Annotated Edition — ${escapeHtml(EDITION)}</span>
    <span class="links">
      <a href="/book">Book</a>
      ${hasCover ? '<a href="/cover">Cover</a>' : ''}
      <a href="${REPO_URL}">GitHub</a>
      <a href="${REPO_URL}/releases">Releases</a>
      ${hasSums ? '<a href="/SHA256SUMS">SHA256SUMS</a>' : ''}
    </span>
  </footer>
</body>
</html>
`;
}

function main() {
  console.log('🌐 Assembling static web site (dist/)...\n');

  const bookPath = join(OUTPUT_DIR, 'bitcoin-alpha-book.html');
  if (!existsSync(bookPath)) {
    console.error('✗ output/bitcoin-alpha-book.html not found — run npm run build first.');
    process.exit(1);
  }

  rmSync(DIST_DIR, { recursive: true, force: true });
  mkdirSync(DIST_DIR, { recursive: true });

  // Book (required)
  copyFileSync(bookPath, join(DIST_DIR, 'book.html'));
  console.log('   ✓ book.html');

  // Cover (optional — needs sharp)
  const coverPath = join(OUTPUT_DIR, 'cover.html');
  const hasCover = existsSync(coverPath);
  if (hasCover) {
    copyFileSync(coverPath, join(DIST_DIR, 'cover.html'));
    console.log('   ✓ cover.html');
  } else {
    console.warn('   ⚠ cover.html missing — skipping (run npm run cover to include it)');
  }

  // Contact sheet (optional — committed PNG, used as the landing visual)
  const sheetPath = join(OUTPUT_DIR, 'contact-sheet.png');
  const hasSheet = existsSync(sheetPath);
  if (hasSheet) {
    copyFileSync(sheetPath, join(DIST_DIR, 'contact-sheet.png'));
    console.log('   ✓ contact-sheet.png');
  } else {
    console.warn('   ⚠ contact-sheet.png missing — landing page renders without it');
  }

  // Source manifest (committed) + latest release checksums (committed under releases/)
  const manifest = loadManifest();
  if (manifest) {
    copyFileSync(join(ROOT_DIR, 'src', 'source-manifest.json'), join(DIST_DIR, 'source-manifest.json'));
    console.log('   ✓ source-manifest.json');
    copyFileSync(join(ROOT_DIR, 'src', 'openssl-manifest.json'), join(DIST_DIR, 'openssl-manifest.json'));
    console.log('   ✓ openssl-manifest.json');
  }
  const releasesDir = join(ROOT_DIR, 'releases');
  const latestSums = existsSync(releasesDir)
    ? readdirSync(releasesDir).sort().reverse()
        .map((d) => join(releasesDir, d, 'SHA256SUMS'))
        .find((p) => existsSync(p))
    : null;
  if (latestSums) {
    copyFileSync(latestSums, join(DIST_DIR, 'SHA256SUMS'));
    console.log('   ✓ SHA256SUMS (latest release)');
  }

  // Landing page
  const pageCount = readPageCount();
  writeFileSync(
    join(DIST_DIR, 'index.html'),
    buildLandingHtml({ pageCount, hasCover, hasSheet, treeHash: manifest?.treeHash, hasSums: Boolean(latestSums) }),
    'utf8',
  );
  console.log('   ✓ index.html (landing)');

  // Pretty paths
  writeFileSync(
    join(DIST_DIR, '_redirects'),
    ['/book   /book.html   200', '/cover  /cover.html  200', ''].join('\n'),
    'utf8',
  );
  console.log('   ✓ _redirects (/book, /cover)');

  console.log(`\n✨ Static site ready in dist/ (${EDITION})`);
}

main();
