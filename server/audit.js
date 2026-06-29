
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function runAudit(url) {
  // Ensure URL has https
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    let seoScore = 100;
    let aiReadinessScore = 0;

    // AI READINESS: Check for JSON-LD Schema
    const schemaMarkup = $('script[type="application/ld+json"]').length;
    if (schemaMarkup > 0) {
      aiReadinessScore = 100;
    } else {
      aiReadinessScore = 0;
    }

    // SEO: Check Title
    const title = $('title').text();
    if (!title) {
      seoScore -= 30;
    } else if (title.length < 30 || title.length > 60) {
      seoScore -= 10;
    }

    // SEO: Check Meta Description
    const description = $('meta[name="description"]').attr('content');
    if (!description) {
      seoScore -= 30;
    }

    // SEO: Check H1
    const h1Count = $('h1').length;
    if (h1Count === 0) {
      seoScore -= 20;
    }

    return {
      url,
      scores: {
        seo: Math.max(0, seoScore),
        aiReadiness: aiReadinessScore
      }
    };
  } catch (error) {
    throw new Error(`Could not scan ${url}. Make sure it is a valid, public website.`);
  }
