'use strict';
/**
 * scripts/lib/catalog_formatter.js — Loosely Coupled Catalog TSV & Sheet Formatter
 *
 * Extracted from build_catalog.js to ensure high maintainability, clear separation of concerns,
 * and AI-agent-friendly code modularity.
 */

const { classifyComponentRole } = require('./product_meta');

/**
 * Generate Main SKUs TSV content.
 * @param {Array<object>} entries 
 * @param {string} chassisRoot 
 * @returns {string} TSV content string
 */
function generateMainSheet(entries, chassisRoot) {
  const rows = [[
    'Main Category', 'Sub-Category', 'Hierarchy Path', 'Component Role', 'Constraint Text',
    'Subcategory Max Qty', 'Table Rule/Note', 'Product #', 'Option Type', 'Description', 'Current Qty',
    'Unit Price (USD)', 'Price Delta (USD)', 'Extended Price (USD)', 'Price per GB (USD)',
    'HPE Recommended', 'Start Date', 'Discontinued Date',
    'Diff Status', 'Previous List Price (USD)', 'Price Change (USD)', 'Price Change (%)', 'Price History Trail'
  ].join('\t')];

  for (const entry of entries) {
    const constraintStr = entry.maxQty === -1 ? 'Unlimited' :
                         entry.maxQty === -2 ? 'Required' :
                         entry.maxQty > 0 ? `max ${entry.maxQty}` :
                         (entry.constraint || '');
    const maxQtyVal = entry.maxQty === -1 ? 'Unlimited' :
                      entry.maxQty === -2 ? 'Required' :
                      entry.maxQty > 0 ? String(entry.maxQty) :
                      (entry.constraint || '');

    for (const sku of entry.skus) {
      const rawQty   = String(sku['Current Qty'] || '0').replace(/\n/g, '').trim();
      const cleanQty = /^\d+$/.test(rawQty) ? rawQty : '0';
      const role     = classifyComponentRole(entry.parentCategory, sku['Description']);
      // Rule #20: HPE OCA > Chassis [BaseSKU] > Category > Subcategory
      const hierarchyPath = `HPE OCA > ${chassisRoot} > ${entry.parentCategory} > ${entry.subCategory}`;

      rows.push([
        entry.parentCategory, entry.subCategory, hierarchyPath, role, constraintStr, maxQtyVal,
        (entry.rules || []).join(' | '), sku['Product #'] || '', sku['Option Type'] || 'Standard', sku['Description'] || '', cleanQty,
        sku['Price (USD)'] || sku['Unit Price (USD)'] || '', sku['Price Delta (USD)'] || '', sku['Extended Price (USD)'] || '',
        sku['Price per GB (USD)'] || '', sku['HPE Recommended'] || '', sku['Start Date'] || sku['Start'] || '', sku['Discontinued Date'] || sku['Discontinued'] || '',
        sku['Diff Status'] || 'UNCHANGED', sku['Previous List Price (USD)'] || 'N/A', sku['Price Change (USD)'] || '$0.00', sku['Price Change (%)'] || '0.00%', sku['Price History Trail'] || ''
      ].join('\t'));
    }
  }
  return rows.join('\n');
}

/**
 * Generate Rules & Constraints TSV content.
 * @param {Array<object>} entries 
 * @param {Array<object>} subcatList 
 * @param {string} fullText 
 * @returns {string} TSV content string
 */
function generateRulesSheet(entries, subcatList = [], fullText = '') {
  const rows = [['Main Category', 'Sub-Category', 'Constraint', 'Rule Type', 'Rule Text'].join('\t')];
  const seen = new Set();

  for (const sc of subcatList) {
    const key = sc.parentCategory + '|' + sc.name;
    if (seen.has(key)) continue;
    seen.add(key);

    const constraintStr = sc.maxQty === -1 ? 'Unlimited' :
                         sc.maxQty === -2 ? 'Required' :
                         sc.maxQty > 0 ? `max ${sc.maxQty}` : sc.constraint;
    rows.push([sc.parentCategory, sc.name, constraintStr, 'Quantity Constraint', 'Max quantity: ' + constraintStr].join('\t'));
  }

  for (const entry of entries) {
    for (const rule of (entry.rules || [])) {
      rows.push([entry.parentCategory, entry.subCategory, entry.constraint || '', 'Configuration Rule', rule].join('\t'));
    }
  }

  const notePatterns = [
    { regex: /For [Mm]ore detail[s]? on .+?, please refer to: (.+)/g, type: 'Reference Link' },
    { regex: /Minimum \d+ of .+/g, type: 'Minimum Requirement' },
    { regex: /It is recommended to select .+/g, type: 'Recommendation' },
    { regex: /In order to select .+/g, type: 'Selection Guide' },
    { regex: /Mixing of .+ is not allowed/g, type: 'Mixing Rule' },
    { regex: /If .+ is selected.+/g, type: 'Conditional Rule' },
  ];

  for (const pat of notePatterns) {
    // Reset regex state for safety (Rule: regex state safety)
    pat.regex.lastIndex = 0;
    let m;
    while ((m = pat.regex.exec(fullText)) !== null) {
      let nearestSubcat = 'General', nearestParent = 'General';
      for (const sc of subcatList) {
        if (sc.textIndex < m.index) {
          nearestSubcat = sc.name;
          nearestParent = sc.parentCategory;
        }
      }
      const ruleText = m[0].substring(0, 300).trim();
      if (ruleText.length > 10) rows.push([nearestParent, nearestSubcat, '', pat.type, ruleText].join('\t'));
    }
  }
  return rows.join('\n');
}

/**
 * Generate Category Summary TSV content.
 * @param {Array<object>} entries 
 * @param {Array<object>} subcatList 
 * @returns {string} TSV content string
 */
function generateSummarySheet(entries, subcatList = []) {
  const rows = [['Main Category', 'Sub-Category', 'Constraint', 'Max Qty', 'Total SKUs', 'Has Rules', 'Rule Count'].join('\t')];
  const seen = new Set();

  const allSubcats = [
    ...subcatList.map(sc => ({ parentCategory: sc.parentCategory, name: sc.name, constraint: sc.constraint, maxQty: sc.maxQty })),
    ...entries.map(e => ({ parentCategory: e.parentCategory, name: e.subCategory, constraint: e.constraint || '', maxQty: e.maxQty || 0 }))
  ];

  for (const sc of allSubcats) {
    const key = sc.parentCategory + '|' + sc.name;
    if (seen.has(key)) continue;
    seen.add(key);

    let skuCount = 0, ruleCount = 0;
    for (const entry of entries) {
      if (entry.subCategory === sc.name && entry.parentCategory === sc.parentCategory) {
        skuCount += entry.skuCount;
        ruleCount += (entry.rules || []).length;
      }
    }
    const maxQtyStr = sc.maxQty === -1 ? 'Unlimited' :
                      sc.maxQty === -2 ? 'Required' :
                      sc.maxQty > 0 ? String(sc.maxQty) : (sc.constraint || 'N/A');
    rows.push([sc.parentCategory, sc.name, sc.constraint || '', maxQtyStr, skuCount, ruleCount > 0 ? 'Yes' : 'No', ruleCount].join('\t'));
  }
  return rows.join('\n');
}

module.exports = {
  generateMainSheet,
  generateRulesSheet,
  generateSummarySheet
};
