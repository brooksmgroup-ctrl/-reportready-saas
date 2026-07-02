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

// Debug helper to find the build directory
const findBuildPath = () => {
  const possiblePaths = [
    path.join(__dirname, '../client/dist'),
    path.join(process.cwd(), 'client/dist'),
    path.join(__dirname, 'dist'),
    path.join(process.cwd(), 'dist')
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log(`Found build path at: ${p}`);
      return p;
    }
  }
  return possiblePaths[0]; // Fallback
};

const buildPath = findBuildPath();
app.use(express.static(buildPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

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

app.post('/api/download', async (req, res) => {
  const { report } = req.body;
  if (!report) return res.status(400).json({ error: 'Report data is required' });
  try {
    const pdfBuffer = generatePDF(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  const { priceId } = req.body;
  try {
    const session = await createCheckoutSession(priceId);
    res.json({ id: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// The "catchall" handler
app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Detailed error for debugging Render environment
    const debugInfo = {
      error: 'index.html not found',
      triedPath: indexPath,
      cwd: process.cwd(),
      dirname: __dirname,
      buildPath: buildPath,
      existsBuildPath: fs.existsSync(buildPath)
    };
    console.error('Frontend load failed:', debugInfo);
    res.status(500).json(debugInfo);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using buildPath: ${buildPath}`);
});
