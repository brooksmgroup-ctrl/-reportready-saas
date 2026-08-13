/**
 * Monthly AI-Readiness Report Scheduler
 *
 * Runs on a monthly cadence (cron wired in index.js). For every agency
 * account with tracked client sites (agency_sites.json — the same data the
 * agency dashboard and fulfillment pipeline use):
 *   1. Re-audits every tracked client site.
 *   2. Logs every audit run (site URL, four scores, timestamp) to
 *      audit_history.json so we can compute month-over-month deltas and
 *      scan for perfect-access sites. History is capped at 12 runs/site.
 *   3. Emails the agency the updated branded PDF reports (agency signature
 *      on each PDF — white-label stays client-facing).
 *   4. Emails the agency owner a roll-up of their whole book: per client —
 *      site URL, current AI-readiness score, change vs last month, issue
 *      count, top fix, plus a "this month" highlight.
 *
 * Safety (mirrors campaignManager.js patterns):
 *   - MONTHLY_REPORTS_ENABLED env flag gates real sends (default OFF).
 *   - Per-agency-per-month dedupe via monthly_reports_tracking.json — no
 *     duplicate sends; a failed send is recorded and retried next run.
 *   - Per-site try/catch — one failing site never blocks the rest.
 *   - --email <addr> overrides all recipients (for testing only).
 *   - No emails to free-audit prospects — strictly paying agency accounts
 *     and their tracked client sites.
 *
 * CLI:
 *   node server/monthlyReports.js --check                  Dry run (logs only)
 *   node server/monthlyReports.js --run                    Real run (needs MONTHLY_REPORTS_ENABLED=true)
 *   node server/monthlyReports.js --run --force            Real run, bypass the env flag (testing)
 *   node server/monthlyReports.js --run --email a@b.com    Override recipients (testing)
 */

import { Resend } from 'resend';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAudit } from './audit.js';
import { generatePDF } from './reportGenerator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────

const AGENCY_USERS_FILE = path.join(__dirname, 'agency_users.json');
const AGENCY_SITES_FILE = path.join(__dirname, 'agency_sites.json');
const TRACKING_FILE = path.join(__dirname, 'monthly_reports_tracking.json');
const AUDIT_HISTORY_FILE = path.join(__dirname, 'audit_history.json');

// Real sends are OFF unless explicitly enabled. The cron and API both
// respect this; CLI --force is the only bypass (explicit testing intent).
const MONTHLY_REPORTS_ENABLED = process.env.MONTHLY_REPORTS_ENABLED === 'true';

// History cap per site (12 months of deltas is plenty).
const MAX_HISTORY_PER_SITE = 12;

// ── Clients ─────────────────────────────────────────────────

// null when Resend isn't configured — sends are skipped with a log line
// instead of crashing (same pattern as fulfillment.js).
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// ── Logger ──────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

// ── JSON helpers ────────────────────────────────────────────

function loadJSON(file, fallback) {
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      log(`⚠  Could not parse ${path.basename(file)}: ${err.message}`);
      return fallback;
    }
  }
  return fallback;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ── Month key ───────────────────────────────────────────────

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── Tracking (dedupe) ───────────────────────────────────────

function loadTracking() {
  return loadJSON(TRACKING_FILE, {});
}

function saveTracking(data) {
  saveJSON(TRACKING_FILE, data);
}

// Have this agency's monthly client reports already been sent this month?
function reportsSentForMonth(tracking, agencyId, month) {
  return tracking[agencyId]?.[month]?.reportsSent === true;
}

// Has the monthly roll-up already been sent to this agency this month?
function rollupSentForMonth(tracking, agencyId, month) {
  return tracking[agencyId]?.[month]?.rollupSent === true;
}

// ── Audit history (minimal logging for deltas) ──────────────

function loadAuditHistory() {
  return loadJSON(AUDIT_HISTORY_FILE, {});
}

function saveAuditHistory(history) {
  saveJSON(AUDIT_HISTORY_FILE, history);
}

// Append one audit run to the site's history. Newest first, capped.
function logAuditRun(history, siteId, siteUrl, report) {
  const entry = {
    date: report.timestamp || new Date().toISOString(),
    scores: report.scores,
    aiCrawlersBlocked: report.aiCrawlersBlocked || [],
  };
  const siteHistory = history[siteId] || { url: siteUrl, history: [] };
  siteHistory.url = siteUrl;
  siteHistory.history = [entry, ...siteHistory.history].slice(0, MAX_HISTORY_PER_SITE);
  history[siteId] = siteHistory;
}

// ── Report helpers ──────────────────────────────────────────

function topFixFor(issues) {
  if (!issues || issues.length === 0) return null;
  const issue = issues[0];
  if (issue.category === 'AI Readiness' && issue.message.includes('robots.txt')) return 'Remove AI crawler blocks from robots.txt';
  if (issue.category === 'AI Readiness') return 'Add Schema markup (JSON-LD) to your homepage';
  if (issue.category === 'SEO' && issue.message.includes('title')) return 'Set a clear page title (30–60 chars)';
  if (issue.category === 'SEO' && issue.message.includes('summary')) return 'Add a meta description (120–160 chars)';
  if (issue.category === 'SEO') return 'Use exactly one H1 heading per page';
  if (issue.category === 'Performance') return 'Reduce page load time: compress images, minimise scripts';
  if (issue.category === 'Accessibility') return 'Add alt text to images and set a lang attribute on <html>';
  return issue.message;
}

// Compare current AI-readiness vs the previous run in history.
// Returns { delta, arrow } where arrow is 'up' | 'down' | 'same' | 'first'.
function trendFor(history, siteId, currentScore) {
  const siteHistory = history[siteId]?.history;
  if (!siteHistory || siteHistory.length < 2) return { delta: 0, arrow: 'first' };
  const previous = siteHistory[1].scores?.aiReadiness;
  if (typeof previous !== 'number') return { delta: 0, arrow: 'first' };
  const delta = currentScore - previous;
  return { delta, arrow: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same' };
}

function domainOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ── Email builders ──────────────────────────────────────────

// Client-facing reports email (branded PDFs attached, sent to the agency
// so they can forward each report to the client).
function buildReportsEmail(agency, rows, month) {
  const lines = rows
    .map(
      (r) =>
        `<li style="margin:10px 0;padding:12px;border:1px solid #e0e0e0;border-radius:8px;">` +
        `<strong>${r.domain}</strong> — AI Readiness: ${r.report.scores.aiReadiness}/100 · ` +
        `SEO: ${r.report.scores.seo}/100 · Performance: ${r.report.scores.performance}/100<br/>` +
        `<small>${r.report.issues?.length || 0} issues found — PDF attached, branded with ${agency.agency}.</small></li>`
    )
    .join('');

  return {
    subject: `Your monthly AI-readiness reports (${rows.length} site${rows.length > 1 ? 's' : ''}) — ${agency.agency || agency.name}`,
    html: `<h2>Monthly AI-Readiness Reports — ${month}</h2>
<p>Hi ${agency.name || 'there'},</p>
<p>We re-audited ${rows.length} client site${rows.length > 1 ? 's' : ''} this month. Updated branded PDF reports are attached — forward each one to the matching client.</p>
<ul>${lines}</ul>
<p>Want a different cadence or have questions? Just reply to this email.</p>
<p>— The ReportReady Team</p>`,
  };
}

// Roll-up email to the agency owner (from ReportReady — not white-label).
function buildRollupEmail(agency, rows, month) {
  const tableRows = rows
    .map((r) => {
      const t = r.trend;
      const trendCell =
        t.arrow === 'first'
          ? '<span style="color:#94a3b8">first report</span>'
          : t.arrow === 'up'
            ? `<span style="color:#22c55e">▲ +${t.delta}</span>`
            : t.arrow === 'down'
              ? `<span style="color:#ef4444">▼ ${t.delta}</span>`
              : '<span style="color:#94a3b8">— unchanged</span>';
      return `<tr style="border-bottom:1px solid #e5e7eb;">
<td style="padding:10px 8px">${r.domain}</td>
<td style="padding:10px 8px;font-weight:700">${r.report.scores.aiReadiness}/100</td>
<td style="padding:10px 8px">${trendCell}</td>
<td style="padding:10px 8px">${r.report.issues?.length || 0}</td>
<td style="padding:10px 8px;color:#64748b">${r.topFix || '—'}</td>
</tr>`;
    })
    .join('');

  // "This month" highlight: biggest improver, or the book's strongest site.
  const improvers = rows.filter((r) => r.trend.arrow === 'up').sort((a, b) => b.trend.delta - a.trend.delta);
  let highlight;
  if (improvers.length > 0) {
    const best = improvers[0];
    highlight = `Best mover this month: <strong>${best.domain}</strong> is up <strong>+${best.trend.delta}</strong> points (${best.report.scores.aiReadiness}/100).`;
  } else if (rows.length > 0) {
    const top = rows.slice().sort((a, b) => b.report.scores.aiReadiness - a.report.scores.aiReadiness)[0];
    highlight = `Highest scorer this month: <strong>${top.domain}</strong> at ${top.report.scores.aiReadiness}/100.`;
  } else {
    highlight = 'No client sites audited this month.';
  }

  return {
    subject: `Your client book this month — ${agency.agency || agency.name} (${month})`,
    html: `<h2>Monthly Client Book Roll-up — ${month}</h2>
<p>Hi ${agency.name || 'there'},</p>
<p>Here is where every tracked client site stands after this month's re-audit. Use these numbers for your monthly check-in calls.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<thead><tr style="border-bottom:2px solid #d1d5db;text-align:left">
<th style="padding:10px 8px">Site</th>
<th style="padding:10px 8px">AI Readiness</th>
<th style="padding:10px 8px">vs last month</th>
<th style="padding:10px 8px">Issues</th>
<th style="padding:10px 8px">Top fix</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
<p style="margin-top:20px;color:#374151">${highlight}</p>
<p>Questions? Reply to this email — we typically respond within 4 hours.</p>
<p>— The ReportReady Team</p>`,
  };
}

// ── Sending ─────────────────────────────────────────────────

async function sendEmail(agency, emailData, attachments, recipientOverride, label) {
  const to = recipientOverride || agency.email;
  if (!resend) {
    log(`  [${label}] Resend not configured — skipping send (would send to ${to})`);
    return { sent: false, reason: 'resend-not-configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: 'ReportReady <hello@getreportready.com>',
      to: [to],
      subject: emailData.subject,
      html: emailData.html,
      ...(attachments && attachments.length ? { attachments } : {}),
    });
    if (error) throw error;
    log(`  [${label}] ✓ Sent to ${to} (${data?.id || 'ok'})`);
    return { sent: true, id: data?.id || null };
  } catch (err) {
    log(`  [${label}] ✗ Send failed to ${to}: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

// ── Main pipeline ───────────────────────────────────────────

/**
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - Log everything, change nothing.
 * @param {boolean} [options.force=false]  - Bypass MONTHLY_REPORTS_ENABLED (testing).
 * @param {string|null} [options.emailOverride=null] - Send every email to this address instead.
 * @returns {Promise<Object>} summary
 */
export async function runMonthlyReports(options = {}) {
  const { dryRun = false, force = false, emailOverride = null } = options;
  const mode = dryRun ? 'DRY RUN' : 'LIVE';
  const month = monthKey();
  const now = new Date().toISOString();

  log('═══════════════════════════════════════');
  log(`Monthly Reports — ${mode} (month: ${month})`);
  log('═══════════════════════════════════════');

  if (!dryRun && !MONTHLY_REPORTS_ENABLED && !force) {
    log('Monthly reports are DISABLED — set MONTHLY_REPORTS_ENABLED=true (or pass --force for an explicit test run).');
    return { enabled: false, dryRun, month, processed: 0 };
  }

  const users = loadJSON(AGENCY_USERS_FILE, []);
  const sites = loadJSON(AGENCY_SITES_FILE, []);
  const tracking = loadTracking();
  const history = loadAuditHistory();

  if (!Array.isArray(users) || !Array.isArray(sites)) {
    log(`❌ agency_users.json / agency_sites.json are not arrays — aborting.`);
    return { enabled: MONTHLY_REPORTS_ENABLED, dryRun, month, error: 'invalid-data-files' };
  }

  const sitesByAgency = {};
  for (const site of sites) {
    if (!site || !site.agencyId || !site.url) continue;
    (sitesByAgency[site.agencyId] = sitesByAgency[site.agencyId] || []).push(site);
  }

  const summary = { month, processed: 0, skipped: 0, agencies: [] };

  for (const agency of users) {
    const agencySites = sitesByAgency[agency.id] || [];
    if (agencySites.length === 0) {
      log(`⏭  ${agency.agency || agency.name || agency.id} — no tracked client sites, skipping`);
      summary.skipped++;
      continue;
    }
    log(`\n📋 Agency: ${agency.agency || agency.name || agency.id} (${agencySites.length} site${agencySites.length > 1 ? 's' : ''})`);

    // Dedupe per agency per month — but independently for each email so a
    // failed roll-up still gets retried after reports already went out.
    const reportsAlreadySent = !dryRun && reportsSentForMonth(tracking, agency.id, month);
    const rollupAlreadySent = !dryRun && rollupSentForMonth(tracking, agency.id, month);
    if (reportsAlreadySent && rollupAlreadySent && !force) {
      log(`  ⏭ Already sent this month (reports + roll-up) — skipping`);
      summary.skipped++;
      continue;
    }

    // 1. Audit every tracked site.
    const rows = [];
    for (const site of agencySites) {
      log(`  Auditing: ${site.url}`);
      if (dryRun) {
        log(`    [DRY RUN] Would audit ${site.url}`);
        // Placeholder row so the rest of the pipeline is exercised in dry-run too.
        rows.push({ site, domain: domainOf(site.url), report: null, topFix: null, trend: { arrow: 'first', delta: 0 } });
        continue;
      }
      try {
        const report = await runAudit(site.url);
        logAuditRun(history, site.id, site.url, report);
        const topFix = topFixFor(report.issues);
        const trend = trendFor(history, site.id, report.scores.aiReadiness);
        rows.push({ site, domain: domainOf(site.url), report, topFix, trend });
        log(`    ✓ ${report.scores.aiReadiness}/100 (${report.issues?.length || 0} issues, trend: ${trend.arrow})`);
      } catch (err) {
        log(`    ✗ Audit failed: ${err.message}`);
      }
    }

    if (rows.length === 0) {
      log(`  No successful audits for ${agency.agency || agency.name || agency.id} — skipping emails this month`);
      summary.skipped++;
      continue;
    }

    // 2. Build branded PDFs.
    const attachments = [];
    for (const r of rows) {
      try {
        if (dryRun) {
          log(`    [DRY RUN] Would generate PDF for ${r.domain}`);
          continue;
        }
        const pdfBuffer = generatePDF(
          {
            url: r.site.url,
            timestamp: r.report.timestamp,
            scores: r.report.scores,
            issues: r.report.issues,
            aiCrawlersBlocked: r.report.aiCrawlersBlocked || [],
          },
          agency.signature || ''
        );
        const size = Buffer.byteLength(Buffer.from(pdfBuffer));
        attachments.push({
          filename: `ReportReady-${r.domain}-audit.pdf`,
          content: Buffer.from(pdfBuffer).toString('base64'),
        });
        log(`    ✓ PDF generated for ${r.domain} (${size} bytes)`);
      } catch (err) {
        log(`    ✗ PDF generation failed for ${r.domain}: ${err.message}`);
      }
    }

    if (dryRun) {
      log(`  [DRY RUN] Would email ${agency.email}:\n` +
        `    · ${attachments.length || rows.length} branded PDF report(s)\n` +
        `    · monthly client-book roll-up`);
      summary.processed++;
      summary.agencies.push({ agencyId: agency.id, month, dryRun: true });
      continue;
    }

    // 3. Client reports email (branded PDFs) — skip if already sent this month.
    const monthRecord = tracking[agency.id]?.[month] || {};
    if (reportsAlreadySent && !force) {
      log(`  ⏭ Client reports already sent this month — skipping`);
    } else {
      const reportsEmail = buildReportsEmail(agency, rows, month);
      const reportsResult = await sendEmail(
        agency,
        reportsEmail,
        attachments,
        emailOverride,
        'client-reports'
      );
      if (reportsResult.sent) monthRecord.reportsSent = true;
      else monthRecord.reportsError = reportsResult.reason;
      monthRecord.reportsAttemptedAt = now;
      log(`  → Client reports: ${reportsResult.sent ? 'sent' : 'FAILED (' + reportsResult.reason + ')'}`);
    }

    // 4. Roll-up email to the agency owner — skip if already sent this month.
    if (rollupAlreadySent && !force) {
      log(`  ⏭ Roll-up already sent this month — skipping`);
    } else {
      const rollupEmail = buildRollupEmail(agency, rows, month);
      const rollupResult = await sendEmail(
        agency,
        rollupEmail,
        [],
        emailOverride,
        'roll-up'
      );
      if (rollupResult.sent) monthRecord.rollupSent = true;
      else monthRecord.rollupError = rollupResult.reason;
      monthRecord.rollupAttemptedAt = now;
      log(`  → Roll-up: ${rollupResult.sent ? 'sent' : 'FAILED (' + rollupResult.reason + ')'}`);
    }

    tracking[agency.id] = tracking[agency.id] || {};
    tracking[agency.id][month] = monthRecord;

    summary.processed++;
    summary.agencies.push({
      agencyId: agency.id,
      month,
      sites: rows.length,
      reportsSent: monthRecord.reportsSent === true,
      rollupSent: monthRecord.rollupSent === true,
      errors: [monthRecord.reportsError, monthRecord.rollupError].filter(Boolean),
    });
  }

  // Persist state (never in dry run).
  if (!dryRun) {
    tracking._lastRun = { at: now, month, mode };
    saveTracking(tracking);
    saveAuditHistory(history);
    log(`\nTracking + audit history saved.`);
  }

  log(`\n═══════════════════════════════════════`);
  log(`Done. Processed: ${summary.processed}, Skipped: ${summary.skipped} (${mode})`);
  log('═══════════════════════════════════════');

  return summary;
}

// ── CLI entrypoint ──────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--check');
  const isRun = args.includes('--run');
  const force = args.includes('--force');
  const emailIdx = args.indexOf('--email');
  const emailOverride = emailIdx >= 0 && args[emailIdx + 1] ? args[emailIdx + 1] : null;

  if (!isDryRun && !isRun) {
    console.log('Usage: node server/monthlyReports.js --check | --run [--force] [--email addr]');
    console.log('  --check     Dry run: log what would happen without executing');
    console.log('  --run       Execute the monthly pipeline');
    console.log('  --force     Bypass MONTHLY_REPORTS_ENABLED (explicit testing)');
    console.log('  --email     Override recipients with this address (testing)');
    process.exit(1);
  }

  try {
    await runMonthlyReports({ dryRun: isDryRun, force, emailOverride });
  } catch (err) {
    log(`❌ Fatal error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// Allow import as module or direct execution.
const isDirectlyInvoked = process.argv[1] && (
  process.argv[1].endsWith('monthlyReports.js') || process.argv[1] === import.meta.url
);

if (isDirectlyInvoked) {
  main();
}

export { monthKey, loadAuditHistory, logAuditRun, topFixFor, trendFor };
