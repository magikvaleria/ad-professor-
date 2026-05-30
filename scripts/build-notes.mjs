// Standalone generator for the Reading Notes site.
// Reads the quote markdown in /quotes and writes a single self-contained
// static page to /reading-notes/index.html. No framework, no dependencies —
// the output is plain HTML that Vercel (or anything) can serve statically.
//
// Run with: node scripts/build-notes.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quotesDir = join(root, 'quotes');
const outDir = join(root, 'reading-notes');

// Collect every .md file under /quotes, skipping the README.
function findMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...findMarkdown(full));
    } else if (name.endsWith('.md') && name.toLowerCase() !== 'readme.md') {
      out.push(full);
    }
  }
  return out;
}

const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Inline formatting: **bold** and "smart" quotes left as-is.
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

// Minimal markdown -> HTML for the small subset we use:
// # h1, ## h2, > blockquote (consecutive lines merge), --- hr,
// HTML comments are dropped, blank lines separate paragraphs.
function render(md) {
  const lines = md.split('\n');
  const html = [];
  let inComment = false;
  let quoteBuf = [];
  let paraBuf = [];

  const flushQuote = () => {
    if (quoteBuf.length) {
      html.push(`<blockquote>${inline(quoteBuf.join(' '))}</blockquote>`);
      quoteBuf = [];
    }
  };
  const flushPara = () => {
    if (paraBuf.length) {
      html.push(`<p>${inline(paraBuf.join(' '))}</p>`);
      paraBuf = [];
    }
  };
  const flush = () => {
    flushQuote();
    flushPara();
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (inComment) {
      if (line.includes('-->')) inComment = false;
      continue;
    }
    if (line.startsWith('<!--')) {
      if (!line.includes('-->')) inComment = true;
      continue;
    }

    if (line === '') {
      flush();
    } else if (line === '---') {
      flush();
      html.push('<hr />');
    } else if (line.startsWith('## ')) {
      flush();
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      flush();
      html.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('>')) {
      flushPara();
      quoteBuf.push(line.replace(/^>\s?/, ''));
    } else {
      flushQuote();
      paraBuf.push(line);
    }
  }
  flush();
  return html.join('\n      ');
}

const books = findMarkdown(quotesDir)
  .sort()
  .map((file) => `<section class="book">\n      ${render(readFileSync(file, 'utf8'))}\n    </section>`)
  .join('\n\n    ');

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reading Notes</title>
    <meta name="description" content="Quotes and reflections from my reading." />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap"
    />
    <style>
      :root {
        --paper: #f7f5ef;
        --ink: #23201b;
        --soft: #6b655c;
        --accent: #6a5b3e;
        --rule: #e2ddd1;
      }
      * { box-sizing: border-box; }
      html { background: var(--paper); }
      body {
        margin: 0;
        color: var(--ink);
        font-family: "EB Garamond", Georgia, serif;
        font-size: 1.15rem;
        line-height: 1.65;
      }
      .wrap { max-width: 40rem; margin: 0 auto; padding: 5rem 1.5rem 7rem; }
      header.masthead { margin-bottom: 4rem; }
      header.masthead .kicker {
        font-size: 0.78rem;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--accent);
        margin: 0 0 0.6rem;
      }
      header.masthead h1.site {
        font-size: 2.6rem;
        font-weight: 500;
        margin: 0;
        line-height: 1.1;
      }
      header.masthead p.tagline {
        color: var(--soft);
        font-style: italic;
        margin: 0.6rem 0 0;
      }
      .book h1 {
        font-size: 1.9rem;
        font-weight: 500;
        margin: 0 0 0.25rem;
      }
      .book h2 {
        font-size: 1.25rem;
        font-weight: 500;
        color: var(--accent);
        margin: 3rem 0 1rem;
      }
      blockquote {
        margin: 1.1rem 0;
        padding-left: 1.1rem;
        border-left: 2px solid var(--accent);
        font-style: italic;
        color: #322e27;
      }
      p { margin: 0.85rem 0; color: #312d26; }
      .book p strong { font-weight: 600; }
      hr { border: 0; border-top: 1px solid var(--rule); margin: 2.5rem 0; }
      footer {
        margin-top: 5rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--rule);
        color: var(--soft);
        font-size: 0.85rem;
        font-style: italic;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="masthead">
        <p class="kicker">Reading Notes</p>
        <h1 class="site">Quotes &amp; Reflections</h1>
        <p class="tagline">Lines worth keeping from what I read, with my own notes.</p>
      </header>

    ${books}

      <footer>A private reading journal.</footer>
    </div>
  </body>
</html>
`;

writeFileSync(join(outDir, 'index.html'), page);
console.log('Wrote reading-notes/index.html');
