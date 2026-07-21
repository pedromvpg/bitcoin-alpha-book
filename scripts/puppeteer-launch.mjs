/**
 * Launch Puppeteer with a working Chrome binary.
 *
 * Cursor/sandbox often sets PUPPETEER_CACHE_DIR to an empty cache, so the
 * bundled Chromium download is missing. Prefer an explicit path, then the
 * local system browser, then Puppeteer's default.
 */

import puppeteer from 'puppeteer';
import { existsSync } from 'fs';

const SYSTEM_CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);

function resolveExecutablePath() {
  for (const candidate of SYSTEM_CHROME) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    const bundled = puppeteer.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    /* bundled Chrome missing from cache */
  }
  return undefined;
}

export function puppeteerLaunchOptions(extra = {}) {
  const { args: extraArgs, ...rest } = extra;
  const opts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      ...(extraArgs || []),
    ],
    ...rest,
  };

  const executablePath = resolveExecutablePath();
  if (executablePath) {
    opts.executablePath = executablePath;
  }

  return opts;
}

export async function launchBrowser(extra = {}) {
  const opts = puppeteerLaunchOptions(extra);
  if (opts.executablePath) {
    console.log(`   Chrome: ${opts.executablePath}`);
  }
  return puppeteer.launch(opts);
}
