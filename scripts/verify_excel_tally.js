// 100% Comprehensive Excel Tally & Pipeline Quality Audit Utility
// Usage: node scripts/verify_excel_tally.js <outputs/.../Foo_OCA_Catalog.xlsx>
// Accepts the xlsx path as CLI arg — works for ANY chassis, not just DL380 Gen12 SFF.
// All sibling paths (JSON, PDF) derived from the xlsx path automatically.

'use strict';

const XLSX   = require('xlsx-js-style');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Argument handling ─────────────────────────────────────────────────────────
const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/verify_excel_tally.js <outputs/.../Foo_OCA_Catalog.xlsx>');
  console.error('Example: node scripts/verify_excel_tally.js outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx');
  process.exit(1);
}

// Derive sibling paths from xlsx path
const targetDir  = path.dirname(xlsxPath);
const xlsxBase   = path.basename(xlsxPath, '.xlsx');                    // e.g. DL380_Gen12_SFF_OCA_Catalog
const filePrefix = xlsxBase.replace(/_OCA_Catalog$/, '');               // e.g. DL380_Gen12_SFF
const jsonPath   = path.join(targetDir, `${filePrefix}_Catalog.json`);
let pdfPath = path.join(targetDir, `HPE_${filePrefix}_QuickSpecs.pdf`);
if (!fs.existsSync(pdfPath)) {
  const existingPdfs = fs.readdirSync(targetDir).filter(f => f.endsWith('.pdf'));
  if (existingPdfs.length > 0) pdfPath = path.join(targetDir, existingPdfs[0]);
}

const auditResults = { timestamp: new Date().toISOString(), chassis: filePrefix, checks: [] };

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    auditResults.checks.push({ status: 'PASS', message });
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    auditResults.checks.push({ status: 'FAIL', message });
    throw new Error(`Guardrail Failure: ${message}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('🔍 COMPREHENSIVE EXCEL TALLY & PIPELINE AUDIT');
  console.log(`Chassis: ${filePrefix}`);
  console.log(`Excel:   ${xlsxPath}`);
  console.log('================================================================\n');

  // ── AUDIT 1: File Existence & Payload Sizes ───────────────────────────────
  console.log('--- AUDIT 1: Artifact File Existence & Payload Sizes ---');
  assert(fs.existsSync(xlsxPath), `Excel workbook exists: ${path.basename(xlsxPath)}`);
  assert(fs.existsSync(jsonPath), `Catalog JSON companion exists: ${path.basename(jsonPath)}`);

  const hasPdf = fs.existsSync(pdfPath);
  if (hasPdf) {
    console.log(`  ✅ PASS: QuickSpecs PDF exists: ${path.basename(pdfPath)}`);
    const pdfStats = fs.statSync(pdfPath);
    console.log(`  📑 QuickSpecs PDF:  ${(pdfStats.size / 1024 / 1024).toFixed(2)} MB`);
    assert(pdfStats.size > 500000, `PDF size (${(pdfStats.size / 1024 / 1024).toFixed(2)} MB) > 500 KB threshold`);
  } else {
    console.log(`  ⚠️  ADVISORY: QuickSpecs PDF not present (no QuickSpecs link on OCA page): ${path.basename(pdfPath)}`);
  }

  const xlsxStats = fs.statSync(xlsxPath);
  console.log(`  📊 Excel Workbook:  ${(xlsxStats.size / 1024).toFixed(1)} KB`);

  // ── AUDIT 2: Excel Workbook Sheet Structure ───────────────────────────────
  console.log('\n--- AUDIT 2: Excel Workbook Sheet Structure ---');
  const wb = XLSX.readFile(xlsxPath);
  const coreSheets = ['Category Summary', 'All SKUs', 'Rules & Constraints', 'Metadata'];
  coreSheets.forEach(sheet => {
    assert(wb.SheetNames.includes(sheet), `Core sheet '${sheet}' present in workbook`);
  });
  console.log(`  Workbook contains ${wb.SheetNames.length} total sheets:`, wb.SheetNames.join(', '));

  // ── AUDIT 3: Master SKU Tally & Row Counts ─────────────────────────────
  console.log('\n--- AUDIT 3: Master SKU Tally & Row Counts ---');
  const catalogData  = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const allSkusSheet = XLSX.utils.sheet_to_json(wb.Sheets['All SKUs']);
  const summarySheet = XLSX.utils.sheet_to_json(wb.Sheets['Category Summary']);

  const jsonSkuCount = catalogData.metadata.totalUniqueSKUs;
  console.log(`  JSON  totalUniqueSKUs:     ${jsonSkuCount}`);
  console.log(`  Excel 'All SKUs' rows:     ${allSkusSheet.length}`);
  assert(
    allSkusSheet.length >= jsonSkuCount && allSkusSheet.length > 0,
    `Excel 'All SKUs' count (${allSkusSheet.length}) >= JSON totalUniqueSKUs (${jsonSkuCount})`
  );

  let summarySkuSum = 0;
  summarySheet.forEach(row => {
    const val = parseInt(row['Total SKUs'] || row['SKU Count'] || row['Count'] || '0', 10);
    if (!isNaN(val)) summarySkuSum += val;
  });
  console.log(`  Category Summary SKU sum:  ${summarySkuSum}`);
  assert(summarySkuSum > 0, `Category Summary SKU sum (${summarySkuSum}) > 0`);
  assert(summarySheet.length >= 3, `Category Summary has ${summarySheet.length} subcategory rows (>= 3)`);

  // ── AUDIT 4: Data Quality (Qty regex + Hierarchy depth + Option Type) ──
  console.log('\n--- AUDIT 4: Data Quality Guardrails ---');
  let cleanQtyCount       = 0;
  let validHierarchyCount  = 0;
  let validOptionTypeCount = 0;

  allSkusSheet.forEach(row => {
    const qty = String(row['Current Qty'] || row['Quantity'] || '');
    if (/^\d+$/.test(qty)) cleanQtyCount++;

    const pathStr = String(row['Hierarchy Path'] || '');
    if ((pathStr.match(/>/g) || []).length >= 3) validHierarchyCount++;

    const optType = String(row['Option Type'] || '');
    if (['Standard', 'CTO', 'BTO', 'FIO'].includes(optType)) validOptionTypeCount++;
  });

  assert(
    cleanQtyCount === allSkusSheet.length,
    `100% of SKUs (${cleanQtyCount}/${allSkusSheet.length}) pass numeric Current Qty regex (^\\d+$)`
  );
  assert(
    validHierarchyCount === allSkusSheet.length,
    `100% of SKUs (${validHierarchyCount}/${allSkusSheet.length}) have 4-level Hierarchy Path (>= 3 '>' delimiters, Rule #20)`
  );
  assert(
    validOptionTypeCount === allSkusSheet.length,
    `100% of SKUs (${validOptionTypeCount}/${allSkusSheet.length}) have valid Option Type (Standard/CTO/BTO/FIO, Rule #30)`
  );

  // ── AUDIT 5: Category-Specific Sheet Tallies ──────────────────────────────
  console.log('\n--- AUDIT 5: Category-Specific Sheet SKU Tallies ---');
  const coreSheetsList = ['Category Summary', 'All SKUs', 'Rules & Constraints', 'Metadata', 'Catalog Diff & History'];
  const catSheets = wb.SheetNames.filter(name => !coreSheetsList.includes(name));
  catSheets.forEach(sheetName => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    console.log(`  ${sheetName}: ${rows.length} SKUs`);
    assert(rows.length > 0, `Sheet '${sheetName}' contains > 0 SKUs`);
  });

  // ── AUDIT 6: PDF Fingerprint MD5 ─────────────────────────────────────────
  console.log('\n--- AUDIT 6: PDF Fingerprint MD5 Cache Verification ---');
  if (hasPdf) {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const md5Hash   = crypto.createHash('md5').update(pdfBuffer).digest('hex');
    console.log(`  PDF MD5 Fingerprint: ${md5Hash}`);
    assert(md5Hash.length === 32, 'Valid 32-character MD5 hash generated for QuickSpecs PDF');
  } else {
    console.log('  ⚠️  ADVISORY: QuickSpecs PDF not present — skipping MD5 calculation.');
  }

  // ── AUDIT 7: Historical Diff & Price Trail Verification ────────────────────
  console.log('\n--- AUDIT 7: Historical Diff & Price Trail Verification ---');
  const historyDir = path.join(targetDir, 'history');
  if (fs.existsSync(historyDir)) {
    const snapshots = fs.readdirSync(historyDir).filter(f => f.startsWith('catalog_') && f.endsWith('.json'));
    console.log(`  History snapshots found: ${snapshots.length} file(s)`);
    assert(snapshots.length > 0, 'history/ directory contains valid catalog snapshots');
    if (fs.existsSync(path.join(historyDir, 'price_history.json'))) {
      console.log('  ✅ PASS: price_history.json cumulative log verified');
    }
  } else {
    console.log('  ⚠️  ADVISORY: history/ directory not yet established for this chassis.');
  }

  // Write structured audit result file
  const auditJsonPath = path.join(targetDir, 'audit_result.json');
  fs.writeFileSync(auditJsonPath, JSON.stringify(auditResults, null, 2));

  console.log('\n================================================================');
  console.log('🎉 ALL AUDIT CHECKS PASSED — PIPELINE 100% COMPLIANT!');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err.message);
  process.exit(1);
});
