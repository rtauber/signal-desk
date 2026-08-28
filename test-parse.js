// Offline sanity check for normalization — no network required.
const Parser = require('rss-parser');
const { normalize } = require('./server');

const parser = new Parser({
  customFields: { item: [['yt:videoId','ytVideoId'],['itunes:duration','itunesDuration']] },
});

const YT = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>MeidasTouch</title>
 <entry><yt:videoId>abc123XYZ</yt:videoId><title>The story they buried</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123XYZ"/>
  <published>2026-08-15T13:00:00+00:00</published></entry>
</feed>`;

const POD = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
 <channel><title>IHIP News</title>
  <item><title>Two-a-day rundown</title><link>https://example.com/ep</link>
   <pubDate>Fri, 15 Aug 2026 12:00:00 GMT</pubDate>
   <itunes:duration>24:52</itunes:duration>
   <description>Progressive takes on the day's news.</description></item>
 </channel></rss>`;

(async () => {
  const yt = await parser.parseString(YT);
  const a = normalize({ name:'MeidasTouch', type:'youtube' }, yt, yt.items[0]);
  const pod = await parser.parseString(POD);
  const b = normalize({ name:'IHIP News', type:'podcast' }, pod, pod.items[0]);

  const ok =
    a.type==='video' && a.thumbnail.includes('abc123XYZ') && a.url.includes('watch?v=') &&
    b.type==='podcast' && b.meta==='24:52' && b.title==='Two-a-day rundown';

  console.log('YouTube  →', a.type, '|', a.title, '|', a.thumbnail);
  console.log('Podcast  →', b.type, '|', b.title, '|', b.meta);
  console.log(ok ? '\nPASS: normalization works.' : '\nFAIL');
  process.exit(ok ? 0 : 1);
})();
