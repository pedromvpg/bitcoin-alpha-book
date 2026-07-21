/**
 * Cover PDF Generator for Bitcoin Alpha Book
 *
 * Renders output/cover.html to a print-ready PDF at the full canvas size
 * (including bleed and crop marks). Preview guides and the info bar are
 * stripped before export so the PDF is clean.
 *
 * Usage:
 *   node scripts/generate-cover-pdf.js
 *   npm run cover:pdf
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser } from './puppeteer-launch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT_DIR   = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

export async function generateCoverPDF({ quiet = false } = {}) {
  if (!quiet) console.log('📄 Bitcoin Alpha Book — Cover PDF Generator\n');

  const coverHtmlPath = join(OUTPUT_DIR, 'cover.html');
  if (!existsSync(coverHtmlPath)) {
    throw new Error('cover.html not found. Run "npm run cover" first.');
  }

  const metaPath = join(OUTPUT_DIR, 'cover-meta.json');
  if (!existsSync(metaPath)) {
    throw new Error('cover-meta.json not found. Run "npm run cover" first.');
  }

  const { pageCount, spine, canvasW, canvasH, printW, printH } = JSON.parse(readFileSync(metaPath, 'utf8'));
  const canvasWpx  = Math.ceil(canvasW * 96);
  const canvasHpx  = Math.ceil(canvasH * 96);
  const printWpx   = Math.ceil(printW * 96);
  const printHpx   = Math.ceil(printH * 96);

  if (!quiet) {
    console.log(`   Pages:  ${pageCount}`);
    console.log(`   Spine:  ${spine.toFixed(4)}"`);
    console.log(`   Canvas: ${canvasW.toFixed(4)}" × ${canvasH.toFixed(4)}" (full, incl. crop marks)`);
    console.log(`   Output: ${printW.toFixed(4)}" × ${printH.toFixed(4)}" (bleed-to-bleed, matches printer template)\n`);
  }

  if (!quiet) console.log('   Launching browser...');
  const browser = await launchBrowser({ timeout: 60000 });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);

    await page.setViewport({
      width:             canvasWpx,
      height:            canvasHpx,
      deviceScaleFactor: 2,
    });

    if (!quiet) console.log('   Loading cover HTML...');
    await page.goto(`file://${coverHtmlPath}`, {
      waitUntil: 'networkidle2',
      timeout:   30000,
    });

    await page.evaluateHandle('document.fonts.ready');
    if (!quiet) console.log('   ✓ Fonts loaded');

    // Strip preview-only chrome; crop marks removed — printer needs bleed-to-bleed only.
    await page.evaluate((wPx, hPx) => {
      document.querySelectorAll(
        '.guide, .info-bar, .crop-marks, #cover-preview-chrome, #cover-preview-bar, #cover-inspect-panel, #cover-inspect-hilite'
      ).forEach(el => el.remove());
      const pa = document.querySelector('.print-area');
      if (pa) { pa.style.left = '0'; pa.style.top = '0'; }
      for (const el of [document.documentElement, document.body]) {
        el.style.height   = `${hPx}px`;
        el.style.width    = `${wPx}px`;
        el.style.overflow = 'hidden';
        el.style.margin   = '0';
        el.style.padding  = '0';
      }
    }, printWpx, printHpx);

    await page.setViewport({ width: printWpx, height: printHpx, deviceScaleFactor: 2 });

    const pdfPath = join(OUTPUT_DIR, 'cover.pdf');
    if (!quiet) console.log('   Generating PDF...');

    await page.pdf({
      path:            pdfPath,
      width:           `${printW}in`,
      height:          `${printH}in`,
      printBackground: true,
      margin:          { top: 0, right: 0, bottom: 0, left: 0 },
      timeout:         120000,
    });

    if (!quiet) {
      console.log(`   ✓ PDF saved to ${pdfPath}`);
      console.log('\n✨ Cover PDF generation complete!');
    }
    return { pdfPath, printW, printH, pageCount, spine };
  } finally {
    await browser.close();
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  generateCoverPDF().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
