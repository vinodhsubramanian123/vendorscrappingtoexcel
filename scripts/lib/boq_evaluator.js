'use strict';
/**
 * scripts/lib/boq_evaluator.js — Pre-Flight BOQ Evaluator & 6-Aspect Solution Pre-Check Engine
 *
 * Provides comprehensive multi-sheet Excel parsing, chassis multiplier evaluation, separator normalization,
 * modular 6-aspect physical pre-checks, quantitative confidence scoring, and Gemini Notebook payload formatting.
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { cleanBaseSKU, isValidHpeSKU, HPE_SKU_EXTRACT_REGEX } = require('./sku');
const { calculateConfidenceScore } = require('./feedback_loop');

/**
 * High TDP threshold requiring High-Performance Fan Kits
 */
const HIGH_TDP_THRESHOLD_WATTS = 240;

/**
 * Standard SKU mappings for mandatory physical dependencies
 */
const MANDATORY_SKUS = {
  HIGH_PERF_FAN_KIT: { sku: 'P48820-B21', name: 'HPE ProLiant DL380 Gen12 High Performance Fan Kit' },
  HIGH_PERF_HEATSINK: { sku: 'P74792-B21', name: 'HPE ProLiant DL380 Gen12 Performance Heat Sink Kit' },
  NO_DRIVE_FIO_KIT: { sku: '873763-B21', name: 'HPE ProLiant Compute DL380 No Drive Configuration FIO Kit' },
  DC_LUG_KIT: { sku: 'P36877-B21', name: 'HPE 1600W -48VDC Power Cable Lug Kit' },
  SMART_STORAGE_BATTERY: { sku: 'P01366-B21', name: 'HPE 96W Smart Storage Battery' },
  CONTROLLER_CABLE_KIT: { sku: 'P48918-B21', name: 'HPE DL360 Gen11 Storage Controller Cable Kit' },
  TRI_MODE_BOX12_CABLE: { sku: 'P76453-B21', name: 'HPE ProLiant Compute DL380 Gen12 8SFF/2SFF UMB PCIe Box 1/2 Cable Kit' }
};

/**
 * Parse raw BOQ input (CSV, TSV, Multi-sheet Excel workbook, or text) and extract consolidated items.
 * Handles multipliers (e.g., 2x Server Node x 6x DIMMs = 12 total DIMMs) and line separators.
 * @param {string|Buffer} rawInput 
 * @param {string} filePath Optional filepath if parsing .xlsx file directly
 * @returns {Array<object>} Consolidated items array
 */
function parseAndConsolidateBOQ(rawInput, filePath = '') {
  let lines = [];

  if (filePath && (filePath.endsWith('.xlsx') || filePath.endsWith('.xls'))) {
    const workbook = xlsx.readFile(filePath);
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csvText = xlsx.utils.sheet_to_csv(sheet);
      lines.push(...csvText.split(/\r?\n/));
    });
  } else {
    const text = String(rawInput);
    lines = text.split(/\r?\n/);
  }

  lines = lines.filter(l => l.trim().length > 0);
  const itemMap = new Map();
  let currentMultiplier = 1;

  for (const line of lines) {
    // Skip headers
    if (line.toLowerCase().includes('product #') && line.toLowerCase().includes('description')) continue;

    // Detect chassis/node multiplier line (e.g. "2x HPE DL380 Gen12 Server Nodes" or "Multiplier: 2")
    const multMatch = line.match(/^(\d+)\s*x\b/i) || line.match(/\b(\d+)\s*x\s*(?:node|server|chassis|system|unit|quote)\b/i) || line.match(/^(?:multiplier|qty|quantity)[:=\s]*(\d+)\b/i);
    const lineSku = (line.match(HPE_SKU_EXTRACT_REGEX) || [])[1];
    if (multMatch && (!lineSku || !isValidHpeSKU(lineSku))) {
      currentMultiplier = parseInt(multMatch[1], 10) || 1;
    }

    // Normalize separators (/, |, ;, +, -- double dash) without removing single SKU hyphens
    const normalizedLine = line.replace(/[\/\|;\+]|--/g, ' ');

    // Extract all valid SKU matches on the line
    const rawMatches = normalizedLine.match(new RegExp(HPE_SKU_EXTRACT_REGEX.source, 'gi')) || [];
    const validMatches = rawMatches.map(m => cleanBaseSKU(m)).filter(s => s && isValidHpeSKU(s));
    if (validMatches.length === 0) continue;

    for (const cleanSku of validMatches) {
      // Parse line item quantity (default to 1)
      let lineQty = 1;
      const explicitQty = normalizedLine.match(/\b(?:qty|quantity|count)[:=\s]*(\d+)\b/i);
      if (explicitQty) {
        lineQty = parseInt(explicitQty[1], 10) || 1;
      } else {
        const leadingQty = normalizedLine.match(/^(\d+)[\s,\t]+/);
        const trailingQty = normalizedLine.match(/[\s,\t]+(\d+)\s*$/);
        if (leadingQty && validMatches.length === 1) {
          lineQty = parseInt(leadingQty[1], 10) || 1;
        } else if (trailingQty && validMatches.length === 1) {
          lineQty = parseInt(trailingQty[1], 10) || 1;
        }
      }

      const totalQty = lineQty * currentMultiplier;

      // Clean description
      let description = normalizedLine
        .replace(new RegExp(cleanSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
        .replace(/^[\d\s,\t\-"'\:\;]+/, '')
        .replace(/[\d\s,\t\-"'\:\;]+$/, '')
        .trim();
      if (!description) description = cleanSku;

      if (itemMap.has(cleanSku)) {
        const existing = itemMap.get(cleanSku);
        existing.quantity += totalQty;
      } else {
        itemMap.set(cleanSku, {
          sku: cleanSku,
          description: description,
          quantity: totalQty
        });
      }
    }
  }

  return Array.from(itemMap.values());
}

/**
 * Aspect 1: Compute & Thermal Pre-Check
 */
function evalComputeThermal(items) {
  let cpuCount = 0;
  let maxCpuTdpWatts = 0;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    if (desc.includes('processor') || desc.includes('intel xeon') || desc.includes('amd epyc') || /^p\d{5}-b21$/i.test(it.sku)) {
      if (desc.includes('processor') || desc.includes('xeon') || desc.includes('epyc')) {
        cpuCount += it.quantity;
        const tdpMatch = desc.match(/(\d{3})\s*w/i);
        if (tdpMatch) {
          const tdp = parseInt(tdpMatch[1], 10);
          if (tdp > maxCpuTdpWatts) maxCpuTdpWatts = tdp;
        }
      }
    }
  }

  const hasHighPerfFans = items.some(it => cleanBaseSKU(it.sku) === MANDATORY_SKUS.HIGH_PERF_FAN_KIT.sku);
  const hasHeatsinks = items.some(it => cleanBaseSKU(it.sku) === MANDATORY_SKUS.HIGH_PERF_HEATSINK.sku);

  return { cpuCount, maxCpuTdpWatts, hasHighPerfFans, hasHeatsinks };
}

/**
 * Aspect 2: Memory & Channel Pre-Check
 */
function evalMemoryChannel(items) {
  let memoryCount = 0;
  let totalMemoryGb = 0;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    if (desc.includes('memory') || desc.includes('rdimm') || desc.includes('ddr5')) {
      memoryCount += it.quantity;
      const gbMatch = desc.match(/(\d+)\s*gb/i);
      if (gbMatch) {
        totalMemoryGb += (parseInt(gbMatch[1], 10) * it.quantity);
      }
    }
  }

  const isBalancedChannel = memoryCount > 0 && (memoryCount % 8 === 0 || memoryCount === 16);
  return { memoryCount, totalMemoryGb, isBalancedChannel };
}

/**
 * Aspect 3: Storage & Tri-Mode Controller Pre-Check
 */
function evalStorageTriMode(items) {
  let driveCount = 0;
  let hasStorageController = false;
  let hasSmartBattery = false;
  let hasNoDriveKit = false;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    const sku = cleanBaseSKU(it.sku);
    if (desc.includes('hdd') || desc.includes('ssd') || desc.includes('drive') || desc.includes('nvme')) {
      if (!desc.includes('no drive') && !desc.includes('cage') && !desc.includes('controller')) {
        driveCount += it.quantity;
      }
    }
    if (desc.includes('controller') || desc.includes('mr416i') || desc.includes('sr932i')) {
      hasStorageController = true;
    }
    if (sku === MANDATORY_SKUS.SMART_STORAGE_BATTERY.sku || desc.includes('smart storage battery')) {
      hasSmartBattery = true;
    }
    if (sku === MANDATORY_SKUS.NO_DRIVE_FIO_KIT.sku || desc.includes('no drive')) {
      hasNoDriveKit = true;
    }
  }

  return { driveCount, hasStorageController, hasSmartBattery, hasNoDriveKit };
}

/**
 * Aspect 4: Networking & OCP 3.0 Interconnect Pre-Check
 */
function evalNetworkingOcp(items) {
  let networkPortsCount = 0;
  let hasOcpAdapter = false;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    if (desc.includes('ocp') || desc.includes('adapter') || desc.includes('ethernet') || desc.includes('bcm5719') || desc.includes('bcm57504')) {
      hasOcpAdapter = true;
      networkPortsCount += (4 * it.quantity);
    }
  }

  return { networkPortsCount, hasOcpAdapter };
}

/**
 * Aspect 4B: PCIe Slot Capacity & Riser Expansion Card Math Pre-Check
 */
function evalPcieRiserSlots(items) {
  let requiredPcieCards = 0;
  let primaryRiserCount = 0;
  let secondaryRiserCount = 0;
  let tertiaryRiserCount = 0;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    const sku  = cleanBaseSKU(it.sku);

    // Count PCIe Expansion Cards (GPUs, NICs, HBAs, Controllers, Accelerator Cards)
    if (desc.includes('adapter') || desc.includes('controller') || desc.includes('hba') || desc.includes('nvidia') || desc.includes('pcie') || desc.includes('gpu')) {
      if (!desc.includes('ocp') && !desc.includes('embedded') && !desc.includes('lom') && !desc.includes('cable') && !desc.includes('cage')) {
        requiredPcieCards += it.quantity;
      }
    }

    // Count Risers
    if (desc.includes('primary riser') || desc.includes('main riser')) primaryRiserCount += it.quantity;
    if (desc.includes('secondary riser')) secondaryRiserCount += it.quantity;
    if (desc.includes('tertiary riser')) tertiaryRiserCount += it.quantity;
  }

  // Base Chassis provides 2 standard slots; Primary adds 3; Secondary adds 3; Tertiary adds 2.
  const totalSlotsAvailable = 2 + (primaryRiserCount * 3) + (secondaryRiserCount * 3) + (tertiaryRiserCount * 2);
  const needsSecondaryRiser = requiredPcieCards > (2 + primaryRiserCount * 3);

  return { requiredPcieCards, primaryRiserCount, secondaryRiserCount, tertiaryRiserCount, totalSlotsAvailable, needsSecondaryRiser };
}

/**
 * Aspect 5: Power & Environmental Pre-Check
 */
function evalPowerEnvironment(items) {
  let hasDcPowerSupply = false;
  let hasDcLugKit = false;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    const sku = cleanBaseSKU(it.sku);
    if (desc.includes('-48vdc') || desc.includes('dc power')) {
      hasDcPowerSupply = true;
    }
    if (sku === MANDATORY_SKUS.DC_LUG_KIT.sku || desc.includes('lug kit')) {
      hasDcLugKit = true;
    }
  }

  return { hasDcPowerSupply, hasDcLugKit };
}

/**
 * Aspect 6: Support & Manufacturing Pre-Check
 */
function evalSupportManufacturing(items) {
  let hasSupportService = false;
  for (const it of items) {
    const desc = it.description.toLowerCase();
    if (desc.includes('tech care') || desc.includes('support') || desc.includes('warranty') || /^h[a-z0-9]{6}/i.test(it.sku)) {
      hasSupportService = true;
    }
  }
  return { hasSupportService };
}

/**
 * Run modular physical math evaluation across all 6 solution aspects.
 * @param {Array<object>} items Consolidated BOQ items
 * @returns {object} Evaluation results
 */
function evaluatePhysicalMath(items) {
  const compute = evalComputeThermal(items);
  const memory = evalMemoryChannel(items);
  const storage = evalStorageTriMode(items);
  const network = evalNetworkingOcp(items);
  const pcie    = evalPcieRiserSlots(items);
  const power = evalPowerEnvironment(items);
  const support = evalSupportManufacturing(items);

  const errors = [];
  const warnings = [];
  const missingDependencies = [];

  // Rule: PCIe Slot Capacity vs Riser Math
  if (pcie.requiredPcieCards > pcie.totalSlotsAvailable) {
    warnings.push(`PCIe expansion cards count (${pcie.requiredPcieCards}) exceeds available chassis/riser PCIe slots (${pcie.totalSlotsAvailable}). Additional Riser Kit required.`);
  }

  // Rule: CPU 2 PCIe Lane Allocation requirement for Secondary/Tertiary Risers
  if ((pcie.secondaryRiserCount > 0 || pcie.tertiaryRiserCount > 0) && compute.cpuCount < 2) {
    errors.push(`Secondary/Tertiary Riser configured with only 1 CPU socket populated. Secondary PCIe bus lines require 2nd CPU socket.`);
  }

  // Rule 1: High TDP thermal requirement
  if (compute.maxCpuTdpWatts >= HIGH_TDP_THRESHOLD_WATTS && !compute.hasHighPerfFans) {
    errors.push(`High TDP Processor configured (${compute.maxCpuTdpWatts}W >= ${HIGH_TDP_THRESHOLD_WATTS}W threshold) without High-Performance Fan Kit.`);
    missingDependencies.push({
      rule: 'High TDP Thermal Cooling Rule',
      sku: MANDATORY_SKUS.HIGH_PERF_FAN_KIT.sku,
      description: MANDATORY_SKUS.HIGH_PERF_FAN_KIT.name,
      quantity: 1
    });
  }

  // Rule 2: Drive-less server requirement
  if (storage.driveCount === 0 && !storage.hasNoDriveKit) {
    warnings.push(`Drive-less server configuration detected (0 storage drives). Requires HPE No Drive Configuration FIO Kit to clear layout block.`);
    missingDependencies.push({
      rule: 'Drive-less Chassis Configuration Rule',
      sku: MANDATORY_SKUS.NO_DRIVE_FIO_KIT.sku,
      description: MANDATORY_SKUS.NO_DRIVE_FIO_KIT.name,
      quantity: 1
    });
  }

  // Rule 3: DC Power Supply Lug Kit requirement
  if (power.hasDcPowerSupply && !power.hasDcLugKit) {
    errors.push(`-48VDC Power Supply configured without matching DC Power Cable Lug Kit.`);
    missingDependencies.push({
      rule: 'DC Power Supply Cable Rule',
      sku: MANDATORY_SKUS.DC_LUG_KIT.sku,
      description: MANDATORY_SKUS.DC_LUG_KIT.name,
      quantity: 1
    });
  }

  // Rule 81392308: CLIC Unbuildable Error Check (P73282-B21 Front Drive Cage / No-Drive FIO Kit)
  const hasBaseChassis = items.some(it => cleanBaseSKU(it.sku) === 'P73282-B21');
  const hasNoDriveFioKit = items.some(it => cleanBaseSKU(it.sku) === '873763-B21');
  const hasDriveCageKit = items.some(it => cleanBaseSKU(it.sku) === 'P75741-B21' || cleanBaseSKU(it.sku) === 'P76449-B21');

  if (hasBaseChassis && storage.driveCount === 0 && !hasNoDriveFioKit && !hasDriveCageKit) {
    missingDependencies.push({
      rule: 'CLIC Rule 81392308: 8SFF Front Cage / No Drive FIO Requirement',
      sku: '873763-B21',
      description: '873763-B21 FIO HPE 8SFF Front Remove SPEC Perf FIO (or 8SFF Front Cage Kit P75741-B21)',
      quantity: 1,
      reason: 'UNBUILDABLE CONFIGURATION (Rule 81392308): P73282-B21 DL380 Gen12 SFF NC chassis ordered without drives requires 873763-B21 FIO Kit or an explicit 8SFF Front Drive Cage Kit.'
    });
  }

  // Rule 4: Controller Smart Storage Battery requirement
  if (storage.hasStorageController && !storage.hasSmartBattery) {
    warnings.push(`Storage controller configured without Smart Storage Battery to protect write cache.`);
    missingDependencies.push({
      rule: 'Controller Cache Protection Rule',
      sku: MANDATORY_SKUS.SMART_STORAGE_BATTERY.sku,
      description: MANDATORY_SKUS.SMART_STORAGE_BATTERY.name,
      quantity: 1
    });
  }

  // Rule 5: Memory Channel Balance requirement
  if (memory.memoryCount > 0 && !memory.isBalancedChannel) {
    warnings.push(`Memory count (${memory.memoryCount} DIMMs across ${compute.cpuCount || 2} CPUs) is not populated symmetrically across 8 memory channels per CPU socket.`);
  }

  const evalSummary = {
    cpuCount: compute.cpuCount,
    maxCpuTdpWatts: compute.maxCpuTdpWatts,
    memoryCount: memory.memoryCount,
    totalMemoryGb: memory.totalMemoryGb,
    isBalancedChannel: memory.isBalancedChannel,
    driveCount: storage.driveCount,
    hasStorageController: storage.hasStorageController,
    hasSmartBattery: storage.hasSmartBattery,
    hasNoDriveKit: storage.hasNoDriveKit,
    hasHighPerfFans: compute.hasHighPerfFans,
    hasHeatsinks: compute.hasHeatsinks,
    hasDcPowerSupply: power.hasDcPowerSupply,
    hasDcLugKit: power.hasDcLugKit,
    hasOcpAdapter: network.hasOcpAdapter,
    networkPortsCount: network.networkPortsCount,
    requiredPcieCards: pcie.requiredPcieCards,
    totalPcieSlotsAvailable: pcie.totalSlotsAvailable,
    hasSupportService: support.hasSupportService,
    errors,
    warnings,
    missingDependencies
  };

  // Step 2.5: Run 5-Level Dependency Conflict Graph Validation
  const { validateConflictGraph } = require('./conflict_graph');
  const graphResults = validateConflictGraph(items, missingDependencies, 'outputs/ProLiant/Gen12/DL380_Gen12_SFF');
  evalSummary.conflictGraph = graphResults;

  // Deduct score if whole solution has graph conflicts
  if (!graphResults.isWholeSolutionValid) {
    evalSummary.errors.push(`Whole-solution conflict graph validation failed: ${graphResults.conflicts.length} unresolved conflict(s).`);
  }

  // Calculate quantitative confidence score & HITL trigger details
  const confidence = calculateConfidenceScore(items, evalSummary);
  evalSummary.confidence = confidence;

  return evalSummary;
}

/**
 * Format prompt payload for Gemini Notebook RAG query.
 * Prompts NotebookLM for whole-solution buildability validation across all 5 hierarchy levels.
 * @param {Array<object>} items 
 * @param {object} evalResults 
 * @returns {string} Formatted prompt string
 */
function formatNotebookQueryPayload(items, evalResults) {
  const graph = evalResults.conflictGraph || {};
  const chassis = graph.chassisInfo || { model: 'DL380 Gen12 SFF', formFactor: 'SFF' };

  let prompt = `Perform grounded 5-tier whole-solution buildability analysis and architectural validation for the following ${chassis.model} BOQ:\n\n`;
  prompt += `CONSOLIDATED HARDWARE BOQ ITEMS:\n`;
  items.forEach(it => {
    prompt += `- SKU: ${it.sku} | Qty: ${it.quantity} | Description: ${it.description}\n`;
  });
  prompt += `\nPRE-FLIGHT PHYSICAL MATH & CONFLICT GRAPH ASSERTIONS:\n`;
  prompt += `- Chassis Model & Form Factor: ${chassis.model} (${chassis.formFactor})\n`;
  prompt += `- Total Processors: ${evalResults.cpuCount} (Max TDP: ${evalResults.maxCpuTdpWatts}W)\n`;
  prompt += `- Total Memory: ${evalResults.memoryCount} DIMMs (${evalResults.totalMemoryGb} GB Total)\n`;
  prompt += `- Total Storage Drives: ${evalResults.driveCount}\n`;
  prompt += `- Whole-Solution Buildability: ${graph.isWholeSolutionValid ? '✅ PASSED' : '❌ CONFLICTS DETECTED'}\n`;
  prompt += `- Total Catalog Rules Evaluated: ${graph.totalRulesEvaluated || 33}\n`;
  prompt += `- Quantitative Confidence Score: ${evalResults.confidence ? evalResults.confidence.score : '1.0'}\n\n`;

  if (evalResults.missingDependencies.length > 0) {
    prompt += `MISSING MANDATORY PHYSICAL DEPENDENCIES TO INJECT:\n`;
    evalResults.missingDependencies.forEach(dep => {
      prompt += `- Add SKU: ${dep.sku} (Qty ${dep.quantity}) — ${dep.description} [Rule: ${dep.rule}]\n`;
    });
    prompt += `\n`;
  }

  if (graph.resolvedFixes && graph.resolvedFixes.length > 0) {
    prompt += `RESOLVED CASCADING FIXES & REASONING:\n`;
    graph.resolvedFixes.forEach(rf => {
      prompt += `- SKU ${rf.sku}: ${rf.action} — ${rf.reasoning}\n`;
    });
    prompt += `\n`;
  }

  prompt += `REQUIREMENTS:\n`;
  prompt += `1. Verify that the ENTIRE solution (original BOQ + all injected fixes) is 100% buildable as a single cohesive system without any breaking conflicts.\n`;
  prompt += `2. Synthesize a 5-Tier Strategic Resolution Matrix (Rank 1: Intent Preserved to Rank 5: Dense I/O).\n`;
  prompt += `3. For Rank 1, include exact list price citations from the catalog data.\n`;
  prompt += `4. Include technical attribute filters (e.g., Memory capacity > 32GB matching 64GB/96GB/128GB RDIMMs).\n`;
  prompt += `5. Provide complete backtrackable rationale so a human reviewer can verify or override any architectural assumptions.\n`;

  return prompt;
}

module.exports = {
  parseAndConsolidateBOQ,
  evaluatePhysicalMath,
  formatNotebookQueryPayload,
  evalComputeThermal,
  evalMemoryChannel,
  evalStorageTriMode,
  evalNetworkingOcp,
  evalPowerEnvironment,
  evalSupportManufacturing
};
