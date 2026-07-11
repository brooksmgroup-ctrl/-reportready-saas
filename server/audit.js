import axios from 'axios';
import * as cheerio from 'cheerio';

export async function runAudit(url) {
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }
  try {
    const startTime = Date.now();
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    const endTime = Date.now();
    const loadTime = endTime - startTime;

    const html = response.data;
    const $ = cheerio.load(html);
    const issues = [];
    let seoScore = 100;
    let accessibilityScore = 100;
    let performanceScore = 100;
    let aiReadinessScore = 0;

    // --- AI READINESS CHECK ---
    const schemaMarkup = $('script[type="application/ld+json"]').length;
    if (schemaMarkup > 0) {
      aiReadinessScore = 100;
    } else {
      issues.push({ 
        category: 'AI Readiness', 
        message: 'People using ChatGPT won\'t find your business in search results. Add a code snippet called Schema Markup to your homepage.', 
        severity: 'high' 
      });
      aiReadinessScore = 0;
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

