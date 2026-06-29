
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function runAudit(url) {
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

    const schemaMarkup = $('script[type="application/ld+json"]').length;
    if (schemaMarkup > 0) {
      aiReadinessScore = 100;
    }

    const title = $('title').text();
    if (!title) {
      seoScore -= 30;
    }

    const description = $('meta[name="description"]').attr('content');
    if (!description) {
      seoScore -= 30;
    }

    return {
      url,
      scores: {
        seo: Math.max(0, seoScore),
        aiReadiness: aiReadinessScore
      }
    };
  } catch (error) {
    throw new Error(`Audit failed for ${url}`);
  }
} 
