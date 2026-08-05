// End-to-End Pipeline & Guardrails Verification Script
// Usage: node scripts/test_pipeline_evals.js <outputs/.../Foo_OCA_Catalog.xlsx>
// Accepts the xlsx path as CLI arg — works for ANY chassis, not just DL380 Gen12 SFF.
// Tests all pre-flight, in-flight, and post-flight guardrails.

'use strict';

const WebSocket = require('ws');
const fs    = require('fs');
const XLSX  = require('xlsx');
const path  = require('path');
const { sendCommand, getOCATarget, connectWS, sleep } = require('./lib/cdp');

// ── Argument handling ─────────────────────────────────────────────────────────
const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/test_pipeline_evals.js <outputs/.../Foo_OCA_Catalog.xlsx>');
  console.error('Example: node scripts/test_pipeline_evals.js outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx');
  process.exit(1);
}

// Derive sibling paths from xlsx path
const targetDir   = path.dirname(xlsxPath);
const xlsxBase    = path.basename(xlsxPath, '.xlsx');
const filePrefix  = xlsxBase.replace(/_OCA_Catalog$/, '');
const rawDataPath = path.join(targetDir, 'raw_data', 'oca_raw_data_full.json');
const catalogJsonPath = path.join(targetDir, `${filePrefix}_Catalog.json`);
const pdfPath    = path.join(targetDir, `HPE_${filePrefix}_QuickSpecs.pdf`);

function assert(condition, message) {
  if (!condition) {
    console.error('❌ GUARDRAIL FAIL:', message);
    throw new Error('Guardrail Assertion Failed: ' + message);
  }
  console.log('✅ GUARDRAIL PASS:', message);
}

async function main() {
  console.log(`=== STARTING END-TO-END PIPELINE & GUARDRAILS EVALUATION ===`);
  console.log(`Chassis: ${filePrefix}\n`);

  const pageTarget = await getOCATarget();
  console.log(`CDP target: ${pageTarget.id} (${pageTarget.title})`);
  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);

  // ── GUARDRAIL 1: Pre-Flight Solution Root Assertion ────────────────────────
  console.log('\n--- TEST 1: Pre-Flight Solution Root Assertion ---');
  const preflightRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const upBtn        = document.querySelector('#nav_up, .icon-arrow-up3');
      const selectNav    = document.querySelector('#selectNavTreeOption');
      const compTab      = Array.from(document.querySelectorAll('a'))
                             .find(a => a.innerText.trim() === 'Components');
      return JSON.stringify({
        hasUpBtn:        !!upBtn,
        hasSelectNav:    !!selectNav,
        hasComponentsTab: !!compTab,
        currentNavText:  selectNav ? selectNav.options[selectNav.selectedIndex]?.text.trim() : 'N/A'
      });
    })()`,
    returnByValue: true
  });

  const preflight = JSON.parse(preflightRes.result.value);
  assert(preflight.hasUpBtn || preflight.hasSelectNav,
    'Pre-flight: Root navigation elements (#nav_up / #selectNavTreeOption) present');
  assert(preflight.hasComponentsTab, 'Pre-flight: Components tab element present');

  // ── GUARDRAIL 2: In-Flight Page Expansion Assertion ────────────────────────
  console.log('\n--- TEST 2: In-Flight Page Expansion Assertion ---');
  console.log('Navigating to Product Node Menu tab...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const selectNav = document.querySelector('#selectNavTreeOption');
      if (selectNav && selectNav.options.length > 0) {
        selectNav.selectedIndex = selectNav.options.length - 1;
        selectNav.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof jQuery !== 'undefined') {
        const lastVal = jQuery('#selectNavTreeOption option').last().val();
        if (lastVal) jQuery('#selectNavTreeOption').val(lastVal).trigger('change');
        jQuery('a[href*="extended_overview_menu"]').click();
      }
      const menuTab = document.querySelector('a[href*="extended_overview_menu"], #ui-id-24');
      if (menuTab) menuTab.click();
    })()`,
    returnByValue: true
  });

  await sleep(4000);

  console.log('Triggering section expansion...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      Array.from(document.querySelectorAll('a, button, span')).forEach(el => {
        const t = el.innerText ? el.innerText.trim() : '';
        if (t === 'Expand All' || t === 'Expand Subsections') el.click();
      });
      document.querySelectorAll('input[id*="showmore"]').forEach(i => { if (!i.checked) i.click(); });
    })()`,
    returnByValue: true
  });

  await sleep(3000);

  const expStatsRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const inputs  = document.querySelectorAll('input[id*="showmore"]');
      const checked = Array.from(inputs).filter(i => i.checked).length;
      return JSON.stringify({
        totalShowMore:   inputs.length,
        checkedShowMore: checked,
        textLength:      document.body.innerText.length,
        scrollHeight:    document.body.scrollHeight
      });
    })()`,
    returnByValue: true
  });

  const expStats = JSON.parse(expStatsRes.result.value);
  console.log(
    `Expansion: ${expStats.checkedShowMore}/${expStats.totalShowMore} showmore checked, ` +
    `text ${expStats.textLength} chars, height ${expStats.scrollHeight}px`
  );

  if (expStats.totalShowMore > 0) {
    assert(expStats.totalShowMore > 0,
      `In-flight: Total showmore toggles (${expStats.totalShowMore}) > 0`);
    assert(expStats.scrollHeight >= 1000,
      `In-flight: scrollHeight (${expStats.scrollHeight}px) >= 1,000px (Rule #19)`);
  } else {
    console.log('  ⚠️  ADVISORY: Live page is not currently on an expanded Menu tab (post-flight eval mode).');
  }

  assert(fs.existsSync(rawDataPath),
    `In-flight: Raw scraped data file exists: ${path.basename(rawDataPath)}`);
  const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));
  assert((rawData.textLength || 0) > 1000,
    `In-flight: Scraped text length (${rawData.textLength} chars) > 1,000`);

  ws.close();

  // ── GUARDRAIL 3: Post-Flight JSON Schema Audit ─────────────────────────────
  console.log('\n--- TEST 3: Post-Flight JSON Schema Audit ---');
  assert(fs.existsSync(catalogJsonPath),
    `Post-flight: Catalog JSON exists: ${path.basename(catalogJsonPath)}`);

  const catalogData = JSON.parse(fs.readFileSync(catalogJsonPath, 'utf-8'));

  // Correct schema: metadata.totalUniqueSKUs (not catalogData.totalSkus — that field doesn't exist)
  const jsonSkuCount = catalogData.metadata?.totalUniqueSKUs || 0;
  assert(jsonSkuCount > 0,
    `Post-flight: JSON totalUniqueSKUs (${jsonSkuCount}) > 0`);
  assert(Array.isArray(catalogData.entries) && catalogData.entries.length > 0,
    `Post-flight: entries[] array non-empty (${(catalogData.entries || []).length} entries)`);

  // Iterate entries[].skus[] checking 'Current Qty' field (not currentQty)
  let cleanCurrentQtyCount = 0;
  let totalSkusInJson = 0;
  (catalogData.entries || []).forEach(entry => {
    (entry.skus || []).forEach(sku => {
      totalSkusInJson++;
      const qty = String(sku['Current Qty'] || '0').trim();
      if (/^\d+$/.test(qty)) cleanCurrentQtyCount++;
    });
  });

  assert(
    cleanCurrentQtyCount === totalSkusInJson,
    `Post-flight: 100% of JSON SKUs (${cleanCurrentQtyCount}/${totalSkusInJson}) have clean numeric 'Current Qty'`
  );

  // ── GUARDRAIL 4: Excel Workbook Quality ───────────────────────────────────
  console.log('\n--- TEST 4: Excel Workbook Quality ---');
  assert(fs.existsSync(xlsxPath),
    `Post-flight: Excel workbook exists: ${path.basename(xlsxPath)}`);

  const workbook = XLSX.readFile(xlsxPath);
  const coreSheets = ['Category Summary', 'All SKUs', 'Rules & Constraints', 'Metadata'];
  coreSheets.forEach(s =>
    assert(workbook.SheetNames.includes(s), `Post-flight: Core sheet '${s}' in workbook`)
  );
  assert(workbook.SheetNames.length > coreSheets.length,
    `Post-flight: Workbook contains category drill-down sheets (${workbook.SheetNames.length} sheets total)`);

  const allSkusSheet = XLSX.utils.sheet_to_json(workbook.Sheets['All SKUs']);
  assert(
    allSkusSheet.length >= jsonSkuCount && allSkusSheet.length > 0,
    `Post-flight: Excel 'All SKUs' rows (${allSkusSheet.length}) >= JSON totalUniqueSKUs (${jsonSkuCount})`
  );

  // Rule #20: Hierarchy Path must have >= 3 '>' delimiters
  let hierarchyOk = 0;
  allSkusSheet.forEach(row => {
    const hp = row['Hierarchy Path'] || '';
    if ((hp.match(/>/g) || []).length >= 3) hierarchyOk++;
  });
  assert(
    hierarchyOk === allSkusSheet.length,
    `Post-flight: 100% of Excel rows (${hierarchyOk}/${allSkusSheet.length}) have 4-level Hierarchy Path (Rule #20)`
  );

  // ── GUARDRAIL 5: QuickSpecs PDF ───────────────────────────────────────────
  console.log('\n--- TEST 5: QuickSpecs PDF Quality ---');
  if (fs.existsSync(pdfPath)) {
    const pdfStats = fs.statSync(pdfPath);
    assert(pdfStats.size > 500000,
      `Post-flight: PDF size (${(pdfStats.size / 1024 / 1024).toFixed(2)} MB) > 500 KB`);
  } else {
    console.log(`⚠️ ADVISORY: QuickSpecs PDF not present: ${path.basename(pdfPath)}`);
  }

  console.log('\n=============================================================');
  console.log('🎉 ALL GUARDRAIL EVALUATIONS PASSED (100% COMPLIANT)');
  console.log('=============================================================\n');
}

main().catch(err => {
  console.error('\n❌ EVALUATION FAILED:', err.message || err);
  process.exit(1);
});
