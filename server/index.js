import express from 'express';
import cors from 'cors';
import { runAudit } from './audit.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ReportReady | AI & SEO Audit</title>
    <style>
        body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; background: #f8fafc; color: #1e293b; }
        .header { text-align: center; margin-bottom: 40px; }
        h1 { color: #4f46e5; font-size: 2.5rem; margin-bottom: 10px; }
        .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
        .input-group { display: flex; gap: 12px; margin-bottom: 24px; }
        input { flex: 1; padding: 14px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 16px; outline: none; transition: border-color 0.2s; }
        input:focus { border-color: #4f46e5; }
        button { padding: 14px 28px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 16px; transition: background 0.2s; }
        button:hover { background: #4338ca; }
        .results { margin-top: 40px; display: none; border-top: 2px solid #f1f5f9; padding-top: 30px; }
        .score-container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .score-box { text-align: center; padding: 24px; border-radius: 12px; background: #fdf2f8; border: 2px solid #ec4899; }
        .score-box.seo { background: #eff6ff; border: 2px solid #3b82f6; }
        .score-label { font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px; }
        .score-value { font-size: 48px; font-weight: 800; color: #1e293b; }
        .fix-it-banner { background: #1e293b; color: white; padding: 30px; border-radius: 12px; text-align: center; margin-top: 20px; }
        .fix-it-banner h3 { color: #f472b6; margin-top: 0; }
        .cta-btn { background: #ec4899; border: none; padding: 16px 32px; font-size: 18px; margin-top: 15px; }
        .cta-btn:hover { background: #db2777; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ReportReady</h1>
        <p>Technical AI Audit & SEO Verification</p>
    </div>

    <div class="card">
        <div class="input-group">
            <input type="url" id="urlInput" placeholder="Enter website (e.g. https://yoursite.com)">
            <button id="btn" onclick="runAudit()">Run Audit</button>
        </div>
        <div id="loading" style="display:none; text-align:center; font-weight:600; color: #4f46e5;">Scanning site architecture...</div>

        <div id="results" class="results">
            <div class="score-container">
                <div class="score-box seo">
                    <div class="score-label">Traditional SEO Score</div>
                    <div id="seoScore" class="score-value">0</div>
                </div>
                <div class="score-box">
                    <div class="score-label">AI Readiness (GEO)</div>
                    <div id="aiScore" class="score-value">0</div>
                </div>
            </div>
            
            <div class="fix-it-banner">
                <h3>⚠️ Critical Issues Detected</h3>
                <p>AI search models (ChatGPT/Gemini) cannot properly index your business data. This leads to lost revenue from modern searchers.</p>
                <button class="cta-btn" onclick="window.location.href='mailto:hello@getreportready.com?subject=SEO Fix Request&body=I just ran an audit on my site and want you to fix the issues.'">Have Us Fix This For You</button>
                <p style="font-size: 12px; margin-top: 15px; opacity: 0.8;">Most fixes completed within 48 hours.</p>
            </div>
        </div>
    </div>

    <script>
        async function runAudit() {
            const url = document.getElementById('urlInput').value;
            if(!url) return alert("Please enter a URL");
            
            document.getElementById('loading').style.display = "block";
            document.getElementById('results').style.display = "none";
            document.getElementById('btn').disabled = true;

            try {
                const res = await fetch('/api/audit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ url })
                });
                const data = await res.json();
                
                document.getElementById('seoScore').innerText = data.scores.seo + "/100";
                document.getElementById('aiScore').innerText = data.scores.aiReadiness + "/100";
                document.getElementById('loading').style.display = "none";
                document.getElementById('results').style.display = "block";
            } catch (err) {
                alert("Scan failed. Ensure URL is correct.");
                document.getElementById('loading').style.display = "none";
            } finally {
                document.getElementById('btn').disabled = false;
            }
        }
    </script>
</body>
</html>
`;

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
app.listen(PORT, () => console.log('Live on ' + PORT));
