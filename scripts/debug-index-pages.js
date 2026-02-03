/**
 * Debug script to list all index terms and their page numbers
 * 
 * This script renders the book with Paged.js and extracts the actual
 * page numbers for each index term.
 */

import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

async function debugIndexPages() {
  const htmlPath = join(OUTPUT_DIR, 'bitcoin-alpha-book.html');
  
  if (!existsSync(htmlPath)) {
    console.error('HTML file not found. Run `npm run build` first.');
    process.exit(1);
  }
  
  console.log('🔍 Debug: Index Page Numbers\n');
  console.log('Launching browser...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Enable console logging from the page
  page.on('console', msg => {
    if (msg.type() === 'log') {
      console.log('  [Page]', msg.text());
    }
  });
  
  console.log('Loading HTML file...');
  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle0',
    timeout: 120000
  });
  
  console.log('Waiting for Paged.js to render...');
  
  try {
    await page.waitForFunction(() => {
      return window.PagedPolyfill && window.PagedPolyfill.ready;
    }, { timeout: 120000 });
    
    console.log('Paged.js finished rendering.\n');
  } catch (err) {
    console.log('Paged.js may not have finished, continuing anyway...\n');
  }
  
  // Get total page count
  const totalPages = await page.evaluate(() => {
    const pages = document.querySelectorAll('.pagedjs_page');
    return pages.length;
  });
  console.log(`Total pages in book: ${totalPages}\n`);
  
  // First, get a map of all section IDs to their page numbers
  console.log('Building section-to-page map...\n');
  
  const sectionPageMap = await page.evaluate(() => {
    const map = {};
    const sections = document.querySelectorAll('[id]');
    
    sections.forEach(section => {
      const id = section.id;
      const pagedPage = section.closest('.pagedjs_page');
      if (pagedPage) {
        const pageNum = pagedPage.getAttribute('data-page-number');
        map[id] = parseInt(pageNum, 10);
      }
    });
    
    return map;
  });
  
  console.log('Section to Page mapping (sample):');
  console.log('─'.repeat(50));
  const sampleSections = ['introduction', 'prehistory', 'computer-concepts', 'cryptography-primer', 'cpp-primer', 'main-cpp', 'script-cpp', 'key-h', 'index'];
  sampleSections.forEach(id => {
    if (sectionPageMap[id]) {
      console.log(`  ${id.padEnd(25)} → page ${sectionPageMap[id]}`);
    }
  });
  console.log('─'.repeat(50));
  console.log('');
  
  // Now get all index entries and their referenced sections
  const indexData = await page.evaluate(() => {
    const results = [];
    const indexSection = document.getElementById('index');
    
    if (!indexSection) {
      return { error: 'Index section not found' };
    }
    
    const entries = indexSection.querySelectorAll('.index-entry');
    
    entries.forEach(entry => {
      // Extract term text
      const text = entry.textContent;
      const term = text.split(',')[0].trim();
      
      // Extract all href targets
      const refs = entry.querySelectorAll('.index-page-ref');
      const targets = [];
      
      refs.forEach(ref => {
        const href = ref.getAttribute('href');
        if (href) {
          targets.push(href.replace('#', ''));
        }
      });
      
      results.push({ term, targets });
    });
    
    return results;
  });
  
  if (indexData.error) {
    console.error(indexData.error);
    await browser.close();
    process.exit(1);
  }
  
  // Now combine with page numbers
  console.log('INDEX TERMS AND PAGE NUMBERS');
  console.log('═'.repeat(70));
  console.log('');
  
  indexData.forEach(({ term, targets }) => {
    // Get unique page numbers for this term
    const pageNumbers = [...new Set(
      targets
        .map(t => sectionPageMap[t])
        .filter(p => p !== undefined)
        .sort((a, b) => a - b)
    )];
    
    const pageStr = pageNumbers.length > 0 
      ? pageNumbers.join(', ')
      : '(no pages found)';
    
    // Truncate long terms
    const displayTerm = term.length > 30 ? term.substring(0, 27) + '...' : term;
    
    console.log(`${displayTerm.padEnd(35)} ${pageStr}`);
  });
  
  console.log('');
  console.log('═'.repeat(70));
  console.log(`\nTotal: ${indexData.length} index terms`);
  
  await browser.close();
}

debugIndexPages().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
