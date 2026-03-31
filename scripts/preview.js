/**
 * Preview Server for Bitcoin Alpha Book
 *
 * Routes:
 *   /            → project home page (templates/home.html)
 *   /book        → full book HTML preview
 *   /cover       → cover HTML
 *   /thumbnails     → raw page grid (thumbnails.png)
 *   /contact-sheet  → print overview (spreads + full cover)
 *   /releases/*  → static files from releases/ directory
 *   /api/releases → JSON list of all timestamped releases
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');

const app = express();
const PORT = 3000;

// ── Static file serving ─────────────────────────────────────────────
app.use(express.static(OUTPUT_DIR));
app.use('/styles', express.static(join(ROOT_DIR, 'styles')));
app.use('/releases', express.static(join(ROOT_DIR, 'releases')));

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
  res.sendFile(join(ROOT_DIR, 'templates', 'home.html'));
});

// ── Book preview ─────────────────────────────────────────────────────
app.get('/book', (req, res) => {
  const candidates = [
    join(OUTPUT_DIR, 'preview.html'),
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

// ── Cover ────────────────────────────────────────────────────────────
app.get('/cover', (req, res) => {
  const p = join(OUTPUT_DIR, 'cover.html');
  if (existsSync(p)) return res.sendFile(p);
  res.send(`
    <html><body style="font-family:system-ui;padding:2em;text-align:center">
      <h1>Cover not yet built</h1>
      <p>Run <code>npm run cover</code> first.</p>
    </body></html>
  `);
});

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
  console.log(`   Releases → http://localhost:${PORT}/#releases\n`);
  console.log(`   Press Ctrl+C to stop\n`);
});
