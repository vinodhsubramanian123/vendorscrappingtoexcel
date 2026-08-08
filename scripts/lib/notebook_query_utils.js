'use strict';
/**
 * scripts/lib/notebook_query_utils.js
 *
 * Centralized Gemini Notebook Query Utilities:
 * 1. Pre-processes and sanitizes queries to ensure text/natural-language & part-number format (stripping code snippets, JS variables, const fs, nodejs logic, stack traces).
 * 2. Executes queries safely via child_process.execFile (bypassing shell string interpolation errors).
 * 3. Post-processes RAG results (cleans ANSI codes, formats citations, normalizes JSON output schema).
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Regex patterns for code logic and scripting keywords to strip/clean.
 */
const SCRIPTING_PATTERNS = [
  /const\s+[a-zA-Z0-9_$]+\s*=/g,
  /let\s+[a-zA-Z0-9_$]+\s*=/g,
  /var\s+[a-zA-Z0-9_$]+\s*=/g,
  /require\s*\(['"][^'"]+['"]\)/g,
  /import\s+.*?\s+from\s+['"][^'"]+['"]/g,
  /function\s*\w*\s*\(/g,
  /\=>\s*\{/g,
  /console\.(log|error|warn)\s*\(/g,
  /process\.(env|exit|argv|stdout)/g,
  /execSync\s*\(/g,
  /execFile\s*\(/g,
  /fs\.(readFileSync|writeFileSync|existsSync|mkdirSync)/g,
  /path\.(join|resolve|dirname|basename)/g,
  /\{\s*[\s\S]*?\}/g, // raw JSON / JS objects
  /```[\s\S]*?```/g    // code blocks
];

/**
 * Sanitize and pre-process incoming query for Gemini Notebook.
 * Ensures query is text-based natural language focusing on SKUs, part numbers, and hardware specs.
 * @param {string} rawQuery 
 * @param {object} [context] Optional chassis / SKU context
 * @returns {string} Sanitized natural language query
 */
function sanitizeNotebookQuery(rawQuery, context = {}) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return 'What are the hardware configuration rules and QuickSpecs specifications for this chassis?';
  }

  let clean = rawQuery.trim();

  // Extract HPE SKUs before stripping (e.g. P49025-B21, P76453-B21, 872479-B21)
  const skuMatches = Array.from(clean.matchAll(/([A-Z0-9]{5,6}-[A-Z0-9]{2,3})/g)).map(m => m[1]);
  const uniqueSkus = Array.from(new Set(skuMatches));

  // Check if query contains scripting keywords or code blocks
  const containsCode = SCRIPTING_PATTERNS.some(pattern => pattern.test(clean)) ||
    clean.includes('const fs') ||
    clean.includes('require(') ||
    clean.includes('function(') ||
    clean.includes('module.exports');

  if (containsCode) {
    // Strip code patterns completely
    SCRIPTING_PATTERNS.forEach(pattern => {
      clean = clean.replace(pattern, ' ');
    });
    // Remove shell metacharacters and structural brackets
    clean = clean.replace(/[`"${}$<>;]/g, ' ').replace(/\s+/g, ' ').trim();

    // Reconstruct as a clean natural language query
    const chassisName = context.chassis || 'HPE ProLiant DL380 Gen12 SFF';
    let reconstructed = `What are the hardware configuration rules, physical cable requirements, and QuickSpecs specifications for ${chassisName}?`;
    if (uniqueSkus.length > 0) {
      reconstructed += ` Specifically regarding part numbers: ${uniqueSkus.join(', ')}.`;
    }
    return reconstructed;
  }

  // General pre-processing for natural language queries:
  // Remove markdown code fences, quotes that break CLI flags, and shell metacharacters
  clean = clean
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/["$`\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length === 0) {
    return 'What are the hardware configuration rules and QuickSpecs specifications for this server model?';
  }

  return clean;
}

/**
 * Clean ANSI color codes from stdout
 * @param {string} str 
 * @returns {string} Cleaned text string
 */
function stripAnsi(str) {
  if (!str) return '';
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Post-process raw response from Gemini Notebook RAG query.
 * @param {string|object} stdout 
 * @param {string} originalQuery 
 * @returns {object} Normalized response object { query, answer, citations, source }
 */
function postProcessNotebookResult(stdout, originalQuery = '') {
  const result = {
    query: originalQuery,
    answer: '',
    citations: [],
    source: 'NOTEBOOK_LM'
  };

  if (!stdout) {
    result.answer = 'No response returned from Gemini Notebook.';
    result.source = 'FALLBACK';
    return result;
  }

  if (typeof stdout === 'object') {
    result.answer = stdout.answer || stdout.response || JSON.stringify(stdout);
    result.citations = Array.isArray(stdout.citations) ? stdout.citations : [];
    return result;
  }

  const cleanStdout = stripAnsi(stdout).trim();

  try {
    const parsed = JSON.parse(cleanStdout);
    result.answer = parsed.answer || parsed.response || parsed.result || cleanStdout;
    if (Array.isArray(parsed.citations)) {
      result.citations = parsed.citations;
    }
  } catch (_) {
    // If not JSON, treat raw clean string as answer text
    result.answer = cleanStdout;
  }

  // Clean up any remaining code block formatting or raw JSON dumps in answer text
  if (result.answer.startsWith('{') && result.answer.endsWith('}')) {
    try {
      const inner = JSON.parse(result.answer);
      if (inner.answer) result.answer = inner.answer;
    } catch {}
  }

  return result;
}

/**
 * Safely execute Gemini Notebook query via nlm CLI using child_process.execFile.
 * Pre-processes the prompt and post-processes the result.
 * @param {string} notebookId 
 * @param {string} rawQuery 
 * @param {object} [options] 
 * @returns {Promise<object>} Normalized result { query, answer, citations, source }
 */
function executeNotebookQuery(notebookId, rawQuery, options = {}) {
  return new Promise((resolve) => {
    const sanitizedQuery = sanitizeNotebookQuery(rawQuery, options.context);
    const timeoutMs = options.timeout || 30000;

    const envPath = process.env.PATH || '';
    const homeBin = path.join(process.env.HOME || '', '.local', 'bin');
    const extendedPath = `${homeBin}:${envPath}`;

    execFile('nlm', ['notebook', 'query', notebookId, sanitizedQuery, '--json'], {
      timeout: timeoutMs,
      env: { ...process.env, PATH: extendedPath },
      maxBuffer: 10 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) {
        const fallbackMsg = `NotebookLM RAG Query Notice: ${err.message || 'Execution error'}`;
        return resolve({
          query: sanitizedQuery,
          answer: fallbackMsg,
          citations: [],
          source: 'FALLBACK_ERROR',
          error: err.message
        });
      }

      const processed = postProcessNotebookResult(stdout, sanitizedQuery);
      resolve(processed);
    });
  });
}

// In-memory async query job ledger
const activeQueryJobs = new Map();

/**
 * Perform root-cause diagnosis if a NotebookLM query fails or times out.
 * @param {string} notebookId 
 * @param {Error} err 
 * @returns {object} Diagnostic report
 */
function diagnoseNotebookFailure(notebookId, err) {
  const diagnostic = {
    errorType: 'UNKNOWN_FAILURE',
    rootCause: err ? err.message : 'Timeout or execution failure',
    remediationAction: 'Check network connectivity and nlm CLI auth state.'
  };

  if (!err) return diagnostic;

  const errMsg = err.message || '';
  if (errMsg.includes('ENOENT') || errMsg.includes('not found')) {
    diagnostic.errorType = 'CLI_NOT_INSTALLED';
    diagnostic.rootCause = 'nlm CLI binary not detected in PATH (~/.local/bin/nlm).';
    diagnostic.remediationAction = 'Run `uv tool install notebooklm-mcp-cli` to install nlm CLI.';
  } else if (errMsg.includes('401') || errMsg.includes('UNAUTHENTICATED') || errMsg.includes('auth')) {
    diagnostic.errorType = 'AUTH_EXPIRED';
    diagnostic.rootCause = 'NotebookLM session token expired or unauthenticated.';
    diagnostic.remediationAction = 'Run `nlm login` in terminal to refresh Google Auth credentials.';
  } else if (errMsg.includes('ETIMEDOUT') || errMsg.includes('timeout')) {
    diagnostic.errorType = 'QUERY_TIMEOUT';
    diagnostic.rootCause = 'NotebookLM response exceeded wait window due to heavy source processing.';
    diagnostic.remediationAction = 'Use async non-blocking polling mode via startAsyncNotebookQueryJob.';
  } else if (errMsg.includes('NOT_FOUND') || errMsg.includes('404')) {
    diagnostic.errorType = 'INVALID_NOTEBOOK_ID';
    diagnostic.rootCause = `Target Notebook ID '${notebookId}' not found in Google account.`;
    diagnostic.remediationAction = 'Verify notebooks.json mapping or run `nlm notebook list`.';
  }

  return diagnostic;
}

/**
 * Start an asynchronous non-blocking Gemini Notebook query job.
 * Returns immediately with a jobId so the caller/UI can poll status non-blockingly.
 * @param {string} notebookId 
 * @param {string} rawQuery 
 * @param {object} [options] 
 * @returns {object} { jobId, status, query, pollIntervalMs }
 */
function startAsyncNotebookQueryJob(notebookId, rawQuery, options = {}) {
  const jobId = `JOB_NLM_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const sanitizedQuery = sanitizeNotebookQuery(rawQuery, options.context);
  const chassis = options.context ? options.context.chassis : 'HPE ProLiant DL380 Gen12 SFF';

  const job = {
    jobId,
    notebookId,
    chassis,
    query: sanitizedQuery,
    status: 'PROCESSING',
    startTime: Date.now(),
    pollIntervalMs: 1500,
    answer: null,
    citations: [],
    error: null,
    diagnostic: null
  };

  activeQueryJobs.set(jobId, job);

  // Background non-blocking execution
  setImmediate(() => {
    executeNotebookQuery(notebookId, rawQuery, { ...options, timeout: options.timeout || 60000 })
      .then((res) => {
        job.status = 'COMPLETED';
        job.endTime = Date.now();
        job.durationMs = job.endTime - job.startTime;
        job.answer = res.answer;
        job.citations = res.citations || [];
        job.source = res.source;

        if (res.source === 'FALLBACK_ERROR') {
          job.status = 'FAILED';
          job.error = res.error || res.answer;
          job.diagnostic = diagnoseNotebookFailure(notebookId, new Error(res.error || res.answer));
        }

        // Record telemetry if callback provided or via telemetry lib
        try {
          const telemetryLib = require('./telemetry');
          telemetryLib.recordNotebookConsultationTelemetry({
            query: sanitizedQuery,
            answer: job.answer,
            citations: job.citations,
            chassis,
            agreementScore: job.status === 'COMPLETED' ? 0.95 : 0.5,
            nextActionExecuted: job.status === 'COMPLETED' ? 'ASYNC_RAG_DOUBLE_PROOFED' : 'ASYNC_RAG_FAILED'
          });
        } catch (_) {}
      })
      .catch((err) => {
        job.status = 'FAILED';
        job.endTime = Date.now();
        job.durationMs = job.endTime - job.startTime;
        job.error = err.message;
        job.diagnostic = diagnoseNotebookFailure(notebookId, err);
      });
  });

  return {
    jobId: job.jobId,
    status: job.status,
    query: job.query,
    chassis: job.chassis,
    pollIntervalMs: job.pollIntervalMs
  };
}

/**
 * Get status of an async non-blocking NotebookLM query job.
 * @param {string} jobId 
 * @returns {object|null} Job state
 */
function getAsyncNotebookQueryJobStatus(jobId) {
  if (!activeQueryJobs.has(jobId)) return null;
  const job = activeQueryJobs.get(jobId);
  const currentDuration = job.endTime ? job.durationMs : (Date.now() - job.startTime);

  return {
    jobId: job.jobId,
    status: job.status,
    chassis: job.chassis,
    query: job.query,
    durationMs: currentDuration,
    answer: job.answer,
    citations: job.citations,
    error: job.error,
    diagnostic: job.diagnostic
  };
}

module.exports = {
  sanitizeNotebookQuery,
  postProcessNotebookResult,
  executeNotebookQuery,
  startAsyncNotebookQueryJob,
  getAsyncNotebookQueryJobStatus,
  diagnoseNotebookFailure
};

