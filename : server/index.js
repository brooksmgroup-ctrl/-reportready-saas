
import express from 'express';
import cors from 'cors';
import { runAudit } from './audit.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// THIS IS YOUR WEBSITE CODE
const HTML_PAGE = `
<!DOCTYPE html>
<html>
<head>
    <title>ReportReady | AI Audit</title>
    <style>
        body { font-family: sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; line-height: 1.6; }
        .card { border: 1px solid #ddd; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        input { width: 70%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; }
        button { padding: 10px 20px; background: #6a11cb; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .score-box { display: inline-block; background: #f4f4f4; padding: 10px; margin: 10px; border-radius: 4px; font-weight: bold; }
    </style>
</head>
<body>
    <h1>ReportReady</h1>
    <p>See how your website looks to AI search engines.</p>
    <div class="card">
        <input type="url" id="urlInput" placeholder="https://yourwebsite.com">
        <button onclick="runAudit()">Analyze Site</button>
        <div id="results" style="margin-top: 20px;"></div>
    </div>

    <script>
        async function runAudit() {
            const url = document.getElementById('urlInput').value;
            const resDiv = document.getElementById('results');
            resDiv.innerHTML = "Analyzing... please wait.";
            
            try {
                const response = await fetch('/api/audit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const data = await response.json();
                
                resDiv.innerHTML = '<h2>Results for ' + data.url + '</h2>' +
                    '<div class="score-box">SEO: ' + data.scores.seo + '</div>' +
                    '<div class="score-box">AI Readiness: ' + data.scores.aiReadiness + '</div>' +
                    '<h3>Next Steps:</h3><p>Upgrade to Pro to download your full PDF report.</p>';
            } catch (err) {
                resDiv.innerHTML = "Error: " + err.message;
            }
        }
    </script>
</body>
</html>
`;

// Serve the website
app.get('/', (req, res) => res.send(HTML_PAGE));

// Handle the audit
app.post('/api/audit', async (req, res) => {
  const { url } = req.body;
  try {
    const report = await runAudit(url);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log('Server live on ' + PORT));

