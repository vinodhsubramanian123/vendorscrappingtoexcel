'use strict';
/**
 * tests/test_end_to_end_scenarios.js — Comprehensive End-to-End Scenario Test Suite
 *
 * Tests:
 * 1. Positive Cases — 100% buildable quotes with symmetric memory, matching thermal fans & PSUs
 * 2. Negative Cases — High TDP thermal missing fans, memory mixing, PSU mixing, chassis form-factor gates
 * 3. Neutral / Edge Cases — Multiplier parsing, delimiter normalization, empty BOQs
 * 4. Closed-Loop Feedback — KnowledgeDelta learning & dynamic rule update verification
 */

const fs = require('fs');
const path = require('path');
const { parseAndConsolidateBOQ, evaluatePhysicalMath } = require('../scripts/lib/boq_evaluator');
const { validateConflictGraph } = require('../scripts/lib/conflict_graph');
const { processPortalFeedback } = require('../scripts/lib/feedback_loop');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🧪 COMPREHENSIVE END-TO-END SCENARIO & OBSERVE TEST SUITE');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. POSITIVE SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- 1. Positive Scenarios (100% Buildable Builds) ---');

const positiveBoqText = `
Product #\tDescription\tQty
P73282-B21\tHPE ProLiant Compute DL380 Gen12 SFF NC Configure-to-order Server\t1
P74573-B21\tIntel Xeon 6730P 2.5GHz 32-core 250W Processor for HPE\t2
P48820-B21\tHPE ProLiant DL380 Gen12 High Performance Fan Kit\t1
P69728-B21\tHPE 64GB (1x64GB) Dual Rank x4 DDR5-6400 CAS-52-52-52 EC8 Registered Smart Memory Kit\t16
P47777-B21\tHPE MR416i-p Gen11 SPG x16 Lanes 8GB Cache PCI SPG Controller\t1
P01366-B21\tHPE 96W Smart Storage Battery\t1
P63829-B21\tHPE 1.92TB NVMe Gen4 High Speed Read Intensive SFF SSD\t2
P03178-B21\tHPE 1000W Flex Slot Titanium Hot Plug Power Supply Kit\t2
P78145-B21\tHPE C13 - C14 WW 250V 10A Gray 2.0m Jumper Cord\t2
H7J34A3\tHPE 3Y Tech Care Essential Support Service\t1
`;

const posItems = parseAndConsolidateBOQ(positiveBoqText);
assert(posItems.length === 10, 'Parsed 10 valid consolidated hardware & service SKUs');

const posEval = evaluatePhysicalMath(posItems);
assert(posEval.confidence.score === 1.0, `Positive build scored 1.0 / 1.00 confidence (Actual: ${posEval.confidence.score})`);
assert(posEval.confidence.isHitlTriggered === false, 'Certified buildable — zero HITL review triggered');
assert(posEval.conflictGraph.isWholeSolutionValid === true, 'Whole-solution conflict graph validation PASSED with 0 conflicts');

// ─────────────────────────────────────────────────────────────────────────────
// 2. NEGATIVE SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Negative Scenarios (Physical & Conflict Failures) ---');

// 2A. High TDP CPU without High-Perf Fans
const negFanBoq = `
P73282-B21\tHPE ProLiant DL380 Gen12 SFF Server\t1
P74574-B21\tIntel Xeon 6767P 2.4GHz 50-core 350W Processor for HPE\t2
`;
const negFanItems = parseAndConsolidateBOQ(negFanBoq);
const negFanEval = evaluatePhysicalMath(negFanItems);
assert(negFanEval.errors.some(e => e.includes('High TDP')), 'Flagged missing High-Performance Fan Kit for 350W CPU');
assert(negFanEval.missingDependencies.some(d => d.sku === 'P48820-B21'), 'Auto-injected fix SKU P48820-B21');

// 2B. Memory x4 vs x8 Mixing Rule
const negMemBoq = `
P73282-B21\tHPE ProLiant DL380 Gen12 SFF Server\t1
P69728-B21\t64GB Dual Rank x4 DDR5-6400 Smart Memory Kit\t8
P69729-B21\t32GB Single Rank x8 DDR5-6400 Smart Memory Kit\t8
`;
const negMemItems = parseAndConsolidateBOQ(negMemBoq);
const negMemEval = evaluatePhysicalMath(negMemItems);
assert(negMemEval.conflictGraph.isWholeSolutionValid === false, 'Whole-solution conflict graph caught memory x4/x8 mixing');

// 2C. Power Supply AC vs DC Mixing Rule
const negPsuBoq = `
P73282-B21\tHPE ProLiant DL380 Gen12 SFF Server\t1
P03178-B21\tHPE 1000W Flex Slot Titanium AC Power Supply Kit\t1
P17023-B21\tHPE 1600W Flex Slot -48VDC Hot Plug Power Supply Kit\t1
`;
const negPsuItems = parseAndConsolidateBOQ(negPsuBoq);
const negPsuEval = evaluatePhysicalMath(negPsuItems);
assert(negPsuEval.conflictGraph.conflicts.some(c => c.message.toLowerCase().includes('power supplies')), 'Caught AC and DC Power Supply mixing rule violation');

// ─────────────────────────────────────────────────────────────────────────────
// 3. NEUTRAL & EDGE SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Neutral & Edge Scenarios (Multipliers, Delimiters) ---');

// 3A. Node Multipliers (2x Server Nodes)
const multText = `
2x HPE ProLiant Compute DL380 Gen12 Server Nodes
P73282-B21\tBase Server Chassis\t1
P69728-B21\t64GB Memory Kit\t6
`;
const multItems = parseAndConsolidateBOQ(multText);
const memItem = multItems.find(i => i.sku === 'P69728-B21');
assert(memItem && memItem.quantity === 12, `Node multiplier evaluated correctly: 2 nodes x 6 DIMMs = 12 total DIMMs (Actual: ${memItem ? memItem.quantity : 0})`);

// 3B. Obfuscated Line Separators (/, |, +, --)
const delimText = `
P73282-B21 / P74573-B21 | P69728-B21 + P47777-B21 -- P17023-B21
`;
const delimItems = parseAndConsolidateBOQ(delimText);
assert(delimItems.length === 5, `Cleanly extracted all 5 obfuscated SKUs across complex inline separators (Actual: ${delimItems.length})`);

// 3C. Empty BOQ
const emptyEval = evaluatePhysicalMath([]);
assert(emptyEval.confidence.score < 0.75 && emptyEval.confidence.isHitlTriggered === true, 'Empty BOQ triggered HITL review safeguarding (Score < 0.75)');

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLOSED-LOOP FEEDBACK & KNOWLEDGE LEARNING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Closed-Loop Feedback & Knowledge Delta Learning ---');

const simErr = 'ERR_PCI_RISER_CONFLICT: Tertiary x8x16 Riser P72203-B21 conflicts with OCPA x16 Adapter.';
const testOutputDir = path.join(__dirname, 'tmp_test_feedback');
if (!fs.existsSync(testOutputDir)) fs.mkdirSync(testOutputDir, { recursive: true });

const delta = processPortalFeedback(simErr, testOutputDir);
assert(delta.deltaId.startsWith('DELTA-'), `Generated valid KnowledgeDelta ID: ${delta.deltaId}`);
assert(fs.existsSync(path.join(testOutputDir, 'history', 'catalog_deltas.json')), 'Logged delta persistently to history/catalog_deltas.json');

// Cleanup temp dir
try { fs.rmSync(testOutputDir, { recursive: true, force: true }); } catch (_) {}

// ─────────────────────────────────────────────────────────────────────────────
// 5. WORKLOAD DNA PROFILING & 5-TIER STRATEGIC RESOLUTION MATRIX
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. Workload DNA Profiling & 5-Tier Strategic Matrix ---');

const { extractWorkloadDna, synthesize5TierRankedSolutions } = require('../scripts/lib/conflict_graph');

const vdiGpuBoq = [
  { sku: 'P73282-B21', description: 'HPE DL380 Gen12 SFF Server', quantity: 1 },
  { sku: 'P74573-B21', description: 'Intel Xeon 6730P 32-core Processor', quantity: 2 },
  { sku: 'R6F55A', description: 'NVIDIA RTX Pro 6000 48GB GPU Accelerator', quantity: 2 }
];

const dnaGpu = extractWorkloadDna(vdiGpuBoq);
assert(dnaGpu.primaryWorkload === 'VDI_AI_GRAPHICS', `Correctly identified VDI/AI GPU Workload DNA (Actual: ${dnaGpu.primaryWorkload})`);
assert(dnaGpu.hasGpu === true, 'Detected NVIDIA GPU accelerator presence');

const dbBoq = [
  { sku: 'P73282-B21', description: 'HPE DL380 Gen12 SFF Server', quantity: 1 },
  { sku: 'P74573-B21', description: 'Intel Xeon 6730P 32-core Processor', quantity: 2 },
  { sku: 'P69728-B21', description: '64GB DDR5-6400 Smart Memory Kit', quantity: 32 },
  { sku: 'P63829-B21', description: '1.92TB NVMe Gen4 Mixed Use SSD', quantity: 8 }
];

const dnaDb = extractWorkloadDna(dbBoq);
assert(dnaDb.primaryWorkload === 'DATABASE_IN_MEMORY', `Correctly identified In-Memory Database Workload DNA (Actual: ${dnaDb.primaryWorkload})`);
assert(dnaDb.gbPerCore >= 16, `Calculated RAM/core density >= 16 GB/core (Actual: ${dnaDb.gbPerCore})`);

const tiers = synthesize5TierRankedSolutions(dbBoq, { missingDependencies: [] }, { isWholeSolutionValid: true });
assert(tiers.length === 5, 'Synthesized exactly 5 ranked solution tiers');
assert(tiers[0].rank === 1 && tiers[0].workloadDnaMatch.includes('Database'), 'Rank 1 matches customer In-Memory Database workload intent');

// Summary
console.log('\n================================================================');
console.log(`📊 END-TO-END SCENARIO TEST SUMMARY: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 100% END-TO-END SCENARIOS & OBSERVE TESTED & PASSED!');
} else {
  console.log('⚠️ Some scenario tests failed — review output above.');
}
console.log('================================================================\n');

if (failed > 0) process.exit(1);
