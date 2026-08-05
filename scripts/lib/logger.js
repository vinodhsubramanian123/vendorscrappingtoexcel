'use strict';
/**
 * scripts/lib/logger.js — Structured Dynamic Local Timezone Logger
 *
 * Automatically detects and formats log timestamps in the host machine's
 * current local timezone (e.g. IST in India, GST in Dubai, PST in US)
 * without hardcoded offsets or location assumptions.
 */

const isWindows = process.platform === 'win32';
const useJson   = (process.env.LOG_FORMAT || '').toLowerCase() === 'json';
const logLevel  = (process.env.LOG_LEVEL || 'info').toLowerCase();

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const currentLevel = LEVELS[logLevel] || LEVELS.info;

const SYMBOLS = isWindows ? {
  pass: '[PASS]', fail: '[FAIL]', warn: '[WARN]', info: '[INFO]',
  step: '[STEP]', launch: '[START]', success: '[OK]', debug: '[DBG]'
} : {
  pass: '✅', fail: '❌', warn: '⚠️', info: 'ℹ️',
  step: '📌', launch: '🚀', success: '🎉', debug: '🔍'
};

/**
 * Get the system's timezone name / short abbreviation (e.g., IST, GST, PST, UTC).
 */
function getSystemTimezone() {
  try {
    const tzMatch = new Date().toTimeString().match(/\((.+)\)$/);
    if (tzMatch && tzMatch[1]) return tzMatch[1];
  } catch {}
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {}
  return 'UTC';
}

/**
 * Format a Date object into local YYYY-MM-DD HH:mm:ss TZ string dynamically.
 * Automatically adapts whether executed in India (IST), Dubai (GST), US, Europe, etc.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function getLocalTimestamp(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins  = String(d.getMinutes()).padStart(2, '0');
  const secs  = String(d.getSeconds()).padStart(2, '0');
  const tz    = getSystemTimezone();

  return `${year}-${month}-${day} ${hours}:${mins}:${secs} ${tz}`;
}

function formatMessage(context, level, msg, meta = null) {
  const date = new Date();
  const timestampISO = date.toISOString();
  const timestampLocal = getLocalTimestamp(date);

  if (useJson) {
    return JSON.stringify({
      timestamp: timestampISO,
      timestampLocal,
      level,
      context,
      message: msg,
      ...(meta ? { meta } : {})
    });
  }

  const prefix = `[${timestampLocal}] [${level.toUpperCase().padEnd(5)}] [${context}]`;
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `${prefix} ${msg}${metaStr}`;
}

function createLogger(context = 'App') {
  const startTime = Date.now();
  const stepTimes = {};

  return {
    debug(msg, meta) {
      if (currentLevel <= LEVELS.debug) console.log(formatMessage(context, 'debug', msg, meta));
    },
    info(msg, meta) {
      if (currentLevel <= LEVELS.info) console.log(formatMessage(context, 'info', msg, meta));
    },
    warn(msg, meta) {
      if (currentLevel <= LEVELS.warn) console.warn(formatMessage(context, 'warn', `${SYMBOLS.warn} ${msg}`, meta));
    },
    error(msg, meta) {
      if (currentLevel <= LEVELS.error) console.error(formatMessage(context, 'error', `${SYMBOLS.fail} ${msg}`, meta));
    },
    fatal(msg, meta) {
      if (currentLevel <= LEVELS.fatal) console.error(formatMessage(context, 'fatal', `${SYMBOLS.fail} ${msg}`, meta));
    },
    pass(msg, meta) {
      if (currentLevel <= LEVELS.info) console.log(formatMessage(context, 'info', `${SYMBOLS.pass} ${msg}`, meta));
    },
    step(num, title) {
      stepTimes[num] = Date.now();
      if (currentLevel <= LEVELS.info) {
        console.log(formatMessage(context, 'info', `\n--- STEP ${num}: ${title} ---`));
      }
    },
    stepEnd(num, title) {
      const duration = stepTimes[num] ? Date.now() - stepTimes[num] : 0;
      if (currentLevel <= LEVELS.info) {
        console.log(formatMessage(context, 'info', `Completed Step ${num}: ${title} (${duration} ms)`));
      }
    },
    summary(status = 'SUCCESS', extra = {}) {
      const totalDuration = Date.now() - startTime;
      const meta = { totalDurationMs: totalDuration, status, ...extra };
      console.log(formatMessage(context, 'info', `${SYMBOLS.success} PIPELINE SUMMARY: ${status} in ${totalDuration} ms`, meta));
    },
    SYMBOLS,
    getLocalTimestamp,
    getSystemTimezone
  };
}

createLogger.getLocalTimestamp = getLocalTimestamp;
createLogger.getSystemTimezone = getSystemTimezone;

module.exports = createLogger;
