
import express from 'express';
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>ReportReady | Professional Website Audits</title></head>
      <body style="font-family: sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; line-height: 1.6; color: #333;">
        <h1 style="color: #2563eb;">ReportReady</h1>
        <p><strong>Professional SEO, AI Readiness, and Accessibility Audits for Local Businesses.</strong></p>
        <hr />
        <h3>Our Services:</h3>
        <ul>
          <li><strong>Free Basic Audit:</strong> Real-time scan of site performance and SEO.</li>
          <li><strong>ReportReady Pro ($29.00/mo):</strong> Downloadable white-labeled PDF reports, competitor comparisons, and detailed fix guides.</li>
          <li><strong>Implementation Services:</strong> Custom quotes for technical SEO and AI-optimization fixes.</li>
        </ul>
        <h3>Contact Us:</h3>
        <p>Questions? Reach us at: <strong>hello@getreportready.com</strong></p>
        <p style="color: #666; font-size: 0.8rem;">© 2024 ReportReady. All rights reserved.</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => console.log('Server running'));
