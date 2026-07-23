import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runAudit } from './audit.js';
import { generatePDF } from './reportGenerator.js';
import { createCheckoutSession } from './payments.js';

dotenv.config();

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

app.get('*', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`Frontend not found at ${indexPath}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}. Serving from ${buildPath}`);
});
// Last updated: Thu Jul  2 13:42:21 UTC 2026
