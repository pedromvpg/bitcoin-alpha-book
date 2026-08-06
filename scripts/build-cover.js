/**
 * Cover Builder for Bitcoin Alpha Book
 *
 * Generates a full-spread cover (back + spine + front) with bleed and crop marks.
 * Spine width is derived from the page count using the standard 60# white paper
 * thickness of 0.002252 inches per page.
 *
 * Usage:
 *   node scripts/build-cover.js              # reads page count + Part II TOC from output/book-meta.json
 *   node scripts/build-cover.js --pages=500  # explicit page count (TOC pages still from book-meta if present)
 *
 * Part II source file list + page numbers: run `npm run pdf` after `npm run build` so book-meta.json
 * includes `part2SourceToc`; then `npm run cover`. Without that, the cover lists files with “—” pages.
 *
 * Back-cover Bitcoin QR: run `npm run donation:derive` with BITCOIN_DONATION_XPUB set (see scripts/derive-donation.js),
 * or use `npm run release` (derives a new address each time). Writes output/donation-cover.json.
 * Local preview (`npm run preview`) rebuilds the cover with `--preview-donation` so a test QR shows when no xpub is set.
 *
 * Cover logo frame (animated PNG / multi-page raster):
 *   COVER_LOGO_FRAME — optional 0-based frame index for assets/piratehash-logo.png. If unset and the file has
 *   multiple frames, the middle frame is used (better for a looping flag). Static PNGs are unchanged.
 */

import { writeFileSync, existsSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import UPNG from 'upng-js';
import {
  SOURCE_FILE_ORDER,
  COVER_TOC_HIGHLIGHT,
} from './source-file-order.mjs';
import { EDITION, ANNOTATIONS_CREDIT } from './edition.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT_DIR   = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

// ── Basis Grotesque Mono Pro — embedded as base64 for file:// PDF rendering ──
function loadFontB64(filename) {
  const p = join(ROOT_DIR, 'styles', 'fonts', filename);
  return existsSync(p) ? readFileSync(p).toString('base64') : null;
}
const BGM_REGULAR = loadFontB64('BasisGrotesqueMonoPro-Regular.woff2');
const BGM_MEDIUM  = loadFontB64('BasisGrotesqueMonoPro-Medium.woff2');
const BGM_BOLD    = loadFontB64('BasisGrotesqueMonoPro-Bold.woff2');
const BGM_ITALIC  = loadFontB64('BasisGrotesqueMonoPro-It.woff2');

function basisFontFaces() {
  const face = (b64, weight, style = 'normal') => b64
    ? `@font-face { font-family: 'Basis Grotesque Mono Pro'; src: url('data:font/woff2;base64,${b64}') format('woff2'); font-weight: ${weight}; font-style: ${style}; }`
    : '';
  return [
    face(BGM_REGULAR, 400),
    face(BGM_ITALIC,  400, 'italic'),
    face(BGM_MEDIUM,  '500 600'),
    face(BGM_BOLD,    700),
  ].filter(Boolean).join('\n    ');
}

// ── Physical constants (inches) ───────────────────────────────────────────────
const TRIM_W   = 7;        // single page width
const TRIM_H   = 10;       // page height
const BLEED    = 0.125;    // standard bleed on all sides
const MARK_LEN  = 0.25;    // crop mark gutter zone (keeps canvas dimensions stable)
const MARK_DRAW = 0.08;    // actual drawn line length (shorter marks, visually cleaner)
const MARK_GAP  = 0.0625;  // gap between bleed edge and crop mark
const PPI      = 0.002362; // inches of spine per page — matched to printer template (yvrjvv7)
const DPI      = 96;       // CSS reference px per inch

// Convert inches to CSS px string (no suffix – append "px" at use site)
const px = n => (n * DPI).toFixed(2);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0-based frame index for multi-frame logos; defaults to middle. */
function pickCoverLogoFrameIndex(frameCount) {
  if (frameCount <= 1) return 0;
  const raw = process.env.COVER_LOGO_FRAME;
  if (raw !== undefined && raw !== '') {
    const i = Number.parseInt(raw, 10);
    if (Number.isFinite(i)) return Math.max(0, Math.min(frameCount - 1, i));
  }
  return Math.floor((frameCount - 1) / 2);
}

function pngBufferHasAcTL(buf) {
  let o = 8;
  while (o + 12 <= buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.subarray(o + 4, o + 8).toString('ascii');
    if (type === 'acTL') return true;
    if (type === 'IEND') break;
    o += 12 + len;
  }
  return false;
}

function ffprobeVideoFrameCount(filePath) {
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-count_frames',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=nb_read_frames',
        '-of',
        'default=nokey=1:noprint_wrappers=1',
        filePath,
      ],
      { encoding: 'utf8' },
    ).trim();
    const n = Number.parseInt(out, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

function ffmpegExtractFrameToPng(inputPath, frameIndex, outputPath) {
  execFileSync(
    'ffmpeg',
    [
      '-nostdin',
      '-y',
      '-i',
      inputPath,
      '-vf',
      `select=eq(n\\,${frameIndex})`,
      '-frames:v',
      '1',
      outputPath,
    ],
    { stdio: 'ignore' },
  );
}

/**
 * Data URI for the cover logo. Animated PNGs use a single composited frame (middle by default).
 * Falls back to the raw file if parsing or ffmpeg fails.
 */
async function loadCoverLogoDataUri(logoPath) {
  if (!existsSync(logoPath)) return '';
  const buf = readFileSync(logoPath);

  try {
    const decoded = UPNG.decode(buf);
    const rgbaFrames = UPNG.toRGBA8(decoded);
    if (rgbaFrames.length > 1) {
      const idx = pickCoverLogoFrameIndex(rgbaFrames.length);
      const frame = Buffer.from(rgbaFrames[idx]);
      const png = await sharp(frame, {
        raw: {
          width: decoded.width,
          height: decoded.height,
          channels: 4,
        },
      })
        .png()
        .toBuffer();
      return `data:image/png;base64,${png.toString('base64')}`;
    }
  } catch {
    /* not a PNG or UPNG cannot decode */
  }

  try {
    const meta = await sharp(buf, { animated: true }).metadata();
    const pages = meta.pages ?? 1;
    if (pages > 1) {
      const idx = pickCoverLogoFrameIndex(pages);
      const png = await sharp(buf, { animated: true, page: idx }).png().toBuffer();
      return `data:image/png;base64,${png.toString('base64')}`;
    }
  } catch {
    /* ignore */
  }

  if (pngBufferHasAcTL(buf)) {
    const n = ffprobeVideoFrameCount(logoPath);
    if (n > 1) {
      const idx = pickCoverLogoFrameIndex(n);
      const tmp = join(tmpdir(), `bitcoin-alpha-cover-logo-${randomBytes(8).toString('hex')}.png`);
      try {
        ffmpegExtractFrameToPng(logoPath, idx, tmp);
        const out = readFileSync(tmp);
        return `data:image/png;base64,${out.toString('base64')}`;
      } catch {
        /* fall through to raw embed */
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** Part II rows for cover: from book-meta.json after `npm run pdf`, else filenames with placeholder pages. */
function loadPart2SourceToc() {
  const metaPath = join(OUTPUT_DIR, 'book-meta.json');
  if (existsSync(metaPath)) {
    try {
      const { part2SourceToc } = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (Array.isArray(part2SourceToc) && part2SourceToc.length) return part2SourceToc;
    } catch (_) {}
  }
  return [
    { label: 'rc/ (Resources)', page: null },
    ...SOURCE_FILE_ORDER.map(fn => ({ label: fn, page: null })),
  ];
}

function loadDonationCover({ previewDonation = false } = {}) {
  const outPath = join(OUTPUT_DIR, 'donation-cover.json');
  if (existsSync(outPath)) {
    try {
      const j = JSON.parse(readFileSync(outPath, 'utf8'));
      if (j.enabled && j.qrDataUrl && j.address) return j;
    } catch {
      /* fall through */
    }
  }

  const usePreviewFallback =
    previewDonation ||
    process.argv.includes('--preview-donation') ||
    process.env.COVER_PREVIEW_DONATION === '1';

  if (!usePreviewFallback) return null;

  const prevPath = join(__dirname, 'donation-preview-payload.json');
  if (!existsSync(prevPath)) {
    console.warn('⚠  Preview donation QR: missing scripts/donation-preview-payload.json\n');
    return null;
  }
  try {
    return JSON.parse(readFileSync(prevPath, 'utf8'));
  } catch {
    return null;
  }
}

function buildBackDonationHtml(d) {
  if (!d?.enabled || !d.qrDataUrl || !d.address) return '';
  const safeSrc = String(d.qrDataUrl).replace(/"/g, '&quot;');
  const isPlaceholder = d.placeholder || d.preview;
  const wrapClass = isPlaceholder ? 'back-barcode-wrap back-barcode-preview' : 'back-barcode-wrap';
  const title = d.placeholder
    ? 'Donation QR placeholder'
    : d.preview ? 'Preview QR' : 'Bitcoin donation';
  const sub = d.placeholder
    ? 'Replace with a real silent payment address before printing'
    : d.preview ? 'Layout-only test address'
    : d.scheme === 'silent-payment' ? 'Silent payment — scan to support this project'
    : 'Scan to support this project';
  // Wrap long addresses (silent payment sp1… runs ~115 chars) across lines
  const addr = escapeHtml(d.address);
  const chunks = addr.match(/.{1,44}/g) || [addr];
  const longClass = addr.length > 60 ? ' back-barcode-addr-long' : '';
  return `<div class="${wrapClass}" role="region" aria-label="Back cover code block">
      <div class="back-barcode-copy">
        <p class="back-barcode-label">${title}</p>
        <p class="back-barcode-sublabel">${sub}</p>
        <p class="back-barcode-addr${longClass}">${chunks.join('<br>')}</p>
      </div>
      <img class="back-barcode-qr" src="${safeSrc}" width="200" height="200" alt="">
    </div>`;
}

function buildCoverTocHtml(rows) {
  const rowHtml = r => {
    const hi = COVER_TOC_HIGHLIGHT.has(r.label) ? ' cover-toc-highlight' : '';
    const pg = r.page != null && r.page !== '' ? String(r.page) : '—';
    return `<div class="cover-toc-row${hi}"><span class="cover-toc-name">${escapeHtml(r.label)}</span><span class="cover-toc-page">${escapeHtml(pg)}</span></div>`;
  };
  return `<div class="cover-toc-inner">
    <div class="cover-toc-list">${rows.map(rowHtml).join('')}</div>
  </div>`;
}

// ── Page count resolution ─────────────────────────────────────────────────────
function getPageCount(pagesOverride) {
  if (pagesOverride != null) {
    const n = parseInt(pagesOverride, 10);
    if (Number.isFinite(n) && n > 0) {
      console.log(`   Page count from options: ${n}`);
      return n;
    }
  }

  const arg = process.argv.find(a => a.startsWith('--pages='));
  if (arg) {
    const n = parseInt(arg.split('=')[1], 10);
    console.log(`   Page count from --pages flag: ${n}`);
    return n;
  }

  const metaPath = join(OUTPUT_DIR, 'book-meta.json');
  if (existsSync(metaPath)) {
    try {
      const { pageCount } = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (pageCount) {
        console.log(`   Page count from book-meta.json: ${pageCount}`);
        return pageCount;
      }
    } catch (_) {}
  }

  console.warn('⚠  No page count available. Using 500 as default.');
  console.warn('   Run "npm run pdf" first, or pass --pages=N.\n');
  return 500;
}

// ── HTML generation ───────────────────────────────────────────────────────────
function buildCoverHtml(pageCount, logoDataUri, part2SourceToc, donationCover) {
  const spine    = Math.max(pageCount * PPI, 0.25); // min 0.25in for printability
  const logoCss    = logoDataUri ? `url("${logoDataUri}")` : 'none';
  /* Footer (donation + logo) is in normal flow; only bottom safe inset here */
  const backBottomPad = BLEED + 0.625;
  const spineLogoN = Math.min(spine * 0.98, 0.78) * 1.5; // inches: thickness across spine (after -90° rotation)
  const spineLogoAlong = Math.min(TRIM_H * 0.4, 4.5) * 1.5; // inches along spine after rotation (keeps clear of title)
  const markZone = MARK_LEN + MARK_GAP;             // 0.3125in

  // Canvas – the full document including crop-mark zone on all sides
  const canvasW = 2 * (markZone + BLEED) + 2 * TRIM_W + spine;
  const canvasH = 2 * (markZone + BLEED) + TRIM_H;

  // ── Key x positions from canvas left (inches) ──
  const trimL  = markZone + BLEED;          // left trim edge
  const spineL = trimL + TRIM_W;            // left spine edge
  const spineR = spineL + spine;            // right spine edge
  const trimR  = spineR + TRIM_W;           // right trim edge

  // ── Key y positions from canvas top (inches) ──
  const trimT = markZone + BLEED;
  const trimB = trimT + TRIM_H;

  // ── Bleed-box origin ──
  const bleedX = markZone;
  const bleedY = markZone;

  // Print area = back + spine + front including bleed on all outer edges
  const printW = 2 * TRIM_W + spine + 2 * BLEED;
  const printH = TRIM_H + 2 * BLEED;

  // ── SVG crop marks (px coordinates at 96 dpi) ──────────────────────────────
  // Vertical marks at each x boundary (top and bottom, outside bleed)
  // Horizontal marks at each y boundary (left and right, outside bleed)
  const cropXs = [trimL, spineL, spineR, trimR];
  const cropYs = [trimT, trimB];

  let marks = '';
  for (const cx of cropXs) {
    const x = px(cx);
    marks += `<line x1="${x}" y1="0" x2="${x}" y2="${px(MARK_DRAW)}"/>`;
    marks += `<line x1="${x}" y1="${px(canvasH - MARK_DRAW)}" x2="${x}" y2="${px(canvasH)}"/>`;
  }
  for (const cy of cropYs) {
    const y = px(cy);
    marks += `<line x1="0" y1="${y}" x2="${px(MARK_DRAW)}" y2="${y}"/>`;
    marks += `<line x1="${px(canvasW - MARK_DRAW)}" y1="${y}" x2="${px(canvasW)}" y2="${y}"/>`;
  }

  // ── Spine typography scale ──
  const spinePt  = spine >= 0.6 ? 20 : spine >= 0.35 ? 16 : 12;
  const subPt    = spine >= 0.6 ? 15 : spine >= 0.35 ? 12 : 9;
  const spineGap = spine >= 0.5 ? 18 : 10;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bitcoin v0.01 Alpha — Annotated Edition — Cover</title>
  <style>${basisFontFaces()}</style>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    /* Publisher mark (single embedded PNG — reliable for preview + file:// PDF) */
    :root { --ph-logo: ${logoCss}; }

    html { background: #666; }

    body {
      width: ${px(canvasW)}px;
      height: ${px(canvasH)}px;
      position: relative;
      overflow: hidden;
    }

    /* ── Print area (bleed-to-bleed, back + spine + front) ─────────── */
    .print-area {
      position: absolute;
      left: ${px(bleedX)}px;
      top: ${px(bleedY)}px;
      width: ${px(printW)}px;
      height: ${px(printH)}px;
      background: #000;
      overflow: hidden;
    }

    /* ── Back cover ────────────────────────────────────────────────── */
    .cover-back {
      position: absolute;
      left: 0;
      top: 0;
      width: ${px(TRIM_W + BLEED)}px;
      height: 100%;
      background: #000;
      display: flex;
      flex-direction: column;
      padding: ${px(BLEED + 0.7)}px
               ${px(0.625)}px
               ${px(backBottomPad)}px
               ${px(BLEED + 0.625)}px;
    }

    .back-copy {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-self: flex-start;
      width: min(100%, ${px(TRIM_W * 0.76)}px);
      padding: ${px(0.15)}px 0 ${px(0.45)}px;
      text-align: left;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .back-footer-group {
      flex-shrink: 0;
      display: flex;
      align-self: stretch;
      align-items: flex-end;
      justify-content: flex-start;
      gap: 0px;
      width: 100%;
      pointer-events: none;
      padding-top: ${px(0.18)}px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .back-barcode-wrap {
      display: flex;
      align-items: flex-start;
      gap: ${px(0.12)}px;
      text-align: left;
      width: ${px(2.15)}px;
      box-sizing: border-box;
      margin-left: auto;
      margin-right: 0;
      flex-shrink: 0;
      padding: ${px(0.1)}px ${px(0.1)}px ${px(0.1)}px ${px(0.12)}px;
      border: 1px solid #1a1a1a;
      background: #ffffff;
      box-shadow: 0 ${px(0.02)}px ${px(0.06)}px rgba(0, 0, 0, 0.35);
    }

    .back-barcode-copy {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      min-width: 0;
    }

    .back-barcode-label {
      font-family: 'Inter', sans-serif;
      font-size: 6.85pt;
      font-weight: 600;
      color: #0a0a0a;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin: 0;
      line-height: 1.25;
      white-space: nowrap;
    }

    .back-barcode-sublabel {
      font-family: 'Inter', sans-serif;
      font-size: 6.5pt;
      font-weight: 500;
      color: #333333;
      letter-spacing: 0.03em;
      text-transform: none;
      margin: 0 0 ${px(0.07)}px 0;
      line-height: 1.3;
    }

    .back-barcode-addr-long {
      font-size: 4.6pt;
      white-space: normal;
    }

    .back-barcode-addr {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: 5.35pt;
      font-weight: 400;
      color: #111111;
      letter-spacing: 0.015em;
      margin: 0;
      line-height: 1.25;
      word-break: break-all;
      max-width: ${px(1.24)}px;
    }

    .back-barcode-qr {
      display: block;
      width: ${px(0.76)}px;
      height: ${px(0.76)}px;
      background: #fff;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      border-radius: 0;
    }

    .back-logo-wrap {
      display: flex;
      justify-content: flex-start;
      align-items: flex-end;
      flex: 1 1 auto;
      min-width: 0;
      overflow: visible;
    }

    .back-logo {
      /* Width adapts to available space but never exceeds the ideal size */
      width: 100%;
      max-width: ${px(TRIM_W * 1.0)}px;
      height: ${px(0.75)}px;
      background-image: var(--ph-logo);
      background-repeat: no-repeat;
      background-position: left center;
      background-size: contain;
      opacity: 0.84;
      filter: drop-shadow(0 0 16px rgba(255, 255, 255, 0.34))
              drop-shadow(0 0 48px rgba(255, 255, 255, 0.2))
              drop-shadow(0 0 80px rgba(255, 255, 255, 0.11))
              drop-shadow(0 0 120px rgba(255, 255, 255, 0.05));
    }

    .back-edition-lead {
      font-family: 'Inter', sans-serif;
      font-size: 10.5pt;
      font-weight: 500;
      color: #ffffff;
      line-height: 1.58;
      margin-bottom: 1em;
      padding-left: 0;
      border-left: none;
      text-align: left;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .back-edition-lead strong {
      font-weight: 700;
      color: #ececec;
      letter-spacing: 0.04em;
    }

    .back-description {
      font-family: 'Inter', sans-serif;
      font-size: 10.25pt;
      font-weight: 400;
      color: #8e8e8e;
      line-height: 1.62;
      margin-bottom: 1.35em;
      text-align: left;
      hyphens: none;
      -webkit-hyphens: none;
    }

    .back-copyright {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: 8.1pt;
      font-weight: 400;
      color: #3d3d3d;
      letter-spacing: 0.03em;
      margin-top: 0.3em;
    }

    /* ── Spine ─────────────────────────────────────────────────────── */
    .cover-spine {
      position: absolute;
      left: ${px(TRIM_W + BLEED)}px;
      top: 0;
      width: ${px(spine)}px;
      height: 100%;
      background: #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      overflow: visible;
    }

    .spine-logo-wrap {
      flex-shrink: 0;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      padding-bottom: ${px(BLEED + 0.78)}px;
      pointer-events: none;
      overflow: visible;
    }

    /* Horizontal wordmark: wide×thin box, rotated so thin side = spine thickness.
       Glow matches .front-logo-img / .back-logo. */
    .spine-logo {
      width: ${px(spineLogoAlong)}px;
      height: ${px(spineLogoN)}px;
      background-image: var(--ph-logo);
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      transform: rotate(-90deg) scale(1.5);
      transform-origin: center center;
      filter: drop-shadow(0 0 16px rgba(255, 255, 255, 0.34))
              drop-shadow(0 0 48px rgba(255, 255, 255, 0.2))
              drop-shadow(0 0 80px rgba(255, 255, 255, 0.11))
              drop-shadow(0 0 120px rgba(255, 255, 255, 0.05));
    }

    /* Standard convention: text reads bottom-to-top on English book spines */
    .spine-inner {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      flex-direction: row;
      gap: ${spineGap}px;
      white-space: nowrap;
      padding-top: ${px(BLEED + 0.35)}px;
      padding-bottom: ${px(0.2)}px;
    }

    .spine-title {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: ${spinePt}pt;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .spine-edition {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: ${Math.max(5, Math.min(spinePt - 8, subPt - 6))}pt;
      font-weight: 400;
      color: #8a8a8a;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: ${spineGap * 1.5}px;
    }

    .spine-version {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: ${Math.max(5, Math.min(spinePt - 8, subPt - 6))}pt;
      font-weight: 400;
      color: #555555;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .spine-subtitle {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: ${Math.max(subPt + 0.75, spinePt - 0.75)}pt;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    /* ── Front cover ───────────────────────────────────────────────── */
    .cover-front {
      position: absolute;
      left: ${px(TRIM_W + BLEED + spine)}px;
      top: 0;
      width: ${px(TRIM_W + BLEED)}px;
      height: 100%;
      background: #000;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      padding-top: ${px(BLEED + 0.55)}px;
      padding-bottom: ${px(BLEED + 0.2)}px;
      overflow: visible;
    }

    .cover-toc-inner {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      max-width: ${px(TRIM_W * 0.82)}px;
      padding-top: ${px(0.32)}px;
      padding-bottom: ${px(0.45)}px;
      box-sizing: border-box;
    }

    .cover-toc-list {
      display: flex;
      flex-direction: column;
      gap: 0.14em;
      flex: 1 1 auto;
      min-height: 0;
      overflow: visible;
      width: 100%;
      align-self: center;
      max-width: ${px(TRIM_W * 0.76)}px;
    }

    .cover-toc-row {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: baseline;
      gap: ${px(0.12)}px;
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: 8.65pt;
      line-height: 1.42;
      color: #ffffff;
    }

    .cover-toc-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cover-toc-page {
      flex-shrink: 0;
      font-variant-numeric: tabular-nums;
    }

    .cover-toc-highlight {
      color: #ffffff;
    }

    .cover-toc-highlight .cover-toc-page {
      color: #ffffff;
    }

    .front-logo-wrap {
      display: flex;
      justify-content: center;
      pointer-events: none;
      flex-shrink: 0;
      margin-top: ${px(0.06)}px;
    }

    /* <img> is more reliable than background + data-URI for footer (preview + PDF) */
    .front-logo-img {
      display: block;
      width: min(96%, ${px(TRIM_W * 0.96)}px);
      height: ${px(0.78)}px;
      object-fit: contain;
      object-position: center bottom;
      filter: drop-shadow(0 0 16px rgba(255, 255, 255, 0.34))
              drop-shadow(0 0 48px rgba(255, 255, 255, 0.2))
              drop-shadow(0 0 80px rgba(255, 255, 255, 0.11))
              drop-shadow(0 0 120px rgba(255, 255, 255, 0.05));
    }

    .front-main {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      flex-shrink: 0;
      margin-bottom: 0.15em;
    }

    .book-title {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: 34pt;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      line-height: 1;
      margin: 0;
    }

    .book-subtitle {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: 17pt;
      font-weight: 600;
      color: #c8c8c8;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      margin: 0.38em 0 0 0;
      line-height: 1.2;
    }

    .book-edition-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: max-content;
      max-width: min(${px(TRIM_W * 0.95)}px, 96%);
      margin-top: 0.85em;
      margin-left: auto;
      margin-right: auto;
    }

    .book-edition-label {
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: 8.5pt;
      font-weight: 500;
      color: #7d7d7d;
      letter-spacing: 0.32em;
      text-transform: uppercase;
      line-height: 1.2;
      margin: 0;
      text-align: center;
      white-space: nowrap;
    }

    /* Footer: credit above publisher logo (stacked from bottom of trim) */
    .front-footer {
      position: absolute;
      bottom: ${px(BLEED + 0.5)}px;
      left: ${px(TRIM_W + BLEED + spine)}px;
      width: ${px(TRIM_W + BLEED)}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0px;
      text-align: center;
      z-index: 2;
    }

    .annotations-credit {
      font-family: 'Inter', sans-serif;
      font-size: 7pt;
      font-weight: 500;
      color: #c6c6c6;
      letter-spacing: 0.04em;
      margin: ${px(0.85)}px 0 0 0;
      line-height: 1.35;
    }

    /* ── Crop marks (SVG overlay, full canvas) ────────────────────── */
    .crop-marks {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    /* ── Preview guides (hidden when printing / exporting PDF) ──────── */
    .guide {
      position: absolute;
      pointer-events: none;
    }
    .guide-bleed {
      left: ${px(bleedX)}px;  top: ${px(bleedY)}px;
      width: ${px(printW)}px; height: ${px(printH)}px;
      border: 1px dashed rgba(255, 80, 80, 0.55);
    }
    .guide-trim {
      left: ${px(trimL)}px;              top: ${px(trimT)}px;
      width: ${px(2 * TRIM_W + spine)}px; height: ${px(TRIM_H)}px;
      border: 1px dashed rgba(80, 200, 80, 0.55);
    }
    .guide-spine-l {
      left: ${px(spineL)}px; top: ${px(trimT)}px;
      width: 0; height: ${px(TRIM_H)}px;
      border-left: 1px dashed rgba(100, 150, 255, 0.7);
    }
    .guide-spine-r {
      left: ${px(spineR)}px; top: ${px(trimT)}px;
      width: 0; height: ${px(TRIM_H)}px;
      border-left: 1px dashed rgba(100, 150, 255, 0.7);
    }

    /* ── Info bar (screen only) ───────────────────────────────────── */
    .info-bar {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: rgba(0,0,0,0.92);
      color: #555;
      font-family: 'Basis Grotesque Mono Pro', monospace;
      font-size: 8pt;
      padding: 5px 16px;
      display: flex;
      gap: 2em;
      align-items: center;
      z-index: 9999;
    }
    .info-bar .key { color: #666; }
    .info-bar .val { color: #58a6ff; font-weight: 600; }
    .info-bar .legend { margin-left: auto; display: flex; gap: 1em; font-size: 7.5pt; }
    .info-bar .legend span { display: flex; align-items: center; gap: 4px; }

    @media print {
      .guide, .info-bar { display: none !important; }
      html { background: transparent !important; }
    }

    body.no-publisher-logo .back-logo-wrap,
    body.no-publisher-logo .spine-logo-wrap,
    body.no-publisher-logo .front-logo-wrap,
    body.no-publisher-logo .front-logo-img {
      display: none !important;
    }
  </style>
</head>
<body class="${logoDataUri ? '' : 'no-publisher-logo'}">

  <!-- ── Print area ────────────────────────────────────────────────── -->
  <div class="print-area">

    <!-- Back cover -->
    <div class="cover-back" id="cover-back" data-cover-panel="back">
      <div class="back-copy">
        <p class="back-edition-lead"><strong>Annotated edition — ${EDITION}.</strong> The complete v0.01 Alpha source with commentary embedded in the listing — context anchored to the lines it explains, not siloed in a separate appendix.</p>
        <p class="back-description">On January 3, 2009, Satoshi Nakamoto launched Bitcoin with a single executable and these 20,000 lines of C++.<br><br>This volume walks that first public release file by file. Explanations appear inline: annotation blocks break the code flow where they belong, so you read the original source and the commentary as one continuous thread — data structures, algorithms, and design choices spelled out without leaving the program in front of you.</p>
        <p class="back-copyright">Source code copyright © 2009 Satoshi Nakamoto · MIT/X11 License</p>
      </div>
      <div class="back-footer-group">
        <div class="back-logo-wrap" role="presentation">
          <div class="back-logo" role="img" aria-label="PirateHash"></div>
        </div>
        ${buildBackDonationHtml(donationCover)}
      </div>
    </div>

    <!-- Spine -->
    <div class="cover-spine" id="cover-spine" data-cover-panel="spine">
      <div class="spine-inner">
        <span class="spine-title">Bitcoin</span>
        <span class="spine-subtitle">v0.01 Alpha</span>
        <span class="spine-edition">Annotated edition</span>
        <span class="spine-version">${EDITION}</span>
      </div>
      <div class="spine-logo-wrap" role="presentation">
        <div class="spine-logo" role="img" aria-label="PirateHash"></div>
      </div>
    </div>

    <!-- Front cover -->
    <div class="cover-front" id="cover-front" data-cover-panel="front">
      <div class="front-main">
        <h1 class="book-title">BITCOIN</h1>
        <p class="book-subtitle">v0.01 Alpha</p>
        <div class="book-edition-block">
          <p class="book-edition-label">Annotated edition — ${EDITION}</p>
        </div>
      </div>
      ${buildCoverTocHtml(part2SourceToc)}
    </div>
    <div class="front-footer" id="cover-front-footer" data-cover-panel="front">
      <p class="annotations-credit">${ANNOTATIONS_CREDIT}</p>
      <div class="front-logo-wrap" role="presentation">
        ${logoDataUri ? `<img class="front-logo-img" src="${logoDataUri}" width="768" height="157" alt="PirateHash">` : ''}
      </div>
    </div>

  </div>

  <!-- ── Crop marks ─────────────────────────────────────────────────── -->
  <svg class="crop-marks"
       width="${px(canvasW)}px"
       height="${px(canvasH)}px"
       viewBox="0 0 ${px(canvasW)} ${px(canvasH)}"
       xmlns="http://www.w3.org/2000/svg">
    <g stroke="#000000" stroke-width="0.75" fill="none">${marks}</g>
  </svg>

  <!-- ── Preview guides ─────────────────────────────────────────────── -->
  <div class="guide guide-bleed"></div>
  <div class="guide guide-trim"></div>
  <div class="guide guide-spine-l"></div>
  <div class="guide guide-spine-r"></div>

  <!-- ── Info bar (screen preview only) ────────────────────────────── -->
  <div class="info-bar">
    <span><span class="key">pages</span> <span class="val">${pageCount}</span></span>
    <span><span class="key">spine</span> <span class="val">${spine.toFixed(4)}&quot;</span></span>
    <span><span class="key">canvas</span> <span class="val">${canvasW.toFixed(4)}&quot; &times; ${canvasH.toFixed(4)}&quot;</span></span>
    <span><span class="key">trim</span> <span class="val">7&quot; &times; 10&quot;</span></span>
    <span><span class="key">bleed</span> <span class="val">0.125&quot;</span></span>
    <span class="legend">
      <span><svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="rgba(255,80,80,0.7)" stroke-width="1.5" stroke-dasharray="3,2"/></svg> bleed</span>
      <span><svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="rgba(80,200,80,0.7)" stroke-width="1.5" stroke-dasharray="3,2"/></svg> trim</span>
      <span><svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="rgba(100,150,255,0.8)" stroke-width="1.5" stroke-dasharray="3,2"/></svg> spine</span>
    </span>
  </div>

</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
/**
 * Build cover.html (+ cover-meta.json) from current edition, meta, and donation data.
 * @param {{ previewDonation?: boolean, pages?: number|string, quiet?: boolean }} [opts]
 */
export async function buildCover(opts = {}) {
  const quiet = Boolean(opts.quiet);
  if (!quiet) console.log('🎨 Bitcoin Alpha Book — Cover Builder\n');

  const pageCount = getPageCount(opts.pages);
  const spine     = Math.max(pageCount * PPI, 0.25);

  const logoSrc = join(ROOT_DIR, 'assets', 'piratehash-logo.png');
  const logoDataUri = await loadCoverLogoDataUri(logoSrc);
  if (!logoDataUri && !quiet) {
    console.warn('⚠  assets/piratehash-logo.png missing — PirateHash marks will not render.\n');
  }

  const part2SourceToc = loadPart2SourceToc();
  if (!quiet && part2SourceToc.some(r => r.page == null || r.page === '')) {
    console.warn('⚠  Cover Part II TOC: some page numbers are missing. Run npm run pdf (after npm run build), then npm run cover.\n');
  }

  const donationCover = loadDonationCover({ previewDonation: Boolean(opts.previewDonation) });
  if (!quiet && donationCover) {
    if (donationCover.preview) {
      console.log('   Back cover: preview donation QR (BIP173 test address). Use BITCOIN_DONATION_XPUB + npm run donation:derive for production.\n');
    } else {
      console.log(`   Back cover: donation QR → ${donationCover.address.slice(0, 30)}… (${donationCover.placeholder ? 'PLACEHOLDER' : donationCover.scheme || 'address'})\n`);
    }
  }

  const html = buildCoverHtml(pageCount, logoDataUri, part2SourceToc, donationCover);

  // Write cover HTML
  const coverPath = join(OUTPUT_DIR, 'cover.html');
  writeFileSync(coverPath, html, 'utf8');

  // Write cover meta for the PDF generator
  const markZone = MARK_LEN + MARK_GAP;
  const canvasW  = 2 * (markZone + BLEED) + 2 * TRIM_W + spine;
  const canvasH  = 2 * (markZone + BLEED) + TRIM_H;
  const printW = 2 * TRIM_W + spine + 2 * BLEED;
  const printH = TRIM_H + 2 * BLEED;
  const bleedOffsetPx = Math.round(markZone * DPI); // px to shift canvas so bleed zone is at origin
  const metaPath = join(OUTPUT_DIR, 'cover-meta.json');
  writeFileSync(metaPath, JSON.stringify({
    pageCount,
    spine,
    canvasW,
    canvasH,
    printW,
    printH,
    bleedOffsetPx,
    edition: EDITION,
    annotationsCredit: ANNOTATIONS_CREDIT,
  }, null, 2), 'utf8');

  if (!quiet) {
    console.log(`✅ Cover HTML  →  ${coverPath}`);
    console.log(`   Pages: ${pageCount}  |  Spine: ${spine.toFixed(4)}"  |  Canvas: ${canvasW.toFixed(4)}" × ${canvasH.toFixed(4)}"`);
    console.log(`\n   Preview: http://localhost:3000/cover`);
    console.log(`   Export:  npm run cover:pdf\n`);
  }

  return { coverPath, metaPath, pageCount, spine, canvasW, canvasH };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  await buildCover({
    previewDonation: process.argv.includes('--preview-donation'),
  });
}
