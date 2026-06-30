import { Resend } from 'resend';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const TRACKER_FILE = 'outreach_tracking.json';

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

// Email Templates
const templates = {
  initial: (lead) => ({
    subject: `Technical Audit: ${lead.name} Website Improvement`,
    text: `Hi ${lead.name} Team,

I recently ran a technical audit of your site (${lead.url}) regarding its SEO and AI Readiness. Your current AI score is ${lead.scores.aiReadiness}/100.

You can view the specific technical fixes here: https://reportready-audit.loca.lt

Best,
The ReportReady Team`
  }),
  followup1: (lead) => ({
    subject: `Checking back: ${lead.name} Audit`,
    text: `Hi ${lead.name} Team,

I'm just checking back to see if you had a chance to look at the technical fixes I suggested for your site. Many local businesses are currently losing traffic to AI platforms like ChatGPT because they lack specific hidden code (Schema Markup).

The fixes are still available for you here: https://reportready-audit.loca.lt

If you need a hand implementing these, just let me know!

Best,
The ReportReady Team`
  }),
  followup2: (lead) => ({
    subject: `Final Check-in: ${lead.name} Audit`,
    text: `Hi ${lead.name} Team,

I'll keep this brief. I wanted to send one final check-in regarding the technical audit for ${lead.url}. 

I'll assume you're either handling these updates internally or they aren't a priority right now, so I won't reach out again. If you ever need the professional PDF guide or help with the fixes, the link remains active: https://reportready-audit.loca.lt

Wishing you much success!

Best,
The ReportReady Team`
  })
};

async function sendEmail(email, templateData) {
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
  const leads = JSON.parse(fs.readFileSync('final_leads.json', 'utf8'));
  const tracking = loadTracking();
  const now = Date.now();

  for (const lead of leads) {
    const email = `info@${new URL(lead.url).hostname.replace('www.', '')}`;
    const status = tracking[email] || { stage: 0, lastContact: 0 };

    // Stage 0: Send Initial
    if (status.stage === 0) {
      console.log(`Sending Initial Outreach to ${email}...`);
      const sentId = await sendEmail(email, templates.initial(lead));
      if (sentId) {
        tracking[email] = { stage: 1, lastContact: now };
      }
    } 
    // Stage 1: Send Followup 1 (Wait 3 days = 259200000ms)
    else if (status.stage === 1 && now - status.lastContact > 3 * 24 * 60 * 60 * 1000) {
      console.log(`Sending Follow-up 1 to ${email}...`);
      const sentId = await sendEmail(email, templates.followup1(lead));
      if (sentId) {
        tracking[email] = { stage: 2, lastContact: now };
      }
    }
    // Stage 2: Send Followup 2 (Wait 7 days after last contact = 604800000ms)
    else if (status.stage === 2 && now - status.lastContact > 7 * 24 * 60 * 60 * 1000) {
      console.log(`Sending Final Follow-up to ${email}...`);
      const sentId = await sendEmail(email, templates.followup2(lead));
      if (sentId) {
        tracking[email] = { stage: 3, lastContact: now }; // Completed
      }
    }
  }

  saveTracking(tracking);
  console.log('Campaign cycle complete.');
}

runCampaign();
