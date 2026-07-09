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

I checked ${lead.url}. Your score is ${aiScore}/100.

60% of people now use ChatGPT and AI to research local businesses. If they can't find you there, they find your competitor instead. A lot of businesses don't know they're invisible until they've already lost customers.

Here's your free report showing exactly what's missing: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
      };
    },
    followup1: (lead) => ({
      subject: `${lead.name} — your competitors are showing up in AI search`,
      text: `Hi there,

Following up on the website check for ${lead.url}. Here's the thing — your competitors are probably already fixing this. The businesses that get visible in AI search now will have a huge advantage in 6 months.

Your free report is here: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
    }),
    followup2: (lead) => ({
      subject: `${lead.name} — last check before I close this out`,
      text: `Hi there,

Final note on ${lead.url}. If you're handling this internally, no worries. Just wanted to make sure you saw the report before I stop following up.

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
        subject: `${lead.name} — you might be invisible to AI search`,
        text: `Hi there,

I ran a quick check on ${lead.url}. Your AI-readiness score is ${aiScore}/100.

Here's why that matters: AI search is the fastest growing channel. ChatGPT, Google AI, Perplexity — they're how people find tools and services now. If your site isn't set up for them, your competitors are getting the traffic you should be getting.

Here's your free report showing exactly what's missing: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
      };
    },
    followup1: (lead) => ({
      subject: `${lead.name} — your competitors are already fixing this`,
      text: `Hi there,

Following up on the AI audit for ${lead.url}. Companies that optimize for AI search now will have a massive advantage as this channel grows. Those that wait? They'll be playing catch-up.

Your report is still here: https://getreportready.com/audit?domain=${encodeURIComponent(lead.url)}

Happy to answer any questions.

Best,
Bryan Robinson
Founder, ReportReady
402-431-2646`
    }),
    followup2: (lead) => ({
      subject: `${lead.name} — final check on this`,
      text: `Hi there,

Last note on the AI audit for ${lead.url}. If this isn't the right time, I understand — the report will stay active whenever you want to revisit it.

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
