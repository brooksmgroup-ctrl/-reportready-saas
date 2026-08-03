import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { runAudit } from './audit.js';
import { generatePDF } from './reportGenerator.js';
import { createCheckoutSession } from './payments.js';
import { runCampaign } from './campaignManager.js';
import { startRedditMonitor } from './redditMonitor.js';
import { Resend } from 'resend';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// EXPLICIT PRODUCTION PATHS
const rootDir = process.cwd();
const possibleBuildPaths = [
  path.join(rootDir, 'client/dist'),
  path.join(rootDir, 'dist'),
  path.join(__dirname, '../client/dist'),
  path.join(__dirname, 'dist'),
  path.join(rootDir, 'client') // Fallback to source only if dist is missing
];

let buildPath = possibleBuildPaths[0];
let indexPath = path.join(buildPath, 'index.html');

for (const p of possibleBuildPaths) {
  const checkIndex = path.join(p, 'index.html');
  if (fs.existsSync(checkIndex)) {
    // If we found a 'dist' folder, this is the one we want.
    if (p.includes('dist') || p.includes('build')) {
      buildPath = p;
      indexPath = checkIndex;
      break; 
    }
    // If it's the first one we found (even if not dist), keep it as fallback
    if (!indexPath || !fs.existsSync(indexPath)) {
      buildPath = p;
      indexPath = checkIndex;
    }
  }
}

console.log(`Serving static files from: ${buildPath}`);
app.use(express.static(buildPath));

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    buildPath, 
    indexPath,
    cwd: process.cwd()
  });
});

app.post('/api/audit', async (req, res) => {
  const { url } = req.body;
  try {
    const report = await runAudit(url);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/download', async (req, res) => {
  const { report } = req.body;
  try {
    const pdfBuffer = generatePDF(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const session = await createCheckoutSession(req.body.priceId);
    res.json({ id: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Campaign Triggers ────────────────────────────────────

// GET /api/campaign/status — check when campaign last ran
app.get('/api/campaign/status', (req, res) => {
  const statusFile = path.join(__dirname, 'campaign_status.json');
  if (fs.existsSync(statusFile)) {
    res.json(JSON.parse(fs.readFileSync(statusFile, 'utf8')));
  } else {
    res.json({ lastRun: null, sentToday: 0, message: 'No campaign run recorded yet.' });
  }
});

// POST /api/campaign/run — manual trigger for full campaign (50 emails)
app.post('/api/campaign/run', async (req, res) => {
  console.log('[API] Manual campaign trigger received');
  // Respond immediately, run campaign async to avoid timeout
  res.json({ status: 'started', message: 'Campaign running — check server logs for progress.' });
  try {
    const result = await runCampaign();
    console.log(`[API] Campaign finished: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`[API] Campaign error:`, err.message);
  }
});

// POST /api/campaign/force — send next 100 emails, ignore tracking
app.post('/api/campaign/force', async (req, res) => {
  console.log('[API] Force-send triggered');
  res.json({ status: 'started', message: 'Force-send running...' });
  try {
    const leads = JSON.parse(fs.readFileSync(path.join(__dirname, 'active_leads.json'), 'utf8'));
    const tracking = fs.existsSync(path.join(__dirname, 'outreach_tracking.json'))
      ? JSON.parse(fs.readFileSync(path.join(__dirname, 'outreach_tracking.json'), 'utf8'))
      : {};
    
    let sent = 0;
    for (const lead of leads) {
      if (sent >= 100) break;
      const email = lead.contact_email;
      if (!email) continue;
      if (tracking[email]?.stage > 0) continue;
      
      console.log(`Force-send to ${email}`);
      try {
        await resend.emails.send({
          from: 'ReportReady <hello@getreportready.com>',
          to: [email],
          subject: `${lead.name} — client retention just became a revenue stream`,
          text: `Hi ${lead.contact_name || 'there'},\n\nQuick question: when's the last time you had a reason to call every client?\n\nWe ran 20 random audits on sites in our pipeline. More than half were invisible to ChatGPT and Gemini. Even our own site failed the first time we ran it — and we built the tool.\n\nHere's what that means: someone asks AI for a recommendation, your client's site isn't in the list, and they lose the sale before anyone even clicks. That's happening right now.\n\nReportReady gives agencies a monthly branded AI-readiness report for each client. They see value every 30 days. You get a reason to stay in front of them.\n\n$29/mo per client you charge (your markup), or give it free as a retention tool. $99/mo unlimited, 14-day free trial. Cancel anytime.\n\nYour free audit: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url || '')}\n\nWorth a chat?\n\nBryan Robinson\nFounder, ReportReady`
        });
        sent++;
        console.log(`  Sent #${sent}: ${email}`);
      } catch(e) {
        console.error(`  Failed ${email}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    console.log(`Force-send complete: ${sent} sent`);
  } catch(err) {
    console.error(`Force-send error:`, err.message);
  }
});

// POST /api/campaign/run-followups — manual trigger for follow-ups only (unlimited)
app.post('/api/campaign/run-followups', async (req, res) => {
  console.log('[API] Manual follow-ups trigger received');
  res.json({ status: 'started', message: 'Follow-up campaign running — check server logs for progress.' });
  try {
    const result = await runCampaign({ followupsOnly: true });
    console.log(`[API] Follow-ups finished: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(`[API] Follow-ups error:`, err.message);
  }
});

// Direct CSV download — bypasses SPA fallback
app.get('/clutch-domains.csv', (req, res) => {
  const csvPath = path.join(buildPath, 'clutch-domains.csv');
  if (fs.existsSync(csvPath)) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="clutch-domains.csv"');
    res.sendFile(csvPath);
  } else {
    res.status(404).send('CSV not found');
  }
});

// robots.txt — allow all crawlers
app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: https://getreportready.com/sitemap.xml
`);
});

// sitemap.xml — basic sitemap for SEO
app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://getreportready.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://getreportready.com/audit</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://getreportready.com/welcome</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://getreportready.com/upload</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`);
});

// CSV lead upload endpoint
app.post('/api/leads/upload', (req, res) => {
  const leadsFile = path.join(__dirname, 'active_leads.json');
  const uploaded = req.body;
  
  if (!uploaded || !uploaded.leads || !Array.isArray(uploaded.leads)) {
    return res.status(400).json({ error: 'Expected { leads: [...] }' });
  }

  const existing = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
  const merged = [...existing, ...uploaded.leads];
  fs.writeFileSync(leadsFile, JSON.stringify(merged, null, 2));

  res.json({ added: uploaded.leads.length, total: merged.length, message: 'Leads merged. Backup saved.' });
});

// Legal pages (for Stripe verification - actual URL routes)
const legalPages = {
      '/terms': {
    title: 'Terms of Service | ReportReady',
    heading: 'Terms of Service',
    content: `<h2>Terms of Service</h2>
      <p>Welcome to ReportReady. By using our service, you agree to the following terms:</p>
      <ul>
        <li><strong>Service:</strong> ReportReady provides automated website audits for SEO and AI discovery. These reports are for informational purposes.</li>
        <li><strong>Usage:</strong> You are responsible for the URLs you submit for auditing. You must have the right to audit the website.</li>
        <li><strong>Subscriptions:</strong> Professional subscriptions are billed monthly at $29/mo. You can cancel anytime via your dashboard.</li>
        <li><strong>Liability:</strong> ReportReady is not liable for any changes in search engine or AI engine rankings resulting from the use of our recommendations.</li>
      </ul>`
  },
  '/privacy': {
    title: 'Privacy Policy | ReportReady',
    heading: 'Privacy Policy',
    content: `<h2>Privacy Policy</h2>
      <p>Your privacy is important to us. Here is how we handle your data:</p>
      <ul>
        <li><strong>Data Collection:</strong> We collect the URLs you audit and your email address if you sign up for a Pro account.</li>
        <li><strong>Usage:</strong> We use this data to provide the service and improve our audit algorithms.</li>
        <li><strong>Payment Data:</strong> Payment processing is handled by Stripe. We do not store your credit card information on our servers.</li>
        <li><strong>Security:</strong> We take reasonable measures to protect your data from unauthorized access.</li>
      </ul>`
  },
  '/refund': {
    title: 'Refund Policy | ReportReady',
    heading: 'Refund Policy',
    content: `<h2>Refund Policy</h2>
      <p>We want you to be happy with ReportReady. Our refund policy is simple:</p>
      <ul>
        <li><strong>14-Day Guarantee:</strong> We offer a 14-day "no questions asked" refund policy for any monthly subscription or standalone premium audit.</li>
        <li><strong>How to Request:</strong> To request a refund, please email us at <a href="mailto:reportready-2162dbe4@ctomail.io">reportready-2162dbe4@ctomail.io</a> within 14 days of your purchase.</li>
        <li><strong>Processing:</strong> Refunds will be processed back to your original payment method within 5-10 business days.</li>
      </ul>`
  },
  '/contact': {
    title: 'Contact Us | ReportReady',
    heading: 'Contact Us',
    content: `<h2>Contact Us</h2>
      <p>Need help or have questions? Our team is here to assist you.</p>
      <p>Email: <a href="mailto:reportready-2162dbe4@ctomail.io">reportready-2162dbe4@ctomail.io</a></p>
      <p>We typically respond to all inquiries within 24 hours.</p>`
  }
};

for (const [route, page] of Object.entries(legalPages)) {
      app.get(route, (req, res) => {
        res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${page.title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
        h1 { color: #111; border-bottom: 2px solid #6366f1; padding-bottom: 12px; }
        h2 { color: #111; margin-top: 32px; }
        ul { padding-left: 24px; }
        li { margin-bottom: 8px; }
        .back { display: inline-block; margin-top: 32px; color: #6366f1; text-decoration: none; }
        .back:hover { text-decoration: underline; }
        footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 14px; }
      </style>
    </head>
    <body>
      <h1>${page.heading}</h1>
      ${page.content}
      <a class="back" href="/">&larr; Back to ReportReady</a>
      <footer>&copy; ${new Date().getFullYear()} ReportReady. Professional Website Audits.</footer>
    </body>
    </html>`);
      });
    }

    // Agency trial welcome page
    app.get('/welcome', (req, res) => {
      res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Welcome to ReportReady Agency</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; color: #1f2937; line-height: 1.6; }
        .container { max-width: 700px; margin: 60px auto; padding: 0 24px; }
        .card { background: #fff; border-radius: 16px; padding: 48px 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border: 1px solid #e5e7eb; }
        h1 { font-size: 28px; color: #059669; margin-bottom: 8px; }
        .subtitle { color: #6b7280; font-size: 16px; margin-bottom: 32px; }
        .step { display: flex; gap: 16px; padding: 16px 0; border-bottom: 1px solid #f3f4f6; }
        .step:last-child { border-bottom: none; }
        .step-num { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; min-width: 36px; border-radius: 50%; background: #059669; color: #fff; font-weight: 700; font-size: 16px; }
        .step h3 { font-size: 16px; margin-bottom: 4px; color: #111827; }
        .step p { font-size: 15px; color: #6b7280; }
        .step a { color: #059669; font-weight: 600; text-decoration: none; }
        .step a:hover { text-decoration: underline; }
        .cta { margin-top: 32px; text-align: center; }
        .cta a { display: inline-block; background: #059669; color: #fff; padding: 14px 36px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 16px; }
        .cta a:hover { background: #047857; }
        .footer-note { margin-top: 24px; text-align: center; color: #9ca3af; font-size: 14px; }
        .footer-note a { color: #059669; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>Welcome to ReportReady Agency</h1>
          <p class="subtitle">Your 14-day trial is active. Here's how to make the most of it:</p>

          <div class="step">
            <span class="step-num">1</span>
            <div>
              <h3>Email your client list to <a href="mailto:reportready-2162dbe4@ctomail.io">reportready-2162dbe4@ctomail.io</a></h3>
              <p>Include up to 10 client website URLs.</p>
            </div>
          </div>

          <div class="step">
            <span class="step-num">2</span>
            <div>
              <h3>We run AI-readiness audits on every site</h3>
              <p>Results within 24 hours — score, issues, and fixes for each client.</p>
            </div>
          </div>

          <div class="step">
            <span class="step-num">3</span>
            <div>
              <h3>Send branded reports to your clients</h3>
              <p>We'll send you reports branded with your agency name. You forward them to clients or we can send directly.</p>
            </div>
          </div>

          <div class="step">
            <span class="step-num">4</span>
            <div>
              <h3>Monthly re-checks</h3>
              <p>Every 30 days, we re-audit all your clients and send updated reports. Your clients see progress. You stay top of mind.</p>
            </div>
          </div>

          <div class="cta">
            <a href="mailto:reportready-2162dbe4@ctomail.io?subject=Client%20List%20-%20Getting%20Started">Send Your Client List Now</a>
          </div>

          <p class="footer-note">Questions? Reply to <a href="mailto:reportready-2162dbe4@ctomail.io">reportready-2162dbe4@ctomail.io</a> — typically respond within 4 hours.</p>
        </div>
      </div>
    </body>
    </html>`);
    });

app.get('/upload', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Upload Leads — ReportReady</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; text-align: center; background: #0f0f23; color: #e2e8f0; }
    h1 { color: #00b894; }
    #dropzone { border: 3px dashed #00b894; border-radius: 12px; padding: 60px 20px; margin: 30px 0; cursor: pointer; transition: background .2s; }
    #dropzone:hover, #dropzone.drag { background: rgba(0,184,148,.08); }
    #status { margin-top: 20px; font-size: 14px; color: #94a3b8; }
    .success { color: #00b894; }
    .error { color: #ff4d4d; }
  </style>
</head>
<body>
  <h1>Upload Hunter CSV</h1>
  <div id="dropzone">Drag &amp; drop CSV here<br><small>or click to browse</small></div>
  <input type="file" id="fileInput" accept=".csv" style="display:none">
  <div id="status"></div>
  <script>
    const dz = document.getElementById('dropzone');
    const input = document.getElementById('fileInput');
    const status = document.getElementById('status');
    dz.onclick = () => input.click();
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag'); };
    dz.ondragleave = () => dz.classList.remove('drag');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); };
    input.onchange = e => handleFile(e.target.files[0]);
    async function handleFile(file) {
      if (!file) return;
      status.textContent = 'Uploading...';
      const text = await file.text();
      const res = await fetch('/api/leads/import', { method: 'POST', headers: {'Content-Type':'text/plain'}, body: text });
      const data = await res.json();
      if (data.error) { status.innerHTML = '<span class="error">'+data.error+'</span>'; }
      else { status.innerHTML = '<span class="success">✓ Imported '+data.imported+' valid leads. Total pipeline: '+data.total+'</span>'; }
    }
  </script>
</body>
</html>`);
});

app.post('/api/leads/import', (req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const lines = body.trim().split('\n').filter(l => l.trim());
      
      // Detect if first line is header or data
      const first = lines[0].split(',');
      const isHeader = first.some(c => c.toLowerCase().includes('email') || c.toLowerCase().includes('name') || c.toLowerCase().includes('status'));
      const startRow = isHeader ? 1 : 0;
      
      // Find email column: any column containing @ in any row
      let emailIdx = -1;
      let validIdx = -1;
      let nameIdx = -1;
      let companyIdx = 0; // default: first column
      
      // Sample first 5 data rows to detect columns
      for (let i = startRow; i < Math.min(startRow + 5, lines.length); i++) {
        const cols = lines[i].split(',');
        for (let j = 0; j < cols.length; j++) {
          const v = cols[j].trim().toLowerCase();
          if (v.includes('@') && emailIdx < 0) emailIdx = j;
          if ((v === 'valid' || v === 'invalid' || v === 'accept all') && validIdx < 0) validIdx = j;
          if (!v.includes('@') && !v.includes('.') && v.length > 2 && !['valid','invalid','accept all','us','uk'].includes(v) && nameIdx < 0 && j > 0) nameIdx = j;
        }
      }
      
      if (emailIdx < 0) {
        return res.json({ imported: 0, total: 0, error: 'No email column found', debug: { isHeader, firstRow: lines[0] } });
      }
      
      console.log('[IMPORT] Detected — emailIdx:', emailIdx, 'validIdx:', validIdx, 'companyIdx:', companyIdx);
      
      const imported = [];
      for (let i = startRow; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const email = (cols[emailIdx] || '').trim();
        const status = validIdx >= 0 ? (cols[validIdx] || '').trim().toLowerCase() : 'valid';
        
        if (email && email.includes('@') && (status !== 'invalid')) {
          imported.push({
            email,
            name: nameIdx >= 0 ? (cols[nameIdx] || '').trim() : '',
            company: (cols[companyIdx] || '').trim(),
            source: 'hunter-clutch',
            added: new Date().toISOString()
          });
        }
      }

      const leadsFile = path.join(__dirname, 'active_leads.json');
      const existing = fs.existsSync(leadsFile) ? JSON.parse(fs.readFileSync(leadsFile, 'utf8')) : [];
      const merged = [...existing, ...imported];
      fs.writeFileSync(leadsFile, JSON.stringify(merged, null, 2));

      console.log('[IMPORT] Imported:', imported.length, 'Total:', merged.length);
      res.json({ imported: imported.length, total: merged.length, sample: imported.slice(0, 2) });
    } catch (err) {
      console.error('[IMPORT] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
});

app.get('*', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`Frontend not found at ${indexPath}`);
  }
});

// ─── Cron Scheduler ────────────────────────────────────────

// Run campaign at 10:00 AM ET (14:00 UTC) Monday-Friday
// node-cron uses the server's local time, but we set the timezone explicitly
const CAMPAIGN_CRON = '0 10 * * 1-5'; // 10:00 AM, Mon-Fri

const campaignJob = cron.schedule(CAMPAIGN_CRON, () => {
  console.log(`[CRON] Scheduled campaign triggered at ${new Date().toISOString()}`);
  runCampaign().then(result => {
    console.log(`[CRON] Campaign complete: ${JSON.stringify(result)}`);
  }).catch(err => {
    console.error(`[CRON] Campaign failed:`, err.message);
  });
}, {
  timezone: 'America/New_York',
  scheduled: true
});

console.log(`Campaign cron scheduled: ${CAMPAIGN_CRON} (America/New_York)`);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}. Serving from ${buildPath}`);
  startRedditMonitor();
});
