# The Signal Desk

A self-hosted dashboard that pulls **independent news** — YouTube channels,
podcasts, and article/Substack feeds — into one live wall, newest first.
No API keys. No accounts. You own the source list.

## Why there's a server

Feeds like YouTube, podcasts, and Substack don't allow a webpage to fetch them
directly (browser CORS rules block it). So a tiny Node server does the fetching,
merges everything into one feed, and hands it to the dashboard. That's the whole
backend — one file, `server.js`.

## Quick start — just double-click

**`Start Signal Desk.command`** is the launcher. Double-click it and it starts
the app and opens the dashboard in your browser on its own. No Terminal typing.

- **First time:** right-click (or Control-click) the file → **Open** → **Open**
  in the little box that appears. macOS only asks this once because the file
  came from the internet; after that a normal double-click works.
- Keep the small black window that appears open while you use the dashboard.
- **To quit:** close that window (click **Terminate** if it asks).

It needs [Node.js](https://nodejs.org) installed (the launcher tells you if it's
missing and where to get it). The very first launch takes a minute to set up;
every launch after is quick.

### Or start it by hand (the typed way)

```bash
npm install     # one time
npm start       # then open http://localhost:3000
```

Hit **↻ Refresh** in the top bar to re-pull (feeds are cached for 5 minutes).
Run `npm test` to sanity-check the feed parsing offline.

## Adding or removing sources (the easy way)

Click **＋ Sources** in the top bar. A panel opens where you:
1. Pick the kind — **Video**, **Podcast**, or **Article**.
2. Give it a name.
3. Paste a link:
   - *Video:* the channel's `@handle` (like `@MeidasTouch`) or its YouTube page link.
   - *Podcast:* the show's Apple Podcasts link (it finds the feed) or a direct RSS URL.
   - *Article:* the website (e.g. `someone.substack.com`) or its RSS link — it finds the feed.
4. Click **Add source**. It checks the feed actually works before saving, and
   tells you right away if a link is wrong. Remove any source with the ✕ next to it.

Changes save automatically and the wall refreshes. That's all you need.

## Editing sources by hand (optional)

Under the hood everything lives in **`sources.json`**, so you can also edit it
directly if you ever want to. Three kinds of source:

```jsonc
// A YouTube channel — give a handle OR a channelId (UC...). No API key.
{ "name": "MeidasTouch",       "type": "youtube", "handle": "@MeidasTouch" }
{ "name": "The Don Lemon Show","type": "youtube", "channelId": "UCXs0PlIGUDSXfBaF7j-1euA" }

// A podcast — give the number from its Apple Podcasts URL, OR a direct rss url.
{ "name": "IHIP News",         "type": "podcast", "appleId": "1761444284" }
{ "name": "Some Show",         "type": "podcast", "rss": "https://feeds.example.com/show.xml" }

// An article feed or Substack — Substack feeds are just the site URL + /feed.
{ "name": "ProPublica",        "type": "article", "rss": "https://www.propublica.org/feeds/propublica/main" }
{ "name": "Someone's Substack","type": "article", "rss": "https://someone.substack.com/feed" }
```

Save the file, hit Refresh. Any line in the array that's a plain string
(like `"--- my dividers ---"`) is ignored, so you can use them as comments.

**Finding the bits you need**
- *YouTube handle*: it's the `@name` in the channel's URL. If a handle won't
  resolve, open the channel, "View source", search `UC` — that's the channelId.
- *Apple podcast id*: the number in `podcasts.apple.com/.../id1761444284`.
- *Article RSS*: try the site URL + `/feed` or `/rss`, or look for the RSS icon.

The dashboard is source-agnostic — it'll aggregate whatever you point it at, so
you can tune the wall to exactly the mix of voices you want.

## Optional upgrades

- **Richer YouTube data** (view counts, exact durations): swap the RSS approach
  for the free [YouTube Data API v3](https://developers.google.com/youtube/v3).
  RSS is used here so it works with zero setup.
- **Put it online**: it's a stock Node app — deploys as-is to Render, Railway,
  Fly.io, or a small VPS. Set `PORT` via env var.
- **Auto-refresh**: the front end pulls once on load; add a `setInterval` in
  `index.html` if you want it to re-poll on its own.

## Share it with friends (put it online + install as an app)

On your Mac it only runs while Terminal is open, and only you can reach it. To
let friends use it, host it once and share the link. It's already set up for
this — it reads `PORT` from the environment and has an app icon + manifest.

**Host it (free, recommended: Render):**
1. Make a free account at [github.com](https://github.com) and put this folder
   in a repository (GitHub's site can upload a folder directly).
2. Make a free account at [render.com](https://render.com) — no credit card.
3. New → **Web Service** → connect your repo. Render auto-detects Node and runs
   `npm install` then `npm start`. Click Create.
4. You get a URL like `https://signal-desk.onrender.com`. Share that with anyone.

   Note: the free tier "sleeps" after ~15 min idle, so the first visit after a
   quiet spell takes ~30–60s to wake up, then it's fast. Fine for friends; a
   ~$7/mo plan removes the nap if it takes off.

**Install it as an app (no app store):** open the hosted link and —
- *iPhone/iPad (Safari):* Share → **Add to Home Screen**.
- *Android/desktop (Chrome/Edge):* an **Install** icon appears in the address
  bar, or menu → Install.

It then opens full-screen with the Signal Desk icon, like a native app.

Everyone who opens the link sees the same wall you've curated in `sources.json`.
(Letting each friend pick their *own* sources would mean adding accounts — a
bigger project; happy to add it later.)

## Files

```
server.js        the backend: resolves sources, fetches + parses feeds, /api/feed
sources.json     your source list  ← edit this
public/index.html the dashboard (self-contained; opens in demo mode without the server)
test-parse.js    offline test for the parsing logic
```
