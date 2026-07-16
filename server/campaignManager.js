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
        subject: `${lead.name} \u2014 new line item for every client retainer`,
        text: `${greet(lead)},\n\nI checked your site at ${lead.url} \u2014 your AI-readiness score is ${s}/100.\n\nQuick question: are any of your clients asking about AI search visibility yet? Every agency needs to offer AI readiness audits as a service.\n\nWe built ReportReady so agencies can white-label and resell it. Your clients get a clear score and fix list. You get a new retainer line item.\n\n${formatIssuesList(lead.estimated_issues) ? `A few things we spotted on your own site:\n${formatIssuesList(lead.estimated_issues)}\n\n` : ''}Want to see what a client-ready report looks like?\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nHappy to chat about the reseller program.\n\nBest,\nBryan Robinson\nFounder, ReportReady`
      };
    },
    followup1: (lead) => ({
      subject: `${lead.name} \u2014 AI readiness as a recurring service`,
      text: `${greet(lead)},\n\nFollowing up on ${lead.url}. A lot of agencies are adding AI readiness audits to their monthly retainers \u2014 it's a natural upsell after SEO and CRO.\n\nHere's how it works:\n\u2022 You run an audit for a client \u2192 white-label report \u2192 $29/mo recurring\n\u2022 Or resell unlimited audits at $99/mo and set your own pricing\n\u2022 We handle the technical crawl and scoring; you deliver the value\n\nYour audit is ready:\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nWant to talk through pricing?\n\nBest,\nBryan Robinson\nFounder, ReportReady`
    }),
    followup2: (lead) => ({
      subject: `${lead.name} \u2014 one last thought on AI readiness`,
      text: `${greet(lead)},\n\nLast note on this. If AI audits aren't on your radar yet, no worries \u2014 but they will be soon. Every one of your clients' websites is being indexed by AI crawlers right now, and most of them are invisible.\n\nWhen you're ready, the report is here:\nhttps://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}\n\nBest,\nBryan Robinson\nFounder, ReportReady`
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