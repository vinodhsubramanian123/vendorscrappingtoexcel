// Click all "Show more" links, assert page expansion, then re-scrape the fully expanded page.
// Usage: node scripts/expand_and_rescrape.js <outputs/.../raw_data/oca_raw_data_full.json>
// Auto-detects the active OCA tab — no hardcoded CDP page IDs or absolute paths.

'use strict';

const fs   = require('fs');
const path = require('path');
const {
  sendCommand, getOCATarget, connectWS, expandSections,
  extractChunkedText, extractTablesAsRows, sleep
} = require('./lib/cdp');

const outputPath = process.argv[2];
if (!outputPath) {
  console.error('Usage: node scripts/expand_and_rescrape.js <outputs/.../raw_data/oca_raw_data_full.json>');
  process.exit(1);
}

const SCROLL_HEIGHT_THRESHOLD = 15000;   // Rule #19

async function main() {
  console.log('Connecting to OCA page via CDP...');
  const pageTarget = await getOCATarget();
  console.log(`Target: ${pageTarget.id} (${pageTarget.title})`);

  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);
  console.log('Connected!');

  try {
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
        throw new Error(
          `Rule #19 FAILED: scrollHeight (${scrollHeight}px) still < ${SCROLL_HEIGHT_THRESHOLD}px after retry.\n` +
          `Page expansion failed — aborting to prevent incomplete data extraction.`
        );
      }
    }
    console.log(`✅ scrollHeight ${scrollHeight}px — expansion verified (Rule #19 passed).`);

    // Step 3: Re-extract full text (chunked)
    console.log('\nStep 3: Re-extracting full page text...');
    const { fullText, totalLen } = await extractChunkedText(ws, 50000);
    console.log(`Total text length: ${totalLen} chars`);

    // Step 4: Re-extract tables as ROW ARRAYS
    console.log('\nStep 4: Re-extracting tables...');
    const tables = await extractTablesAsRows(ws);

    // Step 5: Re-extract quantity inputs
    console.log('\nStep 5: Re-extracting quantity inputs...');
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

    const inputs = JSON.parse(inputResult.result.value || '[]');

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
  } finally {
    try { ws.close(); } catch {}
  }
}

main().catch(err => { console.error('Error:', err.message || err); process.exit(1); });
