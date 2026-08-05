'use strict';
/**
 * scripts/lib/cdp.js — Shared Chrome DevTools Protocol utilities
 *
 * Imported by all scraping scripts to avoid copy-paste drift and
 * inconsistent timeouts. Every caller gets the same robust
 * sendCommand, getOCATarget, getAnyPageTarget, connectWS, and sleep.
 */

const WebSocket = require('ws');
const http      = require('http');

const CDP_PORT        = 9222;
const DEFAULT_TIMEOUT = 45000;   // ms — generous for slow OCA pages

let _nextMsgId = 1;

/**
 * Send one CDP command on an open WebSocket and await its response.
 * @param {WebSocket} ws
 * @param {string}    method  e.g. 'Runtime.evaluate'
 * @param {object}    [params]
 * @param {number}    [timeoutMs]
 * @returns {Promise<object>} result field from the CDP response
 */
function sendCommand(ws, method, params = {}, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const id = _nextMsgId++;
    let timer;

    const handler = (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.id !== id) return;
      ws.removeListener('message', handler);
      clearTimeout(timer);
      if (msg.error) reject(new Error(`CDP error [${method}]: ${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    };

    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));

    timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`CDP timeout (${timeoutMs} ms) waiting for: ${method}`));
    }, timeoutMs);
  });
}

/**
 * Find the active OCA browser tab.
 * Matches on URL (oca.ext.hpe.com) or page title containing 'OCA'.
 * Throws a detailed diagnostic error if no matching tab is open.
 */
function getOCATarget() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const pages   = targets.filter(t => t.type === 'page');

          // Primary match: active OCA configuration portal tab
          const ocaPage = pages.find(
            t => (t.url && t.url.includes('oca.ext.hpe.com')) ||
                 (t.title && t.title.includes('OCA'))
          );
          if (ocaPage) return resolve(ocaPage);

          // Secondary diagnostic: check if HPE Partner Portal is open
          const partnerPage = pages.find(t => t.url && t.url.includes('partner.hpe.com'));
          const openTabList = pages.map(t => `   - [${t.id}] ${t.title || 'Untitled'} (${t.url})`).join('\n');

          let errHelp = `No active HPE OCA page (oca.ext.hpe.com) found on CDP port ${CDP_PORT}.\n`;
          if (partnerPage) {
            errHelp += `💡 Found active HPE Partner Portal session at: ${partnerPage.url}\n` +
                       `   Please click through to the OCA / Configuration Application portal in your browser tab.\n`;
          } else {
            errHelp += `💡 Ensure you are logged into the HPE Partner Portal and have opened OCA in your browser.\n`;
          }
          errHelp += `Currently open browser page tabs (${pages.length}):\n${openTabList || '   (none)'}`;

          reject(new Error(errHelp));
        } catch (e) { reject(e); }
      });
    }).on('error', e =>
      reject(new Error(`Cannot reach CDP on port ${CDP_PORT}: ${e.message}\nEnsure Chrome / Antigravity browser is running with --remote-debugging-port=${CDP_PORT}`))
    );
  });
}

/**
 * Find the first non-Antigravity page target.
 * Used by the QuickSpecs PDF downloader to open a helper tab
 * without disturbing the active OCA session.
 */
function getAnyPageTarget() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const page = targets.find(
            t => t.type === 'page' && !t.url.includes('antigravity')
          );
          if (page) resolve(page);
          else reject(new Error('No usable Chrome page target found on port 9222'));
        } catch (e) { reject(e); }
      });
    }).on('error', e =>
      reject(new Error(`Cannot reach CDP on port ${CDP_PORT}: ${e.message}`))
    );
  });
}

/**
 * Open a WebSocket connection to the given CDP debugger URL.
 * Resolves with the open WebSocket instance.
 */
async function connectWS(debuggerUrl, retries = 3, backoffMs = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const ws = new WebSocket(debuggerUrl);
        ws.once('open', () => resolve(ws));
        ws.once('error', reject);
      });
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(backoffMs * attempt);
    }
  }
}

/**
 * Automatically handle JS alert/confirm dialogs and DOM modal popups (WebLogic / legacy UI).
 */
async function setupDialogAutoHandler(ws) {
  try {
    await sendCommand(ws, 'Page.enable');
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.method === 'Page.javascriptDialogOpening') {
          console.log(`  ⚡ JS Dialog Intercepted: "${msg.params.message}" (${msg.params.type}) — Auto Accepting...`);
          await sendCommand(ws, 'Page.handleJavaScriptDialog', { accept: true });
        }
      } catch {}
    });
  } catch {}
}

/**
 * Handle DOM session extension prompts and modal proceed/confirm buttons.
 */
async function dismissDOMModals(ws) {
  try {
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        // Handle session keep-alive or timeout prompts
        const sessionBtns = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
          .filter(el => {
            const t = (el.innerText || el.value || '').trim().toLowerCase();
            return t.includes('continue session') || t.includes('stay logged in') || t.includes('extend session');
          });
        sessionBtns.forEach(btn => btn.click());

        // Handle modal confirmation dialogs (Proceed / Continue / Confirm / OK) — ignoring Cancel / Delete
        const confirmBtns = Array.from(document.querySelectorAll('.modal-dialog button, .ui-dialog button, .dialog-button, .popup-button, .modal-footer button, #btnContinue, .btn-confirm'))
          .filter(el => {
            const t = (el.innerText || el.value || '').trim().toLowerCase();
            return (t === 'proceed' || t === 'continue' || t === 'ok' || t === 'yes' || t === 'confirm' || t === 'accept')
              && !t.includes('cancel') && !t.includes('delete') && !t.includes('remove');
          });
        confirmBtns.forEach(btn => btn.click());
      })()`
    });
  } catch {}
}

/** Async sleep helper */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = { sendCommand, getOCATarget, getAnyPageTarget, connectWS, setupDialogAutoHandler, dismissDOMModals, sleep, CDP_PORT };
