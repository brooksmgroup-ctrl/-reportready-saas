import { Resend } from 'resend';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

// Template for the outreach email
function createEmailTemplate(lead) {
  return `
    Hi ${lead.name} Team,

    I am reaching out from ReportReady with a quick technical observation regarding how your business appears to AI platforms like ChatGPT, Gemini, and Perplexity.

    We recently ran an automated "AI Readiness" audit for your website (${lead.url}). As search moves away from traditional lists and toward AI-generated recommendations, it's critical that your site code is readable by these new platforms.

    Your Current AI Readiness Score: ${lead.scores.aiReadiness}/100
    Your Traditional SEO Score: ${lead.scores.seo}/100

    Specifically, your site is missing JSON-LD Schema Markup, which is the "language" AI bots use to verify your services and location. 

    I've put together a full report with suggested fixes for this and other technical issues here: https://getreportready.com

    My goal is to help local businesses stay ahead of this technology shift. You're welcome to use these suggestions to update your site yourself, or we are happy to assist if you'd prefer a professional to handle the AI optimization for you.

    Best regards,
    The ReportReady Team
    reportready-2162dbe4@ctomail.io

    ---
    If you'd prefer not to receive further site audits from us, please reply with "Unsubscribe".
  `;
}

async function sendOutreach(leadEmail, leadData) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'ReportReady <reportready-2162dbe4@ctomail.io>', 
      to: [leadEmail],
      subject: `SEO Alert: Critical issues found on ${leadData.name}`,
      text: createEmailTemplate(leadData),
    });

    if (error) {
      return console.error({ error });
    }

    console.log(`Email sent successfully to ${leadEmail}:`, data.id);
  } catch (err) {
    console.error(`Failed to send email to ${leadEmail}:`, err.message);
  }
}

// Example usage: Process results and send
const results = JSON.parse(fs.readFileSync('final_leads.json', 'utf8'));

async function processAllEmails() {
  console.log(`Starting official outreach campaign for ${results.length} leads...`);
  
  for (const lead of results) {
    // We'll use a generic info@ for this batch demo
    const email = `info@${new URL(lead.url).hostname.replace('www.', '')}`;
    console.log(`Sending to: ${email}...`);
    await sendOutreach(email, lead);
  }

  console.log('Official outreach process finished.');
}

// processAllEmails();
