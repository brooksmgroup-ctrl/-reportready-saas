import { Resend } from 'resend';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = new Resend(process.env.RESEND_API_KEY);
const TRACKER_FILE = path.join(__dirname, 'outreach_tracking.json');
const LEADS_FILE = path.join(__dirname, 'active_leads.json');
const STATUS_FILE = path.join(__dirname, 'campaign_status.json');
const DAILY_LIMIT = 100;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function loadTracking() {
  if (fs.existsSync(TRACKER_FILE)) return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  return {};
}
function saveTracking(data) {
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
}

const greet = (lead) => lead.contact_name ? `Hi ${lead.contact_name}` : 'Hi there';

const formatIssuesList = (issues) => {
  if (!issues || issues.length === 0) return null;
  return issues.map(i => `\u2022 ${i}`).join('\\n');
};

const templatesByIndustry = {
  saas: {
    initial: (lead) => {
      const s = lead.estimated_score || 65;
      return {
        subject: `${lead.name} \u2014 your AI-readiness score: ${s}/100`,
        text: `${greet(lead)},\n\nI checked ${lead.url} through an AI-readiness audit. Score: ${s}/100.\n\nMost SaaS sites are invisible to ChatGPT and Gemini because they lack structured data and have crawl issues. The average is 65.\n\n${formatIssuesList(lead.estimated_issues) ? `Here's what we found:\n${formatIssuesList(lead.estimated_issues)}\n\n` : ''}The full report shows exactly what's missing and how to fix it:\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nHappy to walk through it if helpful.\n\nBest,\nBryan Robinson\nFounder, ReportReady`
      };
    },
    followup1: (lead) => ({
      subject: `${lead.name} \u2014 your competitors are already fixing this`,
      text: `${greet(lead)},\n\nFollowing up on the AI audit for ${lead.url}. Companies that optimize for AI search now will have a massive advantage as this channel grows.\n\nYour report is still here:\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nHappy to answer any questions.\n\nBest,\nBryan Robinson\nFounder, ReportReady`
    }),
    followup2: (lead) => ({
      subject: `${lead.name} \u2014 final check on this`,
      text: `${greet(lead)},\n\nLast note on the AI audit for ${lead.url}. If this isn't the right time, I understand \u2014 the report will stay active whenever you want to revisit it.\n\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nBest,\nBryan Robinson\nFounder, ReportReady`
    })
  },
  agency: {
    initial: (lead) => {
      const s = lead.estimated_score || 65;
      return {
        subject: `${lead.name} \u2014 client retention just became a revenue stream`,
                    text: `${greet(lead)},\n\nQuick question: when's the last time you had a reason to call every client?\n\nWe ran 20 random audits on sites in our pipeline. Average AI Readiness: 55/100. 60% had performance issues that confuse AI crawlers. Even our own site failed the first time we ran it — and we built the tool.\n\nYour clients' sites are probably in the same boat.\n\nReportReady gives agencies a monthly branded AI-readiness report for each client. They see value every 30 days. You get a reason to stay in front of them.\n\n$29/mo per client you charge (your markup), or give it free as a retention tool. $99/mo unlimited, 14-day free trial. Cancel anytime.\n\nYour free audit: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nWorth a chat?\n\nBryan Robinson\nFounder, ReportReady`
      };
    },
    followup1: (lead) => ({
              subject: `quick follow-up on the monthly client reports`,
              text: `${greet(lead)},\n\nFollowing up — branded AI-readiness reports for your clients.\n\n\u2022 Your logo, monthly delivery, zero extra work\n\u2022 Charge $29/mo per client or give it free to lock retention\n\u2022 $99/mo flat, unlimited sites\n\n$99/mo, 14 days free. Cancel anytime.\n\nYour audit: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nWorth a chat?\n\nBryan Robinson\nFounder, ReportReady`
            }),
            followup2: (lead) => ({
              subject: `one last thought`,
              text: `${greet(lead)},\n\nLast note. We spot-checked 20 sites. Average AI Readiness: 55/100. Most are invisible to AI search.\n\nA branded monthly report = a reason to call every client. And a reason they stay.\n\n$99/mo, 14-day free trial.\n\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nBryan Robinson\nFounder, ReportReady`
            })
  }
};

function getTemplatesForLead(lead) {
  const industry = (lead.industry || lead.type || '').toLowerCase();
  if (industry.includes('agency') || industry.includes('agencia')) return templatesByIndustry.agency;
  return templatesByIndustry.saas;
}

async function sendEmail(email, { subject, text }, isDryRun) {
  if (isDryRun) {
    console.log(`[DRY RUN] Would send to ${email}: "${subject}"`);
    return `dry_${Date.now()}`;
  }
  try {
    const { data, error } = await resend.emails.send({
   from: 'ReportReady <hello@getreportready.com>',
      to: [email], subject, text
    });
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.error(`Failed to send to ${email}:`, err.message);
    return null;
  }
}

/**
 * Run the email campaign.
 * @param {Object} options
 * @param {boolean} [options.followupsOnly=false] - Only send follow-ups, skip initial outreach
 * @param {boolean} [options.dryRun=false] - Log what would be sent without actually sending
 * @returns {Object} { sentToday, mode, error? }
 */
export async function runCampaign(options = {}) {
  const { followupsOnly = false, dryRun = false } = options;
  const mode = dryRun ? 'DRY RUN' : followupsOnly ? 'FOLLOW-UPS ONLY' : 'FULL CAMPAIGN';

  console.log(`[${new Date().toISOString()}] Campaign started — ${mode} (limit: ${followupsOnly ? 'unlimited' : DAILY_LIMIT})`);

  if (!fs.existsSync(LEADS_FILE)) {
    const err = `${LEADS_FILE} not found`;
    console.error(`Error: ${err}`);
    return { sentToday: 0, mode, error: err };
  }

  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  const tracking = loadTracking();
  const now = Date.now();
  let sentToday = 0;

  for (const lead of leads) {
    if (sentToday >= DAILY_LIMIT && !followupsOnly) break;
    if (!lead.contact_email) {
      console.log(`Skipping ${lead.name || 'unknown'} — no contact_email.`);
      continue;
    }
    const email = lead.contact_email;
    const status = tracking[email] || { stage: 0, lastContact: 0 };
    if (status.bounced) {
      console.log(`Skipping ${email} — previously bounced.`);
      continue;
    }
    const templates = getTemplatesForLead(lead);

    if (status.stage === 0) {
      if (followupsOnly) continue;
      console.log(`Action: Initial Outreach to ${email} (${lead.name})...`);
      const sentId = await sendEmail(email, templates.initial(lead), dryRun);
      if (sentId) { tracking[email] = { stage: 1, lastContact: now }; sentToday++; }
      else if (!dryRun) { console.log(`Send failed for ${email} — will retry next run.`); }
      await sleep(1500);
    } else if (status.stage === 1 && now - status.lastContact > 3 * 24 * 60 * 60 * 1000) {
      console.log(`Action: Follow-up 1 to ${email} (${lead.name})...`);
      const sentId = await sendEmail(email, templates.followup1(lead), dryRun);
      if (sentId) { tracking[email] = { stage: 2, lastContact: now }; sentToday++; }
      else if (!dryRun) { console.log(`Send failed for ${email} — will retry next run.`); }
      await sleep(1500);
    } else if (status.stage === 2 && now - status.lastContact > 7 * 24 * 60 * 60 * 1000) {
      console.log(`Action: Final Follow-up to ${email} (${lead.name})...`);
      const sentId = await sendEmail(email, templates.followup2(lead), dryRun);
      if (sentId) { tracking[email] = { stage: 3, lastContact: now }; sentToday++; }
      else if (!dryRun) { console.log(`Send failed for ${email} — will retry next run.`); }
      await sleep(1500);
    }
  }

  if (!dryRun) {
    saveTracking(tracking);
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ lastRun: new Date().toISOString(), sentToday, mode }));
    console.log(`[${new Date().toISOString()}] Campaign complete. Sent: ${sentToday}. Tracking updated.`);
  } else {
    console.log(`[${new Date().toISOString()}] Dry run complete. ${sentToday} would have been sent. No tracking saved.`);
  }

  return { sentToday, mode };
}

// Allow running directly via CLI: node server/campaignManager.js [--followups-only] [--dry-run]
const isDirectlyInvoked = process.argv[1] && (
  process.argv[1].endsWith('campaignManager.js') || process.argv[1] === import.meta.url
);

if (isDirectlyInvoked) {
  const isDryRun = process.argv.includes('--dry-run');
  const followupsOnly = process.argv.includes('--followups-only');
  runCampaign({ followupsOnly, dryRun: isDryRun }).then(result => {
    if (result.error) process.exit(1);
  });
}
