/**
 * The Signal Desk — backend
 * Pulls YouTube channels, podcasts, and article feeds server-side (no CORS
 * headaches, no API keys) and serves one merged, newest-first feed at /api/feed.
 */
const express = require('express');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = 5 * 60 * 1000; // re-fetch feeds at most every 5 minutes
const UA = 'Mozilla/5.0 (SignalDesk news aggregator)';

const parser = new Parser({
  headers: { 'User-Agent': UA },
  timeout: 15000,
  customFields: {
    item: [
      ['yt:videoId', 'ytVideoId'],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['itunes:image', 'itunesImage'],
      ['itunes:duration', 'itunesDuration'],
    ],
  },
});

// ---------- source resolution ----------

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Turn an @handle or channel URL into a UC... channel id by reading the page.
async function resolveYouTubeChannelId(source) {
  if (source.channelId) return source.channelId;
  const ref = source.handle || source.url;
  if (!ref) throw new Error(`${source.name}: needs channelId, handle, or url`);
  const pageUrl = ref.startsWith('http')
    ? ref
    : `https://www.youtube.com/${ref.replace(/^@?/, '@')}`;
  const html = await fetchText(pageUrl);
  const m =
    html.match(/"channelId":"(UC[\w-]+)"/) ||
    html.match(/"externalId":"(UC[\w-]+)"/) ||
    html.match(/channel\/(UC[\w-]+)/);
  if (!m) throw new Error(`${source.name}: couldn't find channel id on ${pageUrl}`);
  return m[1];
}

// Turn an Apple Podcasts id into its real RSS feed url via the iTunes lookup API.
async function resolvePodcastRss(source) {
  if (source.rss) return source.rss;
  if (!source.appleId) throw new Error(`${source.name}: needs rss or appleId`);
  const id = String(source.appleId).match(/\d+/)?.[0];
  const data = JSON.parse(
    await fetchText(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`)
  );
  const feed = data.results?.[0]?.feedUrl;
  if (!feed) throw new Error(`${source.name}: no feed for Apple id ${id}`);
  return feed;
}

async function feedUrlFor(source) {
  if (source.type === 'youtube') {
    const id = await resolveYouTubeChannelId(source);
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
  }
  if (source.type === 'podcast') return resolvePodcastRss(source);
  if (source.type === 'article') {
    if (!source.rss) throw new Error(`${source.name}: article sources need an rss url`);
    return source.rss;
  }
  throw new Error(`${source.name}: unknown type "${source.type}"`);
}

// ---------- normalization ----------

const KIND = { youtube: 'video', podcast: 'podcast', article: 'article' };

function pickThumbnail(source, item) {
  if (source.type === 'youtube' && item.ytVideoId)
    return `https://i.ytimg.com/vi/${item.ytVideoId}/hqdefault.jpg`;
  if (item.itunesImage?.$?.href) return item.itunesImage.$.href;
  const mt = item.mediaThumbnail?.[0]?.$?.url;
  if (mt) return mt;
  const mc = item.mediaContent?.find((c) => (c.$?.medium || '').startsWith('image'));
  if (mc?.$?.url) return mc.$.url;
  if (item.enclosure?.url && (item.enclosure.type || '').startsWith('image'))
    return item.enclosure.url;
  return null;
}

function metaFor(source, item) {
  if (source.type === 'podcast') return item.itunesDuration || 'Episode';
  if (source.type === 'article') return item.creator || item.author || 'Article';
  return item.itunesDuration || 'Video';
}

function normalize(source, feed, item) {
  const publishedMs = item.isoDate ? Date.parse(item.isoDate) : Date.now();
  const snippet = (item.contentSnippet || item.content || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  return {
    id: item.guid || item.id || item.link,
    source: source.name,
    type: KIND[source.type] || 'article',
    title: (item.title || 'Untitled').trim(),
    url: item.link,
    thumbnail: pickThumbnail(source, item) || feed.image?.url || null,
    published: item.isoDate || null,
    publishedMs,
    meta: metaFor(source, item),
    snippet,
  };
}

// ---------- aggregation + cache ----------

const SRC_PATH = path.join(__dirname, 'sources.json');
function readRaw() {
  return JSON.parse(fs.readFileSync(SRC_PATH, 'utf8'));
}
function writeRaw(obj) {
  fs.writeFileSync(SRC_PATH, JSON.stringify(obj, null, 2) + '\n');
}
function loadSources() {
  // Anything that isn't an object with a `type` (e.g. string dividers) is skipped.
  return (readRaw().sources || []).filter((s) => s && typeof s === 'object' && s.type);
}

// Turn whatever the user pasted into a proper source entry.
function buildSourceFromInput(name, type, input) {
  name = (name || '').trim();
  input = (input || '').trim();
  if (!name) throw new Error('Give the source a name.');
  if (!input) throw new Error('Paste a link or feed URL.');
  const s = { name, type };
  if (type === 'youtube') {
    const chan = input.match(/(UC[\w-]{20,})/);
    if (chan) s.channelId = chan[1];
    else if (/youtube\.com|youtu\.be/i.test(input)) s.url = input;
    else s.handle = '@' + input.replace(/^@/, '');
  } else if (type === 'podcast') {
    const apple = input.match(/id(\d+)/) || (/^\d+$/.test(input) ? [null, input] : null);
    if (apple) s.appleId = apple[1];
    else s.rss = input;
  } else if (type === 'article') {
    s.rss = input;
  } else {
    throw new Error(`Unknown type "${type}".`);
  }
  return s;
}

// For an article site that isn't itself a feed, find its feed link in the HTML.
async function discoverFeed(pageUrl) {
  if (!/^https?:\/\//i.test(pageUrl)) pageUrl = 'https://' + pageUrl;
  const html = await fetchText(pageUrl);
  const tag = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i);
  if (tag) {
    const href = tag[0].match(/href=["']([^"']+)["']/i);
    if (href) {
      let u = href[1];
      if (u.startsWith('/')) u = new URL(pageUrl).origin + u;
      return u;
    }
  }
  return null;
}

async function resolveAndTest(source) {
  const url = await feedUrlFor(source);
  const feed = await parser.parseURL(url);
  return (feed.items || []).length;
}

// Turn raw fetch/parse errors into something a normal person can act on.
function friendlyError(msg) {
  msg = String(msg || '');
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed|Failed to fetch|getaddrinfo/i.test(msg))
    return "Couldn't reach that link — check the address and your internet connection.";
  if (/couldn't find channel id/i.test(msg))
    return "Couldn't find that YouTube channel. Paste its @handle (like @MeidasTouch) or the channel page link.";
  if (/no feed for Apple id/i.test(msg))
    return "Couldn't find that podcast. Paste the show's Apple Podcasts link, or a direct RSS URL.";
  if (/HTTP 4\d\d|Status code 4|403|404/i.test(msg))
    return "That link didn't return a readable feed. Double-check you copied the right one.";
  if (/HTTP 5\d\d|Status code 5|timeout|ETIMEDOUT|socket hang up/i.test(msg))
    return "That source's server didn't respond properly. Try again in a moment, or check the link.";
  if (/Unexpected|Non-whitespace|Invalid character|not recognized|close tag|Unclosed/i.test(msg))
    return "That page doesn't look like a feed we can read. Try the channel/show page, or its RSS link.";
  return msg.length < 140 ? msg : 'Something went wrong reading that source.';
}

// Only allow editing from your own machine. A public (hosted) copy is read-only
// unless you deliberately set ALLOW_EDITS=true.
function editsAllowed(req) {
  const host = (req.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  return process.env.ALLOW_EDITS === 'true';
}

async function fetchSource(source) {
  try {
    const url = await feedUrlFor(source);
    const feed = await parser.parseURL(url);
    const items = (feed.items || []).map((it) => normalize(source, feed, it));
    return { name: source.name, type: KIND[source.type], ok: true, count: items.length, items };
  } catch (err) {
    return { name: source.name, type: KIND[source.type], ok: false, error: err.message, items: [] };
  }
}

let cache = { items: [], statuses: [], fetchedAt: 0 };

async function aggregate(force = false) {
  if (!force && Date.now() - cache.fetchedAt < CACHE_TTL_MS && cache.items.length)
    return cache;
  const results = await Promise.all(loadSources().map(fetchSource));
  const items = results
    .flatMap((r) => r.items)
    .sort((a, b) => b.publishedMs - a.publishedMs);
  const statuses = results.map(({ items, ...rest }) => rest);
  cache = { items, statuses, fetchedAt: Date.now() };
  return cache;
}

// ---------- server ----------

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/feed', async (req, res) => {
  try {
    const data = await aggregate(req.query.refresh === '1');
    res.json({
      fetchedAt: new Date(data.fetchedAt).toISOString(),
      sources: data.statuses,
      count: data.items.length,
      items: data.items,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sources', (_req, res) => res.json(loadSources()));

// Add a source: validates the feed actually works before saving it.
app.post('/api/sources', async (req, res) => {
  if (!editsAllowed(req))
    return res.status(403).json({ error: 'Editing is turned off on this hosted copy.' });
  try {
    const { name, type, input } = req.body || {};
    const source = buildSourceFromInput(name, type, input);

    const raw = readRaw();
    const dup = (raw.sources || []).some(
      (s) => s && typeof s === 'object' && (s.name || '').toLowerCase() === source.name.toLowerCase()
    );
    if (dup) return res.status(409).json({ error: `You already have a source named “${source.name}”.` });

    let count;
    try {
      count = await resolveAndTest(source);
    } catch (err) {
      // For an article link that wasn't a feed, try to discover the feed and retry once.
      if (type === 'article') {
        const found = await discoverFeed(input).catch(() => null);
        if (!found) throw err;
        source.rss = found;
        count = await resolveAndTest(source);
      } else {
        throw err;
      }
    }

    raw.sources = raw.sources || [];
    raw.sources.push(source);
    writeRaw(raw);
    cache.fetchedAt = 0; // force a fresh pull next load
    res.json({ ok: true, source, recentItems: count });
  } catch (err) {
    res.status(400).json({ error: friendlyError(err.message) });
  }
});

// Remove a source by name.
app.delete('/api/sources', (req, res) => {
  if (!editsAllowed(req))
    return res.status(403).json({ error: 'Editing is turned off on this hosted copy.' });
  const name = (req.body && req.body.name) || '';
  const raw = readRaw();
  const before = (raw.sources || []).length;
  raw.sources = (raw.sources || []).filter(
    (s) => !(s && typeof s === 'object' && s.name === name)
  );
  if (raw.sources.length === before) return res.status(404).json({ error: 'Source not found.' });
  writeRaw(raw);
  cache.fetchedAt = 0;
  res.json({ ok: true });
});

// Export internals so test-parse.js can check normalization without the network.
module.exports = { normalize, pickThumbnail, KIND };

if (require.main === module) {
  app.listen(PORT, () =>
    console.log(`\n  The Signal Desk is live → http://localhost:${PORT}\n`)
  );
}
