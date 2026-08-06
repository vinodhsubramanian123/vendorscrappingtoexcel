'use strict';
/**
 * scripts/lib/boq_evaluator.js — Pre-Flight BOQ Parser & Physical Rules Evaluator
 *
 * Implements pre-cleanup, consolidated quantity calculations, physical thermal/fan/riser/power
 * constraint assertions, and prompt payload formatting for Gemini Notebook RAG validation.
 */

const { cleanBaseSKU, HPE_SKU_EXTRACT_REGEX } = require('./sku');

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
  SMART_STORAGE_BATTERY: { sku: 'P01366-B21', name: 'HPE 96W Smart Storage Battery' }
};

/**
 * Parse raw BOQ lines (CSV, TSV, or plain text) and extract consolidated items.
 * @param {string} rawInput 
 * @returns {Array<object>} Consolidated items array
 */
function parseAndConsolidateBOQ(rawInput) {
  const lines = rawInput.split(/\r?\n/).filter(l => l.trim().length > 0);
  const itemMap = new Map();

  for (const line of lines) {
    // Skip table headers if present
    if (line.toLowerCase().includes('product #') && line.toLowerCase().includes('description')) continue;

    const skuMatch = line.match(HPE_SKU_EXTRACT_REGEX);
    if (!skuMatch) continue;

    const cleanSku = cleanBaseSKU(skuMatch[1]);
    if (!cleanSku) continue;
    
    // Parse quantity (default to 1 if not explicitly specified)
    let qty = 1;
    const qtyMatch = line.match(/\b(?:qty|quantity|count)[:=\s]*(\d+)\b/i) || line.match(/^(\d+)[\s,\t]+/) || line.match(/[\s,\t]+(\d+)\s*$/);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1], 10) || 1;
    }

    // Clean description
    let description = line
      .replace(skuMatch[0], '')
      .replace(/^[\d\s,\t\-"'\:\;]+/, '')
      .replace(/[\d\s,\t\-"'\:\;]+$/, '')
      .trim();
    if (!description) description = cleanSku;

    if (itemMap.has(cleanSku)) {
      const existing = itemMap.get(cleanSku);
      existing.quantity += qty;
    } else {
      itemMap.set(cleanSku, {
        sku: cleanSku,
        description: description,
        quantity: qty
      });
    }
  }

  return Array.from(itemMap.values());
}

/**
 * Evaluate physical dependencies and mathematical constraints on consolidated BOQ.
 * @param {Array<object>} items 
 * @returns {object} Evaluation results containing metrics, flags, missing parts, and errors
 */
function evaluatePhysicalMath(items) {
  const results = {
    totalItems: items.length,
    cpuCount: 0,
    maxCpuTdpWatts: 0,
    hasHighTdpCpu: false,
    memoryCount: 0,
    totalMemoryGb: 0,
    driveCount: 0,
    hasHighPerfFans: false,
    hasNoDriveFioKit: false,
    hasDcPowerSupply: false,
    hasDcLugKit: false,
    hasStandupController: false,
    hasSmartStorageBattery: false,
    errors: [],
    warnings: [],
    missingDependencies: []
  };

  for (const item of items) {
    const sku = item.sku;
    const desc = item.description.toLowerCase();
    const qty = item.quantity;

    // CPU detection & thermal TDP calculation
    if (desc.includes('xeon') || desc.includes('processor') || desc.includes('cpu') || sku.startsWith('P74') || sku.startsWith('P75')) {
      results.cpuCount += qty;
      const tdpMatch = desc.match(/(\d{3})\s*w\b/i);
      if (tdpMatch) {
        const tdp = parseInt(tdpMatch[1], 10);
        if (tdp > results.maxCpuTdpWatts) results.maxCpuTdpWatts = tdp;
        if (tdp >= HIGH_TDP_THRESHOLD_WATTS) results.hasHighTdpCpu = true;
      }
    }

    // Memory detection
    if (desc.includes('memory') || desc.includes('rdimm') || desc.includes('ddr5') || sku.startsWith('P69') || sku.startsWith('P70')) {
      results.memoryCount += qty;
      const gbMatch = desc.match(/(\d+)\s*gb\b/i);
      if (gbMatch) {
        results.totalMemoryGb += parseInt(gbMatch[1], 10) * qty;
      }
    }

    // Storage Drive detection
    if (desc.includes('ssd') || desc.includes('hdd') || desc.includes('nvme') || desc.includes('edsff') || desc.includes('sff drive')) {
      results.driveCount += qty;
    }

    // High Performance Fans detection
    if (sku === MANDATORY_SKUS.HIGH_PERF_FAN_KIT.sku || desc.includes('high performance fan')) {
      results.hasHighPerfFans = true;
    }

    // No Drive FIO Kit detection
    if (sku === MANDATORY_SKUS.NO_DRIVE_FIO_KIT.sku || desc.includes('no drive')) {
      results.hasNoDriveFioKit = true;
    }

    // DC Power Supply & Lug Kit detection
    if (desc.includes('-48vdc') || desc.includes('dc power supply')) {
      results.hasDcPowerSupply = true;
    }
    if (sku === MANDATORY_SKUS.DC_LUG_KIT.sku || desc.includes('lug kit')) {
      results.hasDcLugKit = true;
    }

    // Standup Controller & Battery detection
    if (desc.includes('controller') || desc.includes('raid') || desc.includes('mr416i') || desc.includes('mr932i')) {
      results.hasStandupController = true;
    }
    if (sku === MANDATORY_SKUS.SMART_STORAGE_BATTERY.sku || desc.includes('storage battery')) {
      results.hasSmartStorageBattery = true;
    }
  }

  // 1. Physical TDP & Fan Assertions
  if (results.hasHighTdpCpu && !results.hasHighPerfFans) {
    results.errors.push(`High TDP Processor configured (${results.maxCpuTdpWatts}W >= ${HIGH_TDP_THRESHOLD_WATTS}W threshold) without High-Performance Fan Kit.`);
    results.missingDependencies.push({
      rule: 'High TDP Thermal Cooling Rule',
      sku: MANDATORY_SKUS.HIGH_PERF_FAN_KIT.sku,
      description: MANDATORY_SKUS.HIGH_PERF_FAN_KIT.name,
      quantity: 1
    });
  }

  // 2. Drive-less Configuration Assertion
  if (results.driveCount === 0 && !results.hasNoDriveFioKit) {
    results.warnings.push(`Drive-less server configuration detected (0 storage drives). Requires HPE No Drive Configuration FIO Kit to clear layout block.`);
    results.missingDependencies.push({
      rule: 'Drive-less Chassis Configuration Rule',
      sku: MANDATORY_SKUS.NO_DRIVE_FIO_KIT.sku,
      description: MANDATORY_SKUS.NO_DRIVE_FIO_KIT.name,
      quantity: 1
    });
  }

  // 3. DC Power Supply Cable Assertion
  if (results.hasDcPowerSupply && !results.hasDcLugKit) {
    results.errors.push(`-48VDC Power Supply configured without matching DC Power Cable Lug Kit.`);
    results.missingDependencies.push({
      rule: 'DC Power Supply Cable Rule',
      sku: MANDATORY_SKUS.DC_LUG_KIT.sku,
      description: MANDATORY_SKUS.DC_LUG_KIT.name,
      quantity: 1
    });
  }

  // 4. Memory Channel Symmetry Assertion (8 channels per socket)
  if (results.cpuCount > 0 && results.memoryCount > 0) {
    const memoryPerSocket = results.memoryCount / results.cpuCount;
    if (results.memoryCount % 8 !== 0) {
      results.warnings.push(`Memory count (${results.memoryCount} DIMMs across ${results.cpuCount} CPUs) is not populated symmetrically across 8 memory channels per CPU socket.`);
    }
  }

  // 5. Smart Storage Battery Assertion for Cache Protection
  if (results.hasStandupController && !results.hasSmartStorageBattery) {
    results.warnings.push(`Storage controller configured without Smart Storage Battery to protect write cache.`);
    results.missingDependencies.push({
      rule: 'Controller Cache Protection Rule',
      sku: MANDATORY_SKUS.SMART_STORAGE_BATTERY.sku,
      description: MANDATORY_SKUS.SMART_STORAGE_BATTERY.name,
      quantity: 1
    });
  }

  return results;
}

/**
 * Format pre-cleaned BOQ summary payload for Gemini Notebook query.
 * @param {Array<object>} items 
 * @param {object} evalResults 
 * @returns {string} Cleaned query prompt string
 */
function formatNotebookQueryPayload(items, evalResults) {
  let prompt = `Validate the following customer HPE DL380 Gen12 Bill of Materials (BOQ):\n\n`;
  prompt += `CONSOLIDATED BOQ ITEMS (${items.length}):\n`;
  
  items.forEach((item, idx) => {
    prompt += `${idx + 1}. SKU: ${item.sku} | Qty: ${item.quantity} | Description: ${item.description}\n`;
  });

  prompt += `\nPRE-FLIGHT PHYSICAL MATH RESULTS:\n`;
  prompt += `- CPUs: ${evalResults.cpuCount} (Max TDP: ${evalResults.maxCpuTdpWatts}W)\n`;
  prompt += `- Memory: ${evalResults.memoryCount} DIMMs (${evalResults.totalMemoryGb} GB Total)\n`;
  prompt += `- Storage Drives: ${evalResults.driveCount}\n`;
  prompt += `- High-Perf Fans Present: ${evalResults.hasHighPerfFans ? 'Yes' : 'No'}\n`;
  
  if (evalResults.missingDependencies.length > 0) {
    prompt += `\nPRE-DETECTED MISSING DEPENDENCIES:\n`;
    evalResults.missingDependencies.forEach((dep, idx) => {
      prompt += `${idx + 1}. SKU: ${dep.sku} (Qty ${dep.quantity}) — ${dep.rule}: ${dep.description}\n`;
    });
  }

  prompt += `\nPlease evaluate this configuration against the 5-Tier Strategic Resolution Hierarchy (Rank 1: Customer Intent Preserved, Rank 2: Performance Optimized, Rank 3: CapEx Saver, Rank 4: Sustainability/Green, Rank 5: Dense I/O Database Cluster) and provide direct SKU fixes for any errors or missing parts.`;

  return prompt;
}

module.exports = {
  parseAndConsolidateBOQ,
  evaluatePhysicalMath,
  formatNotebookQueryPayload,
  MANDATORY_SKUS,
  HIGH_TDP_THRESHOLD_WATTS
};
