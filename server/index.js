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
        body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; background: #f8fafc; }
        .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
        h1 { color: #4f46e5; text-align: center; }
        button { padding: 14px 28px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; margin-top: 10px; }
        .score-box { text-align: center; padding: 20px; border-radius: 12px; background: #eff6ff; border: 2px solid #3b82f6; margin-bottom: 10px; }
        .results { margin-top: 30px; display: none; }
    </style>
</head>
<body>
    <div class="card">
        <h1>ReportReady</h1>
        <input type="url" id="urlInput" placeholder="https://yoursite.com" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
        <button onclick="runAudit()">Run Audit</button>
        <div id="results" class="results">
            <div class="score-box">SEO Score: <span id="seo"></span></div>
            <div class="score-box">AI Readiness: <span id="ai"></span></div>
            <button style="background: #ec4899;" onclick="window.location.href='mailto:hello@getreportready.com?subject=SEO Fix'">Have Us Fix This For You</button>
        </div>
    </div>
    <script>
        async function runAudit() {
            const url = document.getElementById('urlInput').value;
            try {
                const res = await fetch('/api/audit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ url })
                });
                const data = await res.json();
                document.getElementById('seo').innerText = data.scores.seo + "/100";
                document.getElementById('ai').innerText = data.scores.aiReadiness + "/100";
                document.getElementById('results').style.display = "block";
            } catch (e) { alert("Error"); }
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
