'use strict';
/**
 * scripts/mock_history_generator.js
 * 
 * Utility to mock historical snapshots for testing the diff_catalog engine, Excel generation,
 * and Dashboard interactive charts.
 * 
 * Usage: node scripts/mock_history_generator.js --chassis DL380_Gen12_SFF
 */

const fs = require('fs');
const path = require('path');
const { processCatalogDiff } = require('./lib/diff_catalog');

const args = process.argv.slice(2);
let chassisOpt = 'DL380_Gen12_SFF';

if (args.includes('--chassis')) {
  chassisOpt = args[args.indexOf('--chassis') + 1];
}

const baseDir = path.join(__dirname, '..', 'outputs', 'ProLiant', 'Gen12', chassisOpt);
const catalogPath = path.join(baseDir, `${chassisOpt}_Catalog.json`);
const historyDir = path.join(baseDir, 'history');

if (!fs.existsSync(catalogPath)) {
  console.error(`ERROR: Cannot find built catalog for ${chassisOpt} at ${catalogPath}`);
  console.error('Please run `npm run rebuild` or `node scripts/build_catalog.js` first.');
  process.exit(1);
}

// 1. Load the current catalog
let catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

// 2. Clear out existing history to start fresh for the mock
if (fs.existsSync(historyDir)) {
  fs.rmSync(historyDir, { recursive: true, force: true });
}
fs.mkdirSync(historyDir, { recursive: true });

// We will create 3 snapshots: T-30 days, T-15 days, and Today.
const today = new Date();
const t15 = new Date(today); t15.setDate(t15.getDate() - 15);
const t30 = new Date(today); t30.setDate(t30.getDate() - 30);

const dateFormats = {
  today: today.toISOString().split('T')[0],
  t15: t15.toISOString().split('T')[0],
  t30: t30.toISOString().split('T')[0]
};

console.log(`\n--- Generating Mock History for ${chassisOpt} ---`);

// Helper to deep clone
const clone = (obj) => JSON.parse(JSON.stringify(obj));

/**
 * SNAPSHOT 1: T-30 (Baseline)
 * - We reduce all prices by 10%
 * - We remove a few SKUs so they can be "ADDED" later
 */
let catalogT30 = clone(catalog);
catalogT30.metadata.scrapeDate = dateFormats.t30 + 'T12:00:00.000Z';
let skusRemovedInT30 = [];

catalogT30.entries.forEach(entry => {
  if (entry.skus && entry.skus.length > 0) {
    // Drop 1 SKU per category for testing additions
    if (entry.skus.length > 2) {
      const removed = entry.skus.pop();
      skusRemovedInT30.push(removed['Product #']);
    }
    // Adjust prices
    entry.skus.forEach(sku => {
      let price = parseFloat((sku['Unit Price (USD)'] || sku['Price (USD)']).replace(/[^0-9.]/g, ''));
      if (!isNaN(price) && price > 0) {
        sku['Unit Price (USD)'] = (price * 0.9).toFixed(2);
      }
    });
  }
});

console.log(`> Processing Baseline (T-30 Days: ${dateFormats.t30})`);
let res30 = processCatalogDiff(catalogT30, historyDir);

/**
 * SNAPSHOT 2: T-15 (Midpoint)
 * - We increase prices by 5%
 * - We add back the SKUs removed in T-30 (so they show as ADDED)
 * - We remove 2 different SKUs (so they show as REMOVED in T-15)
 */
let catalogT15 = clone(catalog);
catalogT15.metadata.scrapeDate = dateFormats.t15 + 'T12:00:00.000Z';

catalogT15.entries.forEach(entry => {
  if (entry.skus && entry.skus.length > 0) {
    // Remove the first SKU to test removals
    if (entry.skus.length > 2) {
      entry.skus.shift();
    }
    // Adjust prices
    entry.skus.forEach(sku => {
      let price = parseFloat((sku['Unit Price (USD)'] || sku['Price (USD)']).replace(/[^0-9.]/g, ''));
      if (!isNaN(price) && price > 0) {
        sku['Unit Price (USD)'] = (price * 0.95).toFixed(2);
      }
    });
  }
});

console.log(`> Processing Midpoint (T-15 Days: ${dateFormats.t15})`);
let res15 = processCatalogDiff(catalogT15, historyDir);

/**
 * SNAPSHOT 3: Today (Current)
 * - Use the actual current catalog (original prices, original SKUs)
 */
let catalogToday = clone(catalog);
catalogToday.metadata.scrapeDate = dateFormats.today + 'T12:00:00.000Z';

console.log(`> Processing Current (Today: ${dateFormats.today})`);
let resToday = processCatalogDiff(catalogToday, historyDir);

// Re-write the main catalog file to reflect the final enriched state so that generate_xlsx picks it up
fs.writeFileSync(catalogPath, JSON.stringify(resToday.enrichedCatalog, null, 2));

console.log(`\nMock history generation complete for ${chassisOpt}.`);
console.log(`Run 'node scripts/generate_xlsx.js ${path.join(baseDir, chassisOpt + '_OCA_Catalog.xlsx')}' to update the Excel output.`);
