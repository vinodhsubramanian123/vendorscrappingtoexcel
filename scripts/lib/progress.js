'use strict';
/**
 * scripts/lib/progress.js — Structured Progress Event Emitter
 *
 * Provides a uniform protocol for emitting step-by-step progress events
 * from CLI scripts. When STRUCTURED_PROGRESS=1 env var is set (by dashboard server.js),
 * events are written as newline-delimited JSON to stdout for SSE streaming.
 * Otherwise, standard console.log output is used.
 */

/**
 * Emit a structured progress event.
 * @param {number} step Current step number (1-indexed)
 * @param {number} total Total number of steps
 * @param {string} action Human-readable action description (e.g. "Expanding DOM sections")
 * @param {string} status Event status: 'started', 'in_progress', 'completed', 'error', 'skipped'
 * @param {string} detail Optional additional detail text
 */
function emitProgress(step, total, action, status = 'in_progress', detail = '') {
  if (process.env.STRUCTURED_PROGRESS === '1') {
    const event = {
      type: 'progress',
      step,
      total,
      action,
      status,
      detail,
      timestamp: new Date().toISOString()
    };
    process.stdout.write(JSON.stringify(event) + '\n');
  } else {
    const icon = status === 'completed' ? '✅' :
                 status === 'error' ? '❌' :
                 status === 'skipped' ? '⏭️' :
                 status === 'started' ? '🚀' : '⏳';
    console.log(`${icon} Step ${step}/${total}: ${action}${detail ? ' — ' + detail : ''}`);
  }
}

/**
 * Emit a structured log event (non-step, informational).
 * @param {string} level Log level: 'info', 'warn', 'error', 'success', 'debug'
 * @param {string} message Log message text
 * @param {object} data Optional structured data payload
 */
function emitLog(level, message, data = null) {
  if (process.env.STRUCTURED_PROGRESS === '1') {
    const event = {
      type: 'log',
      level,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    process.stdout.write(JSON.stringify(event) + '\n');
  } else {
    const prefix = level === 'error' ? '❌' :
                   level === 'warn' ? '⚠️' :
                   level === 'success' ? '✅' :
                   level === 'debug' ? '🔍' : 'ℹ️';
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Emit a final result event with the complete payload.
 * @param {string} status Overall status: 'SUCCESS' or 'ERROR'
 * @param {object} data The full result payload
 * @param {string} error Optional error message if status is 'ERROR'
 */
function emitResult(status, data = {}, error = '') {
  if (process.env.STRUCTURED_PROGRESS === '1') {
    const event = {
      type: 'result',
      status,
      data,
      error: error || undefined,
      timestamp: new Date().toISOString()
    };
    process.stdout.write(JSON.stringify(event) + '\n');
  }
}

module.exports = {
  emitProgress,
  emitLog,
  emitResult
};
