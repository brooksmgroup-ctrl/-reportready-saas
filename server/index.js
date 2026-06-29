

import express from 'express';
import cors from 'cors';
import { runAudit } from './audit.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// --- THIS IS YOUR WEBSITE CODE (HTML) ---
const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ReportReady | AI & SEO Audit</title>
    <style>
        body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; background: #f4f7f6; color: #333; }
        .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #e1e4e8; }
        h1 { color: #6a11cb; text-align: center; }
        .input-group { display: flex; gap: 10px; margin-top: 20px; }
        input { flex: 1; padding: 12px; border: 2px solid #ddd; border-radius: 6px; font-size: 16px; }
        button { padding: 12px 24px; background: #6a11cb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
        .results { margin-top: 30px; display: none; }
        .score-row { display: flex; justify-content: space-around; margin-bottom: 20px; }
        .score-box { text-align: center; border: 2px solid #6a11cb; padding: 15px; border-radius: 8px; min-width: 120px; }
        .score-val { font-size: 32px; font-weight: bold; color: #6a11cb; }
        .cta { background: #fff8e1; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #ffe082; }
    </style>
</head>
<body>
    <h1>ReportReady</h1>
    <p style="text-align:center;">Professional AI Readiness and SEO Audits</p>
    
    <div class="card">
        <div class="input-group">
            <input type="url" id="urlInput" placeholder="https://yourwebsite.com">
            <button onclick="runAudit()">Analyze</button>
        </div>
        <div id="loading" style="display:none; text-align:center; margin-top:20px;">Analyzing...</div>
        
        <div id="results" class="results">
            <div class="score-row">
                <div class="score-box">
                    <div>SEO Score</div>
                    <div id="seoScore" class="score-val">0</div>
                </div>
                <div class="score-box">
                    <div>AI Readiness</div>
                    <div id="aiScore" class="score-val">0</div>
                </div>
            </div>
            <div class="cta">
                <p><strong>Want the full technical report?</strong></p>
                <button onclick="alert('Pro Dashboard Coming Soon!')">Upgrade to Pro ($29/mo)</button>
            </div>
        </div>
    </div>

    <script>
        async function runAudit() {
            const url = document.getElementById('urlInput').value;
            const results = document.getElementById('results');
            const loading = document.getElementById('loading');
            if(!url) return alert("Enter a URL");

            loading.style.display = "block";
            results.style.display = "none";

            try {
                const response = await fetch('/api/audit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ url })
                });
                const data = await response.json();
                document.getElementById('seoScore').innerText = data.scores.seo;
                document.getElementById('aiScore').innerText = data.scores.aiReadiness;
                loading.style.display = "none";
                results.style.display = "block";
            } catch (err) {
                alert("Error: " + err.message);
                loading.style.display = "none";
            }
        }
    </script>
</body>
</html>
`;

// --- SERVER ROUTES ---
app.get('/', (req, res) => res.send(HTML_PAGE));

app.post('/api/audit', async (req, res) => {
  try {
    const { url } = req.body;
    const report = await runAudit(url);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log('Server running on ' + PORT));
