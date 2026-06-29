
import express from 'express';
import cors from 'cors';
import { runAudit } from './audit.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// THIS IS YOUR WEBSITE INTERFACE
const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ReportReady | AI & SEO Audit</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; background-color: #f9f9f9; color: #333; }
        .header { text-align: center; margin-bottom: 50px; }
        h1 { color: #6a11cb; font-size: 2.5rem; margin-bottom: 10px; }
        .card { background: white; border: 1px solid #e1e4e8; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .input-group { display: flex; gap: 10px; margin-bottom: 20px; }
        input { flex: 1; padding: 12px 15px; border: 2px solid #ddd; border-radius: 6px; font-size: 1rem; transition: border-color 0.2s; }
        input:focus { border-color: #6a11cb; outline: none; }
        button { padding: 12px 25px; background: #6a11cb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; font-weight: 600; transition: background 0.2s; }
        button:hover { background: #5a0eb4; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        .results-section { margin-top: 30px; display: none; }
        .score-container { display: flex; gap: 20px; margin-bottom: 30px; justify-content: center; }
        .score-box { background: #fff; border: 2px solid #6a11cb; padding: 20px; border-radius: 10px; text-align: center; min-width: 150px; }
        .score-box h3 { margin: 0 0 10px 0; font-size: 0.9rem; text-transform: uppercase; color: #666; }
        .score-value { font-size: 2.5rem; font-weight: bold; color: #6a11cb; }
        .pro-cta { background: #fff8e1; border: 1px solid #ffe082; padding: 20px; border-radius: 8px; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ReportReady</h1>
        <p>Ensure your business is ready for the AI search revolution.</p>
    </div>

    <div class="card">
        <div class="input-group">
            <input type="url" id="urlInput" placeholder="https://yourbusiness.com" required>
            <button id="auditBtn" onclick="runAudit()">Analyze Site</button>
        </div>
        <div id="loading" style="display:none; text-align: center;">Analyzing technical data...</div>
        
        <div id="results" class="results-section">
            <h2 id="resultUrl" style="text-align: center; margin-bottom: 20px;"></h2>
            <div class="score-container">
                <div class="score-box">
                    <h3>SEO Score</h3>
                    <div id="seoScore" class="score-value">0</div>
                </div>
                <div class="score-box">
                    <h3>AI Readiness</h3>
                    <div id="aiScore" class="score-value">0</div>
                </div>
            </div>
            <div class="pro-cta">
                <p><strong>Want the full technical breakdown?</strong></p>
                <p>Upgrade to Pro to see missing Schema tags, broken links, and download your branded PDF report.</p>
                <button onclick="alert('Payment system coming soon!')">Upgrade to Pro ($29/mo)</button>
            </div>
        </div>
    </div>

    <script>
        async function runAudit() {
            const urlInput = document.getElementById('urlInput');
            const auditBtn = document.getElementById('auditBtn');
            const results = document.getElementById('results');
            const loading = document.getElementById('loading');
            
            if (!urlInput.value) return alert("Please enter a URL");
            
            loading.style.display = "block";
            results.style.display = "none";
            auditBtn.disabled = true;
            
            try {
                const response = await fetch('/api/audit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: urlInput.value })
                });
                
                const data = await response.json();
                
                if (data.error) throw new Error(data.error);

                document.getElementById('resultUrl').innerText = "Results for " + data.url;
                document.getElementById('seoScore').innerText = data.scores.seo;
                document.getElementById('aiScore').innerText = data.scores.aiReadiness;
                
                loading.style.display = "none";
                results.style.display = "block";
            } catch (err) {
                alert("Audit failed: " + err.message);
                loading.style.display = "none";
            } finally {
                auditBtn.disabled = false;
            }
        }
    </script>
</body>
</html>
`;

// ROUTING
app.get('/', (req, res) => res.send(HTML_PAGE));

app.post('/api/audit', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  
  try {
    const report = await runAudit(url);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log('Server live on port ' + PORT));
