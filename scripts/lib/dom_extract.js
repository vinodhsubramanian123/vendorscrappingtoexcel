'use strict';
/**
 * scripts/lib/dom_extract.js — Shared DOM Extraction Helpers
 *
 * Consolidated DOM extraction routines (chunked text, row-array tables, section headers)
 * to prevent copy-paste drift across scraping scripts.
 */
function getSendCommand() {
  return require('./cdp').sendCommand;
}

/**
 * Extract body text in safe <= 50,000 char chunks over CDP.
 * @param {WebSocket} ws
 * @param {number} [chunkSize=50000]
 * @returns {Promise<{ fullText: string, totalLen: number }>}
 */
async function extractChunkedText(ws, chunkSize = 50000) {
  const sendCommand = getSendCommand();
  const textLenRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: 'document.body.innerText.length',
    returnByValue: true
  });
  const totalLen = textLenRes.result.value || 0;

  let fullText = '';
  for (let i = 0; i < totalLen; i += chunkSize) {
    const chunk = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.body.innerText.substring(${i}, ${i + chunkSize})`,
      returnByValue: true
    });
    fullText += chunk.result.value || '';
  }

  return { fullText, totalLen };
}

/**
 * Extract DOM tables as ROW ARRAYS (for build_catalog.js classification engine).
 * @param {WebSocket} ws
 * @param {string} [scopeSelector] Optional sub-panel container selector
 * @returns {Promise<Array<{ tableIndex: number, rowCount: number, rows: Array<Array<string>> }>>}
 */
async function extractTablesAsRows(ws, scopeSelector = null) {
  const sendCommand = getSendCommand();
  const scopeExpr = scopeSelector ? `document.querySelector(${JSON.stringify(scopeSelector)})` : 'document';
  const tableResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const root = ${scopeExpr} || document;
      const tables = root.querySelectorAll('table');
      const result = [];
      tables.forEach((table, idx) => {
        const rows = [];
        table.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('td, th').forEach(cell => cells.push(cell.innerText.trim()));
          if (cells.length > 0) rows.push(cells);
        });
        if (rows.length > 0) result.push({ tableIndex: idx, rowCount: rows.length, rows });
      });
      return JSON.stringify(result);
    })()`,
    returnByValue: true
  });

  try {
    return JSON.parse(tableResult.result.value);
  } catch {
    return [];
  }
}

/**
 * Extract DOM section headers for landmark category matching.
 * @param {WebSocket} ws
 * @returns {Promise<Array<{ tagName: string, text: string, className: string }>>}
 */
async function extractSectionHeaders(ws) {
  const sendCommand = getSendCommand();
  const sectionsResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const headers = Array.from(document.querySelectorAll(
        'h1, h2, h3, h4, .section-header, .menu_category_header, [class*="category_header"], [class*="section_title"]'
      ));
      return JSON.stringify(headers.map(h => ({
        tagName: h.tagName,
        text: (h.innerText || '').trim(),
        className: h.className || ''
      })).filter(h => h.text.length > 0));
    })()`,
    returnByValue: true
  });

  try {
    return JSON.parse(sectionsResult.result.value);
  } catch {
    return [];
  }
}

module.exports = { extractChunkedText, extractTablesAsRows, extractSectionHeaders };
