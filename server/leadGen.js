import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

async function performAudit(url) {
    try {
        console.log(`Auditing: ${url}`);
        const response = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(response.data);

        const audit = {
            url,
            name: $('title').text() || url,
            scores: { seo: 0, accessibility: 0, performance: 75 },
            issues: []
        };

        // SEO Checks
        if ($('title').length > 0) audit.scores.seo += 30;
        else audit.issues.push({ type: 'SEO', message: 'Missing Title Tag' });

        if ($('meta[name="description"]').length > 0) audit.scores.seo += 30;
        else audit.issues.push({ type: 'SEO', message: 'Missing Meta Description' });

        if ($('h1').length > 0) audit.scores.seo += 40;
        else audit.issues.push({ type: 'SEO', message: 'Missing H1 Header' });

        // Accessibility
        const totalImages = $('img').length;
        const imagesWithAlt = $('img[alt]').length;
        if (totalImages === 0 || imagesWithAlt === totalImages) audit.scores.accessibility = 100;
        else {
            audit.scores.accessibility = Math.round((imagesWithAlt / totalImages) * 100);
            audit.issues.push({ type: 'Accessibility', message: `${totalImages - imagesWithAlt} images missing alt text` });
        }

        return audit;
    } catch (error) {
        console.error(`Failed to audit ${url}: ${error.message}`);
        return null;
    }
}

async function runLeadGen() {
    // Let's target Roofers in a different city for variety
    const targets = [
        { name: 'Apex Roofing', url: 'http://apexroofing.com' },
        { name: 'Elite Roofers', url: 'http://eliteroofers.com' },
        { name: 'Quality Gutters', url: 'http://qualitygutters.com' },
        { name: 'Pro Siding', url: 'http://prosiding.com' },
        { name: 'Master Masonry', url: 'http://mastermasonry.com' }
    ];

    const results = [];
    for (const target of targets) {
        const result = await performAudit(target.url);
        if (result) {
            result.name = target.name; // Keep our clean name
            results.push(result);
        }
    }

    fs.writeFileSync('lead_results.json', JSON.stringify(results, null, 2));
    console.log(`Lead generation complete. Found ${results.length} leads.`);
}

runLeadGen();
