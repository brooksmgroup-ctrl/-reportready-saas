import { Resend } from 'resend';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const TRACKER_FILE = 'outreach_tracking.json';
const LEADS_FILE = 'active_leads.json';
const DAILY_LIMIT = 25;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const isDryRun = process.argv.includes('--dry-run');
const followupsOnly = process.argv.includes('--followups-only');

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
                    text: `${greet(lead)},\n\nWhen's the last time you had a reason to call every client?\n\nReportReady gives agencies a monthly branded AI-readiness report for each client. They see their score improve. You get a built-in reason to stay in front of them.\n\n$29/mo per client (your markup) or free as a retention tool. Either way, $99/mo for you.\n\nYour free audit: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nWorth a chat?\n\nBryan Robinson\nFounder, ReportReady`
      };
    },
    followup1: (lead) => ({
      subject: `${lead.name} \u2014 retain more clients with branded AI reports`,
      text: `${greet(lead)},\n\nFollowing up on ${lead.url}. Agencies that offer AI readiness monitoring retain clients 40% longer \u2014 it gives you a monthly check-in reason that's actually valuable.\n\nThe math:\n\u2022 10 clients \u00d7 $29/mo = $290/mo new revenue for $99/mo cost = $191/mo profit\n\u2022 Branded reports with your logo, not ours\n\u2022 Zero extra work \u2014 we run the scans, you take the credit\n\nSee a sample branded report:\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}&brand=agency\n\nWant to start with a trial?\n\nBest,\nBryan Robinson\nFounder, ReportReady`
    }),
    followup2: (lead) => ({
      subject: `${lead.name} \u2014 final thought: client retention + profit`,
      text: `${greet(lead)},\n\nLast note on this. Here's what I'd want someone to tell me:\n\nAI search is growing fast. Every one of your clients' sites is being crawled by ChatGPT and Gemini right now. Most are invisible. The agencies that help their clients get found will win, and those that don't will lose clients.\n\nWe built ReportReady so you can offer this without adding headcount. Branded reports. Recurring revenue. Zero extra work.\n\nStarts at $99/mo for unlimited client sites:\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}&brand=agency\n\nWhen you're ready, I'm here.\n\nBest,\nBryan Robinson\nFounder, ReportReady`
    })
  }
};

function getTemplatesForLead(lead) {
  const industry = (lead.industry || lead.type || '').toLowerCase();
  if (industry.includes('agency') || industry.includes('agencia')) return templatesByIndustry.agency;
  return templatesByIndustry.saas;
}

async function sendEmail(email, { subject, text }) {
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

async function runCampaign() {
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : followupsOnly ? 'FOLLOW-UPS ONLY' : 'FULL CAMPAIGN'} (limit: ${followupsOnly ? 'unlimited' : DAILY_LIMIT})`);
  if (!fs.existsSync(LEADS_FILE)) {
    console.error(`Error: ${LEADS_FILE} not found. Create it with your lead batch.`);
    return;
  }
  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  const tracking = loadTracking();
  const now = Date.now();
  let sentToday = 0;

  for (const lead of leads) {
    if (sentToday >= DAILY_LIMIT && !followupsOnly) break;
    if (!lead.contact_email) {
      console.log(`Skipping ${lead.name || 'unknown'} \u2014 no contact_email.`);
      continue;
    }
    const email = lead.contact_email;
    const status = tracking[email] || { stage: 0, lastContact: 0 };
    if (status.bounced) {
      console.log(`Skipping ${email} \u2014 previously bounced.`);
      continue;
    }
    const templates = getTemplatesForLead(lead);

    if (status.stage === 0) {
      if (followupsOnly) continue;
      console.log(`Action: Initial Outreach to ${email} (${lead.name})...`);
      const sentId = await sendEmail(email, templates.initial(lead));
      if (sentId) { tracking[email] = { stage: 1, lastContact: now }; sentToday++; }
      else if (!isDryRun) { tracking[email] = { stage: 0, bounced: true, lastContact: now }; console.log(`Marked ${email} as bounced.`); }
      await sleep(1500);
    } else if (status.stage === 1 && now - status.lastContact > 3 * 24 * 60 * 60 * 1000) {
      console.log(`Action: Follow-up 1 to ${email} (${lead.name})...`);
      const sentId = await sendEmail(email, templates.followup1(lead));
      if (sentId) { tracking[email] = { stage: 2, lastContact: now }; sentToday++; }
      else if (!isDryRun) { tracking[email] = { stage: 1, bounced: true, lastContact: now }; console.log(`Marked ${email} as bounced.`); }
      await sleep(1500);
    } else if (status.stage === 2 && now - status.lastContact > 7 * 24 * 60 * 60 * 1000) {
      console.log(`Action: Final Follow-up to ${email} (${lead.name})...`);
      const sentId = await sendEmail(email, templates.followup2(lead));
      if (sentId) { tracking[email] = { stage: 3, lastContact: now }; sentToday++; }
      else if (!isDryRun) { tracking[email] = { stage: 2, bounced: true, lastContact: now }; console.log(`Marked ${email} as bounced.`); }
      await sleep(1500);
    }
  }

  if (!isDryRun) { saveTracking(tracking); console.log('Campaign cycle complete. Tracking updated.'); }
  else { console.log('Dry run complete. No tracking data saved.'); }
}

runCampaign();