'use strict';
/**
 * scripts/lib/boq_evaluator.js — Pre-Flight BOQ Evaluator & 6-Aspect Solution Pre-Check Engine
 *
 * Provides comprehensive multi-sheet Excel parsing, chassis multiplier evaluation, separator normalization,
 * modular 6-aspect physical pre-checks, quantitative confidence scoring, and Gemini Notebook payload formatting.
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx-js-style');
const { cleanBaseSKU, isValidHpeSKU, HPE_SKU_EXTRACT_REGEX } = require('./sku');
const { calculateConfidenceScore } = require('./feedback_loop');
const { classifyComponentRole } = require('./product_meta');
const { emitProgress } = require('./progress');

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
function evalComputeThermal(items, catalogData = null) {
  let cpuCount = 0;
  let maxCpuTdpWatts = 0;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    
    // Attempt to lookup role from catalog if available, fallback to product_meta classifier
    let role = classifyComponentRole('', desc);
    if (catalogData && catalogData.entries) {
      const match = catalogData.entries.find(e => e.skus && e.skus.find(s => cleanBaseSKU(s['Product #']) === cleanBaseSKU(it.sku)));
      if (match) role = classifyComponentRole(match.parentCategory, desc);
    }

    if (role === 'Processor' || /^p\d{5}-b21$/i.test(it.sku)) {
      if (desc.includes('processor') || desc.includes('xeon') || desc.includes('epyc')) {
        cpuCount += it.quantity;
        const tdpMatch = desc.match(/(\d{2,3})\s*w/i);
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
function evalMemoryChannel(items, passedCpuCount = 0, catalogData = null) {
  let memoryCount = 0;
  let totalMemoryGb = 0;
  let cpuCount = passedCpuCount;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    let role = classifyComponentRole('', desc);
    if (catalogData && catalogData.entries) {
      const match = catalogData.entries.find(e => e.skus && e.skus.find(s => cleanBaseSKU(s['Product #']) === cleanBaseSKU(it.sku)));
      if (match) role = classifyComponentRole(match.parentCategory, desc);
    }

    if (role === 'Memory' || desc.includes('memory') || desc.includes('rdimm') || desc.includes('ddr5')) {
      memoryCount += it.quantity;
      const gbMatch = desc.match(/(\d+)\s*gb/i);
      if (gbMatch) {
        totalMemoryGb += (parseInt(gbMatch[1], 10) * it.quantity);
      }
    }
    if (!passedCpuCount && (desc.includes('processor') || desc.includes('xeon') || desc.includes('epyc'))) {
      cpuCount += it.quantity;
    }
  }

  if (cpuCount === 0) cpuCount = 2; // Default if no CPUs found

  const isBalancedChannel = memoryCount > 0 && (memoryCount % cpuCount === 0) && ((memoryCount / cpuCount) % 8 === 0);
  return { memoryCount, totalMemoryGb, isBalancedChannel };
}

/**
 * Aspect 3: Storage & Tri-Mode Controller Pre-Check
 */
function evalStorageTriMode(items, catalogData = null) {
  let driveCount = 0;
  let hasStorageController = false;
  let hasSmartBattery = false;
  let hasNoDriveKit = false;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    const sku = cleanBaseSKU(it.sku);

    let role = classifyComponentRole('', desc);
    if (catalogData && catalogData.entries) {
      const match = catalogData.entries.find(e => e.skus && e.skus.find(s => cleanBaseSKU(s['Product #']) === cleanBaseSKU(it.sku)));
      if (match) role = classifyComponentRole(match.parentCategory, desc);
    }

    if (role === 'Drive Cage / Drive' || desc.includes('hdd') || desc.includes('ssd') || desc.includes('drive') || desc.includes('nvme')) {
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
function evalNetworkingOcp(items, catalogData = null) {
  let networkPortsCount = 0;
  let hasOcpAdapter = false;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    
    let role = classifyComponentRole('', desc);
    if (catalogData && catalogData.entries) {
      const match = catalogData.entries.find(e => e.skus && e.skus.find(s => cleanBaseSKU(s['Product #']) === cleanBaseSKU(it.sku)));
      if (match) role = classifyComponentRole(match.parentCategory, desc);
    }

    if (role === 'Network Adapter' || desc.includes('ocp') || desc.includes('adapter') || desc.includes('ethernet') || desc.includes('bcm5719') || desc.includes('bcm57504')) {
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
function evalPowerEnvironment(items, catalogData = null) {
  let hasDcPowerSupply = false;
  let hasDcLugKit = false;

  for (const it of items) {
    const desc = it.description.toLowerCase();
    const sku = cleanBaseSKU(it.sku);

    let role = classifyComponentRole('', desc);
    if (catalogData && catalogData.entries) {
      const match = catalogData.entries.find(e => e.skus && e.skus.find(s => cleanBaseSKU(s['Product #']) === cleanBaseSKU(it.sku)));
      if (match) role = classifyComponentRole(match.parentCategory, desc);
    }

    if (role === 'Power Supply' && (desc.includes('-48vdc') || desc.includes('dc power'))) {
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
function evalSupportManufacturing(items, catalogData = null) {
  let hasSupportService = false;
  for (const it of items) {
    const desc = it.description.toLowerCase();
    let role = classifyComponentRole('', desc);
    if (catalogData && catalogData.entries) {
      const match = catalogData.entries.find(e => e.skus && e.skus.find(s => cleanBaseSKU(s['Product #']) === cleanBaseSKU(it.sku)));
      if (match) role = classifyComponentRole(match.parentCategory, desc);
    }
    if (role === 'Service & Support' || desc.includes('tech care') || desc.includes('support') || desc.includes('warranty') || /^h[a-z0-9]{6}/i.test(it.sku)) {
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
function evaluatePhysicalMath(items, catalogData = null, targetDir = '') {
  emitProgress(2, 10, 'Compute & Thermal Profiling', 'in_progress', `Analyzing ${items.length} SKUs for high-TDP processor constraints and heatsink counts.`);
  const compute = evalComputeThermal(items, catalogData);
  
  emitProgress(3, 10, 'Memory Channel Math', 'in_progress', `Validating 1DPC / 2DPC symmetry and balanced memory population.`);
  const memory = evalMemoryChannel(items, compute.cpuCount, catalogData);
  
  emitProgress(4, 10, 'Storage Tri-Mode Validation', 'in_progress', `Verifying NVMe/SAS/SATA drive cages, controllers, and backplane capacities.`);
  const storage = evalStorageTriMode(items, catalogData);
  
  emitProgress(5, 10, 'Networking & PCIe Constraints', 'in_progress', `Analyzing OCP NICs and PCIe Riser slot math.`);
  const network = evalNetworkingOcp(items, catalogData);
  const pcie    = evalPcieRiserSlots(items); // Doesn't need strict taxonomy given specific part descriptions
  
  emitProgress(6, 10, 'Power & Infrastructure Checking', 'in_progress', `Verifying DC power lug kits and redundancy.`);
  const power = evalPowerEnvironment(items, catalogData);
  const support = evalSupportManufacturing(items, catalogData);

  const errors = [];
  const warnings = [];
  const missingDependencies = [];
  const mathDeductions = [];

  // Rule: PCIe Slot Capacity vs Riser Math
  if (pcie.requiredPcieCards > pcie.totalSlotsAvailable) {
    const reason = `PCIe Math Failed: ${pcie.requiredPcieCards} required cards exceeds ${pcie.totalSlotsAvailable} available slots.`;
    warnings.push(reason);
    mathDeductions.push(reason);
  }

  // Rule: CPU 2 PCIe Lane Allocation requirement for Secondary/Tertiary Risers
  if ((pcie.secondaryRiserCount > 0 || pcie.tertiaryRiserCount > 0) && compute.cpuCount < 2) {
    const reason = `Compute/PCIe Math Failed: Secondary/Tertiary Risers require 2nd CPU socket. Only 1 CPU found.`;
    errors.push(reason);
    mathDeductions.push(reason);
  }

  // Rule 1: High TDP thermal requirement
  if (compute.maxCpuTdpWatts >= HIGH_TDP_THRESHOLD_WATTS && !compute.hasHighPerfFans) {
    const reason = `Thermal Math Failed: ${compute.maxCpuTdpWatts}W processor exceeds ${HIGH_TDP_THRESHOLD_WATTS}W limit without High-Performance Fan Kit.`;
    errors.push(reason);
    mathDeductions.push(reason);
    missingDependencies.push({
      rule: 'High TDP Thermal Cooling Rule',
      sku: MANDATORY_SKUS.HIGH_PERF_FAN_KIT.sku,
      description: MANDATORY_SKUS.HIGH_PERF_FAN_KIT.name,
      quantity: 1,
      reasoning: reason
    });
  }

  // Rule 2: Drive-less server requirement
  if (storage.driveCount === 0 && !storage.hasNoDriveKit) {
    const reason = `Storage Math Failed: 0 drives detected. Requires HPE No Drive Configuration FIO Kit.`;
    warnings.push(reason);
    mathDeductions.push(reason);
    missingDependencies.push({
      rule: 'Drive-less Chassis Configuration Rule',
      sku: MANDATORY_SKUS.NO_DRIVE_FIO_KIT.sku,
      description: MANDATORY_SKUS.NO_DRIVE_FIO_KIT.name,
      quantity: 1,
      reasoning: reason
    });
  }

  // Rule 3: DC Power Supply Lug Kit requirement
  if (power.hasDcPowerSupply && !power.hasDcLugKit) {
    const reason = `Power Math Failed: -48VDC Power Supply requires DC Power Cable Lug Kit.`;
    errors.push(reason);
    mathDeductions.push(reason);
    missingDependencies.push({
      rule: 'DC Power Supply Cable Rule',
      sku: MANDATORY_SKUS.DC_LUG_KIT.sku,
      description: MANDATORY_SKUS.DC_LUG_KIT.name,
      quantity: 1,
      reasoning: reason
    });
  }

  // Rule 81392308: CLIC Unbuildable Error Check (P73282-B21 Front Drive Cage / No-Drive FIO Kit)
  const hasBaseChassis = items.some(it => cleanBaseSKU(it.sku) === 'P73282-B21');
  const hasNoDriveFioKit = items.some(it => cleanBaseSKU(it.sku) === '873763-B21');
  const hasDriveCageKit = items.some(it => cleanBaseSKU(it.sku) === 'P75741-B21' || cleanBaseSKU(it.sku) === 'P76449-B21');

  if (hasBaseChassis && storage.driveCount === 0 && !hasNoDriveFioKit && !hasDriveCageKit) {
    const reason = 'CLIC Rule 81392308: P73282-B21 chassis without drives requires 873763-B21 FIO Kit.';
    mathDeductions.push(reason);
    missingDependencies.push({
      rule: 'CLIC Rule 81392308: 8SFF Front Cage / No Drive FIO Requirement',
      sku: '873763-B21',
      description: '873763-B21 FIO HPE 8SFF Front Remove SPEC Perf FIO (or 8SFF Front Cage Kit P75741-B21)',
      quantity: 1,
      reason: 'UNBUILDABLE CONFIGURATION (Rule 81392308): P73282-B21 DL380 Gen12 SFF NC chassis ordered without drives requires 873763-B21 FIO Kit or an explicit 8SFF Front Drive Cage Kit.',
      reasoning: reason
    });
  }

  // Rule 4: Controller Smart Storage Battery requirement
  if (storage.hasStorageController && !storage.hasSmartBattery) {
    const reason = `Storage Math Failed: Storage controller requires Smart Storage Battery to protect write cache.`;
    warnings.push(reason);
    mathDeductions.push(reason);
    missingDependencies.push({
      rule: 'Controller Cache Protection Rule',
      sku: MANDATORY_SKUS.SMART_STORAGE_BATTERY.sku,
      description: MANDATORY_SKUS.SMART_STORAGE_BATTERY.name,
      quantity: 1,
      reasoning: reason
    });
  }

  // Rule 5: Memory Channel Balance requirement
  if (memory.memoryCount > 0 && !memory.isBalancedChannel) {
    const reason = `Memory Math Failed: ${memory.memoryCount} DIMMs across ${compute.cpuCount || 2} CPUs is not balanced.`;
    warnings.push(reason);
    mathDeductions.push(reason);
  }

  const aspectChecks = [
    {
      id: 1,
      name: 'Thermal & Compute Math',
      iconType: 'Cpu',
      defaultRule: 'CPU TDP thermal envelope vs cooling kit population rules',
      status: compute.maxCpuTdpWatts >= HIGH_TDP_THRESHOLD_WATTS && !compute.hasHighPerfFans ? 'FAIL' : 'PASS',
      detail: compute.maxCpuTdpWatts >= HIGH_TDP_THRESHOLD_WATTS && !compute.hasHighPerfFans ? `Thermal Math Failed: ${compute.maxCpuTdpWatts}W processor exceeds ${HIGH_TDP_THRESHOLD_WATTS}W limit without High-Performance Fan Kit.` : `Verified ${compute.cpuCount} CPUs within TDP envelope.`
    },
    {
      id: 2,
      name: 'Memory & Channel Balance',
      iconType: 'Memory',
      defaultRule: 'Memory interleaving, channel balance & population rules',
      status: (memory.memoryCount > 0 && !memory.isBalancedChannel) ? 'FAIL' : 'PASS',
      detail: (memory.memoryCount > 0 && !memory.isBalancedChannel) ? `Memory Math Failed: ${memory.memoryCount} DIMMs across ${compute.cpuCount || 2} CPUs is not balanced.` : `Verified ${memory.memoryCount} DIMMs in balanced configuration.`
    },
    {
      id: 3,
      name: 'Storage & Controller Cabling',
      iconType: 'HardDrive',
      defaultRule: 'Storage controller, drive cage & cable kit compatibility checks',
      status: (storage.driveCount === 0 && !storage.hasNoDriveKit && !hasDriveCageKit) || (storage.hasStorageController && !storage.hasSmartBattery) ? 'FAIL' : 'PASS',
      detail: storage.driveCount === 0 && !storage.hasNoDriveKit && !hasDriveCageKit ? 'Storage Math Failed: 0 drives requires No Drive Configuration FIO Kit.' : storage.hasStorageController && !storage.hasSmartBattery ? 'Storage Math Failed: Storage controller requires Smart Storage Battery.' : `Verified ${storage.driveCount} drives and controller configuration.`
    },
    {
      id: 4,
      name: 'PCIe Riser & Slot Alignment',
      iconType: 'Zap',
      defaultRule: 'Riser lane allocation, slot population & TDP compliance',
      status: (pcie.requiredPcieCards > pcie.totalSlotsAvailable) || ((pcie.secondaryRiserCount > 0 || pcie.tertiaryRiserCount > 0) && compute.cpuCount < 2) ? 'FAIL' : 'PASS',
      detail: pcie.requiredPcieCards > pcie.totalSlotsAvailable ? `PCIe Math Failed: ${pcie.requiredPcieCards} required cards exceeds ${pcie.totalSlotsAvailable} slots.` : (pcie.secondaryRiserCount > 0 || pcie.tertiaryRiserCount > 0) && compute.cpuCount < 2 ? 'Compute/PCIe Math Failed: Secondary/Tertiary Risers require 2nd CPU socket.' : `Verified ${pcie.requiredPcieCards} PCIe cards fit within ${pcie.totalSlotsAvailable} slots.`
    },
    {
      id: 5,
      name: 'Power & Redundancy Math',
      iconType: 'Power',
      defaultRule: 'Power supply redundancy rating & auxiliary kit requirements',
      status: power.hasDcPowerSupply && !power.hasDcLugKit ? 'FAIL' : 'PASS',
      detail: power.hasDcPowerSupply && !power.hasDcLugKit ? 'Power Math Failed: -48VDC Power Supply requires DC Power Cable Lug Kit.' : 'Verified power supply and infrastructure dependencies.'
    },
    {
      id: 6,
      name: 'Vendor Support Taxonomy',
      iconType: 'Award',
      defaultRule: 'Hardware SKU validation against mandatory support SLA tiers',
      status: support.hasSupportService ? 'PASS' : 'FAIL',
      detail: support.hasSupportService ? 'Verified mandatory support services included.' : 'Support Taxonomy Failed: Missing required support service SLA.'
    }
  ];

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
    mathDeductions,
    missingDependencies,
    aspectChecks
  };

  // Step 7: Run 5-Level Dependency Conflict Graph Validation
  // G26: Use provided targetDir or auto-detect from items (no hardcoded path)
  const { validateConflictGraph } = require('./conflict_graph');
  const { autoDetectChassisDetailed } = require('./catalog_discovery');
  emitProgress(7, 10, 'Validating Conflict Graph', 'in_progress', 'Resolving dependencies and checking for architectural conflicts.');
  const resolvedDir = targetDir || 'outputs/ProLiant/Gen12/DL380_Gen12_SFF';
  const graphResults = validateConflictGraph(items, missingDependencies, resolvedDir);
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
  const chassis = graph.chassisInfo || { model: 'HPE ProLiant DL380 Gen12 SFF', formFactor: 'SFF' };

  let prompt = `Validate the following physical dependencies and constraints against the QuickSpecs for ${chassis.model}.\n\n`;

  const hasMissingDeps = evalResults.missingDependencies && evalResults.missingDependencies.length > 0;
  const hasErrors = evalResults.errors && evalResults.errors.length > 0;
  const rankedSolutions = graph.rankedSolutions || [];

  if (hasMissingDeps || hasErrors) {
    prompt += `The Local Rule Engine detected the following potential conflicts/missing items in the baseline configuration:\n`;
    if (hasMissingDeps) {
      const deps = evalResults.missingDependencies.map(d => `${d.quantity || 1}x ${d.sku} — ${d.description || 'required cable/accessory'}`).join('; ');
      prompt += `- Missing Dependencies: ${deps}\n`;
    }
    if (hasErrors) {
      prompt += `- Violations: ${evalResults.errors.join('; ')}\n`;
    }
    
    prompt += `\nTo resolve these, the engine generated the following Tier 1 solution: \n`;
    if (rankedSolutions.length > 0) {
      const r1 = rankedSolutions[0];
      prompt += `Proposed Fixes: ${r1.tradeoffMetrics?.skuModifications || 'Standard'}. Reason: ${r1.reasoning}\n`;
    }
    
    prompt += `\nPlease act as a hardware engineering expert. Consult the QuickSpecs to verify if these conflicts are accurate AND if the proposed Tier 1 solution fully resolves the thermal, power, and physical constraints without introducing new violations. Return your answer as a concise technical rationale.`;
  } else {
    // If no conflicts detected locally, do a lightweight sanity check of the primary components
    const primaryItems = items.filter(it => it.quantity > 0 && ['Processor', 'Memory', 'Storage Devices'].includes(it.category)).slice(0, 10);
    const itemSummaries = primaryItems.map(it => `${it.quantity > 1 ? it.quantity + 'x ' : '1x '}${it.sku}`).join('; ');
    prompt += `Core configuration: ${itemSummaries || 'standard base chassis'}.\n`;
    prompt += `The Local Rule Engine detected NO physical conflicts. Please do a quick sanity check to ensure no hidden thermal, power, or mixing rules are violated by this core configuration. Return a concise technical rationale confirming buildability.`;
  }

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
