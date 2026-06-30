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
    <title>ReportReady | Competitive AI Audit</title>
    <style>
        body { font-family: -apple-system, sans-serif; max-width: 1000px; margin: 0 auto; padding: 40px 20px; background: #f0f2f5; color: #1a1a1a; }
        .header { text-align: center; margin-bottom: 40px; }
        h1 { color: #4f46e5; font-size: 2.8rem; }
        .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.1); }
        .input-container { display: flex; flex-direction: column; gap: 15px; margin-bottom: 30px; }
        input { padding: 16px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 16px; width: 100%; box-sizing: border-box; }
        .btn-main { padding: 18px; background: #4f46e5; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 800; font-size: 18px; transition: 0.3s; }
        .btn-main:hover { background: #4338ca; transform: translateY(-2px); }
        .comparison-grid { display: none; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 40px; border-top: 2px solid #eee; pt: 30px; }
        .report-box { padding: 25px; border-radius: 15px; text-align: center; border: 3px solid transparent; }
        .report-box.you { background: #eff6ff; border-color: #3b82f6; }
        .report-box.competitor { background: #fff1f2; border-color: #f43f5e; }
        .score-val { font-size: 56px; font-weight: 900; margin: 10px 0; }
        .insight-banner { grid-column: span 2; background: #1e293b; color: white; padding: 25px; border-radius: 15px; text-align: center; margin-top: 20px; }
        .insight-banner h3 { color: #fbbf24; margin: 0 0 10px 0; }
        .fix-btn { background: #f43f5e; color: white; padding: 16px 32px; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; margin-top: 15px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ReportReady</h1>
        <p>AI-Readiness Gap Analysis for Local Business</p>
    </div>

    <div class="card">
        <div class="input-container">
            <label><strong>Your Website:</strong></label>
            <input type="url" id="userUrl" placeholder="https://yourwebsite.com">
            <label><strong>Competitor Website (Optional):</strong></label>
            <input type="url" id="compUrl" placeholder="https://competitor.com">
            <button class="btn-main" onclick="runAnalysis()">Generate Comparison Report</button>
        </div>
        <div id="loading" style="display:none; text-align:center;">🔍 Running deep scan of both architectures...</div>

        <div id="results" class="comparison-grid">
            <div class="report-box you">
                <h3>YOUR SITE</h3>
                <div class="score-val" id="userScore">0</div>
                <p>AI Readiness Score</p>
            </div>
            <div class="report-box competitor">
                <h3>COMPETITOR</h3>
                <div class="score-val" id="compScore">0</div>
                <p>AI Readiness Score</p>
            </div>
            <div class="insight-banner">
                <h3>🚨 Competitive Gap Detected</h3>
                <p id="insightText">Your site is technically invisible to new Generative AI search models compared to your rival.</p>
                <button class="fix-btn" onclick="window.location.href='mailto:hello@getreportready.com?subject=SEO Fix Request'">Bridge The Gap & Beat Competitors</button>
            </div>
        </div>
    </div>

    <script>
        async function runAnalysis() {
            const userUrl = document.getElementById('userUrl').value;
            const compUrl = document.getElementById('compUrl').value;
            if(!userUrl) return alert("Please enter your URL");

            document.getElementById('loading').style.display = "block";
            document.getElementById('results').style.display = "none";

            try {
                // Fetch User Audit
                const res1 = await fetch('/api/audit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ url: userUrl })
                });
                const data1 = await res1.json();

                let compScore = 0;
                if(compUrl) {
                    const res2 = await fetch('/api/audit', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ url: compUrl })
                    });
                    const data2 = await res2.json();
                    compScore = data2.scores.aiReadiness;
                }

                document.getElementById('userScore').innerText = data1.scores.aiReadiness;
                document.getElementById('compScore').innerText = compScore || "N/A";
                
                const gap = compScore - data1.scores.aiReadiness;
                if(gap > 0) {
                    document.getElementById('insightText').innerText = "You are trailing your competitor by " + gap + " points in AI indexing. They are capturing your leads.";
                } else {
                    document.getElementById('insightText').innerText = "You have a solid lead, but technical gaps in your Schema markup are still present.";
                }

                document.getElementById('loading').style.display = "none";
                document.getElementById('results').style.display = "grid";
            } catch (e) {
                alert("Scan failed. Ensure URLs are correct.");
                document.getElementById('loading').style.display = "none";
            }
        }
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(HTML_PAGE));
app.post('/api/audit', async (req, res) => {
  try {
    const report = await runAudit(req.body.url);
    res.json(report);
  } catch (e) { res.status(500).json({error: e.message}); }
});
app.listen(PORT, () => console.log('Live on ' + PORT));
