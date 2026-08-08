'use strict';
/**
 * scripts/lib/vendor_bom_verifier.js
 *
 * Post-Build Vendor Partner Portal BOM Re-Ingestion & Bi-Directional Cross-Verification Engine:
 * 1. Parses official Vendor Partner Portal BOM (Excel/CSV/JSON/CLIC export).
 * 2. Cross-verifies Vendor BOM against proposed Rank solution (Rank 1 to 5).
 * 3. Identifies deltas:
 *    - ADDED_BY_VENDOR (New SKUs auto-inserted by HPE portal)
 *    - REMOVED_BY_VENDOR (SKUs dropped by HPE portal)
 *    - PRICE_DELTA (List price variance)
 *    - UNCATALOGED_SKU (SKUs not present in local scraped catalog JSON)
 * 4. Triggers closed-loop delta learning & flags fresh CDP scraping when uncataloged SKUs are found.
 */

const fs = require('fs');
const path = require('path');
const { parseAndConsolidateBOQ } = require('./boq_evaluator');
const { processPortalFeedback } = require('./feedback_loop');

/**
 * Cross-verify uploaded Vendor Partner Portal BOM against proposed solution rank.
 * @param {string|Array<object>} vendorBomInput File path or raw array of vendor items
 * @param {object} proposedRankSolution Target rank object from evalResults (e.g. Rank 1)
 * @param {string} chassisDir Target chassis catalog directory
 * @returns {object} Audit report & discrepancy analysis
 */
function verifyVendorBOM(vendorBomInput, proposedRankSolution, chassisDir) {
  let vendorItems = [];

  if (typeof vendorBomInput === 'string' && fs.existsSync(vendorBomInput)) {
    const rawContent = fs.readFileSync(vendorBomInput, 'utf-8');
    vendorItems = parseAndConsolidateBOQ(rawContent, vendorBomInput);
  } else if (Array.isArray(vendorBomInput)) {
    vendorItems = vendorBomInput;
  } else {
    throw new Error('Invalid Vendor BOM input. Must be a valid file path or item array.');
  }

  // Load target chassis catalog JSON
  const chassisPrefix = path.basename(chassisDir);
  const catalogPath = path.join(chassisDir, `${chassisPrefix}_Catalog.json`);
  let catalogSkus = new Set();
  let catalogPriceMap = new Map();

  if (fs.existsSync(catalogPath)) {
    try {
      const cat = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      if (cat.entries) {
        cat.entries.forEach(entry => {
          (entry.skus || []).forEach(s => {
            const sku = s['Product #'] || s.sku;
            if (sku) {
              catalogSkus.add(sku);
              const price = parseFloat(String(s['Unit Price (USD)'] || s['Price (USD)'] || '0').replace(/[^0-9.]/g, '')) || 0;
              catalogPriceMap.set(sku, price);
            }
          });
        });
      }
    } catch (_) {}
  }

  const proposedSkus = (proposedRankSolution?.skuList || []).reduce((map, item) => {
    map.set(item.sku, item);
    return map;
  }, new Map());

  const vendorSkuMap = new Map();
  vendorItems.forEach(it => vendorSkuMap.set(it.sku, it));

  const discrepancies = {
    addedByVendor: [],
    removedByVendor: [],
    priceDeltas: [],
    uncatalogedSkus: [],
    exactMatches: []
  };

  // 1. Audit Vendor SKUs against Proposed SKUs
  vendorItems.forEach(vItem => {
    const pItem = proposedSkus.get(vItem.sku);
    const inCatalog = catalogSkus.size === 0 || catalogSkus.has(vItem.sku);

    if (!inCatalog) {
      discrepancies.uncatalogedSkus.push({
        sku: vItem.sku,
        quantity: vItem.quantity,
        description: vItem.description,
        reason: 'SKU present in Vendor Portal BOM but missing from local scraped catalog JSON.'
      });
    }

    if (!pItem) {
      discrepancies.addedByVendor.push({
        sku: vItem.sku,
        quantity: vItem.quantity,
        description: vItem.description,
        reason: 'Vendor Partner Portal automatically inserted this SKU into the quote.'
      });
    } else {
      // Compare quantities & price
      const qtyDiff = vItem.quantity - pItem.quantity;
      const vPrice = parseFloat(String(vItem.unitPriceUsd || 0)) || catalogPriceMap.get(vItem.sku) || 0;
      const pPrice = parseFloat(String(pItem.unitPriceUsd || 0)) || catalogPriceMap.get(vItem.sku) || 0;

      if (vPrice > 0 && pPrice > 0 && Math.abs(vPrice - pPrice) > 1.0) {
        discrepancies.priceDeltas.push({
          sku: vItem.sku,
          proposedPriceUsd: pPrice,
          vendorPriceUsd: vPrice,
          priceDeltaUsd: vPrice - pPrice,
          percentChange: (((vPrice - pPrice) / pPrice) * 100).toFixed(2) + '%'
        });
      }

      discrepancies.exactMatches.push({
        sku: vItem.sku,
        proposedQty: pItem.quantity,
        vendorQty: vItem.quantity,
        qtyMatch: qtyDiff === 0
      });
    }
  });

  // 2. Audit Proposed SKUs missing from Vendor BOM
  proposedSkus.forEach((pItem, sku) => {
    if (!vendorSkuMap.has(sku)) {
      discrepancies.removedByVendor.push({
        sku,
        quantity: pItem.quantity,
        description: pItem.description,
        reason: 'SKU was included in proposed Rank solution but dropped by Vendor Partner Portal.'
      });
    }
  });

  const hasDiscrepancies = discrepancies.addedByVendor.length > 0 ||
    discrepancies.removedByVendor.length > 0 ||
    discrepancies.uncatalogedSkus.length > 0 ||
    discrepancies.priceDeltas.length > 0;

  const requiresFreshScrape = discrepancies.uncatalogedSkus.length > 0;

  // 3. Closed-Loop Auto-Learning: Log discrepancies into catalog_deltas.json & real-time sync
  if (hasDiscrepancies) {
    discrepancies.addedByVendor.forEach(added => {
      try {
        const feedbackMsg = `Vendor Partner Portal auto-inserted SKU ${added.sku} (Qty ${added.quantity}): ${added.description}`;
        processPortalFeedback(feedbackMsg, chassisDir);
      } catch (_) {}
    });
  }

  return {
    chassisModel: path.basename(chassisDir),
    proposedRank: proposedRankSolution?.rank || 1,
    totalVendorSkus: vendorItems.length,
    totalProposedSkus: proposedSkus.size,
    is100PercentMatch: !hasDiscrepancies,
    requiresFreshScrape,
    discrepancies,
    verificationTimestamp: new Date().toISOString()
  };
}

module.exports = {
  verifyVendorBOM
};
