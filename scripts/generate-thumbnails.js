/**
 * Thumbnail + contact sheet generator for Bitcoin Alpha Book.
 *
 * Writes two artifacts:
 * - output/thumbnails.png + thumbnails.html — raw flat grid (all pages in order, no sections/spreads/cover).
 * - output/contact-sheet.png + contact-sheet.html — print overview: full cover spread + interior pages in
 *   strict two-page spreads (consecutive pages, like a physical book), with section labels as row dividers.
 *
 * Every rendered page is kept (including blanks). Run after build (and `npm run cover` for cover on contact sheet).
 */

import puppeteer from 'puppeteer';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

const SCALE = 0.18;
const THUMB_W = 121; // ~7in * 96 * SCALE
const THUMB_H = 173; // ~10in * 96 * SCALE
const COLS = 16;
const SPREADS_PER_ROW = Math.max(1, Math.floor(COLS / 2));
const GAP = 6;

const GRID_OUTER_W = COLS * (THUMB_W + GAP) + GAP;

/**
 * @param {import('puppeteer').Browser} browser
 * @returns {Promise<string|null>}
 */
async function captureCoverDataUrl(browser) {
  const coverHtmlPath = join(OUTPUT_DIR, 'cover.html');
  if (!existsSync(coverHtmlPath)) {
    console.log('   (No cover.html — run "npm run cover" for cover on contact sheet)');
    return null;
  }

  const coverPage = await browser.newPage();
  coverPage.setDefaultTimeout(120000);
  coverPage.setDefaultNavigationTimeout(120000);

  try {
    await coverPage.goto(`file://${coverHtmlPath}`, {
      waitUntil: 'networkidle2',
      timeout: 120000,
    });
    await coverPage.evaluateHandle('document.fonts.ready');
    await coverPage.addStyleTag({
      content: `
        .info-bar, .guide, .crop-marks { display: none !important; }
        body { margin: 0 !important; background: #222 !important; }
      `,
    });
    await new Promise((r) => setTimeout(r, 400));

    const printArea = await coverPage.$('.print-area');
    if (!printArea) {
      console.log('   ⚠ cover.html has no .print-area — skipping cover strip');
      return null;
    }

    const buf = await printArea.screenshot({ type: 'png' });
    console.log('   ✓ Captured full cover spread for contact sheet');
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (e) {
    console.log('   ⚠ Cover capture failed:', e.message);
    return null;
  } finally {
    await coverPage.close();
  }
}

/**
 * @param {import('puppeteer').Page} page
 * @returns {Promise<number>}
 */
async function waitForPagedJs(page) {
  let pageCount = 0;
  try {
    await page.waitForSelector('.pagedjs_pages .pagedjs_page', { timeout: 180000 });
    console.log('   ✓ Paged.js pages detected');

    let lastCount = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      pageCount = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
      if (i % 5 === 0) console.log(`   ... ${pageCount} pages rendered`);
      if (pageCount === lastCount && pageCount > 0) {
        console.log(`   ✓ Paged.js rendered ${pageCount} pages`);
        break;
      }
      lastCount = pageCount;
    }
  } catch (err) {
    console.log('   ⚠ Paged.js may not have fully rendered:', err.message);
  }
  return pageCount;
}

/**
 * Flat grid only — pages stay in DOM order under .pagedjs_pages.
 * @param {import('puppeteer').Page} page
 */
async function injectRawThumbnailLayout(page) {
  await page.evaluate(
    (scale, thumbW, thumbH, gap, gridOuterW) => {
      const existing = document.getElementById('thumbnail-grid-style');
      if (existing) existing.remove();

      const style = document.createElement('style');
      style.id = 'thumbnail-grid-style';
      style.textContent = `
        html, body {
          background: #555 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .pagedjs_pages {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: ${gap}px !important;
          width: ${gridOuterW}px !important;
          padding: ${gap}px !important;
          margin: 0 auto !important;
          background: #555 !important;
          box-sizing: border-box !important;
        }
        .pagedjs_page {
          width: ${thumbW}px !important;
          height: ${thumbH}px !important;
          overflow: hidden !important;
          position: relative !important;
          flex-shrink: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
        }
        .pagedjs_sheet {
          transform: scale(${scale}) !important;
          transform-origin: top left !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(style);

      document.querySelectorAll('.pagedjs_interface, .pagedjs-cli-toolbar, #toolbar, .toolbar').forEach((el) => el.remove());
    },
    SCALE,
    THUMB_W,
    THUMB_H,
    GAP,
    GRID_OUTER_W,
  );
}

/**
 * Section groups + two-page spreads + optional cover strip.
 * @param {import('puppeteer').Page} page
 * @param {string|null} coverDataUrl
 * @returns {Promise<number>} section count
 */
async function injectContactSheetLayout(page, coverDataUrl) {
  return page.evaluate(
    (scale, thumbW, thumbH, spreadsPerRow, gap, gridOuterW, coverUrl) => {
      function sectionHeadingFromPage(pageEl) {
        const h1 = pageEl.querySelector('h1.chapter-title');
        if (h1) {
          const t = h1.textContent.trim();
          if (t) return t;
        }
        const col = pageEl.querySelector('section.chapter.colophon h2.section-title');
        if (col) {
          const t = col.textContent.trim();
          if (t) return t;
        }
        return null;
      }

      const existing = document.getElementById('thumbnail-grid-style');
      if (existing) existing.remove();

      const style = document.createElement('style');
      style.id = 'thumbnail-grid-style';
      style.textContent = `
        html, body {
          background: #555 !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .thumb-cover-row {
          width: ${gridOuterW}px !important;
          box-sizing: border-box !important;
          padding: ${gap}px !important;
          margin: 0 auto !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          background: #4a4a4a !important;
          border-bottom: 1px solid rgba(0,0,0,0.25) !important;
        }
        .thumb-cover-row img {
          display: block !important;
          max-width: ${gridOuterW - 2 * gap}px !important;
          width: auto !important;
          height: auto !important;
          max-height: 420px !important;
          box-shadow: 0 4px 14px rgba(0,0,0,0.45) !important;
          border-radius: 2px !important;
        }

        .pagedjs_pages {
          display: block !important;
          width: ${gridOuterW}px !important;
          padding: ${gap}px !important;
          margin: 0 auto !important;
          background: #555 !important;
          box-sizing: border-box !important;
        }

        .thumb-spreads-grid {
          display: grid !important;
          grid-template-columns: repeat(${spreadsPerRow}, ${2 * thumbW}px) !important;
          gap: ${gap}px !important;
          width: 100% !important;
          box-sizing: border-box !important;
          align-items: start !important;
        }

        .thumb-section-divider {
          grid-column: 1 / -1 !important;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          letter-spacing: 0.12em !important;
          text-transform: uppercase !important;
          color: #c8c8c8 !important;
          margin: ${gap}px 0 2px 2px !important;
          padding: 0 0 4px 0 !important;
          border-bottom: 1px solid rgba(255,255,255,0.12) !important;
        }
        .thumb-section-divider:first-child {
          margin-top: 0 !important;
        }

        .thumb-spread {
          display: flex !important;
          gap: 0 !important;
          width: ${2 * thumbW}px !important;
          box-sizing: border-box !important;
          padding: 0 !important;
          background: rgba(0,0,0,0.2) !important;
          outline: 1px solid rgba(255,255,255,0.14) !important;
          outline-offset: 2px !important;
          border-radius: 2px !important;
        }

        .pagedjs_page,
        .thumb-page-placeholder {
          width: ${thumbW}px !important;
          height: ${thumbH}px !important;
          overflow: hidden !important;
          position: relative !important;
          flex-shrink: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4) !important;
        }
        /* Spine line: right edge of verso, left edge of recto */
        .thumb-spread > .pagedjs_page:first-child,
        .thumb-spread > .thumb-page-placeholder:first-child {
          border-right: 1px solid rgba(0,0,0,0.25) !important;
        }
        .thumb-page-placeholder {
          background: #4f4f4f !important;
          border: 1px dashed rgba(255,255,255,0.15) !important;
          box-shadow: none !important;
        }

        .pagedjs_sheet {
          transform: scale(${scale}) !important;
          transform-origin: top left !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(style);

      document.querySelectorAll('.pagedjs_interface, .pagedjs-cli-toolbar, #toolbar, .toolbar').forEach((el) => el.remove());

      const container = document.querySelector('.pagedjs_pages');
      if (!container) return 0;

      if (coverUrl) {
        const row = document.createElement('div');
        row.className = 'thumb-cover-row';
        const img = document.createElement('img');
        img.src = coverUrl;
        img.alt = 'Book cover spread (back, spine, front)';
        row.appendChild(img);
        container.parentNode.insertBefore(row, container);
      }

      let pages = Array.from(container.children).filter(
        (el) => el.classList && el.classList.contains('pagedjs_page'),
      );
      if (pages.length === 0) {
        pages = Array.from(container.querySelectorAll('.pagedjs_page')).filter(
          (el) => el.parentElement === container,
        );
      }
      if (pages.length === 0) {
        pages = Array.from(container.querySelectorAll('.pagedjs_page'));
      }
      if (pages.length === 0) return 0;

      const mainGrid = document.createElement('div');
      mainGrid.className = 'thumb-spreads-grid';
      container.appendChild(mainGrid);

      // Correct book spread pairing:
      //   Page 1 (recto) = right side of spread 0, left side is blank
      //   Page 2 (verso) = left side of spread 1
      //   Page 3 (recto) = right side of spread 1
      //   … i.e. spreads are (null, pg[0]), (pg[1], pg[2]), (pg[3], pg[4]) …
      function makeSpread(leftPage, rightPage) {
        const spread = document.createElement('div');
        spread.className = 'thumb-spread';
        if (leftPage) {
          spread.appendChild(leftPage);
        } else {
          const ph = document.createElement('div');
          ph.className = 'thumb-page-placeholder';
          spread.appendChild(ph);
        }
        if (rightPage) {
          spread.appendChild(rightPage);
        } else {
          const ph = document.createElement('div');
          ph.className = 'thumb-page-placeholder';
          spread.appendChild(ph);
        }
        return spread;
      }

      function addDividerIfNeeded(leftPage, rightPage) {
        // Check recto (right) first for chapter headings, fall back to verso
        const heading = sectionHeadingFromPage(rightPage || leftPage) ||
                        (rightPage && leftPage ? sectionHeadingFromPage(leftPage) : null);
        if (heading && heading !== lastHeading) {
          lastHeading = heading;
          const div = document.createElement('div');
          div.className = 'thumb-section-divider';
          div.textContent = heading;
          mainGrid.appendChild(div);
        }
      }

      let lastHeading = null;

      // Spread 0: blank left + page 1 right
      addDividerIfNeeded(null, pages[0]);
      mainGrid.appendChild(makeSpread(null, pages[0]));

      // Remaining spreads: (verso, recto) pairs
      for (let i = 1; i < pages.length; i += 2) {
        const left  = pages[i];       // verso (even page number)
        const right = pages[i + 1] || null;  // recto (odd page number)
        addDividerIfNeeded(left, right);
        mainGrid.appendChild(makeSpread(left, right));
      }

      return mainGrid.querySelectorAll('.thumb-spread').length;
    },
    SCALE,
    THUMB_W,
    THUMB_H,
    SPREADS_PER_ROW,
    GAP,
    GRID_OUTER_W,
    coverDataUrl,
  );
}

function writeViewerHtml(path, title, metaLine, pngName, alt) {
  writeFileSync(
    path,
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #3a3a3a;
      color: #ccc;
      font-family: 'Basis Grotesque Mono Pro', 'Courier New', monospace;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
      gap: 1.5rem;
    }
    header { text-align: center; }
    header h1 {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #eee;
    }
    header p {
      font-size: 0.75rem;
      color: #888;
      margin-top: 0.4rem;
      letter-spacing: 0.05em;
    }
    .sheet {
      border: 1px solid #555;
      border-radius: 2px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .sheet img { display: block; max-width: 100%; }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <p>${metaLine}</p>
  </header>
  <div class="sheet">
    <img src="${pngName}" alt="${alt}">
  </div>
</body>
</html>`,
    'utf8',
  );
}

async function renderPass(browser, htmlPath, label) {
  const page = await browser.newPage();
  page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);

  await page.setViewport({
    width: GRID_OUTER_W + 40,
    height: 900,
    deviceScaleFactor: 1,
  });

  console.log(`   [${label}] Loading HTML...`);
  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle2',
    timeout: 180000,
  });

  await page.evaluateHandle('document.fonts.ready');
  const pageCount = await waitForPagedJs(page);

  return { page, pageCount };
}

async function generateThumbnails() {
  console.log('🖼  Bitcoin Alpha Book — Thumbnails + contact sheet\n');

  const printHtmlPath = join(OUTPUT_DIR, 'bitcoin-alpha-book-print.html');
  const baseHtmlPath = join(OUTPUT_DIR, 'bitcoin-alpha-book.html');

  let htmlPath;
  if (existsSync(printHtmlPath)) {
    htmlPath = printHtmlPath;
    console.log('   Using bitcoin-alpha-book-print.html');
  } else if (existsSync(baseHtmlPath)) {
    htmlPath = baseHtmlPath;
    console.log('   Using bitcoin-alpha-book.html (print HTML not found)');
  } else {
    console.error('Error: No HTML file found. Run "npm run build" (and optionally "npm run pdf") first.');
    process.exit(1);
  }

  console.log('   Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    timeout: 120000,
  });

  let pageCount = 0;
  let coverOnContactSheet = false;

  try {
    // ── Pass 1: raw flat grid ─────────────────────────────────────
    const raw = await renderPass(browser, htmlPath, 'raw');
    pageCount = raw.pageCount;
    console.log('   Injecting raw thumbnail grid...');
    await injectRawThumbnailLayout(raw.page);
    await new Promise((r) => setTimeout(r, 800));

    console.log('   Screenshot → thumbnails.png');
    await raw.page.screenshot({
      path: join(OUTPUT_DIR, 'thumbnails.png'),
      fullPage: true,
      type: 'png',
    });
    console.log('   ✓ Saved thumbnails.png');
    await raw.page.close();

    // ── Pass 2: contact sheet (cover + spreads) ───────────────────
    const coverDataUrl = await captureCoverDataUrl(browser);
    coverOnContactSheet = Boolean(coverDataUrl);
    const cs = await renderPass(browser, htmlPath, 'contact sheet');
    if (!pageCount) pageCount = cs.pageCount;

    console.log('   Injecting contact sheet layout (sections + spreads)...');
    const spreadCount = await injectContactSheetLayout(cs.page, coverDataUrl);
    if (spreadCount > 0) {
      console.log(`   ✓ Built ${spreadCount} two-page spread(s) (print order)`);
    }

    await new Promise((r) => setTimeout(r, 1000));
    console.log('   Screenshot → contact-sheet.png');
    await cs.page.screenshot({
      path: join(OUTPUT_DIR, 'contact-sheet.png'),
      fullPage: true,
      type: 'png',
    });
    console.log('   ✓ Saved contact-sheet.png');
    await cs.page.close();
  } finally {
    await browser.close();
  }

  const generatedDate = new Date().toISOString().split('T')[0];
  const rowsRaw = pageCount > 0 ? Math.ceil(pageCount / COLS) : '?';
  const spreads = pageCount > 0 ? Math.ceil(pageCount / 2) : 0;
  const rowsSpread = spreads > 0 ? Math.ceil(spreads / SPREADS_PER_ROW) : '?';

  writeViewerHtml(
    join(OUTPUT_DIR, 'thumbnails.html'),
    'Bitcoin Alpha Book — Thumbnails (raw)',
    `${pageCount} pages &nbsp;·&nbsp; ${COLS} columns &nbsp;·&nbsp; ~${rowsRaw} rows &nbsp;·&nbsp; scale ${SCALE} &nbsp;·&nbsp; flat grid &nbsp;·&nbsp; generated ${generatedDate}`,
    'thumbnails.png',
    'All book pages at thumbnail scale, flat grid in reading order',
  );
  console.log('   ✓ Saved thumbnails.html');

  writeViewerHtml(
    join(OUTPUT_DIR, 'contact-sheet.html'),
    'Bitcoin Alpha Book — Contact sheet (print overview)',
    `${pageCount} pages &nbsp;·&nbsp; ${spreads || '?'} spreads &nbsp;·&nbsp; ${SPREADS_PER_ROW} spreads/row &nbsp;·&nbsp; ~${rowsSpread} spread rows &nbsp;·&nbsp; scale ${SCALE}${coverOnContactSheet ? ' &nbsp;·&nbsp; full cover spread' : ''} &nbsp;·&nbsp; generated ${generatedDate}`,
    'contact-sheet.png',
    'Book pages grouped in print spreads with cover spread for validation',
  );
  console.log('   ✓ Saved contact-sheet.html');

  console.log('\n✨ Done!');
  console.log('   Raw grid:       output/thumbnails.html  →  /thumbnails');
  console.log('   Contact sheet:  output/contact-sheet.html  →  /contact-sheet');
}

generateThumbnails().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
