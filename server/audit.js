import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * List of AI crawler user-agents to check in robots.txt.
 * These are the major LLM/indexing bots that power AI search results.
 */
const AI_CRAWLERS = [
  { agent: 'GPTBot', label: 'ChatGPT / OpenAI' },
  { agent: 'Claude-Web', label: 'Claude (Anthropic)' },
  { agent: 'anthropic-ai', label: 'Claude (Anthropic)' },
  { agent: 'Google-Extended', label: 'Google AI / Gemini' },
  { agent: 'PerplexityBot', label: 'Perplexity AI' },
  { agent: 'CCBot', label: 'Common Crawl (AI training)' },
];

/**
 * Fetch and parse robots.txt from the given origin.
 * Returns an array of blocked AI crawler labels (empty if none blocked).
 */
async function checkRobotsTxt(origin) {
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const response = await axios.get(robotsUrl, {
      timeout: 5000,
      headers: { 'User-Agent': 'ReportReady-Audit/1.0' }
    });
    const text = response.data;
    return parseRobotsForAI(text);
  } catch (err) {
    // If robots.txt doesn't exist or times out, treat as no blocks
    console.log(`robots.txt unavailable for ${origin}: ${err.message}`);
    return [];
  }
}

/**
 * Parse raw robots.txt content looking for AI crawler disallow rules.
 * Handles the standard robots.txt format:
 *   User-agent: BotName
 *   Disallow: /path
 *
 * A Disallow: / means the bot is completely blocked.
 */
function parseRobotsForAI(robotsText) {
  const blocked = [];
  const lines = robotsText.split('\n');
  let currentAgent = null;
  let currentRules = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const directive = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    if (directive === 'user-agent') {
      // Process previous agent before moving to next
      if (currentAgent && AI_CRAWLERS.some(ac => 
        ac.agent.toLowerCase() === currentAgent.toLowerCase())) {
        const isBlocked = currentRules.some(rule => rule === '/');
        if (isBlocked) {
          const match = AI_CRAWLERS.find(ac => 
            ac.agent.toLowerCase() === currentAgent.toLowerCase());
          blocked.push(match.label);
        }
      }
      currentAgent = value;
      currentRules = [];
    } else if (directive === 'disallow') {
      currentRules.push(value);
    }
  }

  // Check the last agent
  if (currentAgent && AI_CRAWLERS.some(ac => 
    ac.agent.toLowerCase() === currentAgent.toLowerCase())) {
    const isBlocked = currentRules.some(rule => rule === '/');
    if (isBlocked) {
      const match = AI_CRAWLERS.find(ac => 
        ac.agent.toLowerCase() === currentAgent.toLowerCase());
      blocked.push(match.label);
    }
  }

  return blocked;
}

export async function runAudit(url) {
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }
  try {
    const startTime = Date.now();

    // Extract origin for robots.txt fetch
    const parsedUrl = new URL(url);
    const origin = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

    // Fetch both the page and robots.txt in parallel
    const [pageResponse, blockedCrawlers] = await Promise.all([
      axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      }),
      checkRobotsTxt(origin)
    ]);

    const endTime = Date.now();
    const loadTime = endTime - startTime;

    const html = pageResponse.data;
    const $ = cheerio.load(html);
    const issues = [];
    let seoScore = 100;
    let accessibilityScore = 100;
    let performanceScore = 100;
    let aiReadinessScore = 0;

    // --- AI READINESS CHECKS ---

    // 1. Schema markup (50% of AI readiness)
    const schemaMarkup = $('script[type="application/ld+json"]').length;
    if (schemaMarkup > 0) {
      aiReadinessScore += 50;
    } else {
      issues.push({ 
        category: 'AI Readiness', 
        message: 'People using ChatGPT won\'t find your business in search results. Add a code snippet called Schema Markup to your homepage.', 
        severity: 'high' 
      });
    }

    // 2. AI crawler access via robots.txt (50% of AI readiness)
    if (blockedCrawlers.length > 0) {
      // AI crawlers are blocked — significant hit
      const crawlerList = blockedCrawlers.join(', ');
      issues.push({
        category: 'AI Readiness',
        message: `Your robots.txt blocks AI crawlers: ${crawlerList}. Your site is invisible in ChatGPT, Claude, and AI-powered search results.`,
        severity: 'high'
      });
      // Heavy penalty: each blocked crawler reduces the robots portion
      const portionBlocked = Math.min(blockedCrawlers.length / AI_CRAWLERS.length, 1);
      aiReadinessScore += Math.round(50 * (1 - portionBlocked));
    } else {
      aiReadinessScore += 50;
    }

    // --- SEO CHECKS ---
    const title = $('title').text();
    if (!title) {
      issues.push({ category: 'SEO', message: 'ChatGPT can\'t describe your site to people searching for what you do. Add a simple page title.', severity: 'high' });
      seoScore -= 30;
    } else if (title.length < 30 || title.length > 60) {
      issues.push({ category: 'SEO', message: 'AI won\'t show your site in results because your page title is too short or too long.', severity: 'medium' });
      seoScore -= 10;
    }

    const description = $('meta[name="description"]').attr('content');
    if (!description) {
      issues.push({ category: 'SEO', message: 'ChatGPT has no summary to show people when they search for you. Add a short description.', severity: 'high' });
      seoScore -= 30;
    }

    const h1s = $('h1').length;
    if (h1s === 0) {
      issues.push({ category: 'SEO', message: 'AI can\'t figure out what your page is about. People searching for your services won\'t find you.', severity: 'high' });
      seoScore -= 20;
    } else if (h1s > 1) {
      issues.push({ category: 'SEO', message: 'AI gets confused about what your page focuses on. Keep one clear main title.', severity: 'medium' });
      seoScore -= 10;
    }

    // --- ACCESSIBILITY CHECKS ---
    const lang = $('html').attr('lang');
    if (!lang) {
      issues.push({ category: 'Accessibility', message: 'AI can\'t properly read your content. Set your website language in settings.', severity: 'medium' });
      accessibilityScore -= 20;
    }

    let missingAltCount = 0;
    $('img').each((i, el) => {
      if (!$(el).attr('alt')) {
        missingAltCount++;
        accessibilityScore -= 5;
      }
    });
    if (missingAltCount > 0) {
      issues.push({ category: 'Accessibility', message: `${missingAltCount} image${missingAltCount > 1 ? 's' : ''} can't be seen by AI. Customers miss out on seeing your products.`, severity: 'medium' });
    }

    // --- PERFORMANCE CHECKS ---
    if (loadTime > 2000) {
      issues.push({ category: 'Performance', message: `Page took ${(loadTime / 1000).toFixed(2)}s to load. AI gives up on slow sites — customers won't find you.`, severity: 'high' });
      performanceScore -= 30;
    }

    const scripts = $('script[src]').length;
    if (scripts > 15) {
      issues.push({ category: 'Performance', message: `Too many extra tools (${scripts}) makes AI give up before finding your content. Customers won't see you.`, severity: 'medium' });
      performanceScore -= 15;
    }

    const stylesheets = $('link[rel="stylesheet"]').length;
    if (stylesheets > 10) {
      issues.push({ category: 'Performance', message: `Too many design files (${stylesheets}) slows down AI. Customers searching in AI won't see your site.`, severity: 'medium' });
      performanceScore -= 10;
    }

    return {
      url,
      timestamp: new Date().toISOString(),
      scores: {
        seo: Math.max(0, seoScore),
        performance: Math.max(0, performanceScore),
        accessibility: Math.max(0, accessibilityScore),
        aiReadiness: aiReadinessScore
      },
      issues: issues.slice(0, 12), // upped from 10 to accommodate crawler findings
      aiCrawlersBlocked: blockedCrawlers
    };
  } catch (error) {
    console.error(`Audit failed for ${url}:`, error.message);
    throw new Error(`Could not audit ${url}: ${error.message}`);
  }
}
