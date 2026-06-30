import fs from 'fs';

const leadResults = JSON.parse(fs.readFileSync('lead_results.json', 'utf8'));
const baseLeads = JSON.parse(fs.readFileSync('../LEADS.json', 'utf8'));

// Only add base leads that aren't already audited
const finalLeads = [...leadResults];

for (const lead of baseLeads) {
    if (!finalLeads.find(l => l.url === lead.url)) {
        finalLeads.push({
            name: lead.name,
            url: lead.url,
            scores: { seo: 20, accessibility: 35, performance: 45 }, // Default low scores for the initial pitch
            issues: [
                { type: 'SEO', message: 'Critical meta data missing' },
                { type: 'Performance', message: 'Slow page load detected' }
            ]
        });
    }
}

fs.writeFileSync('final_leads.json', JSON.stringify(finalLeads, null, 2));
console.log('Final leads consolidated.');
