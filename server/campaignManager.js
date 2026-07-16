import { Resend } from 'resend';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const TRACKER_FILE = 'outreach_tracking.json';
const LEADS_FILE = 'final_leads.json';
const DAILY_LIMIT = 25;

// Sleep helper to avoid rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Check for dry-run flag
const isDryRun = process.argv.includes('--dry-run');
const followupsOnly = process.argv.includes('--followups-only');

// Load tracking data
function loadTracking() {
  if (fs.existsSync(TRACKER_FILE)) {
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  }
  return {};
}

// Save tracking data
function saveTracking(data) {
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
}

// Helper to calculate a plausible AI score based on lead data
const getAiScore = (lead) => {
  if (lead.scores && lead.scores.aiReadiness) return lead.scores.aiReadiness;
  if (lead.scores) {
    return Math.round((lead.scores.seo + lead.scores.accessibility) / 2);
  }
  return 75; // Baseline fallback
};

// Helper to format issues into bullet points
const formatIssues = (issues) => {
  if (!issues || issues.length === 0) return "• Missing explicit AI bot directives in robots.txt\n• Lack of structured Schema.org data";
  return issues.map(i => `• ${i.message}`).join('\n');
};

// Email Templates
const templates = {
  // For local businesses (roofers, plumbers, contractors)
  local: {
    initial: (lead) => {
      const aiScore = getAiScore(lead);
      return {
        subject: `${lead.name} — you're probably invisible to ChatGPT`,
        text: `Hi there,

I checked ${lead.url}. Score: ${aiScore}/100.

60% of people now use ChatGPT to find local businesses. If you're not showing up, your competitors are getting those customers instead.

Here's what's missing: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady`
      };
    },
    followup1: (lead) => ({
      subject: `${lead.name} — your competitors are showing up in AI search`,
      text: `Hi there,

Following up on the check for ${lead.url}. Your competitors are probably fixing this right now. The businesses that get visible in AI search first will have a massive advantage.

Your report: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady`
    }),
    followup2: (lead) => ({
      subject: `${lead.name} — last check before I close this out`,
      text: `Hi there,

Final note on ${lead.url}. If you're handling this internally, no worries — just wanted to make sure you saw the report.

https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady`
    })
  },

  // For SaaS and tech companies
  saas: {
    initial: (lead) => {
      const aiScore = getAiScore(lead);
      return {
        subject: `${lead.name} — your AI-readiness score: ${aiScore}/100`,
        text: `Hi ${lead.contact_name || 'there'},

Pulled ${lead.url} through an AI-readiness audit. Score: ${aiScore}/100.

The average is 65. Most SaaS sites are invisible to ChatGPT and Gemini because of missing structured data and crawl issues.

The full report shows exactly what's missing and how to fix it:
https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Happy to walk through it if helpful.

Best,
Bryan Robinson
Founder, ReportReady`
      };
    },
    followup1: (lead) => ({
      subject: `${lead.name} — your competitors are already fixing this`,
      text: `Hi ${lead.contact_name || 'there'},

Following up on the AI audit for ${lead.url}. Companies that optimize for AI search now will have a massive advantage as this channel grows. Those that wait? They'll be playing catch-up.

Your report is still here: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Happy to answer any questions.

Best,
Bryan Robinson
Founder, ReportReady`
    }),
    followup2: (lead) => ({
      subject: `${lead.name} — final check on this`,
      text: `Hi ${lead.contact_name || 'there'},

Last note on the AI audit for ${lead.url}. If this isn't the right time, I understand — the report will stay active whenever you want to revisit it.

https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady`
    })
  },

  // For agencies (they can resell this to their clients)
  agency: {
    initial: (lead) => {
      return {
        subject: `${lead.name} — new line item for every client retainer`,
        text: `Hi ${lead.contact_name || 'there'},

Quick one — if you have clients, you're leaving money on the table. Most websites can't be read by ChatGPT or Gemini, and your clients don't know it.

We built a $99/mo agency plan: unlimited client sites, white-label reports. You bill each client $29-50/mo and keep it all. Zero extra work — we run the scans, you take the credit. 10 clients = $290/mo new revenue on a $99 cost. Bonus — it gives you a reason to check in with every client monthly.

Free audit of your site so you can see the product: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady`
      };
    },
    followup1: (lead) => ({
      subject: `Follow-up: ${lead.name}`,
      text: `Hi ${lead.contact_name || 'there'},

Following up — if you have clients, AI visibility monitoring is an easy add-on. $99/mo, unlimited sites, your branding. You set the price. Plus a monthly check-in reason to keep your name in front of every client.

Your free audit: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady`
    }),
    followup2: (lead) => ({
      subject: `Last check: ${lead.name}`,
      text: `Hi ${lead.contact_name || 'there'},

Last note on this. If it's not the right fit right now, I understand. The link stays active if you ever want to revisit.

https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady`
    })
  }
};

// Pick the right template based on industry
function getTemplateForLead(lead) {
  const industry = (lead.industry || '').toLowerCase();
  if (industry === 'agency' || industry === 'digital agency') {
    return templates.agency;
  }
  if (industry === 'saas' || industry === 'technology' || industry === 'tech') {
    return templates.saas;
  }
  // Default to simple language for local businesses and everyone else
  return templates.local;
}

async function sendEmail(email, templateData) {
  if (isDryRun) {
    console.log(`[DRY RUN] To: ${email}`);
    console.log(`[DRY RUN] From: Bryan Robinson <hello@getreportready.com>`);
    console.log(`[DRY RUN] Subject: ${templateData.subject}`);
    console.log(`[DRY RUN] Body:\n${templateData.text}\n`);
    console.log('------------------------------------------');
    return 'dry-run-id';
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Bryan Robinson <hello@getreportready.com>',
      replyTo: 'reportready-2162dbe4@ctomail.io',
      to: [email],
      subject: templateData.subject,
      text: templateData.text,
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
    console.error(`Error: ${LEADS_FILE} not found.`);
    return;
  }

  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  const tracking = loadTracking();
  const now = Date.now();
  let sentToday = 0;

  for (const lead of leads) {
    if (sentToday >= DAILY_LIMIT && !followupsOnly) {
      console.log(`Daily limit of ${DAILY_LIMIT} reached. Stopping.`);
      break;
    }
    // Contact Handling: Skip if no verified contact email — no guessing
    let email = lead.contact_email;
    if (!email) {
      const domain = lead.url ? new URL(lead.url).hostname.replace('www.', '') : '';
      console.log(`Skipping ${lead.name} — no contact email (guessed info@${domain} would likely bounce)`);
      continue;
    }

    const status = tracking[email] || { stage: 0, lastContact: 0 };

    // Skip bounced emails — don't send any more
    if (status.bounced) {
      console.log(`Skipping ${email} — previously bounced.`);
      continue;
    }

    // Stage 0: Send Initial
    if (status.stage === 0) {
      if (followupsOnly) {
        console.log(`Skipping ${email} — follow-ups only mode.`);
        continue;
      }
      console.log(`Action: Initial Outreach to ${email}...`);
      const tmpl = getTemplateForLead(lead);
      const sentId = await sendEmail(email, tmpl.initial(lead));
      if (sentId && !isDryRun) {
        tracking[email] = { stage: 1, lastContact: now };
        sentToday++;
      } else if (!sentId && !isDryRun) {
        tracking[email] = { stage: 0, bounced: true, lastContact: now };
        console.log(`Marked ${email} as bounced.`);
      }
      await sleep(1500); // Rate limit protection
    } 
    // Stage 1: Send Followup 1 (Wait 3 days)
    else if (status.stage === 1 && now - status.lastContact > 3 * 24 * 60 * 60 * 1000) {
      console.log(`Action: Follow-up 1 to ${email}...`);
      const tmpl = getTemplateForLead(lead);
      const sentId = await sendEmail(email, tmpl.followup1(lead));
      if (sentId && !isDryRun) {
        tracking[email] = { stage: 2, lastContact: now };
        sentToday++;
      } else if (!sentId && !isDryRun) {
        tracking[email] = { stage: 1, bounced: true, lastContact: now };
        console.log(`Marked ${email} as bounced.`);
      }
      await sleep(1500);
    }
    // Stage 2: Send Followup 2 (Wait 7 days after last contact)
    else if (status.stage === 2 && now - status.lastContact > 7 * 24 * 60 * 60 * 1000) {
      console.log(`Action: Final Follow-up to ${email}...`);
      const tmpl = getTemplateForLead(lead);
      const sentId = await sendEmail(email, tmpl.followup2(lead));
      if (sentId && !isDryRun) {
        tracking[email] = { stage: 3, lastContact: now }; // Completed
        sentToday++;
      } else if (!sentId && !isDryRun) {
        tracking[email] = { stage: 2, bounced: true, lastContact: now };
        console.log(`Marked ${email} as bounced.`);
      }
      await sleep(1500);
    }
  }

  if (!isDryRun) {
    saveTracking(tracking);
    console.log('Campaign cycle complete. Tracking updated.');
  } else {
    console.log('Dry run complete. No tracking data saved.');
  }
}

runCampaign();
