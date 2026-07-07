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
        subject: `${lead.name} — Quick Website Check`,
        text: `Hi there,

I ran a quick check on ${lead.url} to see if it's showing up when people use ChatGPT to find businesses like yours.

Your score is ${aiScore}/100. That means some things might be stopping AI from showing your business to potential customers.

Here's your free report with the fixes: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
      };
    },
    followup1: (lead) => ({
      subject: `Follow-up: ${lead.name}`,
      text: `Hi there,

Just checking back on the website check I sent for ${lead.url}.

More people are using ChatGPT to find local businesses every day. If your site isn't set up right, they just won't see you.

Your free report is still here: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
    }),
    followup2: (lead) => ({
      subject: `Last check: ${lead.name}`,
      text: `Hi there,

Last note about the website check for ${lead.url}. If this isn't a priority right now, no problem — the report stays active if you ever want to check it later.

https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
    })
  },

  // For SaaS and tech companies
  saas: {
    initial: (lead) => {
      const aiScore = getAiScore(lead);
      return {
        subject: `${lead.name} — AI Readiness Check`,
        text: `Hi there,

I ran a quick technical audit on ${lead.url} to see how well it's set up for AI search and discovery.

Your current AI-readiness score is ${aiScore}/100. Here's a link to the full report with specific findings: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
      };
    },
    followup1: (lead) => ({
      subject: `Quick follow-up: ${lead.name}`,
      text: `Hi there,

Just checking back on the AI audit for ${lead.url}. With AI search growing fast, making sure your site is discoverable by these tools is becoming increasingly important.

Your report is still available here: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
    }),
    followup2: (lead) => ({
      subject: `Last check: ${lead.name}`,
      text: `Hi there,

Final note on the AI audit for ${lead.url}. If this isn't a priority right now, no problem — the report link stays active.

https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
    })
  },

  // For agencies (they can resell this to their clients)
  agency: {
    initial: (lead) => {
      return {
        subject: `${lead.name} — New service your clients need`,
        text: `Hi there,

I checked ${lead.url} and noticed something interesting — your clients are probably invisible to AI search.

Most websites can't be read by ChatGPT or Google AI. That means your clients are missing out on a growing source of traffic, and they probably don't even know it.

We offer a simple $99/mo plan that monitors unlimited client sites. You can bill each client $29-50/mo and keep the profit. Here's a free audit of your own site so you can see what we're talking about: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
      };
    },
    followup1: (lead) => ({
      subject: `Follow-up: ${lead.name}`,
      text: `Hi there,

Just checking back. We help agencies like yours offer AI visibility monitoring to clients. It's a $29/mo service you can resell — no extra work for your team.

Your free audit is still here: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
    }),
    followup2: (lead) => ({
      subject: `Last check: ${lead.name}`,
      text: `Hi there,

Last note on this. If offering AI visibility monitoring to your clients isn't the right fit right now, I understand. The link stays active if you ever want to revisit.

https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
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
  if (!fs.existsSync(LEADS_FILE)) {
    console.error(`Error: ${LEADS_FILE} not found.`);
    return;
  }

  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  const tracking = loadTracking();
  const now = Date.now();
  let sentToday = 0;

  for (const lead of leads) {
    if (sentToday >= DAILY_LIMIT) {
      console.log(`Daily limit of ${DAILY_LIMIT} reached. Stopping.`);
      break;
    }
    // Contact Handling: Use contact_email if present, otherwise fallback
    let email = lead.contact_email;
    if (!email) {
      try {
        const domain = new URL(lead.url).hostname.replace('www.', '');
        email = `info@${domain}`;
      } catch (e) {
        console.warn(`Invalid URL for lead ${lead.name}: ${lead.url}`);
        continue;
      }
    }

    const status = tracking[email] || { stage: 0, lastContact: 0 };

    // Skip bounced emails — don't send any more
    if (status.bounced) {
      console.log(`Skipping ${email} — previously bounced.`);
      continue;
    }

    // Stage 0: Send Initial
    if (status.stage === 0) {
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
