import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Main route
app.get('/', (req, res) => {
  res.send('<h1>ReportReady Professional Audits</h1><p>Your site is being verified. Audits will be available shortly.</p>');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
