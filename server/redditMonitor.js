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

async function searchReddit(keyword) {
  const url = `https://www.reddit.com/search.json?q="${encodeURIComponent(keyword)}"&sort=new&t=day&limit=10`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ReportReadyBot/1.0)',
        'Accept': 'application/json'
      }
    });
    if (!r.ok) {
      console.error(`Reddit search HTTP ${r.status} for "${keyword}"`);
      return [];
    }
    const data = await r.json();
    return (data.data?.children || []).map(c => ({
      id: c.data.id,
      title: c.data.title,
      subreddit: c.data.subreddit_name_prefixed,
      url: `https://reddit.com${c.data.permalink}`,
      selftext: (c.data.selftext || '').substring(0, 300),
      created_utc: c.data.created_utc
    }));
  } catch (e) {
    console.error(`Reddit search error for "${keyword}":`, e.message);
    return [];
  }
}

async function checkAll() {
  const seen = loadSeen();
  const now = Date.now();
  const newIds = [];

  for (const kw of KEYWORDS) {
    const results = await searchReddit(kw);
    for (const post of results) {
      if (seen.includes(post.id)) continue;
      // Only alert on posts from last 2 hours (within our check window)
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
    // Be nice to Reddit's API
    await new Promise(r => setTimeout(r, 2000));
  }

  if (newIds.length) saveSeen(seen);
  console.log(`[${new Date().toISOString()}] Check complete. ${newIds.length} new alerts.`);
}

export function startRedditMonitor() {
  checkAll();
  setInterval(checkAll, CHECK_INTERVAL_MINUTES * 60 * 1000);
  console.log(`Reddit monitor started — checking every ${CHECK_INTERVAL_MINUTES} minutes for ${KEYWORDS.length} keywords`);
}
