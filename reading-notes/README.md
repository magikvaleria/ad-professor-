# Reading Notes — standalone site

This folder is a self-contained static site for my book quotes and
reflections. It is **completely separate from the Ad Swipe File** — its own
look, its own URL, no shared navigation.

## How it works

- The source quotes live in `/quotes/**/*.md` (one file per book).
- `scripts/build-notes.mjs` reads those files and regenerates `index.html`
  here. Run it with `node scripts/build-notes.mjs` after adding a quote.
- `index.html` is plain static HTML with no dependencies — it can be served
  by anything.

## Deploying it as its own Vercel project

Deploy this folder as a **separate Vercel project** so it never mixes with
the ad site:

1. Vercel dashboard → **Add New… → Project**.
2. Import the **same GitHub repo** (`ad-professor-`).
3. Under **Root Directory**, click **Edit** and choose **`reading-notes`**.
4. Framework Preset: **Other** (no build step needed — it's static).
5. **Deploy**.

You'll get a separate URL (e.g. `reading-notes.vercel.app`) that auto-updates
whenever this folder changes.
