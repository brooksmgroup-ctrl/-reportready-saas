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

// Optimized search to prioritize 'dist' or 'build' folders
function getProductionIndexPath(dir) {
  const entries = fs.readdirSync(dir);
  
  // First, look for index.html in a 'dist' or 'build' subdirectory
  for (const entry of entries) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory() && (entry === 'dist' || entry === 'build')) {
      const indexPath = path.join(p, 'index.html');
      if (fs.existsSync(indexPath)) return indexPath;
    }
  }

  // Second, recurse into other directories (excluding node_modules)
  for (const entry of entries) {
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory() && entry !== 'node_modules' && entry !== 'dist' && entry !== 'build') {
      const found = getProductionIndexPath(p);
      if (found) return found;
    }
  }

  return null;
}

let cachedIndexPath = getProductionIndexPath(process.cwd());

// Fallback to any index.html if no production one found
if (!cachedIndexPath) {
    const findAny = (dir) => {
        const entries = fs.readdirSync(dir);
        for (const e of entries) {
            const p = path.join(dir, e);
            if (e === 'index.html') return p;
            if (fs.statSync(p).isDirectory() && e !== 'node_modules') {
                const res = findAny(p);
                if (res) return res;
            }
        }
        return null;
    }
    cachedIndexPath = findAny(process.cwd());
}

if (cachedIndexPath) {
  const buildDir = path.dirname(cachedIndexPath);
  console.log(`Serving production static files from: ${buildDir}`);
  app.use(express.static(buildDir));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', indexPath: cachedIndexPath });
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
  if (cachedIndexPath) {
    res.sendFile(cachedIndexPath);
  } else {
    res.status(404).send('Frontend not found.');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}. Production Index: ${cachedIndexPath}`);
});
