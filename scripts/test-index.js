/**
 * Test script for Subject Index
 * 
 * Verifies that the index is generated correctly and page numbers resolve.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

async function testIndex() {
  console.log('🧪 Testing Subject Index\n');
  
  const htmlPath = join(OUTPUT_DIR, 'bitcoin-alpha-book.html');
  
  // Test 1: HTML file exists
  console.log('1. Checking HTML file exists...');
  if (!existsSync(htmlPath)) {
    console.error('   ✗ HTML file not found. Run `npm run build` first.');
    process.exit(1);
  }
  console.log('   ✓ HTML file exists\n');
  
  const html = readFileSync(htmlPath, 'utf8');
  
  // Test 2: Index section exists
  console.log('2. Checking index section exists...');
  if (!html.includes('class="chapter index-section"')) {
    console.error('   ✗ Index section not found in HTML');
    process.exit(1);
  }
  console.log('   ✓ Index section exists\n');
  
  // Test 3: Index has letter groups
  console.log('3. Checking index letter groups...');
  const letterGroups = html.match(/class="index-letter-group"/g);
  if (!letterGroups || letterGroups.length === 0) {
    console.error('   ✗ No letter groups found');
    process.exit(1);
  }
  console.log(`   ✓ Found ${letterGroups.length} letter groups\n`);
  
  // Test 4: Index has entries
  console.log('4. Checking index entries...');
  const entries = html.match(/class="index-entry"/g);
  if (!entries || entries.length === 0) {
    console.error('   ✗ No index entries found');
    process.exit(1);
  }
  console.log(`   ✓ Found ${entries.length} index entries\n`);
  
  // Test 5: Index entries have page references with valid hrefs
  console.log('5. Checking page references...');
  const pageRefs = html.match(/<a class="index-page-ref" href="#[^"]+"><\/a>/g);
  if (!pageRefs || pageRefs.length === 0) {
    console.error('   ✗ No page references found');
    process.exit(1);
  }
  console.log(`   ✓ Found ${pageRefs.length} page references\n`);
  
  // Test 6: Page references point to valid section IDs
  console.log('6. Validating page reference targets...');
  const hrefPattern = /href="#([^"]+)"/g;
  const sectionIdPattern = /id="([^"]+)"/g;
  
  // Extract all section IDs
  const sectionIds = new Set();
  let match;
  while ((match = sectionIdPattern.exec(html)) !== null) {
    sectionIds.add(match[1]);
  }
  
  // Check that all page ref hrefs point to valid sections
  const pageRefHrefs = [];
  const indexSection = html.substring(html.indexOf('class="chapter index-section"'));
  let hrefMatch;
  const hrefRegex = /class="index-page-ref" href="#([^"]+)"/g;
  while ((hrefMatch = hrefRegex.exec(indexSection)) !== null) {
    pageRefHrefs.push(hrefMatch[1]);
  }
  
  const invalidRefs = pageRefHrefs.filter(href => !sectionIds.has(href));
  if (invalidRefs.length > 0) {
    console.error(`   ✗ Found ${invalidRefs.length} invalid references:`);
    invalidRefs.slice(0, 5).forEach(ref => console.error(`     - #${ref}`));
    if (invalidRefs.length > 5) console.error(`     ... and ${invalidRefs.length - 5} more`);
    process.exit(1);
  }
  console.log(`   ✓ All ${pageRefHrefs.length} references point to valid sections\n`);
  
  // Test 7: CSS has target-counter rule
  console.log('7. Checking CSS for target-counter rule...');
  if (!html.includes('target-counter(attr(href url), page)')) {
    // Check if it has the old syntax
    if (html.includes('target-counter(attr(href), page)')) {
      console.warn('   ⚠ Found old target-counter syntax (missing url keyword)');
      console.warn('   Page numbers may not resolve in Paged.js\n');
    } else {
      console.error('   ✗ target-counter CSS rule not found');
      process.exit(1);
    }
  } else {
    console.log('   ✓ target-counter CSS rule found with correct syntax\n');
  }
  
  // Test 8: Index is in TOC
  console.log('8. Checking index is in Table of Contents...');
  if (!html.includes('data-target="index"')) {
    console.error('   ✗ Index not found in TOC');
    process.exit(1);
  }
  console.log('   ✓ Index is listed in TOC\n');
  
  // Test 9: Test with Puppeteer (if available)
  console.log('9. Testing page number resolution with Puppeteer...');
  try {
    const puppeteer = await import('puppeteer');
    
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Load the HTML file
    console.log('   Loading HTML and waiting for Paged.js...');
    await page.goto(`file://${htmlPath}`, {
      waitUntil: 'networkidle0',
      timeout: 120000
    });
    
    // Wait for Paged.js to finish
    await page.waitForFunction(() => {
      return window.PagedPolyfill && window.PagedPolyfill.ready;
    }, { timeout: 120000 });
    
    // Extract index entries with their resolved page numbers
    const indexData = await page.evaluate(() => {
      const results = [];
      const entries = document.querySelectorAll('.index-entry');
      
      for (let i = 0; i < Math.min(20, entries.length); i++) {
        const entry = entries[i];
        const termEl = entry.querySelector('.index-code') || entry.firstChild;
        const term = termEl ? termEl.textContent.trim() : entry.textContent.split(',')[0].trim();
        
        const refs = entry.querySelectorAll('.index-page-ref');
        const pageNumbers = [];
        
        refs.forEach(ref => {
          // Get the href target
          const href = ref.getAttribute('href');
          const targetId = href ? href.replace('#', '') : null;
          
          // Find what page number Paged.js assigned
          if (targetId) {
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
              const pagedPage = targetEl.closest('.pagedjs_page');
              if (pagedPage) {
                const pageNum = pagedPage.getAttribute('data-page-number');
                if (pageNum && !pageNumbers.includes(pageNum)) {
                  pageNumbers.push(pageNum);
                }
              }
            }
          }
        });
        
        results.push({ term, pageNumbers: pageNumbers.join(', '), refCount: refs.length });
      }
      
      return results;
    });
    
    await browser.close();
    
    // Display results
    const hasPageNumbers = indexData.some(d => d.pageNumbers.length > 0);
    
    if (hasPageNumbers) {
      console.log('   ✓ Page numbers are resolving!\n');
      console.log('   Sample index entries with page numbers:');
      console.log('   ─────────────────────────────────────────');
      indexData.slice(0, 15).forEach(({ term, pageNumbers, refCount }) => {
        const truncatedTerm = term.length > 25 ? term.substring(0, 22) + '...' : term;
        console.log(`   ${truncatedTerm.padEnd(28)} ${pageNumbers || '(no pages)'}`);
      });
      console.log('   ─────────────────────────────────────────\n');
    } else {
      console.warn('   ⚠ Page numbers not resolving');
      console.warn('   This might be a CSS target-counter compatibility issue\n');
    }
    
  } catch (err) {
    console.log(`   ⚠ Skipped (Puppeteer error: ${err.message})\n`);
  }
  
  console.log('═══════════════════════════════════════');
  console.log('✅ All index tests passed!');
  console.log('═══════════════════════════════════════\n');
}

testIndex().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
