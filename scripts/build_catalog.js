'use strict';
/**
 * build_catalog.js — Classification Engine for HPE OCA Catalog Scrapes
 * Usage: node scripts/build_catalog.js <raw_input.json> <catalog_output.json> [--verbose]
 *
 * Parses raw CDP scrape output (oca_raw_data_full.json) into structured,
 * classified catalog JSON + TSV intermediates for Excel & Notebook LM.
 */

const fs   = require('fs');
const path = require('path');
const { processCatalogDiff } = require('./lib/diff_catalog');
const { HPE_SKU_EXTRACT_REGEX, cleanBaseSKU, classifyOptionType } = require('./lib/sku');
const { generateMainSheet, generateRulesSheet, generateSummarySheet } = require('./lib/catalog_formatter');

// ── CLI Arguments ─────────────────────────────────────────────────────────────
const rawInputPath   = process.argv[2];
const jsonOutputPath = process.argv[3];
const IS_VERBOSE     = process.argv.includes('--verbose') || process.argv.includes('-v');

if (!rawInputPath || !jsonOutputPath) {
  console.error('Usage: node scripts/build_catalog.js <raw_data/oca_raw_data_full.json> <outputs/.../Catalog.json> [--verbose]');
  process.exit(1);
}
if (!fs.existsSync(rawInputPath)) {
  console.error(`❌ ERROR: Raw input file not found: ${rawInputPath}`);
  process.exit(1);
}

console.log('================================================================');
console.log('📦 CLASSIFICATION ENGINE — BUILD CATALOG');
console.log(`Input:  ${rawInputPath}`);
console.log(`Output: ${jsonOutputPath}`);
console.log('================================================================\n');

const targetDir = path.dirname(jsonOutputPath);
const scrapsDir = path.join(targetDir, 'intermittent_scraps');
fs.mkdirSync(scrapsDir, { recursive: true });

// Derive chassis prefix early — available to all generator functions via closure
const catalogBaseName = path.basename(jsonOutputPath, '.json');   // e.g. DL380_Gen12_SFF_Catalog
const filePrefix      = catalogBaseName.replace(/_Catalog$/, ''); // e.g. DL380_Gen12_SFF
const chassisLabel    = filePrefix.replace(/_/g, ' ');            // e.g. DL380 Gen12 SFF

const rawData  = JSON.parse(fs.readFileSync(rawInputPath, 'utf-8'));
const fullText = rawData.fullText || rawData.bodyText || '';
const tables   = rawData.tables || [];

console.log(`Loaded Raw Scrape Payload:`);
console.log(`  Page Title:   "${rawData.pageTitle || 'N/A'}"`);
console.log(`  Full Text:    ${fullText.length.toLocaleString()} chars`);
console.log(`  Total Tables: ${tables.length}`);

// Extract CTO base SKU for hierarchy path (e.g. P73282-B21) — Rule on 4-level path
const _ctoIdx       = fullText.indexOf('Configure-to-order');
const _searchArea   = _ctoIdx > -1 ? fullText.substring(_ctoIdx, _ctoIdx + 300) : fullText.substring(0, 500);
const _baseSKUMatch = _searchArea.match(/\b([A-Z]\d{5}-[A-Z]\d{2}[A-Z0-9]*)\b/);
const baseSKU       = _baseSKUMatch ? _baseSKUMatch[1] : '';
const chassisRoot   = baseSKU ? `${chassisLabel} [${baseSKU}]` : chassisLabel;
console.log(`  Chassis Root: "${chassisRoot}"${baseSKU ? ` (Base SKU: ${baseSKU})` : ''}\n`);

// ============================================================
// Step 1: Build subcategory index from text
// ============================================================
console.log('--- Step 1: Extracting Subcategories & Quantity Constraints ---');

// Permissive regex capturing (max N), (required), (no max), (optional), (min N)
const subcatRegex = /\n([^\n]{3,80})\s*\((max\s+(\d+)|required|no max|optional|min\s+(\d+))\)/gi;
subcatRegex.lastIndex = 0;
const subcatList = [];
let match;
while ((match = subcatRegex.exec(fullText)) !== null) {
  let name = match[1].trim();
  name = name.replace(/^[\s\n\r\t]+/, '').trim();
  if (name.length < 3 || name.length > 80) continue;
  if (name.match(/^\d{4}/)) continue;  // Skip date-like patterns
  if (name.includes('\t')) continue;   // Skip tab-separated data

  const constraintRaw = match[2].toLowerCase();
  let maxQty = 0;
  if (match[3]) maxQty = parseInt(match[3], 10);
  else if (constraintRaw === 'no max') maxQty = -1;       // Unlimited sentinel
  else if (constraintRaw === 'required') maxQty = -2;     // Required sentinel

  subcatList.push({
    name,
    constraint: match[2],
    maxQty,
    textIndex: match.index
  });
}

console.log(`Found ${subcatList.length} subcategory headers in text.`);
if (IS_VERBOSE) {
  subcatList.forEach((sc, i) => console.log(`  [${i+1}] "${sc.name}" (${sc.constraint}, maxQty: ${sc.maxQty}) @ pos ${sc.textIndex}`));
}

// ============================================================
// Step 2: Build parent category mapping
// ============================================================
console.log('\n--- Step 2: Mapping Parent Categories ---');

const configPath = path.join(__dirname, 'config', 'categories.json');
let KNOWN_MAIN_CATEGORIES = [];
let COMPONENT_ROLES_CONFIG = [];

if (fs.existsSync(configPath)) {
  try {
    const parsedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    KNOWN_MAIN_CATEGORIES = parsedConfig.mainCategories || [];
    COMPONENT_ROLES_CONFIG = parsedConfig.componentRoles || [];
  } catch (err) {
    console.warn(`  ⚠️ Failed to parse config/categories.json: ${err.message}`);
  }
}


// Hybrid category discovery: combine KNOWN_MAIN_CATEGORIES + dynamic section headings
const mainCategories = [...KNOWN_MAIN_CATEGORIES];

if (Array.isArray(rawData.sections)) {
  rawData.sections.forEach(sec => {
    const t = (sec.text || '').trim();
    if (t.length >= 3 && t.length <= 50 && !mainCategories.includes(t) && !t.includes('(')) {
      mainCategories.push(t);
    }
  });
}

// Skip navigation menu clustered at text positions < 1,010
const NAV_MENU_END = 1010;
const mainCatPositions = [];

for (const mc of mainCategories) {
  const patterns = ['\n ' + mc + '\n', '\n' + mc + '\n'];
  let bestIdx = -1;
  for (const p of patterns) {
    let searchPos = NAV_MENU_END;
    while (true) {
      const idx = fullText.indexOf(p, searchPos);
      if (idx === -1) break;
      if (idx > NAV_MENU_END) { bestIdx = idx; break; }
      searchPos = Math.max(searchPos + 1, idx + p.length);
    }
  }
  if (bestIdx > -1) {
    mainCatPositions.push({ name: mc, index: bestIdx });
  }
}
mainCatPositions.sort((a, b) => a.index - b.index);

console.log(`Discovered ${mainCatPositions.length} active Main Category headers in content area:`);
mainCatPositions.forEach(mc => console.log(`  • ${mc.name.padEnd(35)} (position ${mc.index})`));

function getParentCategory(textIdx) {
  let parent = 'Unknown';
  for (const mc of mainCatPositions) {
    if (mc.index < textIdx) parent = mc.name;
    else break;
  }
  return parent;
}

// Assign parent categories to subcategories
let unclassifiedSubcats = 0;
for (const sc of subcatList) {
  let parent = getParentCategory(sc.textIndex);
  if (parent === 'Unknown') {
    // Smart fallback: check if sc.name directly matches or contains a known main category
    const directMatch = mainCategories.find(mc =>
      sc.name.toLowerCase() === mc.toLowerCase() || sc.name.toLowerCase().includes(mc.toLowerCase())
    );
    if (directMatch) parent = directMatch;
  }
  sc.parentCategory = parent;
  if (sc.parentCategory === 'Unknown') unclassifiedSubcats++;
}

if (unclassifiedSubcats > 0) {
  console.warn(`⚠️  WARNING: ${unclassifiedSubcats} subcategories mapped to 'Unknown' parent category. Inspect textIndex positioning.`);
}

// ============================================================
// Step 3: Parse individual tables
// ============================================================
console.log('\n--- Step 3: Extracting Tables & SKUs ---');

const allSKURows   = [];
const allSKUMap    = new Map();
const processedPNs = new Set();
const tableEntries = [];
let skippedTables  = 0;

for (let ti = 1; ti < tables.length; ti++) {
  const table = tables[ti];
  if (!table.rows || table.rows.length < 2) {
    skippedTables++;
    continue;
  }

  // Find header row
  let headerIdx  = -1;
  let headers    = [];
  let tableRules = [];

  for (let ri = 0; ri < Math.min(4, table.rows.length); ri++) {
    const row = table.rows[ri];
    const hasProductHeader = row.some(c => c === 'Product #');
    const hasDescHeader    = row.some(c => c === 'Description');

    if (hasProductHeader || hasDescHeader) {
      headerIdx = ri;
      headers   = row.filter(h => h.length > 0);
      break;
    } else {
      const text = row.join(' ').trim();
      if (text && text !== 'Available' && text.length > 5 && text.length < 300) {
        tableRules.push(text);
      }
    }
  }

  if (headerIdx === -1) {
    skippedTables++;
    continue;
  }

  // Extract data rows
  const skus = [];
  for (let ri = headerIdx + 1; ri < table.rows.length; ri++) {
    const row = table.rows[ri];
    if (row.length < 3) continue;

    const obj = {};
    let offset = 0;
    if (headers[0] === 'Product #' && row[0] === '' && row.length > headers.length) offset = 1;

    for (let hi = 0; hi < headers.length; hi++) {
      const header  = headers[hi];
      const cellIdx = hi + offset;
      if (header && cellIdx < row.length) {
        obj[header] = row[cellIdx].replace(/\n/g, ' ').trim();
      }
    }

    // Sanitize Product # — strictly extract HPE hardware and Service SKUs
    // Rejects internal DOM pattern IDs (e.g. dl380pat001b94fb) and arbitrary numeric strings
    const rawPN     = obj['Product #'] || '';
    const hpeMatch  = rawPN.match(HPE_SKU_EXTRACT_REGEX);
    if (!hpeMatch) {
      continue; // Skip rows that do not have a valid HPE part number SKU
    }

    const matchedRaw = hpeMatch[1].toUpperCase();
    const pn         = cleanBaseSKU(matchedRaw);
    const optionType = classifyOptionType(matchedRaw);

    if (pn) {
      obj['Product #']   = pn;
      obj['Option Type'] = optionType;
    }

    // Normalise Current Qty — clean integer string
    const rawQty = String(obj['Current Qty'] || obj['Quantity'] || '0').replace(/\s+/g, '').trim();
    obj['Current Qty'] = /^\d+$/.test(rawQty) ? rawQty : '0';
    delete obj['Quantity'];

    // Filter out TAA Compliant & GTA / #GTA SKUs for MEA (Dubai) region requirement
    const descText = obj['Description'] || '';
    if (/\bTAA\b|TAA Compliant|\bGTA\b|#GTA/i.test(pn) || /\bTAA\b|TAA Compliant|\bGTA\b|#GTA/i.test(descText)) {
      continue;
    }

    if (pn && pn.length >= 3 && pn.length < 30 && !pn.includes('Product #') && !pn.includes('Optional') && !pn.includes('Please make')) {
      skus.push(obj);
    }
  }

  if (skus.length === 0) {
    skippedTables++;
    continue;
  }

  // Find subcategory match via text position
  let matchedSubcat = null;
  let textPos = -1;

  for (const s of skus) {
    const pn = s['Product #'];
    if (pn) {
      const pos = fullText.indexOf(pn);
      if (pos > -1) { textPos = pos; break; }
    }
  }

  if (textPos > -1) {
    for (let i = 0; i < subcatList.length; i++) {
      if (textPos >= subcatList[i].textIndex) {
        if (i === subcatList.length - 1 || textPos < subcatList[i + 1].textIndex) {
          matchedSubcat = subcatList[i];
          break;
        }
      }
    }
  }

  // Table-index order fallback if text position match was not found
  if (!matchedSubcat && subcatList.length > 0) {
    const subcatIdx = Math.min(Math.floor((ti / tables.length) * subcatList.length), subcatList.length - 1);
    matchedSubcat   = subcatList[subcatIdx];
  }

  let parentCat = matchedSubcat ? matchedSubcat.parentCategory :
                    (textPos > -1 ? getParentCategory(textPos) : 'Unknown');
  let subCat    = matchedSubcat ? matchedSubcat.name : '(Sub-table)';

  // Override with explicit wizard subTab / label if available
  if (table.subTab) parentCat = table.subTab;
  if (table.label)  subCat    = table.label;

  // Smart fallback: if parentCat is still 'Unknown', match against known category keywords in rules & SKU descriptions
  if (parentCat === 'Unknown') {
    const searchContext = `${subCat} ${tableRules.join(' ')} ${skus.map(s => s['Description'] || '').join(' ')}`;
    const matchedMain   = KNOWN_MAIN_CATEGORIES.find(mc =>
      new RegExp(`\\b${mc.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(searchContext)
    );
    if (matchedMain) parentCat = matchedMain;
  }

  tableEntries.push({
    tableIndex:     ti,
    parentCategory: parentCat,
    subCategory:    subCat,
    constraint:     matchedSubcat ? matchedSubcat.constraint : '',
    maxQty:         matchedSubcat ? matchedSubcat.maxQty : '',
    rules:          tableRules,
    headers,
    skuCount:       skus.length,
    skus
  });

  // Deduplicate into master SKU list with price-prioritization
  for (const sku of skus) {
    const pn = sku['Product #'];
    if (!pn) continue;

    const newSKURow = {
      parentCategory: parentCat,
      subCategory:    matchedSubcat ? matchedSubcat.name : '(Sub-table)',
      constraint:     matchedSubcat ? matchedSubcat.constraint : '',
      rules:          tableRules.join(' | '),
      ...sku
    };

    const hasValidPrice = (row) => {
      const p = String(row['Unit Price (USD)'] || row['Price (USD)'] || row['Price'] || '').replace(/[\$,\s]/g, '');
      return !isNaN(parseFloat(p)) && parseFloat(p) > 0;
    };

    if (!processedPNs.has(pn)) {
      processedPNs.add(pn);
      allSKUMap.set(pn, newSKURow);
    } else {
      // If duplicate SKU (e.g. CTO vs Smart CTO), prioritize the entry with a valid list price
      const existing = allSKUMap.get(pn);
      if (existing && !hasValidPrice(existing) && hasValidPrice(newSKURow)) {
        allSKUMap.set(pn, newSKURow);
      }
    }
  }

  if (IS_VERBOSE) {
    console.log(`  Table #${ti}: ${skus.length} SKUs → Subcat: "${matchedSubcat ? matchedSubcat.name : '(Sub-table)'}" (${parentCat})`);
  }
}

console.log(`Processed ${tableEntries.length} valid product tables (${skippedTables} non-SKU/wrapper tables skipped).`);
allSKURows.push(...allSKUMap.values());
console.log(`Extracted ${processedPNs.size} unique SKUs.`);

// ============================================================
// Step 4: Merge sub-tables into parent subcategory
// ============================================================
console.log('\n--- Step 4: Merging Sub-Tables & Subcategory Inheritance ---');

const orderedEntries = [...tableEntries].sort((a, b) => a.tableIndex - b.tableIndex);
let lastMatchedSubcat = null;
let mergedSubtableCount = 0;

for (const entry of orderedEntries) {
  if (entry.subCategory !== '(Sub-table)') {
    lastMatchedSubcat = entry;
  } else if (lastMatchedSubcat) {
    entry.parentCategory = lastMatchedSubcat.parentCategory;
    entry.subCategory    = lastMatchedSubcat.subCategory;
    entry.constraint     = lastMatchedSubcat.constraint;
    entry.maxQty         = lastMatchedSubcat.maxQty;
    mergedSubtableCount++;
  }
}

console.log(`Merged ${mergedSubtableCount} sub-tables into preceding parent subcategories (DOM index order).`);

function getComponentRole(sku, subCat, parentCat) {
  const desc   = (sku['Description'] || '').toLowerCase();
  const sub    = (subCat || '').toLowerCase();
  const parent = (parentCat || '').toLowerCase();
  const pn     = (sku['Product #'] || '').toLowerCase();

  for (const item of COMPONENT_ROLES_CONFIG) {
    if (item.patterns && item.patterns.some(p => desc.includes(p) || pn.includes(p))) {
      return item.role;
    }
    if (item.subcatPatterns && item.subcatPatterns.some(p => sub.includes(p))) {
      return item.role;
    }
    if (item.parentPatterns && item.parentPatterns.some(p => parent.includes(p))) {
      return item.role;
    }
  }

  return 'Hardware Component';
}

// ============================================================
// Step 5: Process Catalog Diffs & History Snapshots
// ============================================================
console.log('\n--- Step 5: Catalog Diff Engine & Historical Price Tracking ---');

const historyDir = path.join(targetDir, 'history');
const catalogObj = {
  metadata: {
    chassis:            filePrefix.replace(/_/g, ' '),
    scrapeDate:         new Date().toISOString(),
    totalSubcategories: subcatList.length,
    totalUniqueSKUs:    processedPNs.size,
    totalTables:        tableEntries.length
  },
  subcategories: subcatList.map(sc => ({
    parentCategory: sc.parentCategory,
    name:           sc.name,
    constraint:     sc.constraint,
    maxQty:         sc.maxQty
  })),
  entries: orderedEntries.map(e => ({
    parentCategory: e.parentCategory,
    subCategory:    e.subCategory,
    constraint:     e.constraint,
    maxQty:         e.maxQty,
    rules:          e.rules,
    headers:        e.headers,
    skuCount:       e.skuCount,
    skus:           e.skus
  }))
};

const { enrichedCatalog } = processCatalogDiff(catalogObj, historyDir);

// ============================================================
// Step 6: Write outputs
// ============================================================
console.log('\n--- Step 6: Generating TSV & Catalog JSON Files ---');

const mainTSV    = generateMainSheet(enrichedCatalog.entries, chassisRoot);
const rulesTSV   = generateRulesSheet(enrichedCatalog.entries, subcatList, fullText);
const summaryTSV = generateSummarySheet(enrichedCatalog.entries, subcatList);

fs.writeFileSync(path.join(scrapsDir, `${filePrefix}_Catalog_SKUs.tsv`),    mainTSV);
fs.writeFileSync(path.join(scrapsDir, `${filePrefix}_Catalog_Rules.tsv`),   rulesTSV);
fs.writeFileSync(path.join(scrapsDir, `${filePrefix}_Catalog_Summary.tsv`), summaryTSV);

fs.writeFileSync(jsonOutputPath, JSON.stringify(enrichedCatalog, null, 2));

console.log('=== FILES SAVED ===');
console.log(`  📄 ${filePrefix}_Catalog_SKUs.tsv    (${mainTSV.split('\n').length} rows)`);
console.log(`  📄 ${filePrefix}_Catalog_Rules.tsv   (${rulesTSV.split('\n').length} rows)`);
console.log(`  📄 ${filePrefix}_Catalog_Summary.tsv (${summaryTSV.split('\n').length} rows)`);
console.log(`  📄 ${catalogBaseName}.json        (structured companion JSON)`);

console.log('\n=== CATEGORY BREAKDOWN ===');
const catCounts = {};
for (const e of enrichedCatalog.entries) {
  catCounts[e.parentCategory] = (catCounts[e.parentCategory] || 0) + e.skuCount;
}
Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
  console.log(`  • ${cat.padEnd(35)}: ${count} SKUs`);
});
console.log('\n✅ CLASSIFICATION COMPLETE.');
