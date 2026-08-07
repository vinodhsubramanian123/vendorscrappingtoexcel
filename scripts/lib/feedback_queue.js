'use strict';
/**
 * scripts/lib/feedback_queue.js — User Feedback Queue for Dashboard Feature Requests
 *
 * Manages a persistent JSON queue at outputs/history/user_feedback_queue.json
 * for dashboard Component 8 (Feature Request & Self-Improving UI Loop).
 * Entries are timestamped and categorized for review by the Antigravity agent.
 */

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const QUEUE_FILE = path.join(PROJECT_ROOT, 'outputs', 'history', 'user_feedback_queue.json');

/**
 * Load the current feedback queue from disk, or initialize an empty queue.
 * @returns {Array<object>} Queue entries
 */
function loadQueue() {
  if (fs.existsSync(QUEUE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    } catch {}
  }
  return [];
}

/**
 * Persist the queue to disk.
 * @param {Array<object>} queue
 */
function saveQueue(queue) {
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
}

/**
 * Append a new feedback entry to the queue.
 * @param {string} feedbackText The user's feedback or feature request text
 * @param {string} category Category of the feedback (e.g. 'ui_tweak', 'bug_report', 'feature_request', 'data_issue')
 * @param {object} context Optional context object (e.g. { component: 'ResolutionMatrix', chassis: 'DL380_Gen12_SFF' })
 * @returns {object} The created feedback entry
 */
function appendFeedback(feedbackText, category = 'feature_request', context = {}) {
  const queue = loadQueue();

  const entry = {
    id: `FB-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    text: String(feedbackText || '').trim(),
    category: String(category || 'feature_request'),
    context: context || {},
    status: 'PENDING', // PENDING → IN_PROGRESS → COMPLETED → REJECTED
    resolution: null,
    resolvedAt: null
  };

  queue.push(entry);
  saveQueue(queue);

  return entry;
}

/**
 * List all feedback entries, optionally filtered by status.
 * @param {string|null} statusFilter Optional status filter ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED')
 * @returns {Array<object>} Filtered queue entries
 */
function listFeedback(statusFilter = null) {
  const queue = loadQueue();
  if (!statusFilter) return queue;
  return queue.filter(e => e.status === statusFilter);
}

/**
 * Mark a feedback entry as processed/completed.
 * @param {string} feedbackId The feedback entry ID
 * @param {string} resolution Description of how the feedback was addressed
 * @param {string} status New status (default: 'COMPLETED')
 * @returns {object|null} Updated entry or null if not found
 */
function markProcessed(feedbackId, resolution = '', status = 'COMPLETED') {
  const queue = loadQueue();
  const entry = queue.find(e => e.id === feedbackId);
  if (!entry) return null;

  entry.status = status;
  entry.resolution = resolution;
  entry.resolvedAt = new Date().toISOString();

  saveQueue(queue);
  return entry;
}

/**
 * Get queue summary statistics.
 * @returns {object} { total, pending, inProgress, completed, rejected }
 */
function getQueueStats() {
  const queue = loadQueue();
  return {
    total: queue.length,
    pending: queue.filter(e => e.status === 'PENDING').length,
    inProgress: queue.filter(e => e.status === 'IN_PROGRESS').length,
    completed: queue.filter(e => e.status === 'COMPLETED').length,
    rejected: queue.filter(e => e.status === 'REJECTED').length
  };
}

/**
 * Get the next pending feedback entry for agent auto-pickup.
 * @returns {object|null} Next pending entry or null
 */
function getNextPendingFeedback() {
  const pending = listFeedback('PENDING');
  return pending.length > 0 ? pending[0] : null;
}

/**
 * Format a feedback queue entry into an actionable prompt for Antigravity AI pair-programming agent.
 * @param {object} entry 
 * @returns {string} Formatted agent task prompt
 */
function formatAgentTaskPrompt(entry) {
  if (!entry) return '';
  let prompt = `User submitted in-dashboard feedback/feature request [${entry.id}]:\n\n`;
  prompt += `Category: ${entry.category}\n`;
  prompt += `Timestamp: ${entry.timestamp}\n`;
  prompt += `Feedback Text: "${entry.text}"\n`;
  if (entry.context && Object.keys(entry.context).length > 0) {
    prompt += `Context: ${JSON.stringify(entry.context, null, 2)}\n`;
  }
  prompt += `\nInstructions for Agent:\n`;
  prompt += `1. Review requested changes in context of dashboard codebase (dashboard/src/ or scripts/lib/).\n`;
  prompt += `2. Perform necessary edits to implement request or resolve reported bug.\n`;
  prompt += `3. Run npm run test:all to verify zero regressions.\n`;
  prompt += `4. Mark feedback item ${entry.id} as COMPLETED using markProcessed("${entry.id}", "Resolution details").\n`;
  return prompt;
}

module.exports = {
  appendFeedback,
  listFeedback,
  markProcessed,
  getQueueStats,
  getNextPendingFeedback,
  formatAgentTaskPrompt,
  QUEUE_FILE
};
