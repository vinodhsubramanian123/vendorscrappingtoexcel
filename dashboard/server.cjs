'use strict';
/**
 * dashboard/server.js — HPE OCA Catalog Intelligence Express Server Bridge
 *
 * Provides REST & SSE APIs for the React dashboard UI on Port 3001.
 * Connects UI actions to native Node.js pipeline scripts with zero external API key requirements.
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, exec, execFile } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUTS_DIR = path.join(PROJECT_ROOT, 'outputs');
const TEMP_DIR = path.join(OUTPUTS_DIR, 'temp');
const HISTORY_DIR = path.join(OUTPUTS_DIR, 'history');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'scripts', 'config');

// Ensure required output directories exist
[OUTPUTS_DIR, TEMP_DIR, HISTORY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Import shared library helpers
const feedbackQueue = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'feedback_queue.js'));

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static artifacts (JSON, TSV, PDF, Excel) securely
app.use('/artifacts', express.static(OUTPUTS_DIR));

// Configure Multer for BOQ uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_DIR),
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `boq_${Date.now()}_${cleanName}`);
  }
});
const upload = multer({ storage });

// Active background task mutex lock & log streaming broadcaster
let activeTask = null; // { type, process, startTime }
const sseClients = new Set();

function broadcastSSE(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// -----------------------------------------------------------------------------
// 1. CDP Session & Observability Endpoints
// -----------------------------------------------------------------------------

app.get('/api/cdp-status', (req, res) => {
  const reqCdp = http.get('http://localhost:9222/json', (cdpRes) => {
    let raw = '';
    cdpRes.on('data', chunk => raw += chunk);
    cdpRes.on('end', () => {
      try {
        const targets = JSON.parse(raw);
        const ocaTarget = targets.find(t => t.url && t.url.includes('oca.ext.hpe.com') && t.type === 'page');
        res.json({
          online: true,
          activeSession: !!ocaTarget,
          target: ocaTarget || null,
          totalTargets: targets.length
        });
      } catch (err) {
        res.json({ online: true, activeSession: false, target: null, error: err.message });
      }
    });
  });
  reqCdp.on('error', () => {
    res.json({ online: false, activeSession: false, target: null });
  });
});

app.get('/api/session-observability', (req, res) => {
  const obsScript = path.join(PROJECT_ROOT, 'scripts', 'observability_status.js');
  execFile('node', [obsScript, '--json'], (err, stdout) => {
    if (err) {
      return res.status(500).json({ error: err.message, status: 'OFFLINE' });
    }
    try {
      const data = JSON.parse(stdout);
      res.json(data);
    } catch {
      res.json({ raw: stdout, status: 'RAW' });
    }
  });
});

// -----------------------------------------------------------------------------
// 2. Catalog & Discovery Endpoints
// -----------------------------------------------------------------------------

app.get('/api/available-catalogs', (req, res) => {
  const registryFile = path.join(OUTPUTS_DIR, 'SCRAPED_CATALOGS.md');
  const catalogs = [];

  // Helper to recursively find catalog JSON files
  function findCatalogs(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name !== 'history' && item.name !== 'raw_data' && item.name !== 'intermittent_scraps') {
          findCatalogs(fullPath);
        }
      } else if (item.isFile() && item.name.endsWith('_Catalog.json')) {
        const relativePath = path.relative(OUTPUTS_DIR, fullPath);
        const folderPath = path.dirname(fullPath);
        const folderName = path.basename(folderPath);

        // Read metadata
        let metadata = { chassis: folderName };
        let totalSKUs = 0;
        try {
          const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
          metadata = content.metadata || metadata;
          totalSKUs = metadata.totalUniqueSKUs || content.entries?.reduce((acc, e) => acc + (e.skuCount || 0), 0) || 0;
        } catch {}

        // Check for quickspecs PDF
        const pdfFile = fs.readdirSync(folderPath).find(f => f.endsWith('.pdf'));
        const xlsxFile = fs.readdirSync(folderPath).find(f => f.endsWith('.xlsx'));

        catalogs.push({
          id: folderName,
          chassis: metadata.chassis || folderName,
          family: relativePath.split(path.sep)[0] || 'Unknown',
          gen: relativePath.split(path.sep)[1] || 'Unknown',
          chassisDir: path.relative(OUTPUTS_DIR, folderPath).replace(/\\/g, '/'),
          jsonPath: `/artifacts/${relativePath.replace(/\\/g, '/')}`,
          xlsxPath: xlsxFile ? `/artifacts/${path.relative(OUTPUTS_DIR, path.join(folderPath, xlsxFile)).replace(/\\/g, '/')}` : null,
          pdfPath: pdfFile ? `/artifacts/${path.relative(OUTPUTS_DIR, path.join(folderPath, pdfFile)).replace(/\\/g, '/')}` : null,
          totalSKUs,
          scrapeDate: metadata.scrapeDate || 'N/A'
        });
      }
    }
  }

  findCatalogs(OUTPUTS_DIR);
  res.json({ catalogs });
});

app.get('/api/catalog-data', (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: 'Missing path query parameter' });
  const fullPath = path.join(OUTPUTS_DIR, relPath.replace(/^\/artifacts\//, ''));
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Catalog file not found' });
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.setHeader('Content-Type', 'application/json');
    res.send(content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. Real-Time Log Terminal (Server-Sent Events)
// -----------------------------------------------------------------------------

app.get('/api/stream-logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Stream Active' })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// -----------------------------------------------------------------------------
// 4. Execution & Task Triggers (Mutex Lock Protected)
// -----------------------------------------------------------------------------

app.post('/api/scrape', (req, res) => {
  if (activeTask) {
    return res.status(409).json({ error: 'Another task is currently running', task: activeTask.type });
  }

  const { mode } = req.body; // 'solution' or 'storage'
  const scriptName = mode === 'storage' ? 'scrape_oca_storage_solution.js' : 'scrape_oca_solution.js';
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', scriptName);

  const proc = spawn('node', [scriptPath], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  activeTask = { type: `SCRAPE_${mode.toUpperCase()}`, pid: proc.pid, startTime: Date.now() };

  broadcastSSE({ type: 'TASK_STARTED', task: activeTask.type });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) broadcastSSE({ type: 'LOG', text: line, stream: 'stdout' });
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) broadcastSSE({ type: 'LOG', text: line, stream: 'stderr' });
    });
  });

  proc.on('close', (code) => {
    broadcastSSE({ type: 'TASK_COMPLETED', code, task: activeTask.type });
    activeTask = null;
  });

  res.json({ message: 'Scrape task started', pid: proc.pid });
});

app.post('/api/rebuild', (req, res) => {
  if (activeTask) {
    return res.status(409).json({ error: 'Another task is currently running' });
  }

  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'rebuild_all.js');
  const proc = spawn('node', [scriptPath], { cwd: PROJECT_ROOT });
  activeTask = { type: 'REBUILD_ALL', pid: proc.pid, startTime: Date.now() };

  broadcastSSE({ type: 'TASK_STARTED', task: activeTask.type });

  proc.stdout.on('data', (data) => {
    broadcastSSE({ type: 'LOG', text: data.toString(), stream: 'stdout' });
  });

  proc.on('close', (code) => {
    broadcastSSE({ type: 'TASK_COMPLETED', code, task: activeTask.type });
    activeTask = null;
  });

  res.json({ message: 'Rebuild task started', pid: proc.pid });
});

// -----------------------------------------------------------------------------
// 5. BOQ Upload & Evaluation Engine
// -----------------------------------------------------------------------------

app.post('/api/upload-boq', upload.single('boqFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No BOQ file uploaded' });
  res.json({
    message: 'BOQ uploaded successfully',
    filepath: req.file.path,
    filename: req.file.originalname
  });
});

app.post('/api/eval-boq', (req, res) => {
  const { filepath, rawText, chassisDir } = req.body;

  let targetPath = filepath;
  if (!targetPath && rawText) {
    targetPath = path.join(TEMP_DIR, `boq_text_${Date.now()}.json`);
    fs.writeFileSync(targetPath, rawText, 'utf-8');
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    return res.status(400).json({ error: 'Valid BOQ file or text input is required' });
  }

  const evalScript = path.join(PROJECT_ROOT, 'scripts', 'eval_boq.js');
  const args = [evalScript, targetPath, '--json'];
  if (chassisDir) {
    args.push('--chassis', chassisDir);
  }

  const proc = spawn('node', args, { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  activeTask = { type: 'EVAL_BOQ', pid: proc.pid, startTime: Date.now() };
  broadcastSSE({ type: 'TASK_STARTED', task: activeTask.type });

  let stdoutBuffer = '';

  proc.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) broadcastSSE({ type: 'LOG', text: line, stream: 'stderr' });
    });
  });

  proc.on('close', (code) => {
    broadcastSSE({ type: 'TASK_COMPLETED', code, task: 'EVAL_BOQ' });
    activeTask = null;

    try {
      const data = JSON.parse(stdoutBuffer);
      res.json(data);
    } catch {
      res.json({ rawOutput: stdoutBuffer, error: 'Failed to parse evaluator JSON' });
    }
  });
});

// -----------------------------------------------------------------------------
// 6. NotebookLM RAG & Async Smart Search
// -----------------------------------------------------------------------------

app.post('/api/notebook-query', (req, res) => {
  const { query, chassis } = req.body;
  if (!query) return res.status(400).json({ error: 'Query string is required' });

  // Resolve notebook ID from notebooks.json config
  const notebooksPath = path.join(CONFIG_DIR, 'notebooks.json');
  let notebookId = '1d190853-4e9c-48df-aa70-eae66c6f2c1f';
  if (fs.existsSync(notebooksPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(notebooksPath, 'utf-8'));
      const chassisId = (config.notebooks && config.notebooks[chassis]);
      if (chassisId && chassisId.trim()) {
        notebookId = chassisId.trim();
      } else if (config.defaultNotebookId) {
        notebookId = config.defaultNotebookId;
      }
    } catch {}
  }

  if (!notebookId) {
    return res.json({
      query,
      answer: "Local Evaluation Engine: RAG notebook mapping unavailable for this chassis. Serving local 5-level conflict graph matrix.",
      citations: [],
      source: 'LOCAL_FALLBACK'
    });
  }

  execFile('nlm', ['notebook', 'query', notebookId, query, '--json'], { timeout: 30000 }, (err, stdout) => {
    if (err) {
      return res.json({
        query,
        answer: `NotebookLM Query Fallback: ${err.message || 'Timeout exceeded'}`,
        citations: [],
        source: 'FALLBACK'
      });
    }
    try {
      const data = JSON.parse(stdout);
      res.json({ ...data, source: 'NOTEBOOK_LM' });
    } catch {
      res.json({ query, answer: stdout, citations: [], source: 'NOTEBOOK_LM_RAW' });
    }
  });
});

// -----------------------------------------------------------------------------
// 7. User Feedback Queue & Portal Deltas
// -----------------------------------------------------------------------------

app.get('/api/feedback-list', (req, res) => {
  res.json(feedbackQueue.listFeedback());
});

app.post('/api/feedback-submit', (req, res) => {
  const { text, category, context } = req.body;
  if (!text) return res.status(400).json({ error: 'Feedback text is required' });
  const entry = feedbackQueue.appendFeedback(text, category, context);
  const agentPrompt = feedbackQueue.formatAgentTaskPrompt(entry);
  res.json({ entry, agentPrompt });
});

// Alias for FeedbackModal (Fix B1)
app.post('/api/portal-feedback', (req, res) => {
  const { rank, title, feedbackText } = req.body;
  const text = `[Portal Feedback Rank ${rank} - ${title}] ${feedbackText}`;
  const entry = feedbackQueue.appendFeedback(text, 'portal_feedback', { rank, title });
  res.json({ success: true, entry });
});

// Download QuickSpecs PDF Endpoint (Fix B4)
app.post('/api/download-pdf', (req, res) => {
  const { chassisId } = req.body;
  const pdfScript = path.join(PROJECT_ROOT, 'scripts', 'download_quickspecs_pdf.js');
  if (!fs.existsSync(pdfScript)) {
    return res.status(404).json({ error: 'download_quickspecs_pdf.js not found' });
  }

  const proc = spawn('node', [pdfScript], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  activeTask = { type: 'DOWNLOAD_PDF', pid: proc.pid, startTime: Date.now() };
  broadcastSSE({ type: 'TASK_STARTED', task: activeTask.type });

  proc.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) broadcastSSE({ type: 'LOG', text: line, stream: 'stdout' });
    });
  });
  proc.on('close', (code) => {
    broadcastSSE({ type: 'TASK_COMPLETED', code, task: 'DOWNLOAD_PDF' });
    activeTask = null;
  });

  res.json({ message: 'PDF download started', pid: proc.pid });
});

// Kill Active Task Endpoint (Enhancement U3)
app.post('/api/kill-task', (req, res) => {
  if (!activeTask || !activeTask.pid) {
    return res.status(400).json({ error: 'No active task to kill' });
  }
  try {
    process.kill(activeTask.pid, 'SIGTERM');
    broadcastSSE({ type: 'LOG', text: `🛑 Task ${activeTask.type} (PID ${activeTask.pid}) cancelled by user.`, stream: 'stderr' });
    broadcastSSE({ type: 'TASK_COMPLETED', code: 143, task: activeTask.type });
    activeTask = null;
    res.json({ message: 'Task cancelled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Price History Log Endpoint (Fix Rule #45 for Price Trends)
app.get('/api/price-history', (req, res) => {
  const { chassis, sku } = req.query;
  if (!sku) return res.status(400).json({ error: 'SKU parameter required' });

  // Search for price_history.json in outputs
  let historyFile = null;
  function searchHistory(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        searchHistory(fullPath);
      } else if (item.name === 'price_history.json') {
        if (!chassis || fullPath.includes(chassis)) {
          historyFile = fullPath;
          break;
        }
      }
    }
  }
  searchHistory(OUTPUTS_DIR);

  if (!historyFile || !fs.existsSync(historyFile)) {
    return res.json({ sku, history: [] });
  }

  try {
    const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    const trail = data[sku] || [];
    res.json({ sku, history: trail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Portfolio Verification Suite Endpoint (verify_all.js)
app.post('/api/verify-all', (req, res) => {
  if (activeTask) {
    return res.status(409).json({ error: 'Another task is currently running' });
  }

  const verifyScript = path.join(PROJECT_ROOT, 'scripts', 'verify_all.js');
  const proc = spawn('node', [verifyScript], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  activeTask = { type: 'VERIFY_ALL', pid: proc.pid, startTime: Date.now() };

  broadcastSSE({ type: 'TASK_STARTED', task: activeTask.type });

  proc.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) broadcastSSE({ type: 'LOG', text: line, stream: 'stdout' });
    });
  });

  proc.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) broadcastSSE({ type: 'LOG', text: line, stream: 'stderr' });
    });
  });

  proc.on('close', (code) => {
    broadcastSSE({ type: 'TASK_COMPLETED', code, task: activeTask.type });
    activeTask = null;
  });

  res.json({ message: 'Portfolio verification suite started', pid: proc.pid });
});

// -----------------------------------------------------------------------------
// 8. Data Quality Audit Endpoint
// -----------------------------------------------------------------------------

app.post('/api/audit-catalog', (req, res) => {
  const { xlsxPath } = req.body;
  if (!xlsxPath) return res.status(400).json({ error: 'xlsxPath required' });
  const fullXlsxPath = path.join(OUTPUTS_DIR, xlsxPath.replace(/^\/artifacts\//, ''));

  const verifyScript = path.join(PROJECT_ROOT, 'scripts', 'verify_excel_tally.js');
  execFile('node', [verifyScript, fullXlsxPath, '--json'], (err, stdout) => {
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch {
      res.json({ passed: !err, raw: stdout });
    }
  });
});

// -----------------------------------------------------------------------------
// 9. Knowledge Sync — Push learned rules to NotebookLM (SSE streamed)
// -----------------------------------------------------------------------------

app.post('/api/sync-knowledge', (req, res) => {
  if (activeTask) {
    return res.status(409).json({ error: 'Another task is currently running', task: activeTask.type });
  }

  const syncScript = path.join(PROJECT_ROOT, 'scripts', 'lib', 'knowledge_sync.js');
  if (!fs.existsSync(syncScript)) {
    return res.status(404).json({ error: 'knowledge_sync.js not found' });
  }

  const proc = spawn('node', [syncScript], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  activeTask = { type: 'KNOWLEDGE_SYNC', pid: proc.pid, startTime: Date.now() };
  broadcastSSE({ type: 'TASK_STARTED', task: activeTask.type });

  proc.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) broadcastSSE({ type: 'LOG', text: line, stream: 'stdout' });
    });
  });
  proc.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) broadcastSSE({ type: 'LOG', text: line, stream: 'stderr' });
    });
  });
  proc.on('close', (code) => {
    broadcastSSE({ type: 'TASK_COMPLETED', code, task: 'KNOWLEDGE_SYNC' });
    activeTask = null;
  });

  res.json({ message: 'Knowledge sync started', pid: proc.pid });
});

// -----------------------------------------------------------------------------
// 10. Simulate Portal Rejection — Injects an error into the learning engine
// -----------------------------------------------------------------------------

app.post('/api/simulate-error', (req, res) => {
  const { boqPath, errorMessage, chassis } = req.body;
  if (!errorMessage) return res.status(400).json({ error: 'errorMessage is required' });

  // Write a KnowledgeDelta entry directly into catalog_deltas.json
  const deltasFile = path.join(OUTPUTS_DIR, 'history', 'catalog_deltas.json');
  let deltas = [];
  if (fs.existsSync(deltasFile)) {
    try { deltas = JSON.parse(fs.readFileSync(deltasFile, 'utf-8')); } catch {}
  }
  if (!Array.isArray(deltas)) deltas = [];

  const newDelta = {
    id: `DELTA_${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: 'PORTAL_REJECTION',
    chassis: chassis || 'UNKNOWN',
    boqPath: boqPath || null,
    errorMessage,
    status: 'PENDING_SYNC',
    scopeTaxonomy: chassis ? 'CHASSIS_SPECIFIC' : 'UNIVERSAL_VENDOR'
  };
  deltas.push(newDelta);
  fs.mkdirSync(path.dirname(deltasFile), { recursive: true });
  fs.writeFileSync(deltasFile, JSON.stringify(deltas, null, 2), 'utf-8');

  broadcastSSE({
    type: 'LOG',
    text: `⚠️ [PORTAL_REJECTION] Delta logged: ${errorMessage} (ID: ${newDelta.id})`,
    stream: 'stdout'
  });

  res.json({ message: 'Portal rejection logged as KnowledgeDelta', delta: newDelta });
});

// -----------------------------------------------------------------------------
// 11. Export Corrected BOQ — Generates downloadable corrected JSON from eval results
// -----------------------------------------------------------------------------

app.post('/api/export-boq', (req, res) => {
  const { evalResults, chassisId, rankTier } = req.body;
  if (!evalResults) return res.status(400).json({ error: 'evalResults payload is required' });

  const XLSX = require('xlsx-js-style');
  const tier = rankTier || 1;
  const timestamp = Date.now();
  const exportDir = path.join(OUTPUTS_DIR, 'temp', 'exports');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const exportFilename = `corrected_boq_rank${tier}_${chassisId || 'unknown'}_${timestamp}.xlsx`;
  const exportPath = path.join(exportDir, exportFilename);

  const rankedSolution = evalResults.conflictGraph?.rankedSolutions?.find(s => s.rank === tier) || null;
  const wb = XLSX.utils.book_new();

  // --- SHEET 1: Summary & Rationale ---
  const summaryData = [
    ['Field', 'Value'],
    ['Chassis', chassisId || 'Unknown'],
    ['Applied Rank', tier],
    ['Solution Name', rankedSolution?.name || 'N/A'],
    ['Customer Intent Match', rankedSolution?.tradeoffMetrics?.intentAlignment || 'N/A'],
    ['Estimated CapEx', rankedSolution?.estimatedCostUsd ? `$${rankedSolution.estimatedCostUsd.toLocaleString()}` : 'N/A'],
    ['NotebookLM RAG Reasoning', rankedSolution?.reasoning || 'N/A']
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary & Rationale');

  // --- SHEET 2: Corrected BOM ---
  const bomData = [['SKU', 'Quantity', 'Description', 'Action']];
  const correctedSkus = rankedSolution?.skuList || [];
  correctedSkus.forEach(sku => {
    bomData.push([sku.sku, sku.quantity, sku.description || '', sku.isFix ? 'ADDED (FIX)' : 'ORIGINAL']);
  });
  const wsBom = XLSX.utils.aoa_to_sheet(bomData);
  XLSX.utils.book_append_sheet(wb, wsBom, 'Corrected BOM');

  XLSX.writeFile(wb, exportPath);

  res.json({
    message: `Rank ${tier} corrected BOQ Excel exported`,
    filename: exportFilename,
    downloadPath: `/artifacts/temp/exports/${exportFilename}`,
    exportedAt: new Date().toISOString()
  });
});

// -----------------------------------------------------------------------------
// 12. Notebook Config Registry — Read & Write notebooks.json from UI
// -----------------------------------------------------------------------------

app.get('/api/config/notebooks', (req, res) => {
  const notebooksPath = path.join(CONFIG_DIR, 'notebooks.json');
  if (!fs.existsSync(notebooksPath)) {
    return res.json({ defaultNotebookId: '', notebooks: {} });
  }
  try {
    res.json(JSON.parse(fs.readFileSync(notebooksPath, 'utf-8')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/notebooks', (req, res) => {
  const { defaultNotebookId, notebooks } = req.body;
  if (!notebooks || typeof notebooks !== 'object') {
    return res.status(400).json({ error: 'notebooks object is required' });
  }
  const notebooksPath = path.join(CONFIG_DIR, 'notebooks.json');
  try {
    const existing = fs.existsSync(notebooksPath)
      ? JSON.parse(fs.readFileSync(notebooksPath, 'utf-8'))
      : {};
    const updated = {
      ...existing,
      defaultNotebookId: defaultNotebookId || existing.defaultNotebookId || '',
      notebooks: { ...existing.notebooks, ...notebooks }
    };
    fs.writeFileSync(notebooksPath, JSON.stringify(updated, null, 2), 'utf-8');
    res.json({ message: 'Notebook registry updated', config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// Start Server
// -----------------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`⚡ HPE OCA Dashboard Server Bridge running on http://localhost:${PORT}`);
  console.log(`📁 Static artifacts served from: ${OUTPUTS_DIR}`);
});

// Graceful shutdown — Rule #42: prevent zombie processes on SIGTERM
process.on('SIGTERM', () => {
  if (activeTask?.process) {
    try { activeTask.process.kill('SIGTERM'); } catch {}
  }
  server.close(() => {
    console.log('⚡ Dashboard server shut down cleanly.');
    process.exit(0);
  });
});
process.on('SIGINT', () => process.emit('SIGTERM'));
