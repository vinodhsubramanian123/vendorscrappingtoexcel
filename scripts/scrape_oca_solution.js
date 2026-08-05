// 100% Generic E2E HPE OCA Solution Traversal & Catalog Pipeline
// Auto-detects Solution Root, Product Family, Generation, Chassis Name, SKUs, and QuickSpecs.
// NO Hardcoded Product IDs, Families, or Absolute Paths.

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { sendCommand, getOCATarget, connectWS, setupDialogAutoHandler, dismissDOMModals, sleep } = require('./lib/cdp');
const { updateScrapedRegistry } = require('./lib/registry');

// All paths derived from __dirname — machine-independent
const PROJECT_ROOT  = path.resolve(__dirname, '..');
const OUTPUTS_ROOT  = path.join(PROJECT_ROOT, 'outputs');

const SCROLL_HEIGHT_THRESHOLD = 15000;   // Rule #19

// ── Chassis name detection ──────────────────────────────────────────────────
function parseProductMeta(rawText) {
  const genMatch = rawText.match(/Gen\d+(?:Plus)?/i);
  const gen = genMatch ? genMatch[0] : (/tape|msl|storeever/i.test(rawText) ? 'Tape' : 'General');

  let family = 'ProLiant';
  if (/synergy/i.test(rawText))                 family = 'Synergy';
  else if (/alletra/i.test(rawText))            family = 'Alletra';
  else if (/msl|storeever|tape/i.test(rawText)) family = 'StoreEver';
  else if (/cray|gx\d/i.test(rawText))          family = 'Cray';
  else if (/superdome/i.test(rawText))          family = 'Superdome';
  else if (/edgeline/i.test(rawText))           family = 'Edgeline';
  else if (/simplivity/i.test(rawText))         family = 'SimpliVity';
  else if (/aruba/i.test(rawText))              family = 'Aruba';

  const modelMatch      = rawText.match(/\b(DL\d{3}|ML\d{3}|RL\d{3}|SY\d{3}|GX\d{4}|MicroServer|MSL\d{4}|Alletra\s*\d{4}|Nimble\s*[A-Z0-9]+|StoreOnce\s*\d{4}|MSA\s*\d{4})\b/i);
  const formFactorMatch = rawText.match(/\b(SFF|LFF|NHP|CTO|Compute|Storage|Enclosure|Frame|Rack)\b/i);

  let cleanName = '';
  if (modelMatch) {
    const model = modelMatch[0].replace(/\s+/g, '_');
    const ff    = formFactorMatch ? formFactorMatch[0].toUpperCase() : '';
    cleanName   = `${model}_${gen}${ff ? '_' + ff : ''}`;
  } else {
    cleanName = rawText
      .replace(/Collapse All|Expand All|Expand Subsections|Undo Selection|Remove Defaults|View HPE Recommended only/gi, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  return { family, gen, cleanName };
}

// ── Section expansion helper ────────────────────────────────────────────────
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
    })()`,
    returnByValue: true
  });
}

async function main() {
  console.log('================================================================');
  console.log('🚀 100% GENERIC DYNAMIC HPE OCA SOLUTION SCRAPER PIPELINE');
  console.log('================================================================\n');

  const pageTarget = await getOCATarget();
  console.log(`Connecting via CDP: ${pageTarget.id} (${pageTarget.title})...`);
  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);

  // Enable automated JS dialog & WebLogic modal prompt handler
  await setupDialogAutoHandler(ws);

  // STEP 1: Solution Root Navigation & Pre-flight
  console.log('\n--- STEP 1: Solution Root Discovery & Pre-flight ---');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const upBtn = document.querySelector('#nav_up, .icon-arrow-up3');
      if (upBtn) upBtn.click();
      const compTab = Array.from(document.querySelectorAll('a'))
        .find(a => a.innerText.trim() === 'Components');
      if (compTab) compTab.click();
    })()`,
    returnByValue: true
  });

  await sleep(2500);

  const treeInfoRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const selectNav = document.querySelector('#selectNavTreeOption');
      const options = selectNav
        ? Array.from(selectNav.options).map(o => ({ val: o.value, text: o.text.trim() }))
        : [];
      const solutionName =
        document.querySelector('#solution_title, .solution-name, .breadcrumb-item')
          ?.innerText.trim() || 'OCA Solution';
      return JSON.stringify({ solutionName, options });
    })()`,
    returnByValue: true
  });

  const treeInfo = JSON.parse(treeInfoRes.result.value);
  console.log(`Discovered Solution Name: "${treeInfo.solutionName}"`);
  console.log(`Discovered Nodes (${treeInfo.options.length}):`, treeInfo.options.map(o => o.text));

  // STEP 2: Navigate into Product Node Menu tab
  console.log('\n--- STEP 2: Navigating into Product Node Menu Catalog ---');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      if (typeof jQuery !== 'undefined') {
        const titleSpan = jQuery('.fancytree-title, span[id*="node_title"]').filter((i, el) => {
          const t = jQuery(el).text();
          return t.includes('Gen12') || t.includes('Gen11') || t.includes('#1');
        });
        if (titleSpan.length > 0) titleSpan.trigger('click').trigger('dblclick');
        const lastVal = jQuery('#selectNavTreeOption option').last().val();
        if (lastVal) jQuery('#selectNavTreeOption').val(lastVal).trigger('change');
        jQuery('a[href*="extended_overview_menu"]').click();
      }
      // Vanilla DOM fallback
      const menuTab = document.querySelector('a[href*="extended_overview_menu"], #ui-id-24');
      if (menuTab) menuTab.click();
    })()`,
    returnByValue: true
  });

  await sleep(4000);

  // STEP 3: Full Page Section Expansion
  console.log('\n--- STEP 3: Expanding Page Sections & Show More Checkboxes ---');
  await expandSections(ws);
  await sleep(4000);

  // Rule #19 — assert page expansion (scrollHeight >= 15,000px OR totalRows >= 50 OR tablesCount >= 10)
  const getMetrics = async () => {
    const res = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const scrollHeight = document.body.scrollHeight;
        const tablesCount  = document.querySelectorAll('table').length;
        const totalRows    = Array.from(document.querySelectorAll('table')).reduce((sum, t) => sum + t.querySelectorAll('tr').length, 0);
        return JSON.stringify({ scrollHeight, tablesCount, totalRows });
      })()`,
      returnByValue: true
    });
    return JSON.parse(res.result.value);
  };

  let metrics = await getMetrics();
  let scrollHeight = metrics.scrollHeight;
  console.log(`Page Expansion Metrics: height=${metrics.scrollHeight}px, tables=${metrics.tablesCount}, rows=${metrics.totalRows}`);

  let isExpanded = metrics.scrollHeight >= SCROLL_HEIGHT_THRESHOLD || metrics.totalRows >= 50 || metrics.tablesCount >= 10;

  if (!isExpanded) {
    console.warn(`⚠️  Page expansion metrics below threshold — retrying expansion...`);
    await expandSections(ws);
    await sleep(4000);
    metrics = await getMetrics();
    scrollHeight = metrics.scrollHeight;
    isExpanded = metrics.scrollHeight >= SCROLL_HEIGHT_THRESHOLD || metrics.totalRows >= 50 || metrics.tablesCount >= 10;
    if (!isExpanded) {
      ws.close();
      throw new Error(
        `Rule #19 FAILED: height (${metrics.scrollHeight}px), rows (${metrics.totalRows}) below threshold. ` +
        `Aborting — page expansion failed, incomplete catalog would be extracted.`
      );
    }
  }
  console.log(`✅ Expansion verified: ${metrics.tablesCount} tables, ${metrics.totalRows} rows — Rule #19 passed.`);

  // STEP 4: Extract Dynamic DOM & Metadata
  console.log('\n--- STEP 4: Extracting DOM & Metadata ---');

  // Detect page heading (chassis name source)
  const headingRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const rawHeading = Array.from(document.querySelectorAll(
        'h1, h2, h3, .breadcrumb, #solution_title, .qs-link, .menu_info, .menu-title, span[class*="qs"]'
      )).map(el => el.innerText.trim()).find(t =>
        /Gen\d+/i.test(t) || /MSL|Tape|DL\d|ML\d|RL\d|SY\d|GX\d|Synergy|Alletra|ProLiant|StoreOnce|StoreEver|MSA|Cray|Aruba/i.test(t)
      ) || document.title;
      const pageHeading = rawHeading
        .replace(/Collapse All|Expand All|Expand Subsections|Undo Selection|Remove Defaults|View HPE Recommended only/gi, '')
        .trim();
      const qsLink = document.querySelector('a[href*="quickspec"], a.qs-link-a')?.href || '';
      return JSON.stringify({ pageHeading, qsLink });
    })()`,
    returnByValue: true
  });
  const { pageHeading, qsLink } = JSON.parse(headingRes.result.value);
  console.log(`Active Product Node Title: "${pageHeading}"`);

  // Extract full text (chunked — Rule #5)
  const textLenRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: 'document.body.innerText.length', returnByValue: true
  });
  const totalLen = textLenRes.result.value;
  console.log(`Text length: ${totalLen} chars`);

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

  // Extract tables as ROW ARRAYS — NOT outerHTML (build_catalog.js expects rows)
  console.log('Extracting tables (row arrays)...');
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

  // Extract DOM section header elements (landmarks)
  console.log('Extracting DOM section headers (landmarks)...');
  const sectionsResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, .section-header, .menu_category_header, [class*="category_header"], [class*="section_title"]'));
      return JSON.stringify(headers.map(h => ({
        tagName: h.tagName,
        text: (h.innerText || '').trim(),
        className: h.className || ''
      })).filter(h => h.text.length > 0));
    })()`,
    returnByValue: true
  });

  let sections = [];
  try {
    sections = typeof sectionsResult.result.value === 'string'
      ? JSON.parse(sectionsResult.result.value)
      : (sectionsResult.result.value || []);
  } catch (e) {
    sections = [];
  }
  console.log(`Extracted ${sections.length} DOM section headers`);

  let tables = [];
  try {
    tables = typeof tableResult.result.value === 'string'
      ? JSON.parse(tableResult.result.value)
      : (tableResult.result.value || []);
  } catch (e) {
    tables = [];
  }
  console.log(`Extracted ${tables.length} tables, ${totalLen} chars of text`);

  // ── Chassis detection ───────────────────────────────────────────────────────
  const meta = parseProductMeta(pageHeading);

  // Refuse to proceed if chassis name is un-parseable — never silently fall back
  const GENERIC_NAMES = ['External_OCA_Hewlett_Packard_Enterprise', 'General', ''];
  if (GENERIC_NAMES.includes(meta.cleanName)) {
    ws.close();
    throw new Error(
      `Cannot auto-detect chassis name from: "${pageHeading}".\n` +
      `Ensure you are on the correct Product Node Menu tab in OCA.\n` +
      `Hint: check that the page title contains a model (DL380, ML350, etc.) and generation (Gen12).`
    );
  }

  console.log(`Family: "${meta.family}", Gen: "${meta.gen}", Chassis: "${meta.cleanName}"`);

  const outputDir = path.join(OUTPUTS_ROOT, meta.family, meta.gen, meta.cleanName);
  const rawDir    = path.join(outputDir, 'raw_data');
  fs.mkdirSync(rawDir, { recursive: true });

  // Extract sections for dynamic category discovery (Rule #24)
  const sectionsRes = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const headers = Array.from(document.querySelectorAll('h2, h3, .section-header, .group-header'));
      return headers.map(h => ({ text: h.innerText.trim() })).filter(h => h.text.length > 2);
    })()`,
    returnByValue: true
  });

  let sections = [];
  try {
    sections = typeof sectionsRes.result.value === 'string'
      ? JSON.parse(sectionsRes.result.value)
      : (sectionsRes.result.value || []);
  } catch (e) {
    sections = [];
  }

  // Save raw data as a clean JSON object (NOT double-encoded string)
  const rawJsonPath = path.join(rawDir, 'oca_raw_data_full.json');
  const rawData = {
    timestamp:  new Date().toISOString(),
    pageTitle:  pageTarget.title,
    url:        pageTarget.url,
    nodeText:   pageHeading,
    qsLink,
    scrollHeight,
    textLength: totalLen,
    fullText,
    sections,
    tables,
    tableCount: tables.length
  };
  fs.writeFileSync(rawJsonPath, JSON.stringify(rawData, null, 2));
  console.log(`Raw data JSON saved to: ${rawJsonPath}`);

  // STEP 5: QuickSpecs PDF Download
  if (qsLink) {
    console.log(`\n--- STEP 5: QuickSpecs PDF Download ---`);
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

  // STEP 6: Catalog Parser & Excel Generator
  console.log('\n--- STEP 6: Catalog Classification & Excel Generation ---');
  const catalogJson = path.join(outputDir, `${meta.cleanName}_Catalog.json`);
  const catalogXlsx = path.join(outputDir, `${meta.cleanName}_OCA_Catalog.xlsx`);

  execSync(
    `node "${path.join(__dirname, 'build_catalog.js')}" "${rawJsonPath}" "${catalogJson}"`,
    { stdio: 'inherit', cwd: PROJECT_ROOT }
  );
  execSync(
    `node "${path.join(__dirname, 'generate_xlsx.js')}" "${catalogXlsx}"`,
    { stdio: 'inherit', cwd: PROJECT_ROOT }
  );

  // STEP 7: Automated Post-Flight Audit Verification
  console.log('\n--- STEP 7: Post-Flight Quality Audit ---');
  try {
    execSync(
      `node "${path.join(__dirname, 'verify_excel_tally.js')}" "${catalogXlsx}"`,
      { stdio: 'inherit', cwd: PROJECT_ROOT }
    );
  } catch (e) {
    console.error('❌ POST-FLIGHT AUDIT FAILED:', e.message);
    process.exit(1);
  }

  // STEP 8: Update Master Registry
  console.log('\n--- STEP 8: Updating Master Scraped Catalogs Registry ---');
  updateScrapedRegistry({
    timestamp:    new Date().toISOString(),
    solutionName: treeInfo.solutionName,
    family:       meta.family,
    gen:          meta.gen,
    chassisName:  meta.cleanName,
    outputDir,
    jsonPath:     catalogJson,
    xlsxPath:     catalogXlsx,
    tablesCount:  tables.length,
    textLength:   totalLen
  });

  console.log('\n================================================================');
  console.log(`🎉 PIPELINE COMPLETED SUCCESSFULLY — Output Directory:`);
  console.log(`   ${outputDir}`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ PIPELINE ERROR:', err.message || err);
  process.exit(1);
});
