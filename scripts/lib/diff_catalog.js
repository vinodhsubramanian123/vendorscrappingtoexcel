'use strict';
/**
 * scripts/lib/diff_catalog.js — Catalog Diff & Historical Price Tracking Engine
 *
 * Computes SKU additions, removals, price changes, and historical price trails
 * between catalog scrapes. Maintained under outputs/{Family}/{Gen}/{Model}/history/
 */

const fs   = require('fs');
const path = require('path');

function parsePrice(val) {
  if (val === null || val === undefined) return 0;
  const cleaned = String(val).replace(/[^0-9.\-]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const matched = String(dateStr).match(/^\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : new Date().toISOString().split('T')[0];
}

/**
 * Perform diff calculation and history update.
 * @param {object} catalogData - Structured catalog object from build_catalog.js
 * @param {string} historyDir - Absolute path to history/ directory
 * @returns {object} { enrichedCatalog, diffSummary, prevSnapshotPath }
 */
function processCatalogDiff(catalogData, historyDir) {
  fs.mkdirSync(historyDir, { recursive: true });

  const scrapeDate = formatDate(catalogData.metadata?.scrapeDate);
  const currentSnapshotPath = path.join(historyDir, `catalog_${scrapeDate}.json`);
  const priceHistoryPath    = path.join(historyDir, 'price_history.json');

  // Load existing price history log
  let priceHistory = {};
  if (fs.existsSync(priceHistoryPath)) {
    try {
      priceHistory = JSON.parse(fs.readFileSync(priceHistoryPath, 'utf-8'));
    } catch (err) {
      console.warn(`  ⚠️ Warning: Corrupted price_history.json at ${priceHistoryPath}: ${err.message}`);
    }
  }

  // Find previous catalog snapshots (excluding today's file if re-running same day)
  const snapshotFiles = fs.readdirSync(historyDir)
    .filter(f => f.startsWith('catalog_') && f.endsWith('.json') && f !== `catalog_${scrapeDate}.json`)
    .sort();

  const prevSnapshotPath = snapshotFiles.length > 0
    ? path.join(historyDir, snapshotFiles[snapshotFiles.length - 1])
    : null;

  let prevCatalog = null;
  if (prevSnapshotPath && fs.existsSync(prevSnapshotPath)) {
    try {
      prevCatalog = JSON.parse(fs.readFileSync(prevSnapshotPath, 'utf-8'));
    } catch (err) {
      console.warn(`  ⚠️ Warning: Corrupted previous snapshot at ${prevSnapshotPath}: ${err.message}`);
    }
  }

  // Build previous SKU lookup map
  const prevSkuMap = new Map();
  if (prevCatalog && Array.isArray(prevCatalog.entries)) {
    for (const entry of prevCatalog.entries) {
      for (const sku of entry.skus || []) {
        const pn = sku['Product #'];
        if (pn) {
          prevSkuMap.set(pn, {
            ...sku,
            parentCategory: entry.parentCategory,
            subCategory:    entry.subCategory,
            constraint:     entry.constraint,
            rules:          (entry.rules || []).join(' | ')
          });
        }
      }
    }
  }

  const currSkuMap = new Map();
  const diffSummary = { added: 0, removed: 0, priceChanged: 0, unchanged: 0 };

  // 1. Process current entries & compute diffs
  for (const entry of catalogData.entries) {
    for (const sku of entry.skus || []) {
      const pn = sku['Product #'];
      if (!pn) continue;
      currSkuMap.set(pn, sku);

      const currPrice = parsePrice(sku['Unit Price (USD)'] || sku['Price (USD)']);

      // Price trail history initialization
      if (!priceHistory[pn]) priceHistory[pn] = [];

      if (!prevCatalog) {
        // Baseline run — first time scrape
        sku['Diff Status']              = 'UNCHANGED';
        sku['Previous List Price (USD)'] = 'N/A';
        sku['Price Change (USD)']        = '$0.00';
        sku['Price Change (%)']          = '0.00%';

        if (!priceHistory[pn].some(h => h.date === scrapeDate)) {
          priceHistory[pn].push({ date: scrapeDate, price: currPrice, status: 'BASELINE' });
        }
        diffSummary.unchanged++;
      } else if (!prevSkuMap.has(pn)) {
        // ADDED SKU
        sku['Diff Status']              = 'ADDED';
        sku['Previous List Price (USD)'] = 'N/A';
        sku['Price Change (USD)']        = `+$${currPrice.toFixed(2)}`;
        sku['Price Change (%)']          = '+100.00%';

        if (!priceHistory[pn].some(h => h.date === scrapeDate)) {
          priceHistory[pn].push({ date: scrapeDate, price: currPrice, status: 'ADDED' });
        }
        diffSummary.added++;
      } else {
        // SKU present in both current and previous
        const prevSku   = prevSkuMap.get(pn);
        const prevPrice = parsePrice(prevSku['Unit Price (USD)'] || prevSku['Price (USD)']);
        sku['Previous List Price (USD)'] = prevPrice.toFixed(2);

        if (Math.abs(currPrice - prevPrice) > 0.001) {
          // PRICE CHANGED
          const delta = currPrice - prevPrice;
          const pct   = prevPrice > 0 ? (delta / prevPrice * 100) : 0;

          sku['Diff Status']       = 'PRICE_CHANGED';
          sku['Price Change (USD)'] = `${delta > 0 ? '+' : ''}$${delta.toFixed(2)}`;
          sku['Price Change (%)']   = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;

          if (!priceHistory[pn].some(h => h.date === scrapeDate)) {
            priceHistory[pn].push({ date: scrapeDate, price: currPrice, status: 'PRICE_CHANGED', prevPrice });
          }
          diffSummary.priceChanged++;
        } else {
          // UNCHANGED
          sku['Diff Status']       = 'UNCHANGED';
          sku['Price Change (USD)'] = '$0.00';
          sku['Price Change (%)']   = '0.00%';

          if (!priceHistory[pn].some(h => h.date === scrapeDate)) {
            priceHistory[pn].push({ date: scrapeDate, price: currPrice, status: 'UNCHANGED' });
          }
          diffSummary.unchanged++;
        }
      }

      // Build text price history trail
      const trailEntries = priceHistory[pn] || [];
      sku['Price History Trail'] = trailEntries
        .map(h => `${h.date}: $${h.price.toFixed(2)}${h.status === 'PRICE_CHANGED' ? ' (▲)' : ''}`)
        .join(' → ');
    }
  }

  // 2. Process REMOVED SKUs (Tombstone injection — Rule #28)
  if (prevCatalog) {
    for (const [pn, prevSku] of prevSkuMap.entries()) {
      if (!currSkuMap.has(pn)) {
        diffSummary.removed++;
        const prevPrice = parsePrice(prevSku['Unit Price (USD)'] || prevSku['Price (USD)']);

        if (!priceHistory[pn]) priceHistory[pn] = [];
        if (!priceHistory[pn].some(h => h.date === scrapeDate && h.status === 'REMOVED')) {
          priceHistory[pn].push({ date: scrapeDate, price: prevPrice, status: 'REMOVED' });
        }

        const trailEntries = priceHistory[pn] || [];
        const trailStr     = trailEntries.map(h => `${h.date}: $${h.price.toFixed(2)}`).join(' → ') + ' → [REMOVED]';

        const tombstoneSKU = {
          'Main Category':              prevSku.parentCategory || 'Deprecation Archive',
          'Sub-Category':               prevSku.subCategory || 'Discontinued SKUs',
          'Hierarchy Path':             prevSku['Hierarchy Path'] || `HPE OCA > ${catalogData.metadata?.chassis || 'Chassis'} > Deprecation Archive > Discontinued SKUs`,
          'Component Role':             prevSku['Component Role'] || 'Discontinued Hardware',
          'Constraint Text':            prevSku['Constraint Text'] || 'Discontinued',
          'Subcategory Max Qty':        '0',
          'Table Rule/Note':            '[DISCONTINUED] SKU removed from latest HPE OCA portal catalog',
          'Product #':                  pn,
          'Description':                `[REMOVED SKU] ${prevSku.Description || ''}`,
          'Current Qty':                '0',
          'Unit Price (USD)':           prevPrice.toFixed(2),
          'Price Delta (USD)':          '-',
          'Extended Price (USD)':       '0.00',
          'Price per GB (USD)':         '-',
          'HPE Recommended':            'No',
          'Start Date':                 prevSku['Start Date'] || prevSku.Start || '',
          'Discontinued Date':          scrapeDate,
          'Diff Status':                'REMOVED',
          'Previous List Price (USD)':  prevPrice.toFixed(2),
          'Price Change (USD)':         `-$${prevPrice.toFixed(2)}`,
          'Price Change (%)':           '-100.00%',
          'Price History Trail':        trailStr
        };

        // Find or create target entry in catalogData
        let targetEntry = catalogData.entries.find(e => e.subCategory === tombstoneSKU['Sub-Category']);
        if (!targetEntry) {
          targetEntry = {
            parentCategory: tombstoneSKU['Main Category'],
            subCategory:    tombstoneSKU['Sub-Category'],
            constraint:     'Discontinued',
            maxQty:         0,
            rules:          ['[DISCONTINUED] SKU present in previous scrape but removed from active catalog'],
            headers:        ['Product #', 'Description', 'Current Qty', 'Price (USD)'],
            skuCount:       0,
            skus:           []
          };
          catalogData.entries.push(targetEntry);
        }
        targetEntry.skus.push(tombstoneSKU);
        targetEntry.skuCount = targetEntry.skus.length;
      }
    }
  }

  // Save historical snapshot and price history
  fs.writeFileSync(currentSnapshotPath, JSON.stringify(catalogData, null, 2));
  fs.writeFileSync(priceHistoryPath, JSON.stringify(priceHistory, null, 2));

  // Update metadata with diff summary
  catalogData.metadata.diffSummary = diffSummary;
  catalogData.metadata.historySnapshot = path.basename(currentSnapshotPath);

  console.log(`\n--- Stage 7: Catalog Diff Engine Summary ---`);
  console.log(`  Scrape Date:    ${scrapeDate}`);
  console.log(`  Previous Ref:   ${prevSnapshotPath ? path.basename(prevSnapshotPath) : '(Baseline - None)'}`);
  console.log(`  Added SKUs:     ${diffSummary.added}  (Green)`);
  console.log(`  Removed SKUs:   ${diffSummary.removed}  (Red + Strikethrough)`);
  console.log(`  Price Changed:  ${diffSummary.priceChanged}  (Amber)`);
  console.log(`  Unchanged SKUs: ${diffSummary.unchanged}`);
  console.log(`  Snapshot Saved: ${path.basename(currentSnapshotPath)}`);

  return { enrichedCatalog: catalogData, diffSummary, prevSnapshotPath };
}

module.exports = { processCatalogDiff, parsePrice };
