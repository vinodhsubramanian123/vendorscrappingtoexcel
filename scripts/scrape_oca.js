// CDP Scraper for OCA Configuration Page
// Usage: node scripts/scrape_oca.js <outputs/.../raw_data/oca_raw_data_full.json>
// Auto-detects the active OCA page — no hardcoded page IDs or absolute paths.

'use strict';

const fs   = require('fs');
const path = require('path');
const {
  sendCommand, getOCATarget, connectWS,
  extractChunkedText, extractTablesAsRows, extractSectionHeaders
} = require('./lib/cdp');

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

  try {
    console.log('Extracting full page text...');
    const { fullText, totalLen } = await extractChunkedText(ws, 50000);
    console.log(`Total text length: ${totalLen} chars`);

    console.log('Extracting table data...');
    const tables = await extractTablesAsRows(ws);

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

    console.log('Extracting section structure...');
    const sections = await extractSectionHeaders(ws);

    const inputs = JSON.parse(inputResult.result.value || '[]');

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

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(`\nData saved to ${outputPath}`);
    console.log(`  Text:     ${totalLen} chars`);
    console.log(`  Tables:   ${tables.length}`);
    console.log(`  Inputs:   ${inputs.length}`);
    console.log(`  Sections: ${sections.length}`);
  } finally {
    try { ws.close(); } catch {}
  }
}

main().catch(err => { console.error('Error:', err.message || err); process.exit(1); });
