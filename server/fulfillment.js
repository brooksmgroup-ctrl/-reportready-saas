/**
 * Fulfillment Automation Script
 *
 * One-command agency onboarding: checks Stripe for new subscriptions,
 * finds emails with client URLs, runs AI-readiness audits, generates
 * branded PDFs, and sends fulfillment emails.
 *
 * Usage:
 *   node server/fulfillment.js --check     Dry run: log what would happen
 *   node server/fulfillment.js --run       Execute fulfillment pipeline
 */

import { Resend } from 'resend';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAudit } from './audit.js';
import { generatePDF } from './reportGenerator.js';
import { getActiveSubscriptions } from './payments.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────

const TRACKING_FILE = path.join(__dirname, 'fulfillment_tracking.json');

// ── Clients ─────────────────────────────────────────────────

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// ── Logger ──────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
}

// ── Tracking ────────────────────────────────────────────────

function loadTracking() {
  if (fs.existsSync(TRACKING_FILE)) {
    return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
  }
  return {};
}

function saveTracking(data) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
}

function isProcessed(tracking, subscriptionId) {
  return tracking[subscriptionId]?.processed === true;
}

function markProcessed(tracking, subscriptionId, details = {}) {
  tracking[subscriptionId] = {
    processed: true,
    processedAt: new Date().toISOString(),
    ...details,
  };
}

// ── Email: find customer emails containing URLs ─────────────

async function findRelevantEmails(customerEmail) {
  if (!resend) {
    log('⚠  Resend not configured — skipping email search');
    return [];
  }

  try {
    // Use Resend API to list recent email activity.
    // The /emails endpoint lists sent emails. For inbound emails from
    // customers, we check for any email threads involving this address.
    const response = await fetch('https://api.resend.com/emails?limit=50', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      log(`  Resend API returned unexpected response for ${customerEmail}`);
      return [];
    }

    // Filter for emails to/from this customer
    const relevant = data.data.filter(
      (email) =>
        (email.to && email.to.includes(customerEmail)) ||
        (email.from && email.from.includes(customerEmail)),
    );

    // Extract URLs from email bodies
    const urlPattern = /https?:\/\/[^\s"<>]+/gi;
    const results = [];
    for (const email of relevant) {
      const text = (email.text || email.html || '').toString();
      const urls = text.match(urlPattern) || [];
      for (const url of urls) {
        // Only include real domain URLs, not getreportready.com
        const clean = url.replace(/[.,;)\]}>]$/, '');
        if (!clean.includes('getreportready.com') && !clean.includes('resend.com')) {
          results.push({ emailId: email.id, customerEmail, url: clean, subject: email.subject });
        }
      }
    }

    if (results.length > 0) {
      log(`  Found ${results.length} URLs from ${customerEmail} threads`);
    }
    return results;
  } catch (err) {
    log(`  Email search error for ${customerEmail}: ${err.message}`);
    return [];
  }
}

// ── Core: process a single signup ───────────────────────────

async function processSignup(subscription, emails, options = {}) {
  const { dryRun = false } = options;
  const customer = subscription.customer;
  const customerEmail =
    typeof customer === 'object' ? customer.email : 'unknown';
  const customerName =
    typeof customer === 'object'
      ? customer.name || customerEmail
      : customerEmail;

  log(`\n── Processing: ${customerEmail} (sub ${subscription.id}) ──`);

  // Determine which URLs to audit
  const urlsToAudit = emails.map((e) => e.url);

  if (urlsToAudit.length === 0) {
    log(`  No client URLs found for ${customerEmail} — sending request email`);
    if (!dryRun) {
      await sendRequestEmail(customerEmail, customerName, subscription.id);
    } else {
      log(`  [DRY RUN] Would send request email to ${customerEmail}`);
    }
    return { subscriptionId: subscription.id, urlsAudited: 0, emailSent: true };
  }

  // Run audits for each client URL
  const reports = [];
  for (const url of urlsToAudit) {
    log(`  Auditing: ${url}`);
    try {
      if (!dryRun) {
        const report = await runAudit(url);
        reports.push(report);
        log(`    ✓ Done — AI Readiness: ${report.scores.aiReadiness}/100`);
      } else {
        log(`    [DRY RUN] Would audit ${url}`);
      }
    } catch (err) {
      log(`    ✗ Audit failed: ${err.message}`);
    }
  }

  if (reports.length === 0 && !dryRun) {
    log(`  No successful audits — skipping fulfillment email`);
    return { subscriptionId: subscription.id, urlsAudited: 0, emailSent: false };
  }

  // Generate branded PDFs
  const pdfAttachments = [];
  for (const report of reports) {
    try {
      if (!dryRun) {
        const pdfBuffer = generatePDF(report);
        const domain = new URL(report.url).hostname;
        pdfAttachments.push({
          filename: `ReportReady-${domain}-audit.pdf`,
          content: Buffer.from(pdfBuffer).toString('base64'),
        });
      } else {
        log(`    [DRY RUN] Would generate PDF for ${report.url}`);
      }
    } catch (err) {
      log(`    ✗ PDF generation failed for ${report.url}: ${err.message}`);
    }
  }

  // Send fulfillment email with PDFs
  if (pdfAttachments.length > 0 && !dryRun) {
    log(`  Sending fulfillment email with ${pdfAttachments.length} PDF(s)...`);
    try {
      await resend.emails.send({
        from: 'ReportReady <hello@getreportready.com>',
        to: [customerEmail],
        subject: `Your AI Readiness Reports Are Ready (${pdfAttachments.length} site${pdfAttachments.length > 1 ? 's' : ''})`,
        html: buildFulfillmentHtml(customerName, reports),
        attachments: pdfAttachments,
      });
      log(`  ✓ Fulfillment email sent`);
    } catch (err) {
      log(`  ✗ Fulfillment email failed: ${err.message}`);
    }
  } else if (!dryRun && pdfAttachments.length === 0) {
    log(`  No PDFs generated — skipping email`);
  } else if (dryRun) {
    log(`  [DRY RUN] Would send fulfillment email with ${pdfAttachments.length} PDF(s)`);
  }

  return {
    subscriptionId: subscription.id,
    urlsAudited: reports.length,
    pdfsGenerated: pdfAttachments.length,
    emailSent: pdfAttachments.length > 0,
  };
}

// ── Send "send us your client URLs" request ─────────────────

async function sendRequestEmail(customerEmail, customerName, subscriptionId) {
  try {
    await resend.emails.send({
      from: 'ReportReady <hello@getreportready.com>',
      to: [customerEmail],
      subject: 'Welcome to ReportReady — Send Us Your Client URLs',
      html: `
        <h2>Welcome to ReportReady, ${customerName || 'there'}!</h2>
        <p>Thanks for signing up. We're ready to generate your first batch of AI-readiness reports.</p>
        <p><strong>Step 1:</strong> Reply to this email with a list of your client website URLs — one per line or comma-separated.</p>
        <p><strong>Step 2:</strong> We'll run audits on each site and email you branded PDF reports within minutes.</p>
        <p><strong>Step 3:</strong> Share the reports with your clients monthly to demonstrate ongoing value.</p>
        <p>Questions? Just reply to this email.</p>
        <p>— The ReportReady Team</p>
      `,
    });
    log(`  ✓ Request email sent to ${customerEmail}`);
  } catch (err) {
    log(`  ✗ Request email failed: ${err.message}`);
  }
}

// ── Build fulfillment email HTML ────────────────────────────

function buildFulfillmentHtml(customerName, reports) {
  const scoreCards = reports
    .map((r) => {
      const domain = new URL(r.url).hostname;
      return `
        <div style="margin:16px 0;padding:12px;border:1px solid #e0e0e0;border-radius:8px;">
          <strong>${domain}</strong><br/>
          AI Readiness: ${r.scores.aiReadiness}/100 &nbsp;|&nbsp;
          SEO: ${r.scores.seo}/100 &nbsp;|&nbsp;
          Performance: ${r.scores.performance}/100<br/>
          <small>${r.issues?.length || 0} issues found</small>
        </div>`;
    })
    .join('');

  return `
    <h2>Your AI Readiness Reports</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>We've completed audits for ${reports.length} site${reports.length > 1 ? 's' : ''}. 
       Detailed PDF reports are attached.</p>
    ${scoreCards}
    <p><strong>Next steps:</strong></p>
    <ol>
      <li>Review each report and share with your client</li>
      <li>Fix flagged issues to improve AI visibility</li>
      <li>We'll re-check monthly — you'll get updated reports automatically</li>
    </ol>
    <p>Questions? Reply to this email.</p>
    <p>— The ReportReady Team</p>
  `;
}

// ── Main pipeline ───────────────────────────────────────────

async function runFulfillment(options = {}) {
  const { dryRun = false } = options;
  const modeLabel = dryRun ? 'DRY RUN' : 'LIVE';
  log(`═══════════════════════════════════════`);
  log(`Fulfillment Pipeline — ${modeLabel}`);
  log(`═══════════════════════════════════════`);

  const tracking = loadTracking();

  // 1. Get active subscriptions
  const subscriptions = await getActiveSubscriptions();

  if (subscriptions.length === 0) {
    log('No active subscriptions found. Nothing to process.');
    return { processed: 0, skipped: 0 };
  }

  // 2. For each unprocessed subscription, find relevant emails and process
  let processed = 0;
  let skipped = 0;
  const results = [];

  for (const sub of subscriptions) {
    if (isProcessed(tracking, sub.id)) {
      log(`⏭  Skipping ${sub.id} — already processed`);
      skipped++;
      continue;
    }

    const customer = sub.customer;
    const customerEmail =
      typeof customer === 'object' ? customer.email : 'unknown';
    const customerName =
      typeof customer === 'object'
        ? customer.name || customerEmail
        : customerEmail;

    log(`\n📋 Subscription: ${sub.id}`);
    log(`   Customer: ${customerName} <${customerEmail}>`);
    log(`   Status: ${sub.status} | Started: ${new Date(sub.created * 1000).toISOString()}`);
    log(`   Items: ${sub.items.data.map((i) => i.price?.nickname || i.price?.id).join(', ')}`);

    // Find relevant emails from this customer
    const emails = await findRelevantEmails(customerEmail);

    // Process the signup
    const result = await processSignup(sub, emails, { dryRun });
    results.push(result);

    if (!dryRun) {
      markProcessed(tracking, sub.id, {
        customerEmail,
        customerName,
        result,
      });
      saveTracking(tracking);
    } else {
      log(`   [DRY RUN] Would mark ${sub.id} as processed`);
    }

    processed++;
  }

  // Summary
  log(`\n═══════════════════════════════════════`);
  log(`Pipeline complete. Processed: ${processed}, Skipped: ${skipped}`);
  log(`═══════════════════════════════════════`);

  return { processed, skipped, results };
}

// ── CLI entrypoint ──────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--check');
  const isRun = args.includes('--run');

  if (!isDryRun && !isRun) {
    console.log('Usage: node server/fulfillment.js --check | --run');
    console.log('  --check   Dry run: show what would happen without executing');
    console.log('  --run     Execute the full fulfillment pipeline');
    process.exit(1);
  }

  try {
    await runFulfillment({ dryRun: isDryRun });
  } catch (err) {
    log(`❌ Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// Allow import as module or direct execution
const args = process.argv.slice(2);
if (args.includes('--check') || args.includes('--run')) {
  main();
}

export { runFulfillment, getActiveSubscriptions, findRelevantEmails, processSignup };
