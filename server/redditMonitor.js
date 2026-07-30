import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = new Resend(process.env.RESEND_API_KEY);
const SEEN_FILE = path.join(__dirname, 'reddit_seen.json');
const ALERT_EMAIL = 'brooksmgroup@gmail.com';
const CHECK_INTERVAL_MINUTES = 5;

const KEYWORDS = [
  'AI search visibility',
  'AI SEO agency',
  "ChatGPT can't find",
  'GEO strategy',
  'white label report'
];

function loadSeen() {
  if (fs.existsSync(SEEN_FILE)) return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
  return [];
}

function saveSeen(ids) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(ids, null, 2));
}

// Parse Reddit RSS — Reddit doesn't block RSS feeds
async function searchRedditRSS(keyword) {
  const url = `https://www.reddit.com/search.rss?q="${encodeURIComponent(keyword)}"&sort=new&restrict_sr=off&t=day`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReportReadyBot/1.0)' }
    });
    if (!r.ok) {
      console.error(`Reddit RSS HTTP ${r.status} for "${keyword}"`);
      return [];
    }
    const xml = await r.text();
    
    // Parse entries from RSS XML
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      const id = (entry.match(/<id>([^<]+)<\/id>/) || [])[1] || '';
      const title = (entry.match(/<title[^>]*>([^<]+)<\/title>/) || [])[1] || '';
      const link = (entry.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
      const updated = (entry.match(/<updated>([^<]+)<\/updated>/) || [])[1] || '';
      const content = (entry.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || '';
      
      if (id && title) {
        entries.push({
          id: id.split('/').pop(), // last segment of URL as unique ID
          title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
          subreddit: (link.match(/reddit\.com(\/r\/[^/]+)/) || [])[1] || '',
          url: link,
          selftext: content.replace(/<[^>]+>/g, '').substring(0, 300),
          created_utc: new Date(updated).getTime() / 1000
        });
      }
    }
    return entries;
  } catch (e) {
    console.error(`Reddit RSS error for "${keyword}":`, e.message);
    return [];
  }
}

async function checkAll() {
  const seen = loadSeen();
  const now = Date.now();
  const newIds = [];

  for (const kw of KEYWORDS) {
    const results = await searchRedditRSS(kw);
    console.log(`  "${kw}": ${results.length} results`);
    for (const post of results) {
      if (seen.includes(post.id)) continue;
      // Only alert on posts from last 2 hours
      if (now - post.created_utc * 1000 > 2 * 60 * 60 * 1000) continue;

      console.log(`🔔 NEW: "${kw}" in ${post.subreddit}: ${post.title}`);
      newIds.push(post.id);
      seen.push(post.id);

      await resend.emails.send({
        from: 'ReportReady <hello@getreportready.com>',
        to: [ALERT_EMAIL],
        subject: `🔔 Reddit Alert: "${kw}" mentioned in ${post.subreddit}`,
        text: `Keyword: "${kw}"\nSubreddit: ${post.subreddit}\nTitle: ${post.title}\nLink: ${post.url}\n\nPreview: ${post.selftext || '(no text)'}\n\n---\nSent by ReportReady Reddit Monitor`
      });
    }
    // Rate limit: 10 seconds between keyword searches
    await new Promise(r => setTimeout(r, 10000));
  }

  if (newIds.length) saveSeen(seen);
  console.log(`[${new Date().toISOString()}] Check complete. ${newIds.length} new alerts.`);
}

export function startRedditMonitor() {
  checkAll();
  setInterval(checkAll, CHECK_INTERVAL_MINUTES * 60 * 1000);
  console.log(`Reddit monitor started — checking every ${CHECK_INTERVAL_MINUTES} minutes for ${KEYWORDS.length} keywords (RSS)`);
}
