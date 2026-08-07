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
const domExtract = require('./dom_extract');

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
    let timer = null;

    const cleanup = () => {
      ws.removeListener('message', handler);
      ws.removeListener('close', closeHandler);
      if (timer) clearTimeout(timer);
    };

    const handler = (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.id !== id) return;
      cleanup();
      if (msg.error) reject(new Error(`CDP error [${method}]: ${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    };

    const closeHandler = () => {
      cleanup();
      reject(new Error(`WebSocket closed unexpectedly while waiting for CDP command: ${method}`));
    };

    ws.on('message', handler);
    ws.on('close', closeHandler);

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`CDP timeout (${timeoutMs} ms) waiting for: ${method}`));
    }, timeoutMs);

    try {
      ws.send(JSON.stringify({ id, method, params }));
    } catch (err) {
      cleanup();
      reject(new Error(`Failed to send CDP command [${method}]: ${err.message}`));
    }
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
 * Automatically handle JS alert/confirm dialogs, permission requests, and DOM modal popups (WebLogic / legacy UI).
 */
async function setupDialogAutoHandler(ws) {
  if (ws._dialogHandlerAttached) return;
  ws._dialogHandlerAttached = true;

  try {
    await sendCommand(ws, 'Page.enable');
    // Enable download behavior to prevent download confirmation dialogs
    try {
      await sendCommand(ws, 'Page.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp' });
    } catch (_) {}

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.method === 'Page.javascriptDialogOpening') {
          console.log(`  ⚡ JS Dialog Intercepted: "${msg.params.message}" (${msg.params.type}) — Auto Accepting...`);
          await sendCommand(ws, 'Page.handleJavaScriptDialog', { accept: true });
        } else if (msg.method === 'Page.fileChooserOpened') {
          console.log('  ⚡ File Chooser Intercepted — Auto Bypassing...');
          await sendCommand(ws, 'Page.handleFileChooser', { action: 'cancel' });
        }
      } catch (err) {
        // Safe debug output
      }
    });
  } catch (err) {
    console.warn('  ⚠️ setupDialogAutoHandler advisory:', err.message);
  }
}

/**
 * Handle DOM session extension prompts, cookie banners, and modal proceed/confirm/allow buttons.
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

        // Handle permission & notification popups / cookie consent banners (Allow, Accept All, Proceed, OK)
        const consentBtns = Array.from(document.querySelectorAll('#onetrust-accept-btn-handler, .cookie-accept, .cc-accept, .btn-allow, button[id*="allow"], button[class*="allow"], button[id*="accept"]'))
          .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        consentBtns.forEach(btn => btn.click());

        // Handle modal confirmation dialogs (Proceed / Continue / Confirm / OK / Allow) — ignoring Cancel / Delete
        const confirmBtns = Array.from(document.querySelectorAll('.modal-dialog button, .ui-dialog button, .dialog-button, .popup-button, .modal-footer button, #btnContinue, .btn-confirm'))
          .filter(el => {
            const t = (el.innerText || el.value || '').trim().toLowerCase();
            return (t === 'proceed' || t === 'continue' || t === 'ok' || t === 'yes' || t === 'confirm' || t === 'accept' || t === 'allow')
              && !t.includes('cancel') && !t.includes('delete') && !t.includes('remove');
          });
        confirmBtns.forEach(btn => btn.click());
      })()`
    });
  } catch (err) {
    // Non-fatal modal dismiss warning
  }
}

/**
 * Expand all sections and "Show More" checkboxes on active page.
 */
async function expandSections(ws) {
  await dismissDOMModals(ws);
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      Array.from(document.querySelectorAll('a, button, span')).forEach(el => {
        const t = el.innerText ? el.innerText.trim() : '';
        if (t === 'Expand All' || t === 'Expand Subsections') el.click();
      });
      document.querySelectorAll('input[id*="showmore"]').forEach(i => {
        if (!i.checked) i.click();
      });
      document.querySelectorAll('label[for*="showmore"]').forEach(label => {
        const inp = document.getElementById(label.getAttribute('for'));
        if (inp && !inp.checked) label.click();
      });
    })()`,
    returnByValue: true
  });
}

/**
 * Assert DOM expansion using adaptive scroll height thresholds.
 * Avoids false retries on compact storage UI wizards.
 */
async function assertExpansionThreshold(ws, initialHeight = 5000) {
  const res = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const scrollHeight = document.body.scrollHeight || 0;
      const targetThreshold = Math.min(15000, ${initialHeight} + 3000);
      return {
        scrollHeight,
        targetThreshold,
        isExpanded: scrollHeight >= targetThreshold || scrollHeight >= ${initialHeight} * 1.3
      };
    })()`,
    returnByValue: true
  });
  return (res && res.result) ? res.result.value : { isExpanded: true, scrollHeight: 15000 };
}

/**
 * Trigger HPE OCA CLIC Check (Configuration Language & Inspection Engine Check)
 * and extract inspection error messages, root causes, and recommended direct SKU fixes.
 * @param {WebSocket} ws 
 * @param {'root' | 'component'} level 
 * @returns {Promise<object>} CLIC inspection results
 */
async function triggerClicCheck(ws, level = 'root') {
  await dismissDOMModals(ws);
  const evalRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // Find top-right CLIC Check button
      const clicBtn = document.querySelector('#clic_check, .btn-clic, #nav_clic, [id*="clic_check"], a[href*="clic"], button[title*="CLIC"]');
      if (clicBtn) {
        clicBtn.click();
        return { clicked: true, level };
      }
      return { clicked: false, level };
    })()`,
    returnByValue: true
  });

  await sleep(2000);
  await dismissDOMModals(ws);

  const errorRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const modal = document.querySelector('.clic-error-modal, .ui-dialog, .modal-dialog, #clic_results');
      if (!modal) return { hasErrors: false, errorText: '', rootCause: '', recommendedSkus: [] };

      const errorText = modal.innerText || '';
      const skuMatches = errorText.match(/\\b([A-Z0-9]{3,8}-[A-Z0-9]{3,4}|[A-Z0-9]{6})\\b/g) || [];
      return {
        hasErrors: errorText.toLowerCase().includes('error') || errorText.toLowerCase().includes('incompatible'),
        errorText: errorText.trim(),
        rootCause: errorText.substring(0, 300),
        recommendedSkus: Array.from(new Set(skuMatches))
      };
    })()`,
    returnByValue: true
  });

  return (errorRes && errorRes.result) ? errorRes.result.value : { hasErrors: false };
}

/** Async sleep helper */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  sendCommand,
  getOCATarget,
  getAnyPageTarget,
  connectWS,
  setupDialogAutoHandler,
  dismissDOMModals,
  expandSections,
  assertExpansionThreshold,
  triggerClicCheck,
  sleep,
  CDP_PORT,
  ...domExtract
};
