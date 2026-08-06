'use strict';
/**
 * scripts/lib/budget_optimizer.js — Budget-Constrained Solution Optimization Engine
 *
 * Implements the Golden Rule: 100% Solution Validation WITHOUT ANY Unbuildable Errors.
 * Evaluates target CapEx budgets against mandatory buildable SKUs, computes minimum overrun deltas,
 * or allocates remaining surplus budget to highest-impact performance upgrades.
 */

const fs = require('fs');
const path = require('path');
const { cleanBaseSKU } = require('./sku');

/**
 * Grounded List Price Database (USD) derived from V1 scraped catalog data
 */
const SKIELD_LIST_PRICES_USD = {
  'P73282-B21': 5584.00,  // Base DL380 Gen12 SFF NC Chassis
  'P74573-B21': 10516.00, // Xeon 6730P 32-core 250W CPU
  'P74792-B21': 316.00,   // Performance Heatsink Kit
  'P69728-B21': 551.00,    // 64GB DDR5-6400 Smart Memory Kit
  'P47777-B21': 5999.00,  // MR416i-p Storage Controller
  'P01366-B21': 110.00,   // 96W Smart Storage Battery
  'P48918-B21': 38.00,    // Controller Enablement Cable Kit
  '873763-B21': 14.00,    // No Drive Configuration FIO Kit
  'P17023-B21': 1561.00,  // 1600W -48VDC Power Supply
  'P36877-B21': 135.00,   // DC Power Cable Lug Kit
  'P48820-B21': 972.00,   // High Performance Fan Kit
  'P51181-B21': 485.00,   // Broadcom BCM5719 1Gb 4p OCP3 Adapter
  'P72203-B21': 77.00,    // CPU1 to Rear OCP SlotB Cable Kit
  'P26269-B21': 2598.00,  // Broadcom 10/25Gb 4p OCP3 Adapter
  'P72201-B21': 84.00,    // CPU1 to Rear OCP SlotA Cable Kit
  'P03178-B21': 890.00,   // 1000W Titanium Flex Slot PS Kit
  'P78145-B21': 11.00,    // C13 - C14 2m FIO Power Cord
  'P75741-B21': 355.00,   // 8SFF x4 U.3 Tri-Mode Drive Cage Kit
  'P76453-B21': 96.00,    // Box 1/2 Cable Kit
  'P63829-B21': 1200.00   // 1.92TB NVMe Gen4 SSD
};

/**
 * Get unit list price for a SKU (USD)
 * @param {string} skuStr 
 * @returns {number} Price in USD
 */
function getSkuListPrice(skuStr) {
  const clean = cleanBaseSKU(skuStr);
  return SKIELD_LIST_PRICES_USD[clean] || 500.00; // Default estimate if unknown
}

/**
 * Optimize BOQ items for a given CapEx price budget.
 * Enforces Golden Rule: Mandatory buildable dependencies take precedence over budget caps.
 * @param {Array<object>} consolidatedItems 
 * @param {object} evalResults 
 * @param {number} targetBudgetUsd 
 * @returns {object} Optimization analysis
 */
function optimizeForBudget(consolidatedItems, evalResults, targetBudgetUsd = 0) {
  let currentBomCost = 0;

  // Calculate current baseline BOM cost
  consolidatedItems.forEach(it => {
    const unitPrice = getSkuListPrice(it.sku);
    it.unitPriceUsd = unitPrice;
    it.extendedPriceUsd = unitPrice * it.quantity;
    currentBomCost += it.extendedPriceUsd;
  });

  // Calculate mandatory buildable BOM cost (Injecting direct SKU fixes)
  let mandatoryBomCost = currentBomCost;
  const injectedSkus = [];

  if (evalResults && evalResults.missingDependencies) {
    evalResults.missingDependencies.forEach(dep => {
      const unitPrice = getSkuListPrice(dep.sku);
      const extPrice = unitPrice * dep.quantity;
      mandatoryBomCost += extPrice;
      injectedSkus.push({
        sku: dep.sku,
        description: dep.description,
        quantity: dep.quantity,
        unitPriceUsd: unitPrice,
        extendedPriceUsd: extPrice,
        rule: dep.rule
      });
    });
  }

  const hasBudgetConstraint = targetBudgetUsd > 0;
  const isBudgetExceeded = hasBudgetConstraint && mandatoryBomCost > targetBudgetUsd;
  const budgetOverrunUsd = isBudgetExceeded ? (mandatoryBomCost - targetBudgetUsd) : 0;
  const remainingBudgetUsd = (!isBudgetExceeded && hasBudgetConstraint) ? (targetBudgetUsd - mandatoryBomCost) : 0;

  // Upgrades recommendations if surplus budget remains
  const recommendedUpgrades = [];
  if (remainingBudgetUsd > 0) {
    if (remainingBudgetUsd >= 112555.00) {
      recommendedUpgrades.push({
        upgrade: '1DPC Symmetrical 16-DIMM Memory Balance (1.0TB Total)',
        sku: 'P69728-B21',
        qty: 4,
        costUsd: 110444.00,
        benefit: 'Populates all 16 memory channels symmetrically @ 6000MT/s 1DPC'
      });
    }
    if (remainingBudgetUsd >= 2500.00) {
      recommendedUpgrades.push({
        upgrade: '25GbE OCP 3.0 High-Speed Adapter Upgrade',
        sku: 'P26269-B21',
        qty: 1,
        costUsd: 2598.00,
        benefit: 'Upgrades 1Gb network ports to 25GbE SFP28 for virtualization'
      });
    }
  }

  return {
    targetBudgetUsd,
    currentBomCostUsd: currentBomCost,
    mandatoryBomCostUsd: mandatoryBomCost,
    injectedSkus,
    hasBudgetConstraint,
    isBudgetExceeded,
    budgetOverrunUsd,
    remainingBudgetUsd,
    recommendedUpgrades,
    goldenRuleSummary: isBudgetExceeded
      ? `⚠️ GOLDEN RULE MANDATE: Target budget of $${targetBudgetUsd.toLocaleString()} is exceeded by +$${budgetOverrunUsd.toLocaleString()}. Mandatory buildable cost is $${mandatoryBomCost.toLocaleString()} to eliminate unbuildable errors.`
      : `✅ GOLDEN RULE COMPLIANT: Mandatory buildable cost $${mandatoryBomCost.toLocaleString()} fits within target budget of $${targetBudgetUsd.toLocaleString()} (Surplus: $${remainingBudgetUsd.toLocaleString()}).`
  };
}

module.exports = {
  getSkuListPrice,
  optimizeForBudget
};
