import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const resend = new Resend(process.env.RESEND_API_KEY);

async function fetchEmailStats() {
  console.log('Fetching email analytics from Resend...\n');

  let allEmails = [];
  let page = 0;
  const perPage = 100;

  // Fetch all emails (paginated)
  while (true) {
    const { data, error } = await resend.emails.list({ limit: perPage, offset: page * perPage });
    if (error) {
      // Try alternate syntax
      break;
    }
    if (!data || data.length === 0) break;
    allEmails = allEmails.concat(data);
    if (data.length < perPage) break;
    page++;
  }

  console.log(`Total emails retrieved: ${allEmails.length}\n`);

  // Group by subject line
  const groups = {};
  for (const email of allEmails) {
    const subj = email.subject || '(no subject)';
    if (!groups[subj]) {
      groups[subj] = { sent: 0, opened: 0, clicked: 0, lastEvent: email.last_event };
    }
    groups[subj].sent++;

    // Fetch individual email stats for open/click data
    try {
      const { data: detail } = await resend.emails.get(email.id);
      if (detail) {
        if (detail.opened_at || detail.last_opened_at) groups[subj].opened++;
        if (detail.clicked_at || detail.last_clicked_at) groups[subj].clicked++;
      }
    } catch (e) {
      // skip individual fetch errors
    }
  }

  // Print report
  console.log('='.repeat(70));
  console.log('COLD EMAIL ANALYTICS — Per Template');
  console.log('='.repeat(70));
  console.log('');

  const sorted = Object.entries(groups).sort((a, b) => b[1].sent - a[1].sent);
  for (const [subject, stats] of sorted) {
    const openRate = stats.sent > 0 ? ((stats.opened / stats.sent) * 100).toFixed(1) : '0.0';
    const clickRate = stats.sent > 0 ? ((stats.clicked / stats.sent) * 100).toFixed(1) : '0.0';
    console.log(`Subject: "${subject}"`);
    console.log(`  Sent:   ${stats.sent}`);
    console.log(`  Opened: ${stats.opened} (${openRate}%)`);
    console.log(`  Clicked: ${stats.clicked} (${clickRate}%)`);
    console.log('');
  }

  // Summary
  const totalSent = sorted.reduce((s, [, st]) => s + st.sent, 0);
  const totalOpened = sorted.reduce((s, [, st]) => s + st.opened, 0);
  const totalClicked = sorted.reduce((s, [, st]) => s + st.clicked, 0);
  const overallOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0.0';
  const overallClickRate = totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : '0.0';

  console.log('='.repeat(70));
  console.log('OVERALL');
  console.log(`Total sent:    ${totalSent}`);
  console.log(`Total opened:  ${totalOpened} (${overallOpenRate}%)`);
  console.log(`Total clicked: ${totalClicked} (${overallClickRate}%)`);
  console.log('='.repeat(70));

  return { groups, totalSent, totalOpened, totalClicked };
}

fetchEmailStats().catch(err => {
  console.error('Analytics fetch failed:', err.message);
  process.exit(1);
});
