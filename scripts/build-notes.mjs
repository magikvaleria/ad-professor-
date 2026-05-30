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
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" />
    <style>
      :root {
        --night: #1a1230;
        --night-2: #0f0a20;
        --parchment: #f3e9d2;
        --parchment-2: #e8d9b5;
        --card-back: #241a3c;
        --ink: #2a2118;
        --soft: #b9a98c;
        --gold: #c9a24b;
        --gold-bright: #e7c66a;
        --rule: rgba(201, 162, 75, 0.35);
      }
      * { box-sizing: border-box; }
      html { background: var(--night-2); }
      body {
        margin: 0;
        color: var(--parchment);
        font-family: "Cormorant Garamond", Georgia, serif;
        font-size: 1.05rem;
        line-height: 1.6;
        position: relative;
        background:
          radial-gradient(1200px 700px at 50% -10%, #2c1f4d 0%, rgba(44,31,77,0) 60%),
          radial-gradient(900px 600px at 85% 20%, #3a2553 0%, rgba(58,37,83,0) 55%),
          linear-gradient(180deg, var(--night) 0%, var(--night-2) 100%);
        background-attachment: fixed;
      }
      /* Starfield: two layered sprinklings of stars + a slow shimmer. */
      body::before, body::after {
        content: "";
        position: fixed; inset: 0; pointer-events: none; z-index: 0;
      }
      body::before {
        background-image:
          radial-gradient(1.5px 1.5px at 20% 30%, rgba(255,255,255,0.9), transparent),
          radial-gradient(1.5px 1.5px at 70% 65%, rgba(255,255,255,0.7), transparent),
          radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.8), transparent),
          radial-gradient(1px 1px at 85% 15%, rgba(255,255,255,0.7), transparent),
          radial-gradient(1.5px 1.5px at 55% 45%, rgba(255,255,255,0.6), transparent),
          radial-gradient(1px 1px at 10% 60%, rgba(255,255,255,0.7), transparent),
          radial-gradient(1px 1px at 90% 85%, rgba(255,255,255,0.6), transparent),
          radial-gradient(1.5px 1.5px at 33% 12%, rgba(255,255,255,0.8), transparent);
        animation: twinkle 6s ease-in-out infinite alternate;
      }
      body::after {
        background-image:
          radial-gradient(1px 1px at 15% 85%, rgba(231,198,106,0.8), transparent),
          radial-gradient(1px 1px at 65% 25%, rgba(231,198,106,0.6), transparent),
          radial-gradient(1px 1px at 80% 55%, rgba(255,255,255,0.6), transparent),
          radial-gradient(1px 1px at 45% 70%, rgba(231,198,106,0.5), transparent);
        animation: twinkle 9s ease-in-out infinite alternate-reverse;
      }
      @keyframes twinkle { from { opacity: 0.5; } to { opacity: 1; } }

      .wrap { position: relative; z-index: 1; max-width: 64rem; margin: 0 auto; padding: 5rem 1.25rem 7rem; }

      header.masthead { text-align: center; margin-bottom: 3rem; }
      .kicker {
        font-family: "Cinzel", serif;
        font-size: 0.72rem; letter-spacing: 0.4em; text-transform: uppercase;
        color: var(--gold); margin: 0 0 1rem;
      }
      .ornament { color: var(--gold); font-size: 1.1rem; letter-spacing: 0.5em; margin-bottom: 0.6rem; opacity: 0.85; }
      h1.site {
        font-family: "Cinzel", serif;
        font-size: 2.7rem; font-weight: 600; margin: 0; line-height: 1.15;
        color: #f7eecf;
        text-shadow: 0 0 18px rgba(201,162,75,0.45), 0 2px 2px rgba(0,0,0,0.4);
      }
      .tagline { color: var(--soft); font-style: italic; margin: 0.8rem 0 0; font-size: 1.05rem; }

      .filters {
        display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem;
        margin: 0 auto 3.5rem; max-width: 54rem;
      }
      .chip {
        font-family: "Cinzel", serif; font-size: 0.68rem; letter-spacing: 0.08em;
        padding: 0.45rem 0.95rem; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--rule); background: rgba(255,255,255,0.02); color: var(--soft);
        transition: all 0.2s ease;
      }
      .chip:hover { border-color: var(--gold); color: var(--gold-bright); box-shadow: 0 0 12px rgba(201,162,75,0.25); }
      .chip.is-active {
        background: linear-gradient(180deg, var(--gold-bright), var(--gold));
        border-color: var(--gold-bright); color: #2a1d05; font-weight: 500;
        box-shadow: 0 0 16px rgba(231,198,106,0.4);
      }

      .book { margin-bottom: 4rem; }
      .book-title {
        font-family: "Cinzel", serif;
        font-size: 0.95rem; font-weight: 400; letter-spacing: 0.12em; text-align: center;
        color: var(--gold); margin: 0 0 2rem; text-transform: uppercase;
      }
      .book-author { display: block; font-family: "Cormorant Garamond", serif; font-size: 0.95rem; font-style: italic; letter-spacing: 0; text-transform: none; color: var(--soft); margin-top: 0.3rem; }

      .grid {
        display: grid; gap: 1.5rem;
        grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
      }

      .card {
        font: inherit; text-align: left; border: none; background: none; padding: 0;
        cursor: pointer; perspective: 1400px; min-height: 15rem;
      }
      .card.is-hidden { display: none; }
      .card-inner {
        display: grid; height: 100%;
        transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
        transform-style: preserve-3d;
      }
      .card:hover .card-inner { transform: translateY(-4px); }
      .card.is-flipped .card-inner { transform: rotateY(180deg); }
      .card.is-flipped:hover .card-inner { transform: rotateY(180deg) translateY(-4px); }
      .face {
        grid-area: 1 / 1; height: 100%; position: relative;
        -webkit-backface-visibility: hidden; backface-visibility: hidden;
        border-radius: 12px; padding: 1.5rem 1.5rem 1.4rem;
        display: flex; flex-direction: column;
        box-shadow:
          0 2px 4px rgba(0,0,0,0.3),
          0 14px 40px rgba(0,0,0,0.45),
          0 0 0 1px rgba(201,162,75,0.25),
          inset 0 0 0 1px rgba(201,162,75,0.4),
          inset 0 0 22px rgba(201,162,75,0.08);
      }
      /* Gilt inner border frame on both faces. */
      .face::before {
        content: "";
        position: absolute; inset: 8px;
        border: 1px solid rgba(201,162,75,0.45);
        border-radius: 7px; pointer-events: none;
      }
      .front {
        background:
          radial-gradient(120% 80% at 50% 0%, #fbf3dd 0%, var(--parchment) 55%, var(--parchment-2) 100%);
        color: var(--ink);
      }
      .back {
        background:
          radial-gradient(130% 90% at 50% 0%, #34265a 0%, var(--card-back) 60%, #1b1330 100%);
        color: var(--parchment);
        transform: rotateY(180deg);
      }

      .tag {
        font-family: "Cinzel", serif; font-size: 0.6rem; letter-spacing: 0.18em;
        text-transform: uppercase; color: #9c7b2e; margin-bottom: 0.85rem;
        position: relative; z-index: 1;
      }
      .back .tag { color: var(--gold-bright); }
      .quote { font-size: 1.2rem; font-style: italic; line-height: 1.5; position: relative; z-index: 1; }
      .front .quote::first-letter { font-size: 1.05em; }
      .hint {
        font-family: "Cinzel", serif; font-size: 0.56rem; letter-spacing: 0.2em;
        text-transform: uppercase; color: #b08f3e; margin-top: auto; padding-top: 1rem;
        position: relative; z-index: 1; opacity: 0.8;
      }
      .hint::before { content: "✦ "; }
      .back-label {
        font-family: "Cinzel", serif; font-size: 0.58rem; letter-spacing: 0.16em;
        text-transform: uppercase; color: var(--gold-bright); margin-bottom: 0.45rem;
        position: relative; z-index: 1;
      }
      .note { margin: 0; font-style: italic; font-size: 1.05rem; position: relative; z-index: 1; }
      .attribution { margin: auto 0 0; font-style: italic; font-size: 1.1rem; position: relative; z-index: 1; }
      .byline { display: block; font-size: 0.9rem; color: var(--gold-bright); font-style: normal; margin-top: 0.25rem; }

      footer {
        margin-top: 4.5rem; text-align: center;
        color: var(--soft); font-size: 0.85rem; font-style: italic;
        position: relative; z-index: 1;
      }
      footer::before { content: "✦ ✦ ✦"; display: block; color: var(--gold); letter-spacing: 0.5em; margin-bottom: 1rem; opacity: 0.7; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="masthead">
        <div class="ornament">✦ ☾ ✦</div>
        <p class="kicker">Reading Notes</p>
        <h1 class="site">Quotes &amp; Reflections</h1>
        <p class="tagline">Draw a card. Tap to turn it. Filter the deck by topic.</p>
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
