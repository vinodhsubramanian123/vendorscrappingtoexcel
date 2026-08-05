'use strict';
/**
 * scripts/lib/logger.js — Structured Cross-Platform Logger
 *
 * Provides ISO-timestamped, severity-aware logging with optional JSON-lines
 * output mode and ASCII emoji fallbacks on Windows legacy terminals.
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

function formatMessage(context, level, msg, meta = null) {
  const timestamp = new Date().toISOString();
  if (useJson) {
    return JSON.stringify({ timestamp, level, context, message: msg, ...(meta ? { meta } : {}) });
  }
  const prefix = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${context}]`;
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
    SYMBOLS
  };
}

module.exports = createLogger;
