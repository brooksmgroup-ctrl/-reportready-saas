import { Resend } from 'resend';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Check for dry run mode
const isDryRun = process.argv.includes('--dry-run');

const resend = (!isDryRun || process.env.RESEND_API_KEY) ? new Resend(process.env.RESEND_API_KEY || 'dummy_key') : null;
const TRACKER_FILE = 'outreach_tracking.json';
const LEADS_FILE = 'final_leads.json';

if (isDryRun) {
  console.log('--- DRY RUN MODE ACTIVE ---');
  console.log('Emails will be logged to console instead of sent.\n');
}

// Load tracking data
function loadTracking() {
  if (fs.existsSync(TRACKER_FILE)) {
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  }
  return {};
}

// Save tracking data
function saveTracking(data) {
  if (!isDryRun) {
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
  }
}

// Helper to format issues for email
function formatIssues(issues) {
  if (!issues || issues.length === 0) return "No specific issues identified.";
  return issues.map(i => `• ${i.message}`).join('\n');
}

// Helper to get score
function getAiScore(lead) {
  return lead.scores.aiReadiness || Math.round((lead.scores.seo + lead.scores.accessibility) / 2) || 0;
}

// Email Templates
const templates = {
  initial: (lead) => {
    const aiScore = getAiScore(lead);
    const issuesText = formatIssues(lead.issues);
    return {
      subject: `Technical Audit: ${lead.name} Website AI-Readiness`,
      text: `Hi ${lead.name} Team,

I recently ran a technical audit of your site (${lead.url}) regarding its SEO and AI Discovery readiness. Your current AI score is ${aiScore}/100.

We identified several 'AI-blind spots' that could be preventing LLMs like ChatGPT and Claude from accurately recommending your services:
${issuesText}

You can view the full technical breakdown and actionable fixes here: https://getreportready.com

Best,
The ReportReady Team`
    };
  },
  followup1: (lead) => ({
    subject: `Checking back: ${lead.name} Audit`,
    text: `Hi ${lead.name} Team,

I'm just checking back to see if you had a chance to look at the technical fixes I suggested for your site. 

Many businesses are currently losing traffic to AI platforms because they lack specific hidden data (like Schema Markup) that these bots rely on to understand your site structure.

The full report is still available for you here: https://getreportready.com

If you need a hand implementing these, just let me know!

Best,
The ReportReady Team`
  }),
  followup2: (lead) => ({
    subject: `Final Check-in: ${lead.name} Audit`,
    text: `Hi ${lead.name} Team,

I'll keep this brief. I wanted to send one final check-in regarding the technical audit for ${lead.url}. 

I'll assume you're either handling these updates internally or they aren't a priority right now, so I won't reach out again. If you ever need the professional PDF guide or help with the fixes, the link remains active: https://getreportready.com

Wishing you much success!

Best,
The ReportReady Team`
  })
};

async function sendEmail(email, templateData) {
  if (isDryRun) {
    console.log(`[DRY RUN] To: ${email}`);
    console.log(`[DRY RUN] From: ReportReady <hello@getreportready.com>`);
    console.log(`[DRY RUN] Subject: ${templateData.subject}`);
    console.log(`[DRY RUN] Body:\n${templateData.text}\n`);
    console.log('------------------------------------------');
    return 'dry-run-id';
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'ReportReady <hello@getreportready.com>',
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

  for (const lead of leads) {
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

    // Stage 0: Send Initial
    if (status.stage === 0) {
      console.log(`Action: Initial Outreach to ${email}...`);
      const sentId = await sendEmail(email, templates.initial(lead));
      if (sentId && !isDryRun) {
        tracking[email] = { stage: 1, lastContact: now };
      }
    } 
    // Stage 1: Send Followup 1 (Wait 3 days = 259200000ms)
    else if (status.stage === 1 && now - status.lastContact > 3 * 24 * 60 * 60 * 1000) {
      console.log(`Action: Follow-up 1 to ${email}...`);
      const sentId = await sendEmail(email, templates.followup1(lead));
      if (sentId && !isDryRun) {
        tracking[email] = { stage: 2, lastContact: now };
      }
    }
    // Stage 2: Send Followup 2 (Wait 7 days after last contact = 604800000ms)
    else if (status.stage === 2 && now - status.lastContact > 7 * 24 * 60 * 60 * 1000) {
      console.log(`Action: Final Follow-up to ${email}...`);
      const sentId = await sendEmail(email, templates.followup2(lead));
      if (sentId && !isDryRun) {
        tracking[email] = { stage: 3, lastContact: now }; // Completed
      }
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
