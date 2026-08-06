// 100% Generic E2E HPE OCA Solution Traversal & Catalog Pipeline
// Auto-detects Solution Root, Product Family, Generation, Chassis Name, SKUs, and QuickSpecs.
// NO Hardcoded Product IDs, Families, or Absolute Paths.

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  sendCommand, getOCATarget, connectWS, setupDialogAutoHandler,
  expandSections, extractChunkedText, extractTablesAsRows, extractSectionHeaders,
  sleep
} = require('./lib/cdp');
const { updateScrapedRegistry } = require('./lib/registry');
const { parseProductMeta } = require('./lib/product_meta');

const PROJECT_ROOT  = path.resolve(__dirname, '..');
const OUTPUTS_ROOT  = path.join(PROJECT_ROOT, 'outputs');

const SCROLL_HEIGHT_THRESHOLD = 15000;   // Rule #19

async function main() {
  const pipelineStart = Date.now();
  console.log('================================================================');
  console.log('🚀 100% GENERIC DYNAMIC HPE OCA SOLUTION SCRAPER PIPELINE');
  console.log('================================================================\n');

  const pageTarget = await getOCATarget();
  console.log(`Connecting via CDP: ${pageTarget.id} (${pageTarget.title})...`);
  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);

  let outputDir = '';
  let meta = {};
  let catalogJson = '';
  let catalogXlsx = '';
  let pdfDestPath = null;
  let tables = [];
  let totalLen = 0;
  let treeInfo = {};

  try {
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

    treeInfo = JSON.parse(treeInfoRes.result.value);
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
        const menuTab = document.querySelector('a[href*="extended_overview_menu"], #ui-id-24');
        if (menuTab) menuTab.click();
      })()`,
      returnByValue: true
    });

    await sleep(4000);

    // STEP 3: Full Page Section Expansion
    console.log('\n--- STEP 3: Expanding Page Sections & Show More Checkboxes ---');
    await expandSections(ws);
    await sleep(3000);

    // STEP 3.5: Multi-Tab Support Services & Configured BOM Check (Pointnext 3Y/4Y/5Y Tech Care)
    console.log('\n--- STEP 3.5: Checking for Solution Services & Configured BOM Tab ---');
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const tabsToClick = Array.from(document.querySelectorAll('a, button, div.tab_header')).filter(el => 
          /pointnext|services|support services|tech care|^bom$/i.test((el.innerText || '').trim()) && 
          !el.href?.includes('menu') && !el.classList.contains('active')
        );
        tabsToClick.forEach(tab => tab.click());
        return tabsToClick.length;
      })()`,
      returnByValue: true
    });
    await sleep(2500);
    await expandSections(ws);
    await sleep(2000);

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
    console.log(`Page Expansion Metrics: height=${metrics.scrollHeight}px, tables=${metrics.tablesCount}, rows=${metrics.totalRows}`);

    let isExpanded = metrics.scrollHeight >= SCROLL_HEIGHT_THRESHOLD || metrics.totalRows >= 50 || metrics.tablesCount >= 10;

    if (!isExpanded) {
      console.warn(`⚠️  Page expansion metrics below threshold — retrying expansion...`);
      await expandSections(ws);
      await sleep(4000);
      metrics = await getMetrics();
      isExpanded = metrics.scrollHeight >= SCROLL_HEIGHT_THRESHOLD || metrics.totalRows >= 50 || metrics.tablesCount >= 10;
      if (!isExpanded) {
        throw new Error(
          `Rule #19 FAILED: height (${metrics.scrollHeight}px), rows (${metrics.totalRows}) below threshold. ` +
          `Aborting — page expansion failed, incomplete catalog would be extracted.`
        );
      }
    }
    console.log(`✅ Expansion verified: ${metrics.tablesCount} tables, ${metrics.totalRows} rows — Rule #19 passed.`);

    // STEP 4: Extract Dynamic DOM & Metadata
    console.log('\n--- STEP 4: Extracting DOM & Metadata ---');

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

    // Shared chunked text extraction
    console.log('Extracting page text...');
    const extractedText = await extractChunkedText(ws, 50000);
    totalLen = extractedText.totalLen;
    const fullText = extractedText.fullText;
    console.log(`Extracted text: ${totalLen.toLocaleString()} chars`);

    // Shared table extraction as row arrays
    console.log('Extracting tables (row arrays)...');
    tables = await extractTablesAsRows(ws);
    console.log(`Extracted ${tables.length} tables.`);

    // Shared section header extraction
    console.log('Extracting DOM section headers (landmarks)...');
    const sections = await extractSectionHeaders(ws);
    console.log(`Extracted ${sections.length} DOM section headers.`);

    // Chassis detection
    meta = parseProductMeta(pageHeading, pageTarget.title);

    const GENERIC_NAMES = ['External_OCA_Hewlett_Packard_Enterprise', 'General', ''];
    if (GENERIC_NAMES.includes(meta.cleanName)) {
      throw new Error(
        `Cannot auto-detect chassis name from: "${pageHeading}".\n` +
        `Ensure you are on the correct Product Node Menu tab in OCA.`
      );
    }

    console.log(`Family: "${meta.family}", Gen: "${meta.gen}", Chassis: "${meta.cleanName}"`);

    outputDir = path.join(OUTPUTS_ROOT, meta.family, meta.gen, meta.cleanName);
    const rawDir = path.join(outputDir, 'raw_data');
    fs.mkdirSync(rawDir, { recursive: true });

    const rawJsonPath = path.join(rawDir, 'oca_raw_data_full.json');
    const rawData = {
      timestamp:  new Date().toISOString(),
      pageTitle:  pageTarget.title,
      url:        pageTarget.url,
      nodeText:   pageHeading,
      qsLink,
      scrollHeight: metrics.scrollHeight,
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

  // STEP 6: Catalog Parser & Excel Generator
  console.log('\n--- STEP 6: Catalog Classification & Excel Generation ---');
  catalogJson = path.join(outputDir, `${meta.cleanName}_Catalog.json`);
  catalogXlsx = path.join(outputDir, `${meta.cleanName}_OCA_Catalog.xlsx`);
  const rawJsonPath = path.join(outputDir, 'raw_data', 'oca_raw_data_full.json');

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
  const actualPdfPath = pdfDestPath && fs.existsSync(pdfDestPath) ? pdfDestPath : null;
  updateScrapedRegistry({
    timestamp:    new Date().toISOString(),
    solutionName: treeInfo.solutionName || 'OCA Solution',
    family:       meta.family,
    gen:          meta.gen,
    chassisName:  meta.cleanName,
    outputDir,
    jsonPath:     catalogJson,
    xlsxPath:     catalogXlsx,
    pdfPath:      actualPdfPath,
    tablesCount:  tables.length,
    textLength:   totalLen
  });

  const durationSec = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log('\n================================================================');
  console.log(`🎉 PIPELINE COMPLETED SUCCESSFULLY in ${durationSec}s — Output Directory:`);
  console.log(`   ${outputDir}`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ PIPELINE ERROR:', err.message || err);
  process.exit(1);
});
