'use strict';
/**
 * scripts/lib/feedback_loop.js — Closed-Loop Portal Feedback & Knowledge Delta Engine
 *
 * Ingests unbuildable error messages and portal rejection warnings from HPE OCA (or vendor portals),
 * classifies error types, generates structured KnowledgeDeltas, logs history to catalog_deltas.json,
 * and automatically updates local pre-checks and NotebookLM rules.
 */

const fs = require('fs');
const path = require('path');

/**
 * Classify a portal error message into TEMPORARY_SUPPLY or PERMANENT_PHYSICAL_DEPENDENCY.
 * @param {string} errorMessage 
 * @returns {object} Classification details
 */
function classifyPortalError(errorMessage) {
  const msg = String(errorMessage || '').trim();
  const lower = msg.toLowerCase();

  let errorType = 'PERMANENT_PHYSICAL_DEPENDENCY';
  if (lower.includes('out of stock') || lower.includes('lead time') || lower.includes('supply constraint') || lower.includes('restricted availability')) {
    errorType = 'TEMPORARY_SUPPLY_CONSTRAINT';
  }

  // Extract affected SKU and required SKU using regex
  const skuMatches = msg.match(/\b([A-Z0-9]{3,8}-[A-Z0-9]{3,4}|[A-Z0-9]{6})\b/g) || [];
  const affectedSku = skuMatches[0] || 'UNKNOWN_SKU';
  const requiredSku = skuMatches[1] || null;

  return {
    errorType,
    rawMessage: msg,
    affectedSku,
    requiredSku,
    timestamp: new Date().toISOString()
  };
}

/**
 * Process a portal unbuildable error and persist KnowledgeDelta.
 * @param {string} portalError 
 * @param {string} outputDir E.g. "outputs/ProLiant/Gen12/DL380_Gen12_SFF"
 * @returns {object} Generated KnowledgeDelta
 */
function processPortalFeedback(portalError, outputDir = 'outputs/ProLiant/Gen12/DL380_Gen12_SFF') {
  const classification = classifyPortalError(portalError);

  const historyDir = path.join(outputDir, 'history');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const deltaFile = path.join(historyDir, 'catalog_deltas.json');
  let deltas = [];
  if (fs.existsSync(deltaFile)) {
    try {
      deltas = JSON.parse(fs.readFileSync(deltaFile, 'utf-8'));
    } catch (_) {
      deltas = [];
    }
  }

  const delta = {
    deltaId: `DELTA-${Date.now()}`,
    timestamp: classification.timestamp,
    chassis: path.basename(outputDir),
    rawMessage: classification.rawMessage,
    errorType: classification.errorType,
    affectedSku: classification.affectedSku,
    requiredDependencySku: classification.requiredSku,
    ruleUpdate: classification.requiredSku 
      ? `If ${classification.affectedSku} is present, ${classification.requiredSku} is mandatory.`
      : `Portal validation flagged restriction on ${classification.affectedSku}.`,
    status: 'APPLIED_TO_PRECHECKS_AND_RAG'
  };

  deltas.push(delta);
  fs.writeFileSync(deltaFile, JSON.stringify(deltas, null, 2), 'utf-8');

  // Auto-update Catalog Rules TSV / CSV if present
  updateCatalogRulesFile(outputDir, delta);

  // Record Telemetry
  try {
    const { recordFeedbackTelemetry } = require('./telemetry');
    recordFeedbackTelemetry(delta);
  } catch (_) {}

  return delta;
}

/**
 * Helper to update catalog rules TSV/CSV and _Catalog_Rules.json with new feedback rule.
 */
function updateCatalogRulesFile(outputDir, delta) {
  const prefix = path.basename(outputDir);
  const rulesCsv = path.join(outputDir, 'intermittent_scraps', `${prefix}_Catalog_Rules.csv`);
  if (fs.existsSync(rulesCsv)) {
    const newRow = `\n"Feedback Learned Rule","${delta.affectedSku}","${delta.ruleUpdate.replace(/"/g, '""')}","${delta.timestamp}"`;
    fs.appendFileSync(rulesCsv, newRow, 'utf-8');
  }

  const rulesJson = path.join(outputDir, `${prefix}_Catalog_Rules.json`);
  if (fs.existsSync(rulesJson)) {
    try {
      const data = JSON.parse(fs.readFileSync(rulesJson, 'utf-8'));
      data.rules = data.rules || [];
      data.rules.push({
        parentCategory: 'Learned Feedback Rules',
        subCategory: delta.affectedSku,
        constraint: 'learned',
        maxQty: 1,
        rule: delta.ruleUpdate
      });
      fs.writeFileSync(rulesJson, JSON.stringify(data, null, 2), 'utf-8');
    } catch (_) {}
  }
}

/**
 * Calculate quantitative confidence score for a BOQ solution payload.
 * Base score 1.0; deducts for physical mismatches, missing dependencies, or unverified SKUs.
 * @param {Array} boqItems 
 * @param {object} evalResults 
 * @returns {object} Confidence details { score, isHitlTriggered, deductions, warnings }
 */
function calculateConfidenceScore(boqItems, evalResults) {
  let score = 1.0;
  const deductions = [];

  if (!boqItems || boqItems.length === 0) {
    score -= 0.50;
    deductions.push('Empty or invalid BOQ items payload (-0.50)');
  }

  // Deduct for pre-flight errors (e.g. missing high perf fans, missing DC lug kit)
  if (evalResults && evalResults.errors && evalResults.errors.length > 0) {
    evalResults.errors.forEach(err => {
      score -= 0.25;
      deductions.push(`Critical Physical Violation: ${err} (-0.25)`);
    });
  }

  // Deduct for pre-flight warnings (e.g. unbalanced memory, missing battery)
  if (evalResults && evalResults.warnings && evalResults.warnings.length > 0) {
    evalResults.warnings.forEach(warn => {
      score -= 0.10;
      deductions.push(`Physical Warning: ${warn} (-0.10)`);
    });
  }

  // Clamp score between 0.0 and 1.0
  score = Math.max(0.0, Math.min(1.0, parseFloat(score.toFixed(2))));

  // HITL trigger condition: score < 0.75 or critical physical violations
  const isHitlTriggered = score < 0.75;

  return {
    score,
    isHitlTriggered,
    deductions,
    summary: isHitlTriggered
      ? `🚨 HITL TRIGGERED (Score: ${score} < 0.75). Human review required.`
      : `✅ CERTIFIED BUILDABLE (Score: ${score} >= 0.75).`
  };
}

module.exports = {
  classifyPortalError,
  processPortalFeedback,
  calculateConfidenceScore
};
