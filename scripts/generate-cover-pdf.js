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

import puppeteer from 'puppeteer';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT_DIR   = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

async function generateCoverPDF() {
  console.log('📄 Bitcoin Alpha Book — Cover PDF Generator\n');

  // Resolve source HTML
  const coverHtmlPath = join(OUTPUT_DIR, 'cover.html');
  if (!existsSync(coverHtmlPath)) {
    console.error('Error: cover.html not found. Run "npm run cover" first.');
    process.exit(1);
  }

  // Resolve canvas dimensions from cover-meta.json (written by build-cover.js)
  const metaPath = join(OUTPUT_DIR, 'cover-meta.json');
  if (!existsSync(metaPath)) {
    console.error('Error: cover-meta.json not found. Run "npm run cover" first.');
    process.exit(1);
  }

  const { pageCount, spine, canvasW, canvasH, printW, printH, bleedOffsetPx } = JSON.parse(readFileSync(metaPath, 'utf8'));
  const canvasWpx  = Math.ceil(canvasW * 96);
  const canvasHpx  = Math.ceil(canvasH * 96);
  const printWpx   = Math.ceil(printW * 96);
  const printHpx   = Math.ceil(printH * 96);

  console.log(`   Pages:  ${pageCount}`);
  console.log(`   Spine:  ${spine.toFixed(4)}"`);
  console.log(`   Canvas: ${canvasW.toFixed(4)}" × ${canvasH.toFixed(4)}" (full, incl. crop marks)`);
  console.log(`   Output: ${printW.toFixed(4)}" × ${printH.toFixed(4)}" (bleed-to-bleed, matches printer template)\n`);

  // Launch browser
  console.log('   Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    timeout: 60000,
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  // Viewport = full canvas so all absolutely-positioned elements render at correct size.
  // Resized to printWpx after transform so Puppeteer PDF scale = 1.0.
  await page.setViewport({
    width:             canvasWpx,
    height:            canvasHpx,
    deviceScaleFactor: 2,
  });

  // Load the cover HTML
  console.log('   Loading cover HTML...');
  await page.goto(`file://${coverHtmlPath}`, {
    waitUntil: 'networkidle2',
    timeout:   30000,
  });

  // Wait for web fonts
  await page.evaluateHandle('document.fonts.ready');
  console.log('   ✓ Fonts loaded');

  // Strip preview-only elements and reposition the print area to the document origin.
  // Directly setting left/top=0 on .print-area is cleaner than transform:translate
  // (translate doesn't affect the layout box, causing scroll-height / clipping bugs).
  // Crop marks are removed — printer only needs the bleed-to-bleed content.
  await page.evaluate((wPx, hPx) => {
    document.querySelectorAll('.guide, .info-bar, .crop-marks').forEach(el => el.remove());
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

  // Resize viewport to exact print dimensions so Puppeteer PDF scale = 1.0.
  await page.setViewport({ width: printWpx, height: printHpx, deviceScaleFactor: 2 });

  // Export PDF — bleed-to-bleed, single page, matches printer template dimensions
  const pdfPath = join(OUTPUT_DIR, 'cover.pdf');
  console.log('   Generating PDF...');

  await page.pdf({
    path:            pdfPath,
    width:           `${printW}in`,
    height:          `${printH}in`,
    printBackground: true,
    margin:          { top: 0, right: 0, bottom: 0, left: 0 },
    timeout:         120000,
  });

  await browser.close();

  console.log(`   ✓ PDF saved to ${pdfPath}`);
  console.log('\n✨ Cover PDF generation complete!');
}

generateCoverPDF().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
