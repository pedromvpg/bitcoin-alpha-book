/**
 * PDF Generator for Bitcoin Alpha Book
 * Uses Paged.js for proper CSS Paged Media support (running headers, etc.)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  SOURCE_FILE_ORDER,
  chapterIdFromFilename,
} from './source-file-order.mjs';
import {
  EDITION,
  ANNOTATIONS_CREDIT,
  syncEditionInHtml,
} from './edition.mjs';
import { launchBrowser } from './puppeteer-launch.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

async function generatePDF() {
  console.log('📄 Bitcoin Alpha Book PDF Generator\n');
  
  const htmlPath = join(OUTPUT_DIR, 'bitcoin-alpha-book.html');
  
  if (!existsSync(htmlPath)) {
    console.error('Error: HTML file not found. Run "npm run build" first.');
    process.exit(1);
  }
  
  // Read the HTML — rewrite edition/credit so PDF matches edition.mjs
  // even if the last `npm run build` predates an edition bump.
  let html = syncEditionInHtml(readFileSync(htmlPath, 'utf8'));
  
  // Add print-specific styles that work with Paged.js
  const printStyles = `
    <style id="print-overrides">
      /* Remove Paged.js preview elements for clean PDF output */
      .pagedjs_page {
        background: white !important;
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
      }

      body {
        background: white !important;
      }

      .pagedjs_pages {
        background: white !important;
      }

      .pagedjs_sheet {
        background: white !important;
        box-shadow: none !important;
        border: none !important;
      }

      /* Remove any page simulation styling */
      .pagedjs_pagebox {
        box-shadow: none !important;
      }

      /* Paged.js running header styles */
      @page {
        size: 7in 10in;
        margin: 0.85in 0.625in 0.75in 0.875in;
      }
      
      /* Left pages (even/verso) - section name top-left, page number bottom-left */
      @page :left {
        margin: 0.85in 0.875in 0.75in 0.625in;

        @top-left {
          content: string(current-section, first);
          font-family: 'Basis Grotesque Mono Pro', monospace;
          font-size: 7pt;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        @top-right {
          content: none;
        }

        @top-center {
          content: none;
        }

        @bottom-left {
          content: counter(page);
          font-family: 'Basis Grotesque Mono Pro', monospace;
          font-size: 8pt;
          color: #333;
        }

        @bottom-right {
          content: none;
        }

        @bottom-center {
          content: none;
        }
      }

      /* Right pages (odd/recto) - book title top-right, page number bottom-right */
      @page :right {
        margin: 0.85in 0.625in 0.75in 0.875in;

        @top-right {
          content: 'BITCOIN v0.01 ALPHA — ANNOTATED';
          font-family: 'Basis Grotesque Mono Pro', monospace;
          font-size: 7pt;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        @top-left {
          content: none;
        }

        @top-center {
          content: none;
        }

        @bottom-right {
          content: counter(page);
          font-family: 'Basis Grotesque Mono Pro', monospace;
          font-size: 8pt;
          color: #333;
        }

        @bottom-left {
          content: none;
        }

        @bottom-center {
          content: none;
        }
      }
      
      /* Front matter pages - no headers/footers */
      @page title-page {
        @top-left { content: none; } @top-right { content: none; } @top-center { content: none; }
        @bottom-left { content: none; } @bottom-right { content: none; } @bottom-center { content: none; }
      }

      @page dedication-page {
        @top-left { content: none; } @top-right { content: none; } @top-center { content: none; }
        @bottom-left { content: none; } @bottom-right { content: none; } @bottom-center { content: none; }
      }

      @page blank-page {
        @top-left { content: none; } @top-right { content: none; } @top-center { content: none; }
        @bottom-left { content: none; } @bottom-right { content: none; } @bottom-center { content: none; }
      }

      @page acknowledgments-page {
        @top-left { content: none; } @top-right { content: none; } @top-center { content: none; }
        @bottom-left { content: none; } @bottom-right { content: none; } @bottom-center { content: none; }
      }

      @page part-divider {
        @top-left { content: none; } @top-right { content: none; } @top-center { content: none; }
        @bottom-left { content: none; } @bottom-right { content: none; } @bottom-center { content: none; }
      }

      @page toc-page {
        @top-left { content: none; } @top-right { content: none; } @top-center { content: none; }
      }
      
      .title-page {
        page: title-page;
        position: relative;
        display: block;
        text-align: center;
        background-color: #ffffff;
        color: #222222;
        padding-top: 2in;
        box-sizing: border-box;
        height: 8.4in;
        overflow: hidden;
      }

      .title-page .title-content {
        margin-bottom: 0;
        text-align: center;
      }

      .title-page .book-title,
      .title-page .book-subtitle,
      .title-page .annotations-credit,
      .title-page .copyright {
        text-align: center;
      }

      .title-page .footer-content {
        position: absolute;
        bottom: 0.5in;
        left: 0;
        right: 0;
        text-align: center;
      }

      .title-page .book-title {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 42pt;
        font-weight: 700;
        color: #000000;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        margin: 0;
      }

      .title-page .book-subtitle {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 16pt;
        font-weight: 400;
        color: #444444;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        margin: 0;
      }

      .title-page .annotations-credit {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 10pt;
        color: #666666;
        letter-spacing: 0.5px;
        margin: 0;
      }

      .title-page .copyright {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 8pt;
        color: #666666;
        letter-spacing: 0.5px;
        margin: 0;
      }
      
      .dedication-page {
        page: dedication-page;
        display: block;
        background-color: #ffffff;
        text-align: center;
        padding-top: 4in;
        height: 8.4in;
        overflow: hidden;
      }

      .acknowledgments-page {
        page: acknowledgments-page;
        padding: 1in 0.5in 0.75in 0.5in;
        background-color: #ffffff;
        height: 8.4in;
        overflow: hidden;
        box-sizing: border-box;
      }

      .dedication-text {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14pt;
        font-style: normal;
        color: #333333;
        margin: 0;
      }

      .blank-page {
        page: blank-page;
        display: block;
        background-color: #ffffff;
        height: 8.4in;
        overflow: hidden;
      }

      .part-divider {
        page: part-divider;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        min-height: 8in;
        padding: 0 1in;
        background-color: #ffffff;
        text-align: center;
        box-sizing: border-box;
      }

      .part-number {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 14pt;
        font-weight: 400;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #888;
        margin-bottom: 0.5em;
      }

      .part-title {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 32pt;
        font-weight: 700;
        line-height: 1.1;
        color: #000;
        margin: 0;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .part-subtitle {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 11pt;
        color: #666;
        margin-top: 1em;
        max-width: 4in;
        line-height: 1.5;
        text-align: center;
      }

      .toc {
        page: toc-page;
        page-break-after: always;
      }

      .toc-section-header {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 8pt;
        font-weight: 700;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 1em 0 0.5em 0;
        margin-top: 0.5em;
        list-style: none;
      }
      
      .toc-section-header:first-child {
        padding-top: 0;
        margin-top: 0;
      }
      
      /* Set running header from any chapter title h1 */
      h1.chapter-title {
        string-set: current-section content();
      }
      
      .introduction {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .introduction h2 {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 13pt;
        font-weight: 700;
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }
      
      .introduction p {
        font-size: 10pt;
        line-height: 1.65;
        margin-bottom: 0.75em;
        text-align: left;
      }
      
      .introduction ul, .introduction ol {
        margin: 0.75em 0 1em 1.5em;
      }
      
      .introduction li {
        margin-bottom: 0.4em;
        line-height: 1.65;
      }
      
      .introduction code {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 0.9em;
        padding: 0.1em 0.3em;
      }
      
      .introduction .closing {
        margin-top: 2em;
        font-size: 11pt;
        text-align: center;
      }
      
      .concepts {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .concepts h2 {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 13pt;
        font-weight: 700;
        margin-top: 3em;
        margin-bottom: 0.5em;
      }

      .concepts h3 {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 11pt;
        font-weight: 700;
        -webkit-text-stroke: 0px currentColor;
        margin-top: 2em;
        margin-bottom: 0.4em;
      }
      
      .concepts p {
        font-size: 10pt;
        line-height: 1.65;
        margin-bottom: 0.75em;
        text-align: left;
      }
      
      .concepts ul, .concepts ol {
        margin: 0.75em 0 1em 1.5em;
      }
      
      .concepts li {
        margin-bottom: 0.4em;
        line-height: 1.65;
      }
      
      .concepts code {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 0.9em;
        padding: 0.1em 0.3em;
      }

      .concepts pre.example {
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 6pt;
        line-height: 1.4;
        background-color: #ffffff;
        border: 1px solid #dddddd;
        padding: 0.75em 1em;
        margin: 0.75em 0;
        white-space: pre-wrap;
      }
      
      .chapter {
        break-before: right;
      }
      
      .chapter:first-of-type {
        break-before: right;
      }
      
      .chapter-intro {
        margin-bottom: 1.5em;
        break-after: page;
      }
      
      .code-container {
        margin: 0;
        padding: 0;
        overflow: visible;
        break-inside: auto;
        font-family: 'Basis Grotesque Mono Pro', monospace;
        font-size: 6pt;
        line-height: 1.4;
        background-color: #ffffff;
      }

      .code-content {
        width: 100%;
        background-color: #ffffff;
      }

      /* Each line is a flex row */
      .code-line {
        display: flex;
        align-items: flex-start;
        background-color: #ffffff;
      }

      /* Line number - fixed width, doesn't wrap */
      .line-num {
        flex-shrink: 0;
        width: 3em;
        color: #888;
        text-align: right;
        padding-right: 1.5em;
        user-select: none;
        white-space: pre;
        background-color: #ffffff;
      }

      /* Code content - can wrap, line number stays fixed */
      .line-code {
        flex: 1;
        color: #222;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        min-width: 0;
        background-color: #ffffff;
      }
      
      /* Hide the inline section-title spans */
      .section-title,
      span.chapter-title:not(h1) {
        position: absolute;
        visibility: hidden;
        height: 0;
        width: 0;
        overflow: hidden;
      }
      
      /* Lines with annotations */
      .code-line.has-annotation {
        background-color: #ffffff;
      }

      .code-line.has-annotation .line-num {
        color: #000000;
        font-weight: 700;
      }

      /* Annotation block - GitHub-style comment interrupting code */
      .annotation-block {
        background-color: #ffffff;
        border: 1px solid #dddddd;
        border-radius: 0;
        margin: 1em 0;
        padding: 0.75em 0 1.5em 0;
        box-shadow: none;
        border-left: none;
        border-right: none;
      }

      .annotation-content {
        padding: 0.3em 0.5em;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 8pt;
        line-height: 1.4;
        color: #000000;
      }

      /* Syntax highlighting - matches syntax.css */
      .token.comment,
      .token.prolog,
      .token.doctype,
      .token.cdata { color: #8a8a8a; font-style: italic; }
      .token.punctuation { color: #444; }
      .token.string,
      .token.attr-value { color: #50a14f; }
      .token.char,
      .token.regex { color: #50a14f; }
      .token.number,
      .token.boolean,
      .token.constant { color: #0086b3; }
      .token.keyword { color: #d73a49; font-weight: 500; }
      .token.operator { color: #444; }
      .token.function { color: #0086b3; }
      .token.class-name,
      .token.type,
      .token.builtin { color: #0086b3; }
      .token.variable { color: #333; }
      .token.property,
      .token.attr-name { color: #50a14f; }
      .token.tag { color: #50a14f; }
      .token.directive,
      .token.directive-hash,
      .token.preprocessor { color: #986801; }
      .token.macro { color: #986801; font-weight: 500; }

      /* Dense chapter layout (uiproject.fbp) - smaller font, 2 columns */
      .chapter-dense .code-container {
        font-size: 4.5pt;
        line-height: 1.3;
      }

      .chapter-dense .code-content {
        column-count: 2;
        column-gap: 1.5em;
        column-rule: 1px solid #ddd;
      }

      .chapter-dense .code-line {
        break-inside: avoid;
      }

      .chapter-dense .line-num {
        width: 2.5em;
        padding-right: 0.8em;
        font-size: 4pt;
      }

      .chapter-dense .annotation-block {
        column-span: all;
      }
    </style>
  `;
  
  html = html.replace('</head>', printStyles + '</head>');
  
  // Write temporary HTML
  const tempHtmlPath = join(OUTPUT_DIR, 'bitcoin-alpha-book-print.html');
  writeFileSync(tempHtmlPath, html, 'utf8');
  console.log('   ✓ Prepared print-ready HTML');
  
  // Launch browser
  console.log('   Launching browser...');
  const browser = await launchBrowser({ timeout: 120000 });
  
  const page = await browser.newPage();

  // Set longer timeouts for PDF generation
  page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);

  // Load the HTML (file:// — use load; networkidle can hang on large local docs)
  console.log('   Loading HTML...');
  await page.goto(`file://${tempHtmlPath}`, {
    waitUntil: 'load',
    timeout: 600000
  });
  
  // Wait for fonts
  await page.evaluateHandle('document.fonts.ready');
  console.log('   ✓ Fonts loaded');
  
  // Wait for Paged.js to finish rendering
  console.log('   Waiting for Paged.js to render...');
  try {
    // Wait for pagedjs_pages container to exist with actual pages
    await page.waitForSelector('.pagedjs_pages .pagedjs_page', { timeout: 600000 });
    console.log('   ✓ Paged.js pages detected');

    // Wait for page count to stabilize
    let lastCount = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const pageCount = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
      if (i % 5 === 0) console.log(`   ... ${pageCount} pages rendered`);
      if (pageCount === lastCount && pageCount > 0) {
        console.log(`   ✓ Paged.js rendered ${pageCount} pages`);
        break;
      }
      lastCount = pageCount;
    }

    // Save page count + Part II source TOC (for print cover) — same DOM as index fill
    if (lastCount > 0) {
      const sectionPageMap = await page.evaluate(() => {
        const map = {};
        document.querySelectorAll('[id]').forEach(section => {
          const p = section.closest('.pagedjs_page');
          if (p) {
            const n = p.getAttribute('data-page-number');
            if (n) map[section.id] = n;
          }
        });
        return map;
      });

      const part2SourceToc = [
        { label: 'rc/ (Resources)', id: 'rc-resources' },
        ...SOURCE_FILE_ORDER.map(fn => ({
          label: fn,
          id:    chapterIdFromFilename(fn),
        })),
      ].map(({ label, id }) => ({
        label,
        page: sectionPageMap[id] != null ? String(sectionPageMap[id]) : null,
      }));

      const bookMetaPath = join(OUTPUT_DIR, 'book-meta.json');
      writeFileSync(
        bookMetaPath,
        JSON.stringify({
          pageCount: lastCount,
          part2SourceToc,
          edition: EDITION,
          annotationsCredit: ANNOTATIONS_CREDIT,
        }, null, 2),
        'utf8',
      );
      console.log(`   ✓ Saved page count + Part II TOC (${part2SourceToc.length} rows) to book-meta.json`);
    }
  } catch (err) {
    console.log('   ⚠ Paged.js may not have fully rendered:', err.message);
  }

  // Additional wait for any final rendering
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Fill in index page numbers (target-counter doesn't always work in PDF export)
  console.log('   Filling in index page numbers...');
  const indexFilled = await page.evaluate(() => {
    // Build section ID to page number map
    const sectionPageMap = {};
    const sections = document.querySelectorAll('[id]');
    sections.forEach(section => {
      const id = section.id;
      const pagedPage = section.closest('.pagedjs_page');
      if (pagedPage) {
        const pageNum = pagedPage.getAttribute('data-page-number');
        sectionPageMap[id] = pageNum;
      }
    });
    
    // Build page number to page ID map
    const pageIdMap = {};
    const pagedPages = document.querySelectorAll('.pagedjs_page');
    pagedPages.forEach(page => {
      const pageNum = page.getAttribute('data-page-number');
      const pageId = page.id;
      if (pageNum && pageId) {
        pageIdMap[pageNum] = pageId;
      }
    });
    
    // Fill in index page refs
    const indexRefs = document.querySelectorAll('.index-page-ref');
    let filled = 0;
    indexRefs.forEach(ref => {
      const href = ref.getAttribute('href');
      if (href) {
        const targetId = href.replace('#', '');
        const pageNum = sectionPageMap[targetId];
        if (pageNum) {
          // Update href to link to the page itself
          const pageId = pageIdMap[pageNum];
          if (pageId) {
            ref.setAttribute('href', '#' + pageId);
          }
          // Add comma separator if not first ref in this entry
          const prevSibling = ref.previousElementSibling;
          const prefix = (prevSibling && prevSibling.classList.contains('index-page-ref')) ? ', ' : '';
          ref.textContent = prefix + pageNum;
          filled++;
        }
      }
    });
    
    return { total: indexRefs.length, filled };
  });
  console.log(`   ✓ Filled ${indexFilled.filled}/${indexFilled.total} index page numbers`);

  // Remove Paged.js preview UI elements before PDF generation
  await page.evaluate(() => {
    // Remove toolbar elements only (be more specific to avoid removing content)
    const toolbarElements = document.querySelectorAll('.pagedjs_interface, .pagedjs-cli-toolbar, #toolbar, .toolbar');
    toolbarElements.forEach(el => el && el.remove());

    // Ensure clean white background
    if (document.body) document.body.style.background = 'white';
    if (document.documentElement) document.documentElement.style.background = 'white';

    // Remove box shadows and borders from page elements
    const pages = document.querySelectorAll('.pagedjs_page, .pagedjs_sheet, .pagedjs_pagebox');
    pages.forEach(p => {
      if (p && p.style) {
        p.style.boxShadow = 'none';
        p.style.border = 'none';
        p.style.background = 'white';
      }
    });

    // Ensure pages container has white background
    const pagesContainer = document.querySelector('.pagedjs_pages');
    if (pagesContainer && pagesContainer.style) {
      pagesContainer.style.background = 'white';
    }
  });
  console.log('   ✓ Removed preview UI elements');

  // Generate PDF
  console.log('   Generating PDF...');
  const pdfPath = join(OUTPUT_DIR, 'bitcoin-alpha-book.pdf');

  // Set viewport to match page size
  await page.setViewport({
    width: 672,  // 7in * 96dpi
    height: 960, // 10in * 96dpi
    deviceScaleFactor: 2
  });

  await page.pdf({
    path: pdfPath,
    width: '7in',
    height: '10in',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    timeout: 600000
  });
  
  await browser.close();
  
  console.log(`   ✓ PDF saved to ${pdfPath}`);
  console.log('\n✨ PDF generation complete!');
}

generatePDF().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
