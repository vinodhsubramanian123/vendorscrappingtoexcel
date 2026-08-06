/**
 * generate_xlsx.js — Generic HPE OCA Catalog Excel Generator (with Color-Coded Diffs)
 * Usage: node scripts/generate_xlsx.js <output_xlsx_path>
 *
 * Derives ALL file paths from the xlsx output path — ZERO hardcoded product names.
 * TSV intermediates are read from:  <xlsx_dir>/intermittent_scraps/<prefix>_Catalog_*.tsv
 * Category drill-down sheets are generated dynamically from SKU data — no hardcoded list.
 * Uses xlsx-js-style for cell styling (Green=Added, Red=Removed, Amber=Price Changed).
 */

'use strict';

const fs   = require('fs');
const XLSX = require('xlsx-js-style');
const path = require('path');

/**
 * Sanitize a string for use as an Excel sheet name.
 * - Strips illegal characters: : \ / ? * [ ]
 * - Truncates to 31 characters (Excel limit)
 * - Deduplicates collisions by appending _2, _3, etc.
 * @param {string} name - Raw category name
 * @param {string[]} existingNames - Already-used sheet names for collision detection
 * @returns {string} Safe, unique sheet name
 */
function sanitizeSheetName(name, existingNames) {
  let safe = String(name)
    .replace(/[:\\/?*\[\]]/g, '')  // Strip Excel-illegal characters
    .replace(/^'+|'+$/g, '')       // Strip leading/trailing single quotes
    .trim();
  if (safe.length === 0) safe = 'Sheet';
  safe = safe.substring(0, 31);

  // Deduplicate: if collision, append _2, _3, etc.
  let candidate = safe;
  let counter = 2;
  while (existingNames.includes(candidate)) {
    const suffix = `_${counter}`;
    candidate = safe.substring(0, 31 - suffix.length) + suffix;
    counter++;
  }
  return candidate;
}

// ── Argument handling ─────────────────────────────────────────────────────────
const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/generate_xlsx.js <outputs/.../Foo_OCA_Catalog.xlsx>');
  process.exit(1);
}

const targetDir = path.dirname(xlsxPath);
const scrapsDir = path.join(targetDir, 'intermittent_scraps');

// Derive clean prefix: DL380_Gen12_SFF_OCA_Catalog.xlsx → DL380_Gen12_SFF
const xlsxBase   = path.basename(xlsxPath, '.xlsx');         // e.g. DL380_Gen12_SFF_OCA_Catalog
const filePrefix = xlsxBase.replace(/_OCA_Catalog$/, '');    // e.g. DL380_Gen12_SFF

// ── TSV parser ────────────────────────────────────────────────────────────────
function parseTSV(filepath) {
  if (!fs.existsSync(filepath)) {
    console.error(`ERROR: TSV not found: ${filepath}`);
    process.exit(1);
  }
  const lines   = fs.readFileSync(filepath, 'utf-8').split('\n');
  const headers = lines[0].split('\t');
  const data    = lines.slice(1).filter(l => l.trim()).map(line => {
    const cells = line.split('\t');
    const obj   = {};
    headers.forEach((h, i) => { obj[h] = cells[i] || ''; });
    return obj;
  });
  return { headers, data };
}

// ── Load TSV files ────────────────────────────────────────────────────────────
const skuData     = parseTSV(path.join(scrapsDir, `${filePrefix}_Catalog_SKUs.tsv`));
const rulesData   = parseTSV(path.join(scrapsDir, `${filePrefix}_Catalog_Rules.tsv`));
const summaryData = parseTSV(path.join(scrapsDir, `${filePrefix}_Catalog_Summary.tsv`));

// ── Build workbook ────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

// ── Column widths for 23-field SKU schema (18 base + 5 diff fields) ──────────
const SKU_COL_WIDTHS = [
  { wch: 25 }, // Main Category
  { wch: 35 }, // Sub-Category
  { wch: 70 }, // Hierarchy Path
  { wch: 22 }, // Component Role
  { wch: 15 }, // Constraint Text
  { wch: 15 }, // Subcategory Max Qty
  { wch: 60 }, // Table Rule/Note
  { wch: 16 }, // Product #
  { wch: 14 }, // Option Type
  { wch: 70 }, // Description
  { wch: 12 }, // Current Qty
  { wch: 16 }, // Unit Price (USD)
  { wch: 16 }, // Price Delta (USD)
  { wch: 18 }, // Extended Price (USD)
  { wch: 15 }, // Price per GB (USD)
  { wch: 14 }, // HPE Recommended
  { wch: 12 }, // Start Date
  { wch: 16 }, // Discontinued Date
  { wch: 16 }, // Diff Status
  { wch: 22 }, // Previous List Price (USD)
  { wch: 18 }, // Price Change (USD)
  { wch: 16 }, // Price Change (%)
  { wch: 55 }, // Price History Trail
];

// ── Cell Styling Helper for Diff Status ──────────────────────────────────────
function applyDiffStyles(ws, data) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);

  for (let r = 1; r <= range.e.r; r++) {
    const rowObj = data[r - 1];
    if (!rowObj) continue;

    const status = rowObj['Diff Status'] || 'UNCHANGED';
    let style = null;

    if (status === 'ADDED') {
      style = {
        font: { name: 'Calibri', sz: 11, color: { rgb: '137333' }, bold: true },
        fill: { fgColor: { rgb: 'E6F4EA' } }
      };
    } else if (status === 'REMOVED') {
      style = {
        font: { name: 'Calibri', sz: 11, color: { rgb: 'C5221F' }, strike: true },
        fill: { fgColor: { rgb: 'FDE7E7' } }
      };
    } else if (status === 'PRICE_CHANGED') {
      style = {
        font: { name: 'Calibri', sz: 11, color: { rgb: 'B06000' }, bold: true },
        fill: { fgColor: { rgb: 'FFF3E0' } }
      };
    }

    if (style) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (ws[cellRef]) {
          ws[cellRef].s = style;
        }
      }
    }
  }
}

// ── Enable Freeze Header Row & AutoFilter for clean UX ───────────────────────
function enableSheetUsability(ws) {
  if (!ws || !ws['!ref']) return;
  ws['!autofilter'] = { ref: ws['!ref'] };
  ws['!views']      = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

  // Style header row
  const range = XLSX.utils.decode_range(ws['!ref']);
  const headerStyle = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0072C6' } },
    alignment: { vertical: 'center' }
  };
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cellRef]) {
      ws[cellRef].s = headerStyle;
    }
  }
}

// Sheet 1: Category Summary
const summaryWS = XLSX.utils.json_to_sheet(summaryData.data);
summaryWS['!cols'] = [
  { wch: 30 }, { wch: 45 }, { wch: 15 },
  { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
];
enableSheetUsability(summaryWS);
XLSX.utils.book_append_sheet(wb, summaryWS, 'Category Summary');

// Sheet 2: All SKUs
const skuWS = XLSX.utils.json_to_sheet(skuData.data);
skuWS['!cols'] = SKU_COL_WIDTHS;
applyDiffStyles(skuWS, skuData.data);
enableSheetUsability(skuWS);
XLSX.utils.book_append_sheet(wb, skuWS, 'All SKUs');

// Sheet 3: Rules & Constraints
const rulesWS = XLSX.utils.json_to_sheet(rulesData.data);
rulesWS['!cols'] = [
  { wch: 30 }, { wch: 45 }, { wch: 15 }, { wch: 20 }, { wch: 100 },
];
enableSheetUsability(rulesWS);
XLSX.utils.book_append_sheet(wb, rulesWS, 'Rules & Constraints');

// Sheet 4: Catalog Diff & History (Dedicated diff sheet — ONLY when diffs exist)
const diffRows = skuData.data.filter(r =>
  r['Diff Status'] === 'ADDED' || r['Diff Status'] === 'REMOVED' || r['Diff Status'] === 'PRICE_CHANGED'
);

if (diffRows.length > 0) {
  const diffWS = XLSX.utils.json_to_sheet(diffRows);
  diffWS['!cols'] = SKU_COL_WIDTHS;
  applyDiffStyles(diffWS, diffRows);
  enableSheetUsability(diffWS);
  XLSX.utils.book_append_sheet(wb, diffWS, 'Catalog Diff & History');
}

// Sheets 5+: Category drill-downs — dynamically discovered from SKU data
const REQUIRED_CATEGORIES = [
  'Processor', 'Memory', 'Smart Chassis', 'Storage Devices',
  'Networking', 'Power Supplies', 'Graphics Options',
];

const allCategoriesInData = [...new Set(
  skuData.data.map(r => r['Main Category']).filter(Boolean)
)];

const orderedCategories = [
  ...REQUIRED_CATEGORIES,
  ...allCategoriesInData.filter(c => !REQUIRED_CATEGORIES.includes(c))
];

const usedSheetNames = wb.SheetNames.slice(); // Track names already in use

for (const cat of orderedCategories) {
  const catSKUs = skuData.data.filter(r => r['Main Category'] === cat);
  if (catSKUs.length === 0) continue;   // Skip categories with no SKUs
  const ws       = XLSX.utils.json_to_sheet(catSKUs);
  ws['!cols']    = SKU_COL_WIDTHS;
  applyDiffStyles(ws, catSKUs);
  enableSheetUsability(ws);
  const sheetName = sanitizeSheetName(cat, usedSheetNames);
  usedSheetNames.push(sheetName);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// Sheet: Metadata — all values derived dynamically
const catalogJsonPath = path.join(targetDir, `${filePrefix}_Catalog.json`);
let catalogMeta = {};
if (fs.existsSync(catalogJsonPath)) {
  try { catalogMeta = JSON.parse(fs.readFileSync(catalogJsonPath, 'utf-8')).metadata || {}; } catch {}
}

const diffSummary = catalogMeta.diffSummary || {};

const metaData = [
  { Field: 'Chassis',              Value: catalogMeta.chassis       || filePrefix.replace(/_/g, ' ') },
  { Field: 'Scrape Date',          Value: catalogMeta.scrapeDate    || new Date().toISOString() },
  { Field: 'Source',               Value: 'OCA (Online Configuration Application)' },
  { Field: 'Total Sub-Categories', Value: String(summaryData.data.length) },
  { Field: 'Total Unique SKUs',    Value: String(skuData.data.length) },
  { Field: 'Total Rules',          Value: String(rulesData.data.length) },
  { Field: 'Total Tables',         Value: String(catalogMeta.totalTables || '') },
  { Field: 'Diff Added SKUs',      Value: String(diffSummary.added || 0) },
  { Field: 'Diff Removed SKUs',    Value: String(diffSummary.removed || 0) },
  { Field: 'Diff Price Changed',   Value: String(diffSummary.priceChanged || 0) },
  { Field: 'Diff Unchanged SKUs',  Value: String(diffSummary.unchanged || skuData.data.length) },
  { Field: 'Output Folder',        Value: targetDir },
];
const metaWS = XLSX.utils.json_to_sheet(metaData);
metaWS['!cols'] = [{ wch: 25 }, { wch: 80 }];
XLSX.utils.book_append_sheet(wb, metaWS, 'Metadata');

// ── Write file ────────────────────────────────────────────────────────────────
XLSX.writeFile(wb, xlsxPath);

console.log('Excel workbook created: ' + xlsxPath);
console.log('\nSheets:');
wb.SheetNames.forEach((name, i) => {
  const ws    = wb.Sheets[name];
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { e: { r: 0 } };
  console.log(`  ${i + 1}. ${name} (${range.e.r} data rows)`);
});
