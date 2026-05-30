// Standalone generator for the Reading Notes site.
// Reads the quote markdown in /quotes and writes a single self-contained
// static page to /reading-notes/index.html: flippable cards grouped and
// filterable by topic. No framework, no dependencies.
//
// Run with: node scripts/build-notes.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quotesDir = join(root, 'quotes');
const outDir = join(root, 'reading-notes');

function findMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...findMarkdown(full));
    else if (name.endsWith('.md') && name.toLowerCase() !== 'readme.md') out.push(full);
  }
  return out;
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

// Parse one book file into structured data: { title, author, cards: [...] }.
// Each blockquote becomes a card tagged with the most recent "## topic".
// A "My note:" line attaches to the most recently added card.
function parseBook(md) {
  const lines = md.split('\n');
  const book = { title: 'Untitled', author: '', cards: [] };
  let category = 'Notes';
  let quoteBuf = [];
  let inComment = false;

  const flushQuote = () => {
    if (quoteBuf.length) {
      book.cards.push({ category, quote: quoteBuf.join(' '), note: '', source: '', apply: '', when: '' });
      quoteBuf = [];
    }
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

    if (line.startsWith('# ')) {
      flushQuote();
      book.title = line.slice(2);
    } else if (/^\*\*Author:\*\*/i.test(line)) {
      flushQuote();
      book.author = line.replace(/^\*\*Author:\*\*\s*/i, '').trim();
    } else if (line.startsWith('## ')) {
      flushQuote();
      category = line.slice(3);
    } else if (line.startsWith('>')) {
      quoteBuf.push(line.replace(/^>\s?/, ''));
    } else if (/^My note:/i.test(line)) {
      flushQuote();
      const last = book.cards[book.cards.length - 1];
      if (last) last.note = line.replace(/^My note:\s*/i, '').trim();
    } else if (/^(—|Source:)/i.test(line)) {
      flushQuote();
      const last = book.cards[book.cards.length - 1];
      if (last) last.source = line.replace(/^(—\s*|Source:\s*)/i, '').trim();
    } else if (/^Apply:/i.test(line)) {
      flushQuote();
      const last = book.cards[book.cards.length - 1];
      if (last) last.apply = line.replace(/^Apply:\s*/i, '').trim();
    } else if (/^When:/i.test(line)) {
      flushQuote();
      const last = book.cards[book.cards.length - 1];
      if (last) last.when = line.replace(/^When:\s*/i, '').trim();
    } else if (line === '') {
      flushQuote();
    }
    // other prose (intro line, byline date) is ignored on purpose
  }
  flushQuote();
  return book;
}

const books = findMarkdown(quotesDir).sort().map((f) => parseBook(readFileSync(f, 'utf8')));

// Build the list of unique topics across all books for the filter bar.
const topics = [...new Set(books.flatMap((b) => b.cards.map((c) => c.category)))];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function cardHtml(card, book) {
  const back =
    card.apply || card.when
      ? `<span class="back-label">Apply it</span><p class="note">${inline(card.apply)}</p>` +
        (card.when
          ? `<span class="back-label" style="margin-top:0.9rem">Reach for it when</span><p class="note">${inline(card.when)}</p>`
          : '')
      : card.note
      ? `<span class="back-label">My note</span><p class="note">${inline(card.note)}</p>`
      : card.source
      ? `<span class="back-label">Reference</span><p class="note">${inline(card.source)}</p>`
      : `<p class="attribution">${inline(book.title)}<span class="byline">${inline(book.author)}</span></p>`;
  return `<button class="card" data-topic="${slug(card.category)}" aria-label="Flip card">
        <span class="card-inner">
          <span class="face front">
            <span class="tag">${esc(card.category)}</span>
            <span class="quote">${inline(card.quote)}</span>
            <span class="hint">tap to flip</span>
          </span>
          <span class="face back">
            <span class="tag">${esc(card.category)}</span>
            ${back}
          </span>
        </span>
      </button>`;
}

const filterBar = `<div class="filters">
        <button class="chip is-active" data-filter="all">All</button>
        ${topics.map((t) => `<button class="chip" data-filter="${slug(t)}">${esc(t)}</button>`).join('\n        ')}
      </div>`;

const sections = books
  .map(
    (b) => `<section class="book">
      <h2 class="book-title">${inline(b.title)}${b.author ? `<span class="book-author">${inline(b.author)}</span>` : ''}</h2>
      <div class="grid">
        ${b.cards.map((c) => cardHtml(c, b)).join('\n        ')}
      </div>
    </section>`
  )
  .join('\n\n    ');

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reading Notes</title>
    <meta name="description" content="Quotes and reflections from my reading, as flippable cards by topic." />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&display=swap" />
    <style>
      :root {
        --paper: #f4f1ea;
        --card: #fffdf8;
        --card-back: #2c2722;
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
        line-height: 1.6;
      }
      .wrap { max-width: 64rem; margin: 0 auto; padding: 4.5rem 1.25rem 7rem; }

      header.masthead { text-align: center; margin-bottom: 2.5rem; }
      .kicker {
        font-family: "Inter", sans-serif;
        font-size: 0.72rem; letter-spacing: 0.24em; text-transform: uppercase;
        color: var(--accent); margin: 0 0 0.6rem;
      }
      h1.site { font-size: 2.7rem; font-weight: 500; margin: 0; line-height: 1.1; }
      .tagline { color: var(--soft); font-style: italic; margin: 0.6rem 0 0; }

      .filters {
        display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem;
        margin: 0 auto 3rem; max-width: 52rem;
      }
      .chip {
        font-family: "Inter", sans-serif; font-size: 0.78rem;
        padding: 0.4rem 0.85rem; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--rule); background: transparent; color: var(--soft);
        transition: all 0.18s ease;
      }
      .chip:hover { border-color: var(--accent); color: var(--accent); }
      .chip.is-active { background: var(--accent); border-color: var(--accent); color: #fff; }

      .book { margin-bottom: 3.5rem; }
      .book-title {
        font-size: 1.05rem; font-weight: 500; text-align: center; color: var(--soft);
        font-style: italic; margin: 0 0 1.75rem;
      }
      .book-author { display: block; font-size: 0.85rem; font-style: normal; }

      .grid {
        display: grid; gap: 1.1rem;
        grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr));
      }

      .card {
        font: inherit; text-align: left; border: none; background: none; padding: 0;
        cursor: pointer; perspective: 1200px; min-height: 13rem;
      }
      .card.is-hidden { display: none; }
      .card-inner {
        display: grid; height: 100%;
        transition: transform 0.55s cubic-bezier(0.2, 0.7, 0.2, 1);
        transform-style: preserve-3d;
      }
      .card.is-flipped .card-inner { transform: rotateY(180deg); }
      .face {
        grid-area: 1 / 1; height: 100%;
        -webkit-backface-visibility: hidden; backface-visibility: hidden;
        border-radius: 14px; padding: 1.35rem 1.4rem;
        display: flex; flex-direction: column;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(40,32,20,0.07);
      }
      .front { background: var(--card); border: 1px solid var(--rule); }
      .back { background: var(--card-back); color: #f4f1ea; transform: rotateY(180deg); }

      .tag {
        font-family: "Inter", sans-serif; font-size: 0.66rem; letter-spacing: 0.12em;
        text-transform: uppercase; color: var(--accent); margin-bottom: 0.7rem;
      }
      .back .tag { color: #c9b890; }
      .quote { font-size: 1.12rem; font-style: italic; line-height: 1.5; }
      .hint {
        font-family: "Inter", sans-serif; font-size: 0.66rem; letter-spacing: 0.1em;
        text-transform: uppercase; color: var(--soft); margin-top: auto; padding-top: 0.9rem;
      }
      .back-label {
        font-family: "Inter", sans-serif; font-size: 0.66rem; letter-spacing: 0.12em;
        text-transform: uppercase; color: #c9b890; margin-bottom: 0.4rem;
      }
      .note { margin: 0; font-style: italic; font-size: 1.02rem; }
      .attribution { margin: auto 0 0; font-style: italic; font-size: 1.05rem; }
      .byline { display: block; font-size: 0.85rem; color: #c9b890; font-style: normal; margin-top: 0.2rem; }

      footer {
        margin-top: 4rem; text-align: center;
        color: var(--soft); font-size: 0.85rem; font-style: italic;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="masthead">
        <p class="kicker">Reading Notes</p>
        <h1 class="site">Quotes &amp; Reflections</h1>
        <p class="tagline">Tap a card to flip it. Filter by topic above.</p>
      </header>

      ${filterBar}

    ${sections}

      <footer>A private reading journal.</footer>
    </div>

    <script>
      // Flip a card on click.
      document.querySelectorAll('.card').forEach(function (card) {
        card.addEventListener('click', function () {
          card.classList.toggle('is-flipped');
        });
      });

      // Filter cards by topic.
      var chips = document.querySelectorAll('.chip');
      var cards = document.querySelectorAll('.card');
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          chips.forEach(function (c) { c.classList.remove('is-active'); });
          chip.classList.add('is-active');
          var filter = chip.getAttribute('data-filter');
          cards.forEach(function (card) {
            var show = filter === 'all' || card.getAttribute('data-topic') === filter;
            card.classList.toggle('is-hidden', !show);
            card.classList.remove('is-flipped');
          });
          // Hide a book section if it has no visible cards.
          document.querySelectorAll('.book').forEach(function (book) {
            var any = book.querySelectorAll('.card:not(.is-hidden)').length > 0;
            book.style.display = any ? '' : 'none';
          });
        });
      });
    </script>
  </body>
</html>
`;

writeFileSync(join(outDir, 'index.html'), page);
console.log('Wrote reading-notes/index.html (' + topics.length + ' topics, ' +
  books.reduce((n, b) => n + b.cards.length, 0) + ' cards)');
