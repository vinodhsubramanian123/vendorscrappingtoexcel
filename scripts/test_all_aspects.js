'use strict';
/**
 * scripts/test_all_aspects.js — Automated Comprehensive Pipeline & 6-Aspect Evaluation Test Suite
 *
 * Exercises all SKU categories, attribute queries, quantity multiplier math, physical engineering checks,
 * price calculations, confidence scoring, HITL triggers, and closed-loop portal feedback logging.
 */

const fs = require('fs');
const path = require('path');
const { parseAndConsolidateBOQ, evaluatePhysicalMath, formatNotebookQueryPayload } = require('./lib/boq_evaluator');
const { calculateConfidenceScore, processPortalFeedback } = require('./lib/feedback_loop');
const { cleanBaseSKU, isValidHpeSKU } = require('./lib/sku');

let totalPasses = 0;
let totalFails = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    totalPasses++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    totalFails++;
  }
}

console.log(`================================================================`);
console.log(`🚀 COMPREHENSIVE PIPELINE & 6-ASPECT EVALUATION TEST SUITE`);
console.log(`================================================================\n`);

// -------------------------------------------------------------------
// Test Group 1: SKU Normalization & Validation Checks
// -------------------------------------------------------------------
console.log(`🔹 Test Group 1: SKU Normalization & Category Validation`);
assert(cleanBaseSKU('P73282-B21CTO') === 'P73282-B21', 'Strips CTO suffix correctly');
assert(cleanBaseSKU('P69728-B21FIO') === 'P69728-B21', 'Strips FIO suffix correctly');
assert(isValidHpeSKU('P73282-B21'), 'Validates hyphenated hardware SKU P73282-B21');
assert(isValidHpeSKU('C0H28A'), 'Validates 6-character hardware SKU C0H28A');
assert(isValidHpeSKU('HU4A6A50C4V'), 'Validates Tech Care service SKU HU4A6A50C4V');
assert(!isValidHpeSKU('pat001b94fb'), 'Rejects DOM template ID pat001b94fb');

// -------------------------------------------------------------------
// Test Group 2: Multiplier & Separator Ingestion Math
// -------------------------------------------------------------------
console.log(`\n🔹 Test Group 2: Multiplier & Line Separator Ingestion Math`);
const testBoqRaw = `
2x HPE ProLiant DL380 Gen12 Server Nodes
P73282-B21 / HPE DL380 Gen12 SFF NC CTO Server, Qty: 1
P74573-B21 | Intel Xeon 6730P 2.5GHz 32-core 250W Processor, Qty: 2
P69728-B21 + HPE 64GB DDR5-6400 Smart Memory Kit; Qty: 6
P47777-B21 -- HPE MR416i-p SPG Controller, Qty: 1
P17023-B21, HPE 1600W -48VDC Power Supply, Qty: 2
`;

const items = parseAndConsolidateBOQ(testBoqRaw);
assert(items.length === 5, `Consolidated 5 unique hardware SKUs (Got: ${items.length})`);

const cpuItem = items.find(i => i.sku === 'P74573-B21');
assert(cpuItem && cpuItem.quantity === 4, `Multiplier math calculated 2 nodes * 2 CPUs = 4 CPUs (Got: ${cpuItem ? cpuItem.quantity : 0})`);

const memItem = items.find(i => i.sku === 'P69728-B21');
assert(memItem && memItem.quantity === 12, `Multiplier math calculated 2 nodes * 6 DIMMs = 12 DIMMs (Got: ${memItem ? memItem.quantity : 0})`);

// -------------------------------------------------------------------
// Test Group 3: Modular 6-Aspect Solution Pre-Checks
// -------------------------------------------------------------------
console.log(`\n🔹 Test Group 3: Modular 6-Aspect Physical Pre-Checks`);
const evalResults = evaluatePhysicalMath(items);

assert(evalResults.cpuCount === 4, `Aspect 1 (Compute): Detected 4 CPUs total`);
assert(evalResults.maxCpuTdpWatts === 250, `Aspect 1 (Compute): Extracted 250W max TDP`);
assert(evalResults.totalMemoryGb === 768, `Aspect 2 (Memory): Calculated 768 GB total memory (12x 64GB)`);
assert(evalResults.driveCount === 0, `Aspect 3 (Storage): Detected 0 drives (Drive-less chassis build)`);
assert(evalResults.hasDcPowerSupply === true, `Aspect 5 (Power): Detected -48VDC power supply configuration`);

// Physical dependencies assertion
assert(evalResults.missingDependencies.length >= 3, `Identified mandatory missing dependencies (Fans, Lug Kit, Battery)`);
const fanDep = evalResults.missingDependencies.find(d => d.sku === 'P48820-B21');
assert(fanDep !== undefined, `Direct SKU Fix identified for High-Perf Fan Kit P48820-B21`);
const lugDep = evalResults.missingDependencies.find(d => d.sku === 'P36877-B21');
assert(lugDep !== undefined, `Direct SKU Fix identified for DC Power Cable Lug Kit P36877-B21`);

// -------------------------------------------------------------------
// Test Group 4: Quantitative Confidence Scoring & HITL Trigger
// -------------------------------------------------------------------
console.log(`\n🔹 Test Group 4: Quantitative Confidence Scoring & HITL Safeguards`);
const confidence = evalResults.confidence;
assert(confidence.score < 0.75, `Confidence score reflects physical violations (Score: ${confidence.score} < 0.75)`);
assert(confidence.isHitlTriggered === true, `HITL review triggered automatically when score < 0.75`);

// -------------------------------------------------------------------
// Test Group 5: Closed-Loop Portal Feedback & KnowledgeDelta Engine
// -------------------------------------------------------------------
console.log(`\n🔹 Test Group 5: Closed-Loop Portal Feedback & KnowledgeDelta Logging`);
const portalErrorMsg = "ERR_STORAGE_CABLE_REQUIRED: Controller MR416i-p requires P76453-B21 Box 1/2 Cable Kit.";
const testOutputDir = 'outputs/ProLiant/Gen12/DL380_Gen12_SFF';

const delta = processPortalFeedback(portalErrorMsg, testOutputDir);
assert(delta.deltaId.startsWith('DELTA-'), `Generated unique KnowledgeDelta ID (${delta.deltaId})`);
assert(delta.errorType === 'PERMANENT_PHYSICAL_DEPENDENCY', `Classified error as PERMANENT_PHYSICAL_DEPENDENCY`);
assert(delta.affectedSku === 'P76453-B21', `Identified affected SKU P76453-B21`);

const deltaLogFile = path.join(testOutputDir, 'history', 'catalog_deltas.json');
assert(fs.existsSync(deltaLogFile), `KnowledgeDelta logged to persistent file history/catalog_deltas.json`);

// -------------------------------------------------------------------
// Test Group 6: Dynamic Attribute RAG Payload Formatting
// -------------------------------------------------------------------
console.log(`\n🔹 Test Group 6: Dynamic Attribute RAG Payload Formatting`);
const payload = formatNotebookQueryPayload(items, evalResults);
assert(payload.includes('Memory capacity > 32GB'), `Attribute filter 'Memory capacity > 32GB' included in query prompt`);
assert(payload.includes('P48820-B21'), `Direct SKU fix P48820-B21 included in RAG payload prompt`);

// -------------------------------------------------------------------
// Test Group 7: Budget-Constrained Optimization & Golden Rule Assurance
// -------------------------------------------------------------------
console.log(`\n🔹 Test Group 7: Budget-Constrained Optimization & Golden Rule Assurance`);
const { optimizeForBudget } = require('./lib/budget_optimizer');

const mockCatalogData = {
  metadata: { family: 'ProLiant' },
  entries: [
    {
      skus: [
        { 'Product #': 'P73282-B21', 'Unit Price (USD)': '5000.00' },
        { 'Product #': 'P74573-B21', 'Unit Price (USD)': '3200.00' },
        { 'Product #': 'P48820-B21', 'Unit Price (USD)': '450.00' },
        { 'Product #': 'P69728-B21', 'Unit Price (USD)': '1850.00' },
        { 'Product #': 'P47777-B21', 'Unit Price (USD)': '1200.00' },
        { 'Product #': 'P01366-B21', 'Unit Price (USD)': '350.00' },
        { 'Product #': 'P63829-B21', 'Unit Price (USD)': '850.00' },
        { 'Product #': 'P03178-B21', 'Unit Price (USD)': '650.00' },
        { 'Product #': 'P78145-B21', 'Unit Price (USD)': '45.00' }
      ]
    }
  ]
};

const budgetExceededRes = optimizeForBudget(items, evalResults, 35000.00, mockCatalogData);
assert(budgetExceededRes.isBudgetExceeded === true, `Identified budget overrun when target budget ($35,000) < mandatory cost ($${budgetExceededRes.mandatoryBomCostUsd})`);
assert(budgetExceededRes.budgetOverrunUsd > 0, `Calculated minimum budget overrun delta (+$${budgetExceededRes.budgetOverrunUsd.toLocaleString()})`);

const budgetSurplusRes = optimizeForBudget(items, evalResults, 600000.00, mockCatalogData);
assert(budgetSurplusRes.isBudgetExceeded === false, `Identified budget surplus when target budget ($600,000) >= mandatory cost ($${budgetSurplusRes.mandatoryBomCostUsd})`);
assert(budgetSurplusRes.remainingBudgetUsd > 0, `Calculated remaining budget surplus ($${budgetSurplusRes.remainingBudgetUsd.toLocaleString()})`);
assert(budgetSurplusRes.recommendedUpgrades.length > 0, `Generated surplus budget performance upgrade recommendations`);

// -------------------------------------------------------------------
// Test Group 8: Zero Hardcoding & Dynamic Category Classification
// -------------------------------------------------------------------
console.log(`\n🔹 Test Group 8: Zero Hardcoding & Dynamic Category Classification`);
const { classifyComponentRole } = require('./lib/product_meta');
assert(classifyComponentRole('Processor', 'Intel Xeon 6730P') === 'Processor', `Classified Processor role dynamically`);
assert(classifyComponentRole('Smart Memory', '64GB RDIMM') === 'Memory', `Classified Memory role dynamically`);
assert(classifyComponentRole('Power Supplies', '1600W -48VDC') === 'Power Supply', `Classified Power Supply role dynamically`);

// -------------------------------------------------------------------
// Test Group 9: Automated CLIC Check Protocol Interface
// -------------------------------------------------------------------
console.log(`\n🔹 Test Group 9: Automated CLIC Check Protocol Interface`);
const { triggerClicCheck } = require('./lib/cdp');
assert(typeof triggerClicCheck === 'function', `CDP module exports triggerClicCheck function for HPE OCA inspection`);

console.log(`\n================================================================`);
console.log(`📊 FINAL TEST SUMMARY: ${totalPasses} PASSED | ${totalFails} FAILED`);
console.log(`================================================================\n`);

if (totalFails > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
