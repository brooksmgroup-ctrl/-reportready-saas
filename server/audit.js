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
        message: 'Missing JSON-LD Schema Markup (AI platforms like ChatGPT use this to understand your business)', 
        severity: 'high' 
      });
      aiReadinessScore = 0;
    }

    // --- SEO CHECKS ---
    const title = $('title').text();
    if (!title) {
      issues.push({ category: 'SEO', message: 'Missing <title> tag', severity: 'high' });
      seoScore -= 30;
    } else if (title.length < 30 || title.length > 60) {
      issues.push({ category: 'SEO', message: 'Title length should be between 30 and 60 characters', severity: 'medium' });
      seoScore -= 10;
    }

    const description = $('meta[name="description"]').attr('content');
    if (!description) {
      issues.push({ category: 'SEO', message: 'Missing meta description', severity: 'high' });
      seoScore -= 30;
    }

    const h1s = $('h1').length;
    if (h1s === 0) {
      issues.push({ category: 'SEO', message: 'Missing H1 tag', severity: 'high' });
      seoScore -= 20;
    } else if (h1s > 1) {
      issues.push({ category: 'SEO', message: 'Multiple H1 tags found', severity: 'medium' });
      seoScore -= 10;
    }

    // --- ACCESSIBILITY CHECKS ---
    const lang = $('html').attr('lang');
    if (!lang) {
      issues.push({ category: 'Accessibility', message: 'Missing lang attribute on <html> tag', severity: 'medium' });
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
      issues.push({ category: 'Accessibility', message: `${missingAltCount} image${missingAltCount > 1 ? 's are' : ' is'} missing alt text`, severity: 'medium' });
    }

    // --- PERFORMANCE CHECKS ---
    if (loadTime > 2000) {
      issues.push({ category: 'Performance', message: `Page load time is slow: ${(loadTime / 1000).toFixed(2)}s`, severity: 'high' });
      performanceScore -= 30;
    }

    const scripts = $('script[src]').length;
    if (scripts > 15) {
      issues.push({ category: 'Performance', message: `High number of external scripts (${scripts})`, severity: 'medium' });
      performanceScore -= 15;
    }

    const stylesheets = $('link[rel="stylesheet"]').length;
    if (stylesheets > 10) {
      issues.push({ category: 'Performance', message: `High number of external stylesheets (${stylesheets})`, severity: 'medium' });
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
      issues: issues.slice(0, 10) // Limit to top 10 issues
    };
  } catch (error) {
    console.error(`Audit failed for ${url}:`, error.message);
    throw new Error(`Could not audit ${url}: ${error.message}`);
  }
}
