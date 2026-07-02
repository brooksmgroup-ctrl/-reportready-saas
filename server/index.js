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

// Recursive search for index.html
function findFile(dir, targetFile) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === targetFile) return fullPath;
    if (fs.statSync(fullPath).isDirectory() && !file.includes('node_modules')) {
      const found = findFile(fullPath, targetFile);
      if (found) return found;
    }
  }
  return null;
}

let cachedIndexPath = null;
const getIndexPath = () => {
  if (cachedIndexPath && fs.existsSync(cachedIndexPath)) return cachedIndexPath;
  cachedIndexPath = findFile(process.cwd(), 'index.html');
  // Skip the one in client/ if there's one in a dist/ or build/ folder
  const files = [];
  const search = (dir) => {
    const entries = fs.readdirSync(dir);
    for (const e of entries) {
      const p = path.join(dir, e);
      if (e === 'index.html' && (dir.includes('dist') || dir.includes('build'))) return p;
      if (fs.statSync(p).isDirectory() && !e.includes('node_modules')) {
        const res = search(p);
        if (res) return res;
      }
    }
    return null;
  };
  const bestPath = search(process.cwd());
  if (bestPath) cachedIndexPath = bestPath;
  return cachedIndexPath;
};

const indexPath = getIndexPath();
if (indexPath) {
  const buildDir = path.dirname(indexPath);
  console.log(`Serving static files from: ${buildDir}`);
  app.use(express.static(buildDir));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', indexPath });
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
  const currentIndex = getIndexPath();
  if (currentIndex) {
    res.sendFile(currentIndex);
  } else {
    res.status(404).send('Frontend not found. Please ensure the build command ran successfully.');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}. Index: ${indexPath}`);
});
