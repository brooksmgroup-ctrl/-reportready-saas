import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

// Explicitly attach the autoTable plugin to jsPDF (required for ESM)
applyPlugin(jsPDF);

const ALL_AI_CRAWLERS = [
  { agent: 'GPTBot', label: 'ChatGPT / OpenAI' },
  { agent: 'Claude-Web', label: 'Claude (Anthropic)' },
  { agent: 'Google-Extended', label: 'Google AI / Gemini' },
  { agent: 'PerplexityBot', label: 'Perplexity AI' },
  { agent: 'CCBot', label: 'Common Crawl (AI training)' },
];

function grade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function recommendationFor(issue) {
  if (issue.category === 'AI Readiness' && issue.message.includes('robots.txt')) return 'Remove AI crawler blocks from robots.txt';
  if (issue.category === 'AI Readiness') return 'Add Schema Markup (JSON-LD) to your homepage';
  if (issue.category === 'SEO' && issue.message.includes('title')) return 'Add a clear, descriptive page title (30–60 chars)';
  if (issue.category === 'SEO' && issue.message.includes('summary')) return 'Add a meta description tag (120–160 chars)';
  if (issue.category === 'SEO') return 'Use exactly one H1 heading per page';
  if (issue.category === 'Performance') return 'Reduce page load time: compress images, minimise scripts';
  if (issue.category === 'Accessibility') return 'Add alt text to all images and set a lang attribute on <html>';
  return issue.message;
}

export function generatePDF(reportData, signature = '') {
  const doc = new jsPDF();
  const blocked = reportData.aiCrawlersBlocked || [];
  const issues = reportData.issues || [];
  let y = 20;

  // ─── Header ──────────────────────────────────────
  doc.setFontSize(22);
  doc.setTextColor(34, 197, 94);
  doc.text('ReportReady Audit Report', 20, y);
  y += 10;

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text(`URL: ${reportData.url}`, 20, y);
  y += 7;
  doc.text(`Date: ${new Date(reportData.timestamp).toLocaleString()}`, 20, y);
  y += 14;

  // ─── Scores with Grades ───────────────────────────
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Scores', 20, y);
  y += 8;

  const scoreData = Object.entries(reportData.scores).map(([key, value]) => [
    key === 'aiReadiness' ? 'AI Readiness' : key.charAt(0).toUpperCase() + key.slice(1),
    value.toString(),
    grade(value)
  ]);

  doc.autoTable({
    startY: y,
    head: [['Category', 'Score', 'Grade']],
    body: scoreData,
    theme: 'striped'
  });
  y = doc.lastAutoTable.finalY + 14;

  // ─── AI Crawler Access ────────────────────────────
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('AI Crawler Access', 20, y);
  y += 8;

  const blockedSet = new Set(blocked);
  if (blockedSet.size === 0) {
    doc.setFontSize(12);
    doc.setTextColor(34, 197, 94);
    doc.text('All major AI crawlers are allowed — your site is visible to AI search.', 20, y);
    y += 12;
  } else {
    const crawlerRows = ALL_AI_CRAWLERS.map(c => [
      c.label,
      blockedSet.has(c.label) ? 'Blocked' : 'Allowed'
    ]);
    doc.autoTable({
      startY: y,
      head: [['AI Crawler', 'Status']],
      body: crawlerRows,
      theme: 'striped'
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // ─── Issues ───────────────────────────────────────
  if (issues.length > 0) {
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('Issues Identified', 20, y);
    y += 8;

    const issueData = issues.map(i => [
      i.category,
      i.message.length > 80 ? i.message.substring(0, 77) + '...' : i.message,
      i.severity
    ]);
    doc.autoTable({
      startY: y,
      head: [['Category', 'Description', 'Severity']],
      body: issueData,
      theme: 'grid',
      headStyles: { fillColor: [170, 59, 255] }
    });
    y = doc.lastAutoTable.finalY + 14;
  } else {
    doc.setFontSize(12);
    doc.setTextColor(34, 197, 94);
    doc.text('No issues found — your site is fully optimised.', 20, y);
    y += 12;
  }

  // ─── Recommendations ──────────────────────────────
  if (issues.length > 0) {
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('Recommendations', 20, y);
    y += 8;

    const recs = issues.map((i, idx) => [
      (idx + 1).toString(),
      recommendationFor(i)
    ]);
    doc.autoTable({
      startY: y,
      head: [['#', 'Recommended Fix']],
      body: recs,
      theme: 'plain',
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 160 } }
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // ─── Monthly Re-Audit ─────────────────────────────
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text('ReportReady re-audits your site every month. AI search changes fast — stay visible.', 20, y);
  y += 8;

  // ─── Signature ────────────────────────────────────
  if (signature) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(signature, 20, 278);
    }
  }

  // ─── Footer ───────────────────────────────────────
  const pageCountFinal = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCountFinal; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Page ${i} of ${pageCountFinal} - Generated by ReportReady`, 20, 285);
  }

  return doc.output('arraybuffer');
}
