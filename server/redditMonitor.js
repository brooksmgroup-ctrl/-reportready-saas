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

// Subreddits to monitor — their /new feeds are rarely rate-limited
const SUBREDDITS = ['SaaS', 'SEO', 'Entrepreneur', 'SideProject', 'agency', 'bigseo', 'digital_marketing'];

function loadSeen() {
  if (fs.existsSync(SEEN_FILE)) return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
  return [];
}

function saveSeen(ids) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(ids, null, 2));
}

function matchesKeyword(text) {
  const lower = text.toLowerCase();
  return KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

async function fetchSubreddit(sub) {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ReportReadyBot/1.0)',
        'Accept': 'application/json'
      }
    });
    if (!r.ok) {
      console.error(`  r/${sub} HTTP ${r.status}`);
      return [];
    }
    const data = await r.json();
    return (data.data?.children || []).map(c => ({
      id: c.data.id,
      title: c.data.title,
      selftext: c.data.selftext || '',
      subreddit: c.data.subreddit_name_prefixed,
      url: `https://reddit.com${c.data.permalink}`,
      created_utc: c.data.created_utc
    }));
  } catch (e) {
    console.error(`  r/${sub} error: ${e.message}`);
    return [];
  }
}

async function checkAll() {
  const seen = loadSeen();
  const now = Date.now();
  const newIds = [];

  for (const sub of SUBREDDITS) {
    const posts = await fetchSubreddit(sub);
    console.log(`  r/${sub}: ${posts.length} posts`);
    
    for (const post of posts) {
      if (seen.includes(post.id)) continue;
      if (now - post.created_utc * 1000 > 2 * 60 * 60 * 1000) continue;

      const combined = `${post.title} ${post.selftext}`;
      if (!matchesKeyword(combined)) continue;

      // Find which keyword matched
      const matched = KEYWORDS.filter(kw => combined.toLowerCase().includes(kw.toLowerCase()));

      console.log(`🔔 MATCH: "${matched.join(', ')}" in ${post.subreddit}: ${post.title}`);
      newIds.push(post.id);
      seen.push(post.id);

      await resend.emails.send({
        from: 'ReportReady <hello@getreportready.com>',
        to: [ALERT_EMAIL],
        subject: `🔔 Reddit Alert: "${matched[0]}" in ${post.subreddit}`,
        text: `Keyword(s): ${matched.join(', ')}\nSubreddit: ${post.subreddit}\nTitle: ${post.title}\nLink: ${post.url}\n\nPreview: ${(post.selftext || '(no text)').substring(0, 300)}\n\n---\nSent by ReportReady Reddit Monitor`
      });
    }
    // 5 seconds between subreddits
    await new Promise(r => setTimeout(r, 5000));
  }

  if (newIds.length) saveSeen(seen);
  console.log(`[${new Date().toISOString()}] Check complete — ${newIds.length} new alerts across ${SUBREDDITS.length} subs`);
}

export function startRedditMonitor() {
  checkAll();
  setInterval(checkAll, CHECK_INTERVAL_MINUTES * 60 * 1000);
  console.log(`Reddit monitor started — checking ${SUBREDDITS.length} subreddits every ${CHECK_INTERVAL_MINUTES} minutes for ${KEYWORDS.length} keywords`);
}
