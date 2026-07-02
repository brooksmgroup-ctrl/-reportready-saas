import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runAudit } from './audit.js';
import { generatePDF } from './reportGenerator.js';
import { createCheckoutSession } from './payments.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// EXPLICIT PRODUCTION PATHS
const rootDir = process.cwd();
const possibleBuildPaths = [
  path.join(rootDir, 'client/dist'),
  path.join(rootDir, 'dist'),
  path.join(__dirname, '../client/dist'),
  path.join(__dirname, 'dist'),
  path.join(rootDir, 'client') // Fallback to source only if dist is missing
];

let buildPath = possibleBuildPaths[0];
let indexPath = path.join(buildPath, 'index.html');

for (const p of possibleBuildPaths) {
  const checkIndex = path.join(p, 'index.html');
  if (fs.existsSync(checkIndex)) {
    // If we found a 'dist' folder, this is the one we want.
    if (p.includes('dist') || p.includes('build')) {
      buildPath = p;
      indexPath = checkIndex;
      break; 
    }
    // If it's the first one we found (even if not dist), keep it as fallback
    if (!indexPath || !fs.existsSync(indexPath)) {
      buildPath = p;
      indexPath = checkIndex;
    }
  }
}

console.log(`Serving static files from: ${buildPath}`);
app.use(express.static(buildPath));

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    buildPath, 
    indexPath,
    cwd: process.cwd()
  });
});

app.post('/api/audit', async (req, res) => {
  const { url } = req.body;
  try {
    const report = await runAudit(url);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/download', async (req, res) => {
  const { report } = req.body;
  try {
    const pdfBuffer = generatePDF(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const session = await createCheckoutSession(req.body.priceId);
    res.json({ id: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`Frontend not found at ${indexPath}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}. Serving from ${buildPath}`);
});
// Last updated: Thu Jul  2 13:42:21 UTC 2026
