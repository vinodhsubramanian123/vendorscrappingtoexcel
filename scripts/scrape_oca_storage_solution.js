// Generic HPE Storage Solution Wizard Scraper (Alletra 5000, Nimble, MSA, StoreOnce, Alletra 9000)
// Usage: node scripts/scrape_oca_storage_solution.js [output_json_path]
// Auto-detects active Storage Solution tab, iterates wizard sub-tabs, extracts both <select> dropdown SKUs & <table> rows.

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { sendCommand, getOCATarget, connectWS, setupDialogAutoHandler, extractTablesAsRows, extractChunkedText, sleep } = require('./lib/cdp');
const { updateScrapedRegistry } = require('./lib/registry');
const { parseProductMeta } = require('./lib/product_meta');

const PROJECT_ROOT  = path.resolve(__dirname, '..');
const OUTPUTS_ROOT  = path.join(PROJECT_ROOT, 'outputs');

async function main() {
  console.log('================================================================');
  console.log('📦 HPE STORAGE SOLUTION WIZARD SCRAPER (Alletra / Nimble / MSA)');
  console.log('================================================================\n');

  const pageTarget = await getOCATarget();
  console.log(`Connecting via CDP to target: ${pageTarget.id} (${pageTarget.title})...`);
  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);

  let outputDir = '';
  let meta = {};
  let heading = '';
  let pdfDestPath = null;
  let allTables = [];
  let combinedFullText = '';

  try {
    // Enable automated JS dialog & WebLogic modal prompt handler
    await setupDialogAutoHandler(ws);

    // STEP 1: Navigate to Storage Node & Solution Wizard tab if not active
    console.log('\n--- STEP 1: Locating Storage Solution Wizard Tab ---');
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const node = Array.from(document.querySelectorAll('.fancytree-title')).find(
          n => n.innerText && (n.innerText.includes('Alletra') || n.innerText.includes('Storage') || n.innerText.includes('Nimble') || n.innerText.includes('MSA') || n.innerText.includes('StoreOnce'))
        );
        if (node) {
          node.click();
          node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        }
      })()`,
      returnByValue: true
    });

    await sleep(3500);

    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const wizardLink = document.querySelector('a[href*="solutionWizard"], #ui-id-113') ||
                           Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Solution Wizard');
        if (wizardLink) wizardLink.click();
      })()`,
      returnByValue: true
    });

    await sleep(3500);

    const subTabsRes = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const tabs = Array.from(document.querySelectorAll(
          '#tabs_alletra_5000_wizard .wizard_tabs li a, .wizardTabRoot .wizard_tabs li a, ul.wizard_tabs li a, [class*="wizard_tabs"] a'
        ));
        return tabs.map(t => ({ id: t.id, text: t.innerText.trim(), href: t.getAttribute('href') }));
      })()`,
      returnByValue: true
    });

    const subTabs = subTabsRes.result.value || [];
    console.log(`Discovered ${subTabs.length} Storage Wizard Sub-Tabs:`, subTabs.map(t => t.text));

    const dropdownSKUs = [];

    // STEP 2: Iterate through each Storage Wizard sub-tab
    if (subTabs.length > 0) {
      console.log('\n--- STEP 2: Iterating Wizard Sub-Tabs & Extracting SKUs ---');

      for (let i = 0; i < subTabs.length; i++) {
        const step = subTabs[i];
        console.log(`\n  • Sub-tab ${i+1}/${subTabs.length}: "${step.text}"...`);

        // Safely escaped element selectors
        await sendCommand(ws, 'Runtime.evaluate', {
          expression: `(() => {
            const el = document.querySelector('a[href="' + ${JSON.stringify(step.href)} + '"]') || document.getElementById(${JSON.stringify(step.id)});
            if (el) el.click();
          })()`,
          returnByValue: true
        });

        await sleep(2500);

        const stepDataRes = await sendCommand(ws, 'Runtime.evaluate', {
          expression: `(() => {
            const panel = document.querySelector(${JSON.stringify(step.href)});
            const text = panel ? panel.innerText : '';

            const tables = panel ? Array.from(panel.querySelectorAll('table')).map((t, idx) => {
              const rows = [];
              t.querySelectorAll('tr').forEach(tr => {
                const cells = [];
                tr.querySelectorAll('td, th').forEach(cell => cells.push(cell.innerText.trim()));
                if (cells.length > 0) rows.push(cells);
              });
              return { tableIndex: idx, subTab: ${JSON.stringify(step.text)}, rowCount: rows.length, rows };
            }) : [];

            const selects = panel ? Array.from(panel.querySelectorAll('select')).map(s => {
              const label = s.closest('div, tr, td')?.innerText.substring(0, 120).replace(/\\n/g, ' ').trim() || ${JSON.stringify(step.text)};
              const options = Array.from(s.options).map(o => ({
                text: o.text.trim(),
                value: o.value
              })).filter(o => o.text && o.text !== 'None.' && !o.text.startsWith('Please make a selection'));

              return { id: s.id, label, options };
            }) : [];

            return JSON.stringify({ text, tables, selects });
          })()`,
          returnByValue: true
        });

        const stepData = JSON.parse(stepDataRes.result.value);
        combinedFullText += `\n\n=== ${step.text} ===\n\n` + stepData.text;

        stepData.tables.forEach(t => allTables.push(t));

        stepData.selects.forEach(sel => {
          if (sel.options.length > 0) {
            const rows = [['Product #', 'Description', 'Quantity', 'Price (USD)']];
            sel.options.forEach(opt => {
              const pnMatch = opt.text.match(/\(([A-Z0-9\-]{5,15})\)/) || opt.text.match(/\b([A-Z0-9]{3}[A-Z0-9\-]{2,20}[A-Z0-9])\b/);
              const pn = pnMatch ? pnMatch[1] : '';
              const desc = opt.text.replace(/\([A-Z0-9\-]{5,15}\)\s*/, '').trim();

              if (pn) {
                rows.push([pn, desc || opt.text, '0', '0.00']);
                dropdownSKUs.push({ subTab: step.text, label: sel.label, pn, desc });
              }
            });

            if (rows.length > 1) {
              allTables.push({
                tableIndex: allTables.length,
                subTab: step.text,
                label: sel.label,
                rowCount: rows.length,
                rows
              });
            }
          }
        });

        console.log(`    Extracted ${stepData.tables.length} tables, ${stepData.selects.length} option dropdowns.`);
      }
    } else {
      console.log('No wizard sub-tabs found — performing standard page extraction...');
      const extractedText = await extractChunkedText(ws, 50000);
      combinedFullText = extractedText.fullText;
      const extractedTables = await extractTablesAsRows(ws);
      extractedTables.forEach(t => allTables.push({ ...t, subTab: 'Storage' }));
    }

    // STEP 3: Detect Metadata & Save Output
    console.log('\n--- STEP 3: Saving Raw Storage Scrape Data ---');
    const headingRes = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const heading = document.querySelector('#solution_title, .solution-name, h1, h2')?.innerText.trim() || document.title;
        const qsLink  = document.querySelector('a[href*="quickspec"], a.qs-link-a')?.href || '';
        return JSON.stringify({ heading, qsLink });
      })()`,
      returnByValue: true
    });

    const parsedHeading = JSON.parse(headingRes.result.value);
    heading = parsedHeading.heading;
    const qsLink = parsedHeading.qsLink;

    meta = parseProductMeta(heading, pageTarget.title);

    console.log(`Family: "${meta.family}", Gen: "${meta.gen}", Chassis: "${meta.cleanName}"`);

    outputDir = path.join(OUTPUTS_ROOT, meta.family, meta.gen, meta.cleanName);
    const rawDir = path.join(outputDir, 'raw_data');
    fs.mkdirSync(rawDir, { recursive: true });

    const rawJsonPath = path.join(rawDir, 'oca_raw_data_full.json');
    const rawData = {
      timestamp:   new Date().toISOString(),
      pageTitle:   pageTarget.title,
      url:         pageTarget.url,
      nodeText:    heading,
      qsLink,
      textLength:  combinedFullText.length,
      fullText:    combinedFullText,
      tables:      allTables,
      tableCount:  allTables.length,
      dropdownSKUs
    };

    fs.writeFileSync(rawJsonPath, JSON.stringify(rawData, null, 2));
    console.log(`Raw storage data saved to: ${rawJsonPath}`);

    // STEP 4: QuickSpecs Download
    if (qsLink) {
      console.log(`\n--- STEP 4: QuickSpecs PDF Download ---`);
      pdfDestPath = path.join(outputDir, `HPE_${meta.cleanName}_QuickSpecs.pdf`);
      try {
        execSync(
          `node "${path.join(__dirname, 'download_quickspecs_pdf.js')}" "${qsLink}" "${pdfDestPath}"`,
          { stdio: 'inherit', cwd: PROJECT_ROOT }
        );
      } catch (e) {
        console.warn('QuickSpecs download warning:', e.message);
      }
    }
  } finally {
    try { ws.close(); } catch {}
  }

  // STEP 5: Build Catalog & Generate Excel
  console.log('\n--- STEP 5: Classification Engine & Excel Generation ---');
  const catalogJson = path.join(outputDir, `${meta.cleanName}_Catalog.json`);
  const catalogXlsx = path.join(outputDir, `${meta.cleanName}_OCA_Catalog.xlsx`);
  const rawJsonPath = path.join(outputDir, 'raw_data', 'oca_raw_data_full.json');

  execSync(
    `node "${path.join(__dirname, 'build_catalog.js')}" "${rawJsonPath}" "${catalogJson}" --verbose`,
    { stdio: 'inherit', cwd: PROJECT_ROOT }
  );
  execSync(
    `node "${path.join(__dirname, 'generate_xlsx.js')}" "${catalogXlsx}"`,
    { stdio: 'inherit', cwd: PROJECT_ROOT }
  );

  // STEP 6: Post-Flight Quality Audit
  console.log('\n--- STEP 6: Automated Post-Flight Quality Audit ---');
  try {
    execSync(
      `node "${path.join(__dirname, 'verify_excel_tally.js')}" "${catalogXlsx}"`,
      { stdio: 'inherit', cwd: PROJECT_ROOT }
    );
  } catch (e) {
    console.error('❌ POST-FLIGHT AUDIT FAILED:', e.message);
    process.exit(1);
  }

  // STEP 7: Registry Update
  const actualPdfPath = pdfDestPath && fs.existsSync(pdfDestPath) ? pdfDestPath : null;
  updateScrapedRegistry({
    timestamp:    new Date().toISOString(),
    solutionName: heading,
    family:       meta.family,
    gen:          meta.gen,
    chassisName:  meta.cleanName,
    outputDir,
    jsonPath:     catalogJson,
    xlsxPath:     catalogXlsx,
    pdfPath:      actualPdfPath,
    tablesCount:  allTables.length,
    textLength:   combinedFullText.length
  });

  console.log('\n================================================================');
  console.log(`🎉 STORAGE SCRAPER COMPLETED — Output Directory:`);
  console.log(`   ${outputDir}`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ STORAGE SCRAPER ERROR:', err.message || err);
  process.exit(1);
});
