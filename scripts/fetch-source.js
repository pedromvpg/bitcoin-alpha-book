/**
 * Fetch Bitcoin v0.01 Alpha source code
 * Downloads from the official archive and extracts to src/bitcoin-0.01/
 */

import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Bitcoin v0.01 source archive URL (from bitcointalk archive)
const BITCOIN_SOURCE_URL = 'https://bitcointalk.org/bitcoin-0.01.zip';
const MIRROR_URL = 'https://github.com/trottier/original-bitcoin/archive/refs/heads/master.zip';

const OUTPUT_DIR = join(ROOT_DIR, 'src', 'bitcoin-0.01');
const TEMP_ZIP = join(ROOT_DIR, 'temp-bitcoin.zip');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    
    const request = (urlStr) => {
      https.get(urlStr, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          request(response.headers.location);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        reject(err);
      });
    };
    
    request(url);
  });
}

async function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  
  // Find the root folder in the zip
  let rootFolder = '';
  for (const entry of entries) {
    if (entry.isDirectory && entry.entryName.split('/').length === 2) {
      rootFolder = entry.entryName;
      break;
    }
  }
  
  // Extract and flatten
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    
    let targetPath = entry.entryName;
    if (rootFolder && targetPath.startsWith(rootFolder)) {
      targetPath = targetPath.substring(rootFolder.length);
    }
    
    // Skip non-source files
    const ext = targetPath.split('.').pop()?.toLowerCase();
    const validExtensions = ['cpp', 'h', 'c', 'txt', 'rc', 'vc', 'fbp'];
    const isValidFile = validExtensions.includes(ext) || 
                        targetPath.toLowerCase().includes('makefile') ||
                        targetPath.toLowerCase().includes('readme');
    
    if (!isValidFile) continue;
    
    const fullPath = join(destDir, targetPath);
    const dir = dirname(fullPath);
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    zip.extractEntryTo(entry, dir, false, true, false, entry.name);
  }
}

async function main() {
  console.log('🪙  Bitcoin v0.01 Alpha Source Fetcher\n');
  
  // Clean up existing
  if (existsSync(OUTPUT_DIR)) {
    console.log('📁 Cleaning existing source directory...');
    rmSync(OUTPUT_DIR, { recursive: true });
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Try to download
  console.log('📥 Downloading Bitcoin v0.01 source code...');
  try {
    await downloadFile(MIRROR_URL, TEMP_ZIP);
    console.log('✅ Download complete');
  } catch (err) {
    console.error('❌ Failed to download:', err.message);
    console.log('   Trying alternate source...');
    try {
      await downloadFile(BITCOIN_SOURCE_URL, TEMP_ZIP);
      console.log('✅ Download complete from alternate source');
    } catch (err2) {
      console.error('❌ All download sources failed');
      console.log('\n📋 Manual download instructions:');
      console.log('   1. Download from: https://github.com/trottier/original-bitcoin');
      console.log('   2. Extract to: src/bitcoin-0.01/');
      process.exit(1);
    }
  }
  
  // Extract
  console.log('📦 Extracting source files...');
  try {
    await extractZip(TEMP_ZIP, OUTPUT_DIR);
    console.log('✅ Extraction complete');
  } catch (err) {
    console.error('❌ Extraction failed:', err.message);
    process.exit(1);
  }
  
  // Clean up temp file
  if (existsSync(TEMP_ZIP)) {
    rmSync(TEMP_ZIP);
  }
  
  console.log('\n🎉 Bitcoin v0.01 source code ready in src/bitcoin-0.01/');
}

main().catch(console.error);
