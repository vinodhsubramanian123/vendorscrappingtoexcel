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
 * Get unit list price for a SKU (USD) by looking it up in the parsed catalog.
 * @param {string} skuStr 
 * @param {object} catalogData 
 * @returns {number} Price in USD
 */
function getSkuListPrice(skuStr, catalogData = null) {
  const clean = cleanBaseSKU(skuStr);
  if (catalogData && Array.isArray(catalogData.entries)) {
    for (const sub of catalogData.entries) {
      if (Array.isArray(sub.skus)) {
        const match = sub.skus.find(s => s['Product #'] && cleanBaseSKU(s['Product #']) === clean);
        if (match) {
          const rawPrice = match['Unit Price (USD)'] || match['Price (USD)'] || match['Price'];
          if (rawPrice) {
            const parsed = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
            if (!isNaN(parsed)) return parsed;
          }
        }
      }
    }
  }
  return 0.00; // Zero Hardcoding Rule: Return 0 if not found
}

/**
 * Load family upgrade templates from config file.
 * @param {string} family
 * @returns {Array<object>} Upgrades list
 */
function loadUpgradeTemplates(family = 'ProLiant') {
  const cfgPath = path.join(__dirname, '..', 'config', 'upgrade_templates.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const families = cfg.families || {};
      return families[family] || families['ProLiant'] || [];
    } catch {}
  }
  return [];
}

/**
 * Optimize BOQ items for a given CapEx price budget.
 * Enforces Golden Rule: Mandatory buildable dependencies take precedence over budget caps.
 * @param {Array<object>} consolidatedItems 
 * @param {object} evalResults 
 * @param {number} targetBudgetUsd 
 * @param {object} catalogData
 * @returns {object} Optimization analysis
 */
function optimizeForBudget(consolidatedItems, evalResults, targetBudgetUsd = 0, catalogData = null) {
  let currentBomCost = 0;
  let zeroPriceCount = 0;

  // Calculate current baseline BOM cost
  consolidatedItems.forEach(it => {
    const unitPrice = getSkuListPrice(it.sku, catalogData);
    if (unitPrice === 0) zeroPriceCount++;
    it.unitPriceUsd = unitPrice;
    it.extendedPriceUsd = unitPrice * it.quantity;
    currentBomCost += it.extendedPriceUsd;
  });

  // Calculate mandatory buildable BOM cost (Injecting direct SKU fixes)
  let mandatoryBomCost = currentBomCost;
  const injectedSkus = [];

  if (evalResults && evalResults.missingDependencies) {
    const dedupedDeps = [];
    const skuMap = new Map();
    evalResults.missingDependencies.forEach(dep => {
      if (skuMap.has(dep.sku)) {
        skuMap.get(dep.sku).quantity = Math.max(skuMap.get(dep.sku).quantity, dep.quantity);
      } else {
        const depCopy = { ...dep };
        skuMap.set(dep.sku, depCopy);
        dedupedDeps.push(depCopy);
      }
    });

    dedupedDeps.forEach(dep => {
      const unitPrice = getSkuListPrice(dep.sku, catalogData);
      if (unitPrice === 0) zeroPriceCount++;
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

  // Dynamic upgrade recommendations based on remaining surplus budget and family templates
  const recommendedUpgrades = [];
  if (remainingBudgetUsd > 0) {
    const family = (catalogData && catalogData.metadata && catalogData.metadata.family) ? catalogData.metadata.family : 'ProLiant';
    const templates = loadUpgradeTemplates(family);

    templates.forEach(tpl => {
      if (remainingBudgetUsd >= tpl.minSurplusUsd) {
        // Retrieve dynamic price from catalog if available, fallback to estimated
        const catalogPrice = getSkuListPrice(tpl.sku, catalogData);
        const finalPrice = catalogPrice > 0 ? catalogPrice : tpl.estimatedCostUsd;
        recommendedUpgrades.push({
          upgrade: tpl.upgrade,
          sku: tpl.sku,
          qty: tpl.qty || 1,
          costUsd: finalPrice,
          benefit: tpl.benefit
        });
      }
    });
  }

  const hasZeroPriceSkus = zeroPriceCount > 0;
  const goldenRuleSummary = !hasBudgetConstraint
    ? `ℹ️ No budget constraint provided — showing mandatory buildable cost only.`
    : (isBudgetExceeded
      ? `⚠️ GOLDEN RULE MANDATE: Target budget of $${targetBudgetUsd.toLocaleString()} is exceeded by +$${budgetOverrunUsd.toLocaleString()}. Mandatory buildable cost is $${mandatoryBomCost.toLocaleString()} to eliminate unbuildable errors.`
      : `✅ GOLDEN RULE COMPLIANT: Mandatory buildable cost $${mandatoryBomCost.toLocaleString()} fits within target budget of $${targetBudgetUsd.toLocaleString()} (Surplus: $${remainingBudgetUsd.toLocaleString()}).`);

  return {
    targetBudgetUsd,
    currentBomCostUsd: currentBomCost,
    mandatoryBomCostUsd: mandatoryBomCost,
    injectedSkus,
    hasBudgetConstraint,
    isBudgetExceeded,
    budgetOverrunUsd,
    remainingBudgetUsd,
    hasZeroPriceSkus,
    zeroPriceCount,
    recommendedUpgrades,
    goldenRuleSummary
  };
}

module.exports = {
  getSkuListPrice,
  optimizeForBudget,
  loadUpgradeTemplates
};
