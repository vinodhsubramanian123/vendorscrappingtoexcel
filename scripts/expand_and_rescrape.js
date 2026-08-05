// Click all "Show more" links, assert page expansion, then re-scrape the fully expanded page.
// Usage: node scripts/expand_and_rescrape.js <outputs/.../raw_data/oca_raw_data_full.json>
// Auto-detects the active OCA tab — no hardcoded CDP page IDs or absolute paths.

'use strict';

const fs   = require('fs');
const path = require('path');
const { sendCommand, getOCATarget, connectWS, sleep } = require('./lib/cdp');

// ── Argument handling ────────────────────────────────────────────────────────
const outputPath = process.argv[2];
if (!outputPath) {
  console.error('Usage: node scripts/expand_and_rescrape.js <outputs/.../raw_data/oca_raw_data_full.json>');
  process.exit(1);
}

const SCROLL_HEIGHT_THRESHOLD = 15000;   // Rule #19

async function expandSections(ws) {
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // Click Expand All / Expand Subsections buttons
      Array.from(document.querySelectorAll('a, button, span')).forEach(el => {
        const t = el.innerText ? el.innerText.trim() : '';
        if (t === 'Expand All' || t === 'Expand Subsections') el.click();
      });
      // Check all Show More toggles
      let clicked = 0;
      document.querySelectorAll('input[id*="showmore"]').forEach(inp => {
        if (!inp.checked) { inp.click(); clicked++; }
      });
      // Also try label fallback
      document.querySelectorAll('label[for*="showmore"]').forEach(label => {
        const inp = document.getElementById(label.getAttribute('for'));
        if (inp && !inp.checked) { label.click(); clicked++; }
      });
      return { clicked };
    })()`,
    returnByValue: true
  });
}

async function main() {
  console.log('Connecting to OCA page via CDP...');
  const pageTarget = await getOCATarget();
  console.log(`Target: ${pageTarget.id} (${pageTarget.title})`);

  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);
  console.log('Connected!');

  // Step 1: Expand all sections and "Show more" toggles
  console.log('\nStep 1: Expanding all sections (Expand All + showmore toggles)...');
  await expandSections(ws);
  await sleep(4000);

  // Step 2: Assert scrollHeight > 15,000px (Rule #19)
  const heightRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: 'document.body.scrollHeight',
    returnByValue: true
  });
  let scrollHeight = heightRes.result.value;
  console.log(`Page scrollHeight after expansion: ${scrollHeight}px`);

  if (scrollHeight < SCROLL_HEIGHT_THRESHOLD) {
    console.warn(`⚠️  scrollHeight (${scrollHeight}px) < ${SCROLL_HEIGHT_THRESHOLD}px — retrying...`);
    await expandSections(ws);
    await sleep(4000);
    const retry = await sendCommand(ws, 'Runtime.evaluate', {
      expression: 'document.body.scrollHeight',
      returnByValue: true
    });
    scrollHeight = retry.result.value;
    console.log(`Retry scrollHeight: ${scrollHeight}px`);
    if (scrollHeight < SCROLL_HEIGHT_THRESHOLD) {
      ws.close();
      console.error(
        `❌ ASSERTION FAILED: scrollHeight (${scrollHeight}px) still < ${SCROLL_HEIGHT_THRESHOLD}px after retry.\n` +
        `Page expansion failed — aborting to prevent incomplete data extraction.`
      );
      process.exit(1);
    }
  }
  console.log(`✅ scrollHeight ${scrollHeight}px — expansion verified (Rule #19 passed).`);

  // Step 3: Re-extract full text (chunked)
  console.log('\nStep 2: Re-extracting full page text...');
  const textLenResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: 'document.body.innerText.length',
    returnByValue: true
  });
  const totalLen = textLenResult.result.value;
  console.log(`Total text length: ${totalLen} chars`);

  let fullText = '';
  const CHUNK = 50000;
  for (let i = 0; i < totalLen; i += CHUNK) {
    process.stdout.write(`  Chunk ${i}–${Math.min(i + CHUNK, totalLen)}...`);
    const chunk = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.body.innerText.substring(${i}, ${i + CHUNK})`,
      returnByValue: true
    });
    fullText += chunk.result.value;
    console.log(' done');
  }

  // Step 4: Re-extract tables as ROW ARRAYS (NOT outerHTML — compatible with build_catalog.js)
  console.log('\nStep 3: Re-extracting tables...');
  const tableResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const tables = document.querySelectorAll('table');
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

  // Step 5: Re-extract quantity inputs
  console.log('Step 4: Re-extracting quantity inputs...');
  const inputResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const inputs = [];
      document.querySelectorAll(
        'input[type="number"], input.qtyInput, input[id*="qty"], input[name*="qty"]'
      ).forEach(inp => {
        const row = inp.closest('tr');
        inputs.push({
          type: inp.type, value: inp.value, min: inp.min, max: inp.max,
          name: inp.name, id: inp.id,
          context: row ? row.innerText.substring(0, 500) : ''
        });
      });
      return JSON.stringify(inputs);
    })()`,
    returnByValue: true
  });

  const tables = JSON.parse(tableResult.result.value);
  const inputs = JSON.parse(inputResult.result.value);

  const data = {
    timestamp:   new Date().toISOString(),
    pageTitle:   pageTarget.title,
    url:         pageTarget.url,
    scrollHeight,
    textLength:  totalLen,
    fullText,
    tables,
    inputs,
    tableCount:  tables.length,
    inputCount:  inputs.length
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log(`\n✅ Data saved to ${outputPath}`);
  console.log(`  Text:   ${totalLen} chars`);
  console.log(`  Tables: ${tables.length}`);
  console.log(`  Inputs: ${inputs.length}`);

  ws.close();
}

main().catch(err => { console.error('Error:', err.message || err); process.exit(1); });
