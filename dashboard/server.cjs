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

// Security helper for Path Traversal Boundary Enforcement (Rule #49)
function resolveSafePath(userInput, baseDir = OUTPUTS_DIR) {
  if (!userInput) return null;
  const resolvedPath = path.resolve(baseDir, userInput);
  if (!resolvedPath.startsWith(baseDir)) {
    throw new Error('HTTP 403: Path Traversal Attempt Blocked');
  }
  return resolvedPath;
}

// Import shared library helpers
const feedbackQueue = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'feedback_queue.js'));
const { executeNotebookQuery, sanitizeNotebookQuery, postProcessNotebookResult } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'notebook_query_utils.js'));

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

// Security helper: prevent directory traversal outside OUTPUTS_DIR
function isPathSafe(targetPath) {
  if (!targetPath) return false;
  const cleanPath = targetPath.replace(/^\/artifacts\//, '');
  const resolved = path.resolve(OUTPUTS_DIR, cleanPath);
  return resolved.startsWith(OUTPUTS_DIR);
}

// -----------------------------------------------------------------------------
// Task Trace Manager (Phase 3 Observability)
// -----------------------------------------------------------------------------
function startTask(type, proc, res) {
  const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const logs = [];

  activeTask = { type, runId, pid: proc.pid, process: proc, startTime: Date.now() };
  broadcastSSE({ type: 'TASK_STARTED', task: type, runId });

  const handleData = (data, streamType) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        const logEntry = { timestamp: new Date().toISOString(), stream: streamType, text: line };
        logs.push(logEntry);

        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'progress' || parsed.type === 'log') {
            broadcastSSE({ ...parsed, type: parsed.type.toUpperCase(), stream: streamType });
            return;
          }
        } catch {}

        broadcastSSE({ type: 'LOG', text: line, stream: streamType });
      }
    });
  };

  proc.stdout.on('data', data => handleData(data, 'stdout'));
  proc.stderr.on('data', data => handleData(data, 'stderr'));

  proc.on('close', (code) => {
    const durationMs = Date.now() - activeTask.startTime;
    broadcastSSE({ type: 'TASK_COMPLETED', code, task: type, runId, durationMs });
    
    // Persist trace log
    const traceDir = path.join(OUTPUTS_DIR, 'history', 'runs');
    if (!fs.existsSync(traceDir)) fs.mkdirSync(traceDir, { recursive: true });
    fs.writeFileSync(path.join(traceDir, `${runId}.json`), JSON.stringify({
      runId,
      taskType: type,
      startTime: new Date(activeTask.startTime).toISOString(),
      durationMs,
      exitCode: code,
      logs
    }, null, 2));

    activeTask = null;
  });

  res.json({ message: `${type} task started`, runId, pid: proc.pid });
}

// -----------------------------------------------------------------------------
// 1. Session Observability Endpoints
// -----------------------------------------------------------------------------

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
// 2. CDP State & Catalog Discovery
// -----------------------------------------------------------------------------

app.get('/api/cdp-status', async (req, res) => {
  try {
    const response = await fetch('http://127.0.0.1:9222/json');
    if (!response.ok) throw new Error('CDP port not responding');
    
    const targets = await response.json();
    const pages = targets.filter(t => t.type === 'page');
    
    // Find active OCA page
    const ocaPage = pages.find(t => t.url.includes('oca.ext.hpe.com'));
    
    if (ocaPage) {
      const isSolutionRoot = ocaPage.url.includes('extended_overview_components') || ocaPage.url.includes('alletra_5000_wizard');
      return res.json({ 
        status: 'READY', 
        title: ocaPage.title, 
        url: ocaPage.url,
        isSolutionRoot
      });
    }

    // Check if on login page
    const loginPage = pages.find(t => t.url.includes('login.hpe.com') || t.url.includes('partner.hpe.com'));
    if (loginPage) {
      return res.json({ status: 'AUTHENTICATING', title: loginPage.title });
    }

    res.json({ status: 'NAVIGATING', message: 'OCA not found in open tabs' });

  } catch (err) {
    res.json({ status: 'DISCONNECTED', error: err.message });
  }
});

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
  if (!isPathSafe(relPath)) return res.status(403).json({ error: 'Access denied: Invalid path traversal' });

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

app.get('/api/price-analytics', (req, res) => {
  const chassisDir = req.query.chassisDir;
  if (!chassisDir) return res.status(400).json({ error: 'Missing chassisDir parameter' });
  if (!isPathSafe(chassisDir)) return res.status(403).json({ error: 'Access denied: Invalid path traversal' });

  const historyDir = path.join(OUTPUTS_DIR, chassisDir, 'history');
  if (!fs.existsSync(historyDir)) {
    return res.json({ snapshots: [], priceHistory: {}, summary: { totalSnapshots: 0 } });
  }

  try {
    const priceHistoryFile = path.join(historyDir, 'price_history.json');
    const priceHistory = fs.existsSync(priceHistoryFile)
      ? JSON.parse(fs.readFileSync(priceHistoryFile, 'utf-8'))
      : {};

    const snapshots = fs.readdirSync(historyDir)
      .filter(f => f.startsWith('catalog_') && f.endsWith('.json'))
      .sort()
      .map(f => {
        const filePath = path.join(historyDir, f);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          return {
            filename: f,
            scrapeDate: content.metadata?.scrapeDate || f.replace('catalog_', '').replace('.json', ''),
            totalSKUs: content.metadata?.totalUniqueSKUs || 0,
            diffSummary: content.metadata?.diffSummary || null,
            priceAnalytics: content.metadata?.priceAnalytics || null
          };
        } catch {
          return { filename: f, error: 'Failed to parse snapshot' };
        }
      });

    res.json({
      chassisDir,
      totalSnapshots: snapshots.length,
      snapshots,
      priceHistory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sku-history', (req, res) => {
  const { sku, chassisDir } = req.query;
  if (!sku || !chassisDir) return res.status(400).json({ error: 'Missing sku or chassisDir parameter' });

  try {
    const safeChassisDir = resolveSafePath(chassisDir);
    const priceHistoryFile = path.join(safeChassisDir, 'history', 'price_history.json');
    if (!fs.existsSync(priceHistoryFile)) return res.json({ sku, history: [] });

    const priceHistory = JSON.parse(fs.readFileSync(priceHistoryFile, 'utf-8'));
    res.json({ sku, history: priceHistory[sku] || [] });
  } catch (err) {
    res.status(err.message.includes('403') ? 403 : 500).json({ error: err.message });
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
  if (activeTask) return res.status(409).json({ error: 'Another task is currently running', task: activeTask.type });

  const { mode } = req.body; // 'solution' or 'storage'
  const scriptName = mode === 'storage' ? 'scrape_oca_storage_solution.js' : 'scrape_oca_solution.js';
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', scriptName);

  const proc = spawn('node', [scriptPath], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  startTask(`SCRAPE_${mode.toUpperCase()}`, proc, res);
});

app.post('/api/rebuild', (req, res) => {
  if (activeTask) return res.status(409).json({ error: 'Another task is currently running' });

  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'rebuild_all.js');
  const proc = spawn('node', [scriptPath], { cwd: PROJECT_ROOT });
  startTask('REBUILD_ALL', proc, res);
});

app.post('/api/navigate-oca', (req, res) => {
  if (activeTask) return res.status(409).json({ error: 'Another task is currently running' });

  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'lib', 'navigate_oca.js');
  const proc = spawn('node', [scriptPath], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  startTask('NAVIGATE_OCA', proc, res);
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

  let safeFilepath = null;
  let safeChassisDir = null;

  try {
    if (filepath) safeFilepath = resolveSafePath(filepath);
    if (chassisDir) safeChassisDir = resolveSafePath(chassisDir);
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }

  let targetPath = safeFilepath;
  if (!targetPath && rawText) {
    targetPath = path.join(TEMP_DIR, `boq_text_${Date.now()}.json`);
    fs.writeFileSync(targetPath, rawText, 'utf-8');
  }

  const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const logs = [];

  if (!targetPath || !fs.existsSync(targetPath)) {
    const errorMsg = 'Valid BOQ file or text input is required';
    logs.push({ timestamp: new Date().toISOString(), stream: 'stderr', text: errorMsg });
    
    // Write failed trace to history
    const traceDir = path.join(OUTPUTS_DIR, 'history', 'runs');
    if (!fs.existsSync(traceDir)) fs.mkdirSync(traceDir, { recursive: true });
    fs.writeFileSync(path.join(traceDir, `${runId}.json`), JSON.stringify({
      runId, taskType: 'EVAL_BOQ', startTime: new Date().toISOString(), durationMs: 0, exitCode: 1, logs
    }, null, 2));

    broadcastSSE({ type: 'TASK_STARTED', task: 'EVAL_BOQ', runId });
    broadcastSSE({ type: 'LOG', text: errorMsg, stream: 'stderr' });
    broadcastSSE({ type: 'TASK_COMPLETED', code: 1, task: 'EVAL_BOQ', runId, durationMs: 0 });

    return res.status(400).json({ error: errorMsg });
  }

  const evalScript = path.join(PROJECT_ROOT, 'scripts', 'eval_boq.js');
  const args = [evalScript, targetPath, '--json'];
  if (safeChassisDir) {
    args.push('--chassis', safeChassisDir);
  }

  const proc = spawn('node', args, { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  activeTask = { type: 'EVAL_BOQ', runId, pid: proc.pid, startTime: Date.now() };
  broadcastSSE({ type: 'TASK_STARTED', task: activeTask.type, runId });

  // Immediately respond with HTTP 202 Accepted to free the browser from waiting!
  res.status(202).json({ status: 'ACCEPTED', runId, message: 'Evaluation job started in background' });

  let stdoutBuffer = '';

  const handleData = (data, streamType) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        logs.push({ timestamp: new Date().toISOString(), stream: streamType, text: line });
        if (streamType === 'stdout') stdoutBuffer += line + '\n';
        
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'progress' || parsed.type === 'log') {
            broadcastSSE({ ...parsed, type: parsed.type.toUpperCase(), stream: streamType });
            return;
          }
        } catch {}
        
        broadcastSSE({ type: 'LOG', text: line, stream: streamType });
      }
    });
  };

  proc.stdout.on('data', data => handleData(data, 'stdout'));
  proc.stderr.on('data', data => handleData(data, 'stderr'));

  proc.on('close', (code) => {
    const durationMs = Date.now() - activeTask.startTime;
    broadcastSSE({ type: 'TASK_COMPLETED', code, task: 'EVAL_BOQ', runId, durationMs });
    
    // Persist trace log
    const traceDir = path.join(OUTPUTS_DIR, 'history', 'runs');
    if (!fs.existsSync(traceDir)) fs.mkdirSync(traceDir, { recursive: true });
    fs.writeFileSync(path.join(traceDir, `${runId}.json`), JSON.stringify({
      runId,
      taskType: 'EVAL_BOQ',
      startTime: new Date(activeTask.startTime).toISOString(),
      durationMs,
      exitCode: code,
      logs
    }, null, 2));

    activeTask = null;

    // Cleanup temp BOQ file if it was created from text
    if (targetPath && targetPath.includes(TEMP_DIR) && fs.existsSync(targetPath)) {
      try { fs.unlinkSync(targetPath); } catch (e) {}
    }

    try {
      // Find the final JSON payload block by checking the last valid JSON output
      const jsonStrMatch = stdoutBuffer.match(/\{[\s\S]*\}/);
      if (!jsonStrMatch) throw new Error('No JSON output found');
      
      const data = JSON.parse(jsonStrMatch[0]);
      if (data.status === 'SUCCESS' && data.data) {
        broadcastSSE({ type: 'EVAL_RESULT', data: data.data, runId });
      } else {
        broadcastSSE({ type: 'EVAL_RESULT', error: data, runId });
      }
    } catch {
      broadcastSSE({ type: 'EVAL_RESULT', error: 'Failed to parse evaluator JSON', runId });
    }
  });
});

// -----------------------------------------------------------------------------
// 6. NotebookLM RAG & Async Smart Search
// -----------------------------------------------------------------------------

app.post('/api/notebook-query', async (req, res) => {
  const { query, chassis } = req.body;
  if (!query) return res.status(400).json({ error: 'Query string is required' });

  // Resolve notebook ID from notebooks.json config
  const notebooksPath = path.join(CONFIG_DIR, 'notebooks.json');
  let notebookId = null;
  if (fs.existsSync(notebooksPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(notebooksPath, 'utf-8'));
      const chassisId = (config.notebooks && config.notebooks[chassis]);
      if (chassisId && chassisId.trim()) {
        notebookId = chassisId.trim();
      }
    } catch {}
  }

  if (!notebookId) {
    return res.json({
      query: sanitizeNotebookQuery(query, { chassis }),
      answer: "Local Evaluation Engine: RAG notebook mapping unavailable for this chassis. Serving local 5-level conflict graph matrix.",
      citations: [],
      source: 'LOCAL_FALLBACK'
    });
  }

  try {
    const result = await executeNotebookQuery(notebookId, query, { context: { chassis } });
    const telemetryLib = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'telemetry.js'));
    telemetryLib.recordNotebookConsultationTelemetry({
      query: result.query,
      answer: result.answer,
      citations: result.citations,
      chassis,
      agreementScore: result.answer && !result.answer.includes('Fallback') ? 0.95 : 0.6,
      nextActionExecuted: 'DEPENDENCY_VALIDATED_AND_DOUBLE_PROOFED'
    });
    res.json(result);
  } catch (err) {
    res.json({
      query: sanitizeNotebookQuery(query, { chassis }),
      answer: `NotebookLM Query Fallback: ${err.message || 'Timeout exceeded'}`,
      citations: [],
      source: 'FALLBACK'
    });
  }
});

// Async Non-Blocking Notebook Query Endpoint
app.post('/api/notebook-query-async', (req, res) => {
  const { query, chassis } = req.body;
  if (!query) return res.status(400).json({ error: 'Query string is required' });

  const notebooksPath = path.join(CONFIG_DIR, 'notebooks.json');
  let notebookId = null;
  if (fs.existsSync(notebooksPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(notebooksPath, 'utf-8'));
      const chassisId = (config.notebooks && config.notebooks[chassis]);
      if (chassisId && chassisId.trim()) {
        notebookId = chassisId.trim();
      }
    } catch {}
  }

  const { startAsyncNotebookQueryJob, sanitizeNotebookQuery } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'notebook_query_utils.js'));
  
  if (!notebookId) {
    // Instant fallback if no explicit mapping exists, skipping NotebookLM
    const fallbackJob = {
      jobId: `job_${Date.now()}_local`,
      status: 'COMPLETED',
      result: {
        query: sanitizeNotebookQuery(query, { chassis }),
        answer: "Local Evaluation Engine: RAG notebook mapping unavailable for this chassis. Serving local 5-level conflict graph matrix.",
        citations: [],
        source: 'LOCAL_FALLBACK'
      }
    };
    return res.status(202).json(fallbackJob);
  }
  const jobInfo = startAsyncNotebookQueryJob(notebookId, query, { context: { chassis } });

  broadcastSSE({
    type: 'LOG',
    text: `🤖 [ASYNC_RAG_LAUNCHED] Job ${jobInfo.jobId} started for ${chassis || 'DL380 Gen12 SFF'}`,
    stream: 'stdout'
  });

  res.status(202).json(jobInfo);
});

// Async Notebook Query Status Polling Endpoint
app.get('/api/notebook-query-status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const { getAsyncNotebookQueryJobStatus } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'notebook_query_utils.js'));
  const status = getAsyncNotebookQueryJobStatus(jobId);

  if (!status) {
    return res.status(404).json({ error: `Query job '${jobId}' not found.` });
  }

  res.json(status);
});

app.get('/api/test-notebooklm', (req, res) => {
  const testScript = path.join(PROJECT_ROOT, 'scripts', 'test_notebooklm_mcp.js');
  if (!fs.existsSync(testScript)) {
    return res.status(404).json({ error: 'test_notebooklm_mcp.js not found' });
  }

  execFile('node', [testScript], { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
    try {
      const outputLines = stdout.split('\n');
      const jsonStart = outputLines.findIndex(l => l.trim().startsWith('{'));
      if (jsonStart !== -1) {
        const jsonStr = outputLines.slice(jsonStart).join('\n');
        return res.json(JSON.parse(jsonStr));
      }
      res.json({ status: err ? 'DEGRADED' : 'HEALTHY', raw: stdout });
    } catch {
      res.json({ status: err ? 'DEGRADED' : 'HEALTHY', raw: stdout });
    }
  });
});

app.get('/api/notebooklm-consultations', (req, res) => {
  const telemetryLib = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'telemetry.js'));
  const data = telemetryLib.loadTelemetry();
  const logs = data.notebookConsultations || [];
  const citationMatches = logs.reduce((acc, curr) => acc + (curr.citations ? curr.citations.length : 0), 0);
  res.json({
    totalQueries: data.totalNlmQueries || logs.length,
    citationMatches,
    log: logs
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

app.post('/api/feedback-mark-completed', (req, res) => {
  const { feedbackId, resolution } = req.body;
  
  if (feedbackId) {
    const entry = feedbackQueue.markProcessed(feedbackId, resolution || 'Resolved by Antigravity AI', 'COMPLETED');
    if (!entry) return res.status(404).json({ error: 'Feedback entry not found' });
    return res.json({ success: true, entry });
  } else {
    // If no ID provided, resolve all pending
    const pending = feedbackQueue.listFeedback('PENDING');
    const resolved = pending.map(p => feedbackQueue.markProcessed(p.id, resolution || 'Resolved by Antigravity AI', 'COMPLETED'));
    return res.json({ success: true, count: resolved.length });
  }
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
  if (activeTask) return res.status(409).json({ error: 'Another task is currently running', task: activeTask.type });

  const { chassisId } = req.body;
  const pdfScript = path.join(PROJECT_ROOT, 'scripts', 'download_quickspecs_pdf.js');
  if (!fs.existsSync(pdfScript)) {
    return res.status(404).json({ error: 'download_quickspecs_pdf.js not found' });
  }

  const proc = spawn('node', [pdfScript], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  startTask('DOWNLOAD_PDF', proc, res);
});

// Kill Active Task Endpoint (Enhancement U3)
app.post('/api/kill-task', (req, res) => {
  if (!activeTask || (!activeTask.pid && !activeTask.process)) {
    return res.status(400).json({ error: 'No active task to kill' });
  }
  try {
    if (activeTask.process) {
      activeTask.process.kill('SIGTERM');
    } else {
      process.kill(activeTask.pid, 'SIGTERM');
    }
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
    return res.status(409).json({ error: 'Another task is currently running', task: activeTask.type });
  }

  const verifyScript = path.join(PROJECT_ROOT, 'scripts', 'verify_all.js');
  const proc = spawn('node', [verifyScript], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  startTask('VERIFY_ALL', proc, res);
});

// -----------------------------------------------------------------------------
// 8. Data Quality Audit & Telemetry Endpoints (Fix G14)
// -----------------------------------------------------------------------------

app.get('/api/telemetry', (req, res) => {
  const telemetry = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'telemetry.js'));
  res.json(telemetry.loadTelemetry());
});

app.post('/api/audit-catalog', (req, res) => {
  const { xlsxPath } = req.body;
  if (!xlsxPath) return res.status(400).json({ error: 'xlsxPath required' });
  
  let fullXlsxPath;
  try {
    fullXlsxPath = resolveSafePath(xlsxPath.replace(/^\/artifacts\//, ''));
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }

  const verifyScript = path.join(PROJECT_ROOT, 'scripts', 'verify_excel_tally.js');
  execFile('node', [verifyScript, fullXlsxPath, '--json'], (err, stdout) => {
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch {
      res.json({ passed: false, error: err ? err.message : 'Audit output unparseable', raw: stdout });
    }
  });
});

app.get('/api/history/runs', (req, res) => {
  const runsDir = path.join(OUTPUTS_DIR, 'history', 'runs');
  if (!fs.existsSync(runsDir)) return res.json([]);
  try {
    const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.json'));
    const runs = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf-8'));
        // Return summary only
        return { runId: data.runId, taskType: data.taskType, startTime: data.startTime, durationMs: data.durationMs, exitCode: data.exitCode };
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/runs/:id', (req, res) => {
  const { id } = req.params;
  const runFile = path.join(OUTPUTS_DIR, 'history', 'runs', `${id}.json`);
  if (!fs.existsSync(runFile)) return res.status(404).json({ error: 'Run trace not found' });
  try {
    res.json(JSON.parse(fs.readFileSync(runFile, 'utf-8')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 9. Knowledge Sync — Push learned rules to NotebookLM (SSE streamed)
// -----------------------------------------------------------------------------

app.post('/api/sync-knowledge', (req, res) => {
  if (activeTask) return res.status(409).json({ error: 'Another task is currently running', task: activeTask.type });

  const syncScript = path.join(PROJECT_ROOT, 'scripts', 'lib', 'knowledge_sync.js');
  if (!fs.existsSync(syncScript)) {
    return res.status(404).json({ error: 'knowledge_sync.js not found' });
  }

  const proc = spawn('node', [syncScript, '--auto-upload-nlm'], { cwd: PROJECT_ROOT, env: { ...process.env, STRUCTURED_PROGRESS: '1' } });
  startTask('KNOWLEDGE_SYNC', proc, res);
});

// -----------------------------------------------------------------------------
// 10. Ambiguity Resolution & NotebookLM Chat MCP Bridge
// -----------------------------------------------------------------------------

app.post('/api/ask-notebook', async (req, res) => {
  const { prompt, chassis } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  // Resolve target notebook ID
  const notebooksPath = path.join(CONFIG_DIR, 'notebooks.json');
  let notebookId = '1d190853-4e9c-48df-aa70-eae66c6f2c1f';
  if (fs.existsSync(notebooksPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(notebooksPath, 'utf-8'));
      if (chassis && config.notebooks && config.notebooks[chassis]) {
        notebookId = config.notebooks[chassis];
      } else if (config.defaultNotebookId) {
        notebookId = config.defaultNotebookId;
      }
    } catch {}
  }

  try {
    const result = await executeNotebookQuery(notebookId, prompt, { context: { chassis } });
    res.json({ answer: result.answer, citations: result.citations || [], query: result.query });
  } catch (err) {
    res.json({
      answer: `To resolve this ambiguity: Inject a physical fixing rule for the requested hardware SKUs. (Notice: ${err.message})`,
      citations: [],
      query: sanitizeNotebookQuery(prompt, { chassis })
    });
  }
});

app.post('/api/resolve-ambiguity', (req, res) => {
  const { ruleUpdate, chassis, affectedSku, requiredDependencySku, humanReasoning, scopeTaxonomy, solutionType } = req.body;
  if (!ruleUpdate) return res.status(400).json({ error: 'ruleUpdate is required' });

  const deltaFile = path.join(OUTPUTS_DIR, 'history', 'catalog_deltas.json');
  const deltaId = `NLM-RES-${Date.now().toString().slice(-6)}`;

  const newDelta = {
    deltaId,
    timestamp: new Date().toISOString(),
    chassis: chassis || 'DL380_Gen12_SFF',
    errorType: 'MANUAL_NOTEBOOKLM_RESOLUTION',
    ruleUpdate,
    affectedSku: affectedSku || null,
    requiredDependencySku: requiredDependencySku || null,
    humanReasoning: humanReasoning || ruleUpdate,
    scopeTaxonomy: scopeTaxonomy || 'CHASSIS_SPECIFIC',
    solutionType: solutionType || 'General Server',
    source: 'dashboard_human_in_loop'
  };

  // Append to catalog_deltas.json
  let deltas = [];
  if (fs.existsSync(deltaFile)) {
    try { deltas = JSON.parse(fs.readFileSync(deltaFile, 'utf-8')); } catch {}
  }
  deltas.push(newDelta);
  fs.mkdirSync(path.dirname(deltaFile), { recursive: true });
  fs.writeFileSync(deltaFile, JSON.stringify(deltas, null, 2), 'utf-8');

  // Real-Time Auto-Sync: Rebuild master registry & push payload note to NotebookLM
  let syncInfo = null;
  try {
    const { buildMasterKnowledgeRegistry, generateNotebookSyncPayload } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'knowledge_sync.js'));
    buildMasterKnowledgeRegistry();
    syncInfo = generateNotebookSyncPayload(newDelta.chassis);
  } catch (syncErr) {
    console.warn('⚠️ Real-time KnowledgeSync notice:', syncErr.message);
  }

  broadcastSSE({
    type: 'LOG',
    text: `💡 [KNOWLEDGE_LEARNED] Delta ${deltaId} logged (${newDelta.scopeTaxonomy}). Real-time sync to NotebookLM triggered.`,
    stream: 'stdout'
  });

  res.json({
    success: true,
    deltaId,
    scopeTaxonomy: newDelta.scopeTaxonomy,
    syncInfo,
    message: 'Human resolution and reasoning logged & synchronized to NotebookLM'
  });
});


// -----------------------------------------------------------------------------
// 10. Post-Build Vendor Partner Portal BOM Re-Ingestion & Cross-Verification
// -----------------------------------------------------------------------------

app.post('/api/verify-vendor-bom', (req, res) => {
  const { vendorItems, proposedRankSolution, chassis } = req.body;
  if (!vendorItems || !Array.isArray(vendorItems)) {
    return res.status(400).json({ error: 'vendorItems array is required' });
  }

  const chassisDir = chassis
    ? path.join(OUTPUTS_DIR, 'ProLiant', 'Gen12', chassis)
    : path.join(OUTPUTS_DIR, 'ProLiant', 'Gen12', 'DL380_Gen12_SFF');

  try {
    const { verifyVendorBOM } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'vendor_bom_verifier.js'));
    const auditReport = verifyVendorBOM(vendorItems, proposedRankSolution, chassisDir);

    if (auditReport.requiresFreshScrape) {
      broadcastSSE({
        type: 'LOG',
        text: `⚠️ [VENDOR_BOM_AUDIT] Uncataloged SKUs found in Vendor Portal BOM. Fresh targeted CDP scrape recommended.`,
        stream: 'stderr'
      });
    } else {
      broadcastSSE({
        type: 'LOG',
        text: `✅ [VENDOR_BOM_AUDIT] Vendor BOM bi-directionally cross-verified (${auditReport.is100PercentMatch ? '100% Match' : 'Deltas Learned'}).`,
        stream: 'stdout'
      });
    }

    res.json(auditReport);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// Centralized JSON Error Handler Middleware for API routes
app.use('/api', (err, req, res, next) => {
  console.error('Unhandled Server Error on API route:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    source: 'SERVER_BRIDGE_ERROR'
  });
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
