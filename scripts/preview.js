/**
 * Preview Server for Bitcoin Alpha Book
 * 
 * Serves the generated HTML for live preview in browser
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const app = express();
const PORT = 3000;

// Serve all files from output directory
app.use(express.static(join(ROOT_DIR, 'output')));

// Also serve styles
app.use('/styles', express.static(join(ROOT_DIR, 'styles')));

// Default route
app.get('/', (req, res) => {
  const previewPath = join(ROOT_DIR, 'output', 'preview.html');
  const htmlPath = join(ROOT_DIR, 'output', 'bitcoin-alpha-book.html');
  
  if (existsSync(previewPath)) {
    res.sendFile(previewPath);
  } else if (existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send(`
      <html>
        <body style="font-family: system-ui; padding: 2em; text-align: center;">
          <h1>Book not yet built</h1>
          <p>Run <code>npm run build</code> first to generate the HTML.</p>
        </body>
      </html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`\n📖 Bitcoin Alpha Book Preview`);
  console.log(`   Open http://localhost:${PORT} in your browser\n`);
  console.log(`   Press Ctrl+C to stop\n`);
});
