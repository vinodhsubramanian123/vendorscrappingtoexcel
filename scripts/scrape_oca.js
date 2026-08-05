// CDP Scraper for OCA Configuration Page
// Usage: node scripts/scrape_oca.js <outputs/.../raw_data/oca_raw_data_full.json>
// Auto-detects the active OCA page — no hardcoded page IDs or absolute paths.

'use strict';

const fs   = require('fs');
const path = require('path');
const { sendCommand, getOCATarget, connectWS, sleep } = require('./lib/cdp');

// ── Argument handling ────────────────────────────────────────────────────────
const outputPath = process.argv[2];
if (!outputPath) {
  console.error('Usage: node scripts/scrape_oca.js <outputs/.../raw_data/oca_raw_data_full.json>');
  process.exit(1);
}

async function main() {
  console.log('Connecting to OCA page via CDP...');
  const pageTarget = await getOCATarget();
  console.log(`Target: ${pageTarget.id} (${pageTarget.title})`);

  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);
  console.log('Connected!');

  // Step 1: Get full page text content (chunked to handle large pages)
  console.log('Extracting full page text...');
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

  // Step 2: Extract structured table data — ROW ARRAYS (NOT outerHTML)
  // build_catalog.js expects: tables[i].rows = array of cell arrays
  console.log('Extracting table data...');
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

  // Step 3: Extract all input fields (qty, min, max)
  console.log('Extracting input fields...');
  const inputResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const inputs = [];
      document.querySelectorAll('input').forEach(inp => {
        const row = inp.closest('tr');
        inputs.push({
          type: inp.type, value: inp.value, min: inp.min, max: inp.max,
          name: inp.name, id: inp.id, placeholder: inp.placeholder,
          disabled: inp.disabled,
          context: row ? row.innerText.substring(0, 500) : ''
        });
      });
      return JSON.stringify(inputs);
    })()`,
    returnByValue: true
  });

  // Step 4: Extract section headers
  console.log('Extracting section structure...');
  const sectionResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const sections = [];
      document.querySelectorAll(
        'h1, h2, h3, h4, h5, .category-header, .section-header, [class*="header"], [class*="category-name"]'
      ).forEach(el => {
        sections.push({ tag: el.tagName, className: el.className, text: el.innerText.trim().substring(0, 300) });
      });
      return JSON.stringify(sections);
    })()`,
    returnByValue: true
  });

  const tables   = JSON.parse(tableResult.result.value);
  const inputs   = JSON.parse(inputResult.result.value);
  const sections = JSON.parse(sectionResult.result.value);

  const data = {
    timestamp:  new Date().toISOString(),
    pageTitle:  pageTarget.title,
    url:        pageTarget.url,
    textLength: totalLen,
    fullText,
    tables,
    inputs,
    sections,
    tableCount: tables.length,
    inputCount: inputs.length
  };

  // Ensure output directory exists before writing
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log(`\nData saved to ${outputPath}`);
  console.log(`  Text:     ${totalLen} chars`);
  console.log(`  Tables:   ${tables.length}`);
  console.log(`  Inputs:   ${inputs.length}`);
  console.log(`  Sections: ${sections.length}`);

  ws.close();
}

main().catch(err => { console.error('Error:', err.message || err); process.exit(1); });
