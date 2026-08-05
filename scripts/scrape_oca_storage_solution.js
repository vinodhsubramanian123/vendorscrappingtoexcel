// Generic HPE Storage Solution Wizard Scraper (Alletra 5000, Nimble, MSA, StoreOnce, Alletra 9000)
// Usage: node scripts/scrape_oca_storage_solution.js [output_json_path]
// Auto-detects active Storage Solution tab, iterates wizard sub-tabs, extracts both <select> dropdown SKUs & <table> rows.

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { sendCommand, getOCATarget, connectWS, setupDialogAutoHandler, dismissDOMModals, sleep } = require('./lib/cdp');
const { updateScrapedRegistry } = require('./lib/registry');

const PROJECT_ROOT  = path.resolve(__dirname, '..');
const OUTPUTS_ROOT  = path.join(PROJECT_ROOT, 'outputs');

function parseStorageProductMeta(rawText, pageTitle) {
  const full = `${rawText} ${pageTitle}`;
  let family = 'Alletra';
  if (/nimble/i.test(full))       family = 'Nimble';
  else if (/storeonce/i.test(full))family = 'StoreOnce';
  else if (/msa/i.test(full))      family = 'MSA';
  else if (/alletra/i.test(full))  family = 'Alletra';
  else if (/simplivity/i.test(full)) family = 'SimpliVity';

  const modelMatch = full.match(/(Alletra\s+\d+|Nimble\s+\w+|StoreOnce\s+\d+|MSA\s+\d+|2060|2062|1060|2050|5010|5030|5050|6000|9000)/i);
  const modelStr   = modelMatch ? modelMatch[0].replace(/\s+/g, '_') : 'Storage_System';
  let cleanName    = `${family}_${modelStr}`.replace(/^HPE_/i, '').replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');

  return { family, gen: 'Storage', cleanName };
}

async function main() {
  console.log('================================================================');
  console.log('📦 HPE STORAGE SOLUTION WIZARD SCRAPER (Alletra / Nimble / MSA)');
  console.log('================================================================\n');

  const pageTarget = await getOCATarget();
  console.log(`Connecting via CDP to target: ${pageTarget.id} (${pageTarget.title})...`);
  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);

  // Enable automated JS dialog & WebLogic modal prompt handler
  await setupDialogAutoHandler(ws);

  // STEP 1: Navigate to Storage Node & Solution Wizard tab if not active
  console.log('\n--- STEP 1: Locating Storage Solution Wizard Tab ---');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // 1. Click Alletra/Storage fancytree node in left navigation tree
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

  // 2. Click Solution Wizard tab
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const wizardLink = document.querySelector('a[href*="solutionWizard"], #ui-id-113') ||
                         Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Solution Wizard');
      if (wizardLink) wizardLink.click();
    })()`,
    returnByValue: true
  });

  await sleep(3500);

  // Discover wizard sub-tabs (e.g. Array Selection, Base Array Components, Add-on Storage, MISC Hardware)
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

  const allTables = [];
  const dropdownSKUs = [];
  let combinedFullText = '';

  // STEP 2: Iterate through each Storage Wizard sub-tab
  if (subTabs.length > 0) {
    console.log('\n--- STEP 2: Iterating Wizard Sub-Tabs & Extracting SKUs ---');

    for (let i = 0; i < subTabs.length; i++) {
      const step = subTabs[i];
      console.log(`\n  • Sub-tab ${i+1}/${subTabs.length}: "${step.text}"...`);

      // Click sub-tab
      await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const el = document.querySelector('a[href="${step.href}"]') || document.getElementById('${step.id}');
          if (el) el.click();
        })()`,
        returnByValue: true
      });

      await sleep(2500);

      // Extract step text, tables, and dropdowns
      const stepDataRes = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const panel = document.querySelector('${step.href}');
          const text = panel ? panel.innerText : '';

          // Extract tables as row arrays
          const tables = panel ? Array.from(panel.querySelectorAll('table')).map((t, idx) => {
            const rows = [];
            t.querySelectorAll('tr').forEach(tr => {
              const cells = [];
              tr.querySelectorAll('td, th').forEach(cell => cells.push(cell.innerText.trim()));
              if (cells.length > 0) rows.push(cells);
            });
            return { tableIndex: idx, subTab: '${step.text}', rowCount: rows.length, rows };
          }) : [];

          // Extract dropdown <select> elements (Storage CTO options)
          const selects = panel ? Array.from(panel.querySelectorAll('select')).map(s => {
            const label = s.closest('div, tr, td')?.innerText.substring(0, 120).replace(/\\n/g, ' ').trim() || '${step.text}';
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

      // Add tables
      stepData.tables.forEach(t => allTables.push(t));

      // Convert <select> dropdown options into synthetic table rows for build_catalog.js
      stepData.selects.forEach(sel => {
        if (sel.options.length > 0) {
          const rows = [['Product #', 'Description', 'Quantity', 'Price (USD)']];
          sel.options.forEach(opt => {
            // Extract Part # in parens e.g. "(R6F55A) HPE Alletra 2120 42TB..." or "P74792-B21"
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
    // Fallback to standard full-page text & table extraction
    const fallbackRes = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const text = document.body.innerText;
        const tables = Array.from(document.querySelectorAll('table')).map((t, idx) => {
          const rows = [];
          t.querySelectorAll('tr').forEach(tr => {
            const cells = [];
            tr.querySelectorAll('td, th').forEach(cell => cells.push(cell.innerText.trim()));
            if (cells.length > 0) rows.push(cells);
          });
          return { tableIndex: idx, subTab: 'Storage', rowCount: rows.length, rows };
        });
        return JSON.stringify({ text, tables });
      })()`,
      returnByValue: true
    });
    const fallbackData = JSON.parse(fallbackRes.result.value);
    combinedFullText = fallbackData.text;
    fallbackData.tables.forEach(t => allTables.push(t));
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

  const { heading, qsLink } = JSON.parse(headingRes.result.value);
  const meta = parseStorageProductMeta(heading, pageTarget.title);

  console.log(`Family: "${meta.family}", Gen: "${meta.gen}", Chassis: "${meta.cleanName}"`);

  const outputDir   = path.join(OUTPUTS_ROOT, meta.family, meta.gen, meta.cleanName);
  const rawDir      = path.join(outputDir, 'raw_data');
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
  console.log(`  Combined text: ${combinedFullText.length.toLocaleString()} chars`);
  console.log(`  Tables extracted: ${allTables.length}`);
  console.log(`  Dropdown SKUs parsed: ${dropdownSKUs.length}`);

  // STEP 4: QuickSpecs Download
  if (qsLink) {
    console.log(`\n--- STEP 4: QuickSpecs PDF Download ---`);
    const pdfDestPath = path.join(outputDir, `HPE_${meta.cleanName}_QuickSpecs.pdf`);
    try {
      execSync(
        `node "${path.join(__dirname, 'download_quickspecs_pdf.js')}" "${qsLink}" "${pdfDestPath}"`,
        { stdio: 'inherit', cwd: PROJECT_ROOT }
      );
    } catch (e) {
      console.warn('QuickSpecs download warning:', e.message);
    }
  }

  ws.close();

  // STEP 5: Build Catalog & Generate Excel
  console.log('\n--- STEP 5: Classification Engine & Excel Generation ---');
  const catalogJson = path.join(outputDir, `${meta.cleanName}_Catalog.json`);
  const catalogXlsx = path.join(outputDir, `${meta.cleanName}_OCA_Catalog.xlsx`);

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
    console.warn('Post-flight audit advisory:', e.message);
  }

  // STEP 7: Registry Update
  updateScrapedRegistry({
    timestamp:    new Date().toISOString(),
    solutionName: heading,
    family:       meta.family,
    gen:          meta.gen,
    chassisName:  meta.cleanName,
    outputDir,
    jsonPath:     catalogJson,
    xlsxPath:     catalogXlsx,
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
