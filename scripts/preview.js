/**
 * Preview Server for Bitcoin Alpha Book
 *
 * Routes:
 *   /            → project home page (templates/home.html)
 *   /book        → DTP preview chrome (templates/preview.html)
 *                  ?section=<id> opens only that chapter in the iframe
 *   /cover       → cover HTML (auto-rebuilds when stale; nav + inspect + proof PDF)
 *   /api/cover/rebuild → POST force-rebuild cover
 *   /api/cover/pdf → POST generate print-proof cover.pdf
 *   /cover.pdf   → download latest cover proof PDF
 *   /review      → continuous content review (live source + annotations, sidebar TOC)
 *   /api/review/rebuild → POST run npm run build, clear review cache
 *   /thumbnails     → raw page grid (thumbnails.png)
 *   /contact-sheet  → print overview (spreads + full cover)
 *   /releases/*  → static files from releases/ directory
 *   /api/releases → JSON list of all timestamped releases
 *   /api/typeface → GET/POST active Design System typeface pairing
 */

import express from 'express';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import {
  EDITION,
  ANNOTATIONS_CREDIT,
  syncEditionInHtml,
} from './edition.mjs';
import { buildCover } from './build-cover.js';
import {
  renderContentReviewHtml,
  renderReviewChapterHtml,
  clearReviewChapterCache,
} from './content-review.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');
const STYLES_DIR = join(ROOT_DIR, 'styles');
const TYPEFACES_PATH = join(STYLES_DIR, 'typefaces.json');
const TYPEFACE_CSS_PATH = join(STYLES_DIR, 'typeface.css');
const COVER_HTML_PATH = join(OUTPUT_DIR, 'cover.html');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '32kb' }));

/** Inputs that should trigger a cover rebuild when newer than cover.html */
const COVER_SOURCE_PATHS = [
  join(__dirname, 'edition.mjs'),
  join(__dirname, 'build-cover.js'),
  join(__dirname, 'source-file-order.mjs'),
  join(__dirname, 'donation-preview-payload.json'),
  join(OUTPUT_DIR, 'book-meta.json'),
  join(OUTPUT_DIR, 'donation-cover.json'),
  join(ROOT_DIR, 'assets', 'piratehash-logo.png'),
  TYPEFACE_CSS_PATH,
];

function coverNeedsRebuild() {
  if (!existsSync(COVER_HTML_PATH)) return true;
  const outM = statSync(COVER_HTML_PATH).mtimeMs;
  return COVER_SOURCE_PATHS.some(p => existsSync(p) && statSync(p).mtimeMs > outM);
}

let coverBuildQueue = Promise.resolve();

function ensureLatestCover({ force = false } = {}) {
  coverBuildQueue = coverBuildQueue.then(async () => {
    if (!force && !coverNeedsRebuild()) return;
    console.log(`   ↻ Rebuilding cover for preview${force ? ' (forced)' : ''}…`);
    // Cache-bust so edits to build-cover.js / edition.mjs apply without restarting the server
    const { buildCover } = await import(`./build-cover.js?t=${Date.now()}`);
    const { EDITION: edition } = await import(`./edition.mjs?t=${Date.now()}`);
    await buildCover({ previewDonation: true, quiet: true });
    console.log(`   ✓ Cover rebuilt (${edition})`);
  });
  return coverBuildQueue;
}

function sendNoStore(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  });
}

/** Preview-only chrome — not written to cover.html on disk (PDF stays clean). */
function injectCoverPreviewChrome(html) {
  const chrome = `
<style id="cover-preview-chrome">
  @media screen {
    html {
      background: #666 !important;
      overflow: auto !important;
      height: auto !important;
      width: auto !important;
    }
    body {
      overflow: visible !important;
      height: auto !important;
      width: auto !important;
      min-height: 100vh;
      margin: 0 !important;
      padding: 48px 0 32px !important;
      box-sizing: border-box;
    }
    #cover-zoom-stage {
      position: absolute;
      left: 24px;
      top: 48px;
      transform-origin: top left;
      will-change: transform;
    }
    #cover-zoom-spacer {
      pointer-events: none;
    }

    /* Flush to viewport edges — no inset margin */
    #cover-preview-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px; color: #e8e8e8;
      background: rgba(12,12,12,0.96); border: none; border-bottom: 1px solid #333;
      border-radius: 0; margin: 0;
      padding: 8px 12px; backdrop-filter: blur(8px);
      box-shadow: none;
    }
    #cover-preview-bar .edition { color: #999; letter-spacing: 0.04em; margin-right: 4px; }
    #cover-preview-bar .sep { width: 1px; height: 18px; background: #333; margin: 0 4px; flex-shrink: 0; }
    #cover-preview-bar .zoom-label {
      font-weight: 600; letter-spacing: 0.06em; color: #aaa;
      min-width: 3.2em; text-align: center;
    }
    #cover-preview-bar a.nav,
    #cover-preview-bar button {
      font: inherit; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; cursor: pointer; text-decoration: none;
      background: #222; color: #ddd; border: 1px solid #3a3a3a;
      padding: 6px 10px; display: inline-flex; align-items: center;
    }
    #cover-preview-bar a.nav:hover,
    #cover-preview-bar button:hover { background: #2e2e2e; color: #fff; border-color: #555; }
    #cover-preview-bar button.primary {
      background: #f0f0f0; color: #111; border-color: #f0f0f0;
    }
    #cover-preview-bar button.primary:hover { background: #fff; }
    #cover-preview-bar button.on {
      background: #3d6bfd; color: #fff; border-color: #3d6bfd;
    }
    #cover-preview-bar button:disabled { opacity: 0.55; cursor: wait; }
    #cover-preview-bar .status { min-width: 4.5em; color: #888; margin-left: 4px; }
    #cover-preview-bar .status.err { color: #e0454a; }
    #cover-preview-bar .grow { flex: 1 1 auto; min-width: 8px; }

    /* Keep metrics bar pinned to viewport (not trapped by zoom transform) */
    .info-bar {
      position: fixed !important;
      bottom: 0 !important; left: 0 !important; right: 0 !important;
      z-index: 99998 !important;
      transform: none !important;
      margin: 0 !important;
    }

    body.cover-inspecting, body.cover-inspecting * { cursor: crosshair !important; }
    #cover-inspect-hilite {
      position: absolute; pointer-events: none; z-index: 99997;
      border: 1.5px solid #3d6bfd;
      background: rgba(61,107,253,0.12);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.35);
      display: none;
    }
    #cover-inspect-panel {
      position: fixed; bottom: 16px; right: 16px; z-index: 99998;
      width: min(360px, calc(100vw - 32px));
      max-height: min(50vh, 420px); overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px; color: #e8e8e8; line-height: 1.45;
      background: rgba(12,12,12,0.96); border: 1px solid #333;
      padding: 12px 14px; backdrop-filter: blur(8px);
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      display: none;
    }
    #cover-inspect-panel.visible { display: block; }
    #cover-inspect-panel .insp-tag { color: #7aa2ff; font-weight: 700; }
    #cover-inspect-panel .insp-cls { color: #9cdcfe; word-break: break-all; }
    #cover-inspect-panel .insp-row { display: flex; gap: 8px; margin: 3px 0; }
    #cover-inspect-panel .insp-k { color: #888; min-width: 5.5em; flex-shrink: 0; }
    #cover-inspect-panel .insp-v { color: #ddd; }
    #cover-inspect-panel .insp-hint { color: #666; margin-top: 8px; font-size: 10px; }
    #cover-inspect-panel .insp-empty { color: #888; }
  }
  @media print {
    #cover-preview-bar,
    #cover-inspect-panel,
    #cover-inspect-hilite,
    #cover-zoom-spacer { display: none !important; }
    #cover-zoom-stage { transform: none !important; position: static !important; }
  }
</style>
<div id="cover-preview-bar" role="toolbar" aria-label="Cover preview controls">
  <a class="nav" href="/">Home</a>
  <span class="sep"></span>
  <button type="button" data-jump="cover-back" title="Jump to back cover (1)">Back</button>
  <button type="button" data-jump="cover-spine" title="Jump to spine (2)">Spine</button>
  <button type="button" data-jump="cover-front" title="Jump to front cover (3)">Front</button>
  <span class="sep"></span>
  <button type="button" id="cover-zoom-out" title="Zoom out (− or Ctrl+scroll)">−</button>
  <span class="zoom-label" id="cover-zoom-label">100%</span>
  <button type="button" id="cover-zoom-in" title="Zoom in (+ or Ctrl+scroll)">+</button>
  <button type="button" id="cover-zoom-100" title="Actual size (0)">100%</button>
  <button type="button" id="cover-fit-btn" title="Fit cover in view (F)">Fit</button>
  <span class="sep"></span>
  <button type="button" id="cover-inspect-btn" title="Inspect elements (I)">Inspect</button>
  <button type="button" id="cover-guides-btn" class="on" title="Toggle bleed/trim guides (G)">Guides</button>
  <span class="sep"></span>
  <button type="button" class="primary" id="cover-pdf-btn" title="Generate &amp; download print PDF">Proof PDF</button>
  <button type="button" id="cover-rebuild-btn">Rebuild</button>
  <span class="status" id="cover-rebuild-status"></span>
  <span class="grow"></span>
  <span class="edition">${EDITION}</span>
</div>
<div id="cover-inspect-hilite" aria-hidden="true"></div>
<aside id="cover-inspect-panel" aria-live="polite">
  <div class="insp-empty">Click an element to inspect. Esc exits.</div>
</aside>
<script>
(function () {
  const status = document.getElementById('cover-rebuild-status');
  const rebuildBtn = document.getElementById('cover-rebuild-btn');
  const pdfBtn = document.getElementById('cover-pdf-btn');
  const inspectBtn = document.getElementById('cover-inspect-btn');
  const guidesBtn = document.getElementById('cover-guides-btn');
  const fitBtn = document.getElementById('cover-fit-btn');
  const zoomInBtn = document.getElementById('cover-zoom-in');
  const zoomOutBtn = document.getElementById('cover-zoom-out');
  const zoom100Btn = document.getElementById('cover-zoom-100');
  const zoomLabel = document.getElementById('cover-zoom-label');
  const hilite = document.getElementById('cover-inspect-hilite');
  const panel = document.getElementById('cover-inspect-panel');
  let inspecting = false;
  let selected = null;

  const CHROME_IDS = new Set([
    'cover-preview-bar', 'cover-inspect-panel', 'cover-inspect-hilite',
    'cover-preview-chrome', 'cover-zoom-stage', 'cover-zoom-spacer',
  ]);

  const stage = document.createElement('div');
  stage.id = 'cover-zoom-stage';
  const spacer = document.createElement('div');
  spacer.id = 'cover-zoom-spacer';
  const move = [];
  for (const child of [...document.body.children]) {
    if (child.id && CHROME_IDS.has(child.id)) continue;
    if (child.classList && child.classList.contains('info-bar')) continue;
    move.push(child);
  }
  move.forEach(el => stage.appendChild(el));
  document.body.insertBefore(stage, document.body.firstChild);
  document.body.insertBefore(spacer, stage.nextSibling);
  // Re-pin metrics bar to body so position:fixed tracks the viewport
  const infoBar = document.querySelector('.info-bar');
  if (infoBar) document.body.appendChild(infoBar);

  let nativeW = 0;
  let nativeH = 0;
  const marks = stage.querySelector('.crop-marks');
  if (marks) {
    nativeW = parseFloat(marks.getAttribute('width')) || marks.getBoundingClientRect().width;
    nativeH = parseFloat(marks.getAttribute('height')) || marks.getBoundingClientRect().height;
  }
  if (!nativeW || !nativeH) {
    let maxR = 0, maxB = 0;
    for (const el of stage.children) {
      if (el.nodeType !== 1) continue;
      const sr = el.offsetLeft + el.offsetWidth;
      const sb = el.offsetTop + el.offsetHeight;
      if (sr > maxR) maxR = sr;
      if (sb > maxB) maxB = sb;
    }
    nativeW = maxR || stage.scrollWidth;
    nativeH = maxB || stage.scrollHeight;
  }
  stage.style.width = nativeW + 'px';
  stage.style.height = nativeH + 'px';

  const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.85, 1, 1.15, 1.25, 1.5, 1.75, 2, 2.5, 3];
  let zoom = 1;

  function nearestZoomIndex(z) {
    let best = 0, bestD = Infinity;
    ZOOMS.forEach((v, i) => {
      const d = Math.abs(v - z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function applyZoom(next, { anchorX, anchorY } = {}) {
    const prev = zoom;
    zoom = Math.min(3, Math.max(0.25, next));
    const ax = anchorX != null ? anchorX : (window.scrollX + window.innerWidth / 2);
    const ay = anchorY != null ? anchorY : (window.scrollY + window.innerHeight / 2);
    const contentX = (ax - 24) / prev;
    const contentY = (ay - 48) / prev;

    stage.style.transform = 'scale(' + zoom + ')';
    spacer.style.width = Math.ceil(nativeW * zoom + 48) + 'px';
    spacer.style.height = Math.ceil(nativeH * zoom + 96) + 'px';
    if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';

    window.scrollTo({
      left: Math.max(0, contentX * zoom + 24 - window.innerWidth / 2),
      top: Math.max(0, contentY * zoom + 48 - window.innerHeight / 2),
      behavior: 'auto',
    });
    if (selected) showHilite(selected);
  }

  function zoomByStep(dir) {
    const i = nearestZoomIndex(zoom);
    applyZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))]);
  }

  function fitCover() {
    const padX = 48;
    const padY = 96;
    const availW = Math.max(200, window.innerWidth - padX);
    const availH = Math.max(200, window.innerHeight - padY);
    const z = Math.min(availW / nativeW, availH / nativeH, 1);
    applyZoom(z);
    requestAnimationFrame(() => {
      const w = nativeW * zoom;
      const h = nativeH * zoom;
      window.scrollTo({
        left: Math.max(0, 24 + w / 2 - window.innerWidth / 2),
        top: Math.max(0, 48 + h / 2 - window.innerHeight / 2),
        behavior: 'smooth',
      });
    });
  }

  function jumpTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }

  function setStatus(msg, err) {
    if (!status) return;
    status.textContent = msg || '';
    status.classList.toggle('err', Boolean(err));
  }

  document.querySelectorAll('[data-jump]').forEach(btn => {
    btn.addEventListener('click', () => jumpTo(btn.getAttribute('data-jump')));
  });
  fitBtn?.addEventListener('click', fitCover);
  zoomInBtn?.addEventListener('click', () => zoomByStep(1));
  zoomOutBtn?.addEventListener('click', () => zoomByStep(-1));
  zoom100Btn?.addEventListener('click', () => applyZoom(1));

  window.addEventListener('wheel', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 0.9 : 1.1;
    applyZoom(zoom * factor, {
      anchorX: ev.clientX + window.scrollX,
      anchorY: ev.clientY + window.scrollY,
    });
  }, { passive: false });

  guidesBtn?.addEventListener('click', () => {
    const on = !guidesBtn.classList.contains('on');
    guidesBtn.classList.toggle('on', on);
    document.querySelectorAll('.guide').forEach(g => {
      g.style.display = on ? '' : 'none';
    });
  });

  rebuildBtn?.addEventListener('click', async () => {
    rebuildBtn.disabled = true;
    setStatus('building…');
    try {
      const res = await fetch('/api/cover/rebuild', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setStatus('done');
      location.reload();
    } catch (err) {
      setStatus(String(err.message || err), true);
      rebuildBtn.disabled = false;
    }
  });

  pdfBtn?.addEventListener('click', async () => {
    pdfBtn.disabled = true;
    setStatus('pdf…');
    try {
      const res = await fetch('/api/cover/pdf', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setStatus('ready');
      const a = document.createElement('a');
      a.href = '/cover.pdf?t=' + Date.now();
      a.download = 'bitcoin-alpha-cover.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setStatus(String(err.message || err), true);
    } finally {
      pdfBtn.disabled = false;
    }
  });

  function pxToIn(px) { return (px / 96).toFixed(3) + 'in'; }

  function describe(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    if (el.closest && el.closest('#cover-preview-bar, #cover-inspect-panel, #cover-zoom-spacer')) return null;
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string')
      ? el.className.trim().split(/\\s+/).filter(Boolean).map(c => '.' + c).join('')
      : '';
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      label: tag + id + cls,
      tag, id, cls,
      w: Math.round(r.width / zoom),
      h: Math.round(r.height / zoom),
      fontSize: cs.fontSize,
      fontFamily: (cs.fontFamily || '').split(',')[0].replace(/['"]/g, ''),
      fontWeight: cs.fontWeight,
      color: cs.color,
      bg: cs.backgroundColor,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      text: (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3)
        ? String(el.textContent || '').trim().slice(0, 80)
        : '',
    };
  }

  function showHilite(el) {
    if (!el || !hilite) return;
    const r = el.getBoundingClientRect();
    hilite.style.display = 'block';
    hilite.style.left = (r.left + window.scrollX) + 'px';
    hilite.style.top = (r.top + window.scrollY) + 'px';
    hilite.style.width = r.width + 'px';
    hilite.style.height = r.height + 'px';
  }

  function renderPanel(info) {
    if (!panel) return;
    if (!info) {
      panel.innerHTML = '<div class="insp-empty">Click an element to inspect. Esc exits.</div>';
      panel.classList.add('visible');
      return;
    }
    panel.innerHTML = [
      '<div><span class="insp-tag">' + info.tag + '</span> <span class="insp-cls">' + (info.id || '') + (info.cls || '') + '</span></div>',
      info.text ? '<div class="insp-row"><span class="insp-k">text</span><span class="insp-v">' + info.text.replace(/</g,'&lt;') + '</span></div>' : '',
      '<div class="insp-row"><span class="insp-k">size</span><span class="insp-v">' + info.w + ' × ' + info.h + 'px · ' + pxToIn(info.w) + ' × ' + pxToIn(info.h) + '</span></div>',
      '<div class="insp-row"><span class="insp-k">font</span><span class="insp-v">' + info.fontSize + ' / ' + info.fontWeight + ' · ' + info.fontFamily + '</span></div>',
      '<div class="insp-row"><span class="insp-k">track</span><span class="insp-v">' + info.letterSpacing + ' · lh ' + info.lineHeight + '</span></div>',
      '<div class="insp-row"><span class="insp-k">color</span><span class="insp-v">' + info.color + '</span></div>',
      '<div class="insp-row"><span class="insp-k">bg</span><span class="insp-v">' + info.bg + '</span></div>',
      '<div class="insp-hint">± zoom · Ctrl+scroll · F fit · scroll to pan · I inspect</div>',
    ].join('');
    panel.classList.add('visible');
  }

  function setInspect(on) {
    inspecting = on;
    document.body.classList.toggle('cover-inspecting', on);
    inspectBtn?.classList.toggle('on', on);
    if (!on) {
      selected = null;
      if (hilite) hilite.style.display = 'none';
      panel?.classList.remove('visible');
    } else {
      renderPanel(null);
    }
  }

  inspectBtn?.addEventListener('click', () => setInspect(!inspecting));

  document.addEventListener('mousemove', (ev) => {
    if (!inspecting) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const info = describe(el);
    if (!selected && info) showHilite(el);
  }, true);

  document.addEventListener('click', (ev) => {
    if (!inspecting) return;
    if (ev.target.closest && ev.target.closest('#cover-preview-bar, #cover-inspect-panel')) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const info = describe(el);
    if (!info) return;
    selected = el;
    showHilite(el);
    renderPanel(info);
  }, true);

  document.addEventListener('keydown', (ev) => {
    if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();
    if (k === 'escape' && inspecting) { setInspect(false); return; }
    if (k === 'i' && !ev.metaKey && !ev.ctrlKey) { setInspect(!inspecting); return; }
    if (k === 'g' && !ev.metaKey && !ev.ctrlKey) { guidesBtn?.click(); return; }
    if (k === 'f' && !ev.metaKey && !ev.ctrlKey) { fitCover(); return; }
    if ((k === '=' || k === '+') && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); zoomByStep(1); return; }
    if (k === '-' && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); zoomByStep(-1); return; }
    if (k === '0' && !ev.metaKey && !ev.ctrlKey) { applyZoom(1); return; }
    if (k === '1') jumpTo('cover-back');
    if (k === '2') jumpTo('cover-spine');
    if (k === '3') jumpTo('cover-front');
    if (inspecting && ev.key === 'ArrowUp' && selected?.parentElement) {
      ev.preventDefault();
      selected = selected.parentElement;
      const info = describe(selected);
      if (info) { showHilite(selected); renderPanel(info); }
    }
  });

  applyZoom(1);
  requestAnimationFrame(() => fitCover());
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${chrome}</body>`);
  }
  return html + chrome;
}

async function serveCover(req, res) {
  try {
    await ensureLatestCover();
  } catch (err) {
    console.error('Cover rebuild failed:', err);
    sendNoStore(res);
    return res.status(500).type('html').send(`
      <html><body style="font-family:system-ui;padding:2em;text-align:center">
        <h1>Cover rebuild failed</h1>
        <p>${String(err.message || err)}</p>
      </body></html>
    `);
  }

  if (!existsSync(COVER_HTML_PATH)) {
    sendNoStore(res);
    return res.type('html').send(`
      <html><body style="font-family:system-ui;padding:2em;text-align:center">
        <h1>Cover not yet built</h1>
        <p>Run <code>npm run cover</code> first.</p>
      </body></html>
    `);
  }

  sendNoStore(res);
  const html = injectCoverPreviewChrome(readFileSync(COVER_HTML_PATH, 'utf8'));
  res.type('html').send(html);
}

app.post('/api/cover/rebuild', async (req, res) => {
  try {
    await ensureLatestCover({ force: true });
    sendNoStore(res);
    res.json({ ok: true, edition: EDITION });
  } catch (err) {
    console.error('Forced cover rebuild failed:', err);
    sendNoStore(res);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

let coverPdfQueue = Promise.resolve();

app.post('/api/cover/pdf', async (req, res) => {
  const job = coverPdfQueue.then(async () => {
    await ensureLatestCover({ force: false });
    const { generateCoverPDF } = await import(`./generate-cover-pdf.js?t=${Date.now()}`);
    console.log('   ↻ Generating cover proof PDF…');
    const result = await generateCoverPDF({ quiet: true });
    console.log('   ✓ Cover PDF ready');
    return result;
  });
  // Keep the queue alive even if this job fails
  coverPdfQueue = job.catch(() => {});

  try {
    const result = await job;
    sendNoStore(res);
    res.json({
      ok: true,
      url: '/cover.pdf',
      printW: result.printW,
      printH: result.printH,
      pageCount: result.pageCount,
      spine: result.spine,
    });
  } catch (err) {
    console.error('Cover PDF generation failed:', err);
    sendNoStore(res);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/cover.pdf', async (req, res) => {
  const pdfPath = join(OUTPUT_DIR, 'cover.pdf');
  if (!existsSync(pdfPath)) {
    sendNoStore(res);
    return res.status(404).type('text').send('cover.pdf not found — use Proof PDF on /cover first.');
  }
  sendNoStore(res);
  res.setHeader('Content-Disposition', 'attachment; filename="bitcoin-alpha-cover.pdf"');
  res.sendFile(pdfPath);
});

let bookBuildQueue = Promise.resolve();

/** Run scripts/build.js (same as npm run build); serialised so clicks don't pile up. */
function runBookBuild() {
  bookBuildQueue = bookBuildQueue.then(
    () =>
      new Promise((resolve, reject) => {
        console.log('   ↻ Rebuilding book for review…');
        const child = spawn(process.execPath, [join(__dirname, 'build.js')], {
          cwd: ROOT_DIR,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
        });
        let log = '';
        const append = (buf) => {
          const s = buf.toString();
          log += s;
          process.stdout.write(s);
        };
        child.stdout.on('data', append);
        child.stderr.on('data', append);
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) {
            clearReviewChapterCache();
            console.log(`   ✓ Book rebuilt (${EDITION})`);
            resolve({ ok: true, log });
          } else {
            reject(new Error(`build.js exited with code ${code}`));
          }
        });
      }),
  );
  return bookBuildQueue;
}

app.post('/api/review/rebuild', async (req, res) => {
  try {
    await runBookBuild();
    // Cover page count / spine may have changed with the new book-meta
    await ensureLatestCover({ force: false });
    sendNoStore(res);
    res.json({ ok: true, edition: EDITION });
  } catch (err) {
    console.error('Book rebuild failed:', err);
    sendNoStore(res);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// Cover routes before static — always freshest build, never cached
app.get('/cover', serveCover);
app.get('/cover.html', serveCover);

/** Serve built book HTML with edition.mjs strings rewritten over stale builds. */
function serveSyncedBookHtml(filename) {
  return (req, res) => {
    const p = join(OUTPUT_DIR, filename);
    if (!existsSync(p)) return res.status(404).send('Book not yet built. Run npm run build.');
    sendNoStore(res);
    res.type('html').send(syncEditionInHtml(readFileSync(p, 'utf8')));
  };
}

app.get('/bitcoin-alpha-book.html', serveSyncedBookHtml('bitcoin-alpha-book.html'));
app.get('/bitcoin-alpha-book-print.html', serveSyncedBookHtml('bitcoin-alpha-book-print.html'));

// ── Static file serving ─────────────────────────────────────────────
app.use(express.static(OUTPUT_DIR, {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.json')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));
app.use('/styles', express.static(STYLES_DIR));
app.use('/releases', express.static(join(ROOT_DIR, 'releases')));

function loadTypefaceCatalog() {
  return JSON.parse(readFileSync(TYPEFACES_PATH, 'utf8'));
}

function writeTypefaceCss(pair, key) {
  const css = `/**
 * Active typeface pairing for Bitcoin Alpha Book.
 * Edited by the Design System preview (POST /api/typeface) and read by build.js.
 * Do not hardcode font families elsewhere — use these CSS variables.
 * @typeface ${key}
 */
:root {
  --font-code: ${pair.codeStack};
  --font-body: ${pair.bodyStack};
  --font-heading: ${pair.codeStack};
}
`;
  writeFileSync(TYPEFACE_CSS_PATH, css, 'utf8');
}

function readActiveTypefaceKey() {
  const catalog = loadTypefaceCatalog();
  try {
    const css = readFileSync(TYPEFACE_CSS_PATH, 'utf8');
    const fromComment = (css.match(/@typeface\s+(\S+)/) || [])[1];
    if (fromComment && catalog.pairs[fromComment]) return fromComment;
  } catch { /* fall through */ }
  return catalog.default;
}

// ── API: active typeface (Design System) ─────────────────────────────
app.get('/api/typeface', (req, res) => {
  try {
    const catalog = loadTypefaceCatalog();
    const key = readActiveTypefaceKey();
    res.json({ key, pair: catalog.pairs[key], catalog });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/typeface', (req, res) => {
  try {
    const catalog = loadTypefaceCatalog();
    const key = req.body?.key;
    const pair = catalog.pairs?.[key];
    if (!pair) {
      return res.status(400).json({ error: `Unknown typeface key: ${key}` });
    }
    writeTypefaceCss(pair, key);
    catalog.default = key;
    writeFileSync(TYPEFACES_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
    res.json({ ok: true, key, pair });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: release list ────────────────────────────────────────────────
app.get('/api/releases', (req, res) => {
  const releasesDir = join(ROOT_DIR, 'releases');

  const current = (() => {
    const p = join(OUTPUT_DIR, 'book-meta.json');
    if (!existsSync(p)) return {};
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
  })();

  if (!existsSync(releasesDir)) {
    return res.json({ releases: [], current });
  }

  try {
    const folders = readdirSync(releasesDir)
      .filter(name => {
        const full = join(releasesDir, name);
        return statSync(full).isDirectory()
          && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(name);
      })
      .sort()
      .reverse(); // newest first

    const releases = folders.map(name => {
      const dir = join(releasesDir, name);
      const files = readdirSync(dir).filter(f => !f.startsWith('.'));

      let pageCount = null;
      const metaPath = join(dir, 'book-meta.json');
      if (existsSync(metaPath)) {
        try { pageCount = JSON.parse(readFileSync(metaPath, 'utf8')).pageCount ?? null; }
        catch { /* ignore */ }
      }

      return { name, files, pageCount };
    });

    const coverMeta = (() => {
      const p = join(OUTPUT_DIR, 'cover-meta.json');
      if (!existsSync(p)) return null;
      try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
    })();

    res.json({
      releases,
      current,
      coverMeta,
      hasCoverHtml: existsSync(join(OUTPUT_DIR, 'cover.html')),
      hasCoverPdf:  existsSync(join(OUTPUT_DIR, 'cover.pdf')),
    });
  } catch (err) {
    res.status(500).json({ releases: [], current, error: err.message });
  }
});

// ── Home page ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const htmlPath = join(ROOT_DIR, 'templates', 'home.html');
  sendNoStore(res);
  res.type('html').send(syncEditionInHtml(readFileSync(htmlPath, 'utf8')));
});

// ── Content review (continuous scroll, live YAML — no print build) ───
app.get('/review', (req, res) => {
  try {
    const bypassCache = req.query.reload === '1' || req.query.reload === 'true';
    sendNoStore(res);
    res.type('html').send(renderContentReviewHtml({ bypassCache }));
  } catch (err) {
    console.error('Content review failed:', err);
    sendNoStore(res);
    res.status(500).type('html').send(`
      <html><body style="font-family:system-ui;padding:2em;text-align:center">
        <h1>Content review failed</h1>
        <p>${String(err.message || err)}</p>
      </body></html>
    `);
  }
});

app.get('/api/review/chapter/:id', (req, res) => {
  try {
    const html = renderReviewChapterHtml(req.params.id);
    if (!html) {
      sendNoStore(res);
      return res.status(404).type('html').send(`<p>Unknown chapter: ${req.params.id}</p>`);
    }
    sendNoStore(res);
    res.type('html').send(html);
  } catch (err) {
    console.error('Content review chapter failed:', err);
    sendNoStore(res);
    res.status(500).type('html').send(`<p>${String(err.message || err)}</p>`);
  }
});

// ── Book preview (DTP chrome) ────────────────────────────────────────
app.get('/book', (req, res) => {
  const chrome = join(ROOT_DIR, 'templates', 'preview.html');
  if (existsSync(chrome)) return res.sendFile(chrome);

  // Fallback: serve raw book HTML if chrome template is missing
  const candidates = [
    join(OUTPUT_DIR, 'bitcoin-alpha-book.html'),
    join(OUTPUT_DIR, 'bitcoin-alpha-book-print.html'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return res.sendFile(p);
  }
  res.send(`
    <html><body style="font-family:system-ui;padding:2em;text-align:center">
      <h1>Book not yet built</h1>
      <p>Run <code>npm run build</code> first.</p>
    </body></html>
  `);
});

// ── Cover (handled above with live rebuild) ──────────────────────────

// ── Thumbnails (raw grid) ───────────────────────────────────────────
app.get('/thumbnails', (req, res) => {
  const p = join(OUTPUT_DIR, 'thumbnails.html');
  if (existsSync(p)) return res.sendFile(p);
  res.send('<p style="font-family:system-ui;padding:2em">Run <code>npm run thumbnails</code> first.</p>');
});

// ── Contact sheet (print spreads + cover) ───────────────────────────
app.get('/contact-sheet', (req, res) => {
  const p = join(OUTPUT_DIR, 'contact-sheet.html');
  if (existsSync(p)) return res.sendFile(p);
  res.send('<p style="font-family:system-ui;padding:2em">Run <code>npm run thumbnails</code> first.</p>');
});

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n📖 Bitcoin Alpha Book`);
  console.log(`   Home     → http://localhost:${PORT}/`);
  console.log(`   Book     → http://localhost:${PORT}/book`);
  console.log(`   Cover    → http://localhost:${PORT}/cover`);
  console.log(`   Review   → http://localhost:${PORT}/review`);
  console.log(`   Releases → http://localhost:${PORT}/#releases\n`);
  console.log(`   Press Ctrl+C to stop\n`);
});
