'use strict';
/**
 * scripts/eval_boq.js — CLI Pre-Flight BOQ Evaluator, Multi-Sheet Parser & Gemini Notebook Validator
 *
 * Runs end-to-end BOQ parsing (multi-sheet Excel, multipliers, line separators), 6-aspect physical pre-checks,
 * quantitative confidence scoring, Gemini Notebook RAG validation, and 5-Tier Resolution Report synthesis.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { parseAndConsolidateBOQ, evaluatePhysicalMath, formatNotebookQueryPayload } = require('./lib/boq_evaluator');
const { calculateConfidenceScore, processPortalFeedback } = require('./lib/feedback_loop');

const DEFAULT_NOTEBOOK_ID = '1d190853-4e9c-48df-aa70-eae66c6f2c1f'; // Dl 380 Spec Gen 12

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/eval_boq.js <input_boq_file> [--notebook-id <id>] [--output <output_report.md>] [--simulate-portal-error "<error>"]

Examples:
  node scripts/eval_boq.js test_boq_dl380_gen12.csv
  node scripts/eval_boq.js my_quote.xlsx --output outputs/reports/eval_report.md
  node scripts/eval_boq.js test_boq_dl380_gen12.csv --simulate-portal-error "ERR_STORAGE_CABLE_REQUIRED: Controller MR416i-p requires P76453-B21 Box 1/2 Cable Kit."
`);
    process.exit(0);
  }

  const inputFile = args[0];
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input BOQ file not found: ${inputFile}`);
    process.exit(1);
  }

  let notebookId = DEFAULT_NOTEBOOK_ID;
  const nbIdx = args.indexOf('--notebook-id');
  if (nbIdx !== -1 && args[nbIdx + 1]) {
    notebookId = args[nbIdx + 1];
  }

  const inputBase = path.basename(inputFile, path.extname(inputFile));
  const chassisDir = 'outputs/ProLiant/Gen12/DL380_Gen12_SFF';
  const defaultReportsDir = path.join(chassisDir, 'reports');
  if (!fs.existsSync(defaultReportsDir)) {
    fs.mkdirSync(defaultReportsDir, { recursive: true });
  }

  let outputPath = path.join(defaultReportsDir, `BOQ_Evaluation_${inputBase}.md`);
  const outIdx = args.indexOf('--output');
  if (outIdx !== -1 && args[outIdx + 1]) {
    outputPath = args[outIdx + 1];
  }

  // Handle portal error simulation if requested
  const errIdx = args.indexOf('--simulate-portal-error');
  if (errIdx !== -1 && args[errIdx + 1]) {
    const simError = args[errIdx + 1];
    // Derive output dir from --output-dir arg or default to DL380_Gen12_SFF
    const odIdx = args.indexOf('--output-dir');
    const feedbackDir = (odIdx !== -1 && args[odIdx + 1]) ? args[odIdx + 1] : 'outputs/ProLiant/Gen12/DL380_Gen12_SFF';
    console.log(`\n🔄 Processing simulated partner portal error feedback...`);
    const delta = processPortalFeedback(simError, feedbackDir);
    console.log(`✅ KnowledgeDelta logged: ${delta.deltaId} (${delta.ruleUpdate})`);
  }

  console.log(`\n===============================================================`);
  console.log(`🚀 HPE BOQ PRE-FLIGHT EVALUATION & GEMINI NOTEBOOK VALIDATOR`);
  console.log(`===============================================================`);
  console.log(`  📄 Input BOQ File : ${inputFile}`);
  console.log(`  📚 Notebook ID    : ${notebookId}`);
  console.log(`  📝 Output Report  : ${outputPath}`);

  // Step 1: Parse and consolidate BOQ
  const rawContent = fs.readFileSync(inputFile, 'utf-8');
  const items = parseAndConsolidateBOQ(rawContent, inputFile);
  console.log(`\n🔍 Phase 1: Consolidated ${items.length} unique hardware SKUs from BOQ.`);

  // Step 2: Modular 6-Aspect Solution Pre-Check Engine
  const evalResults = evaluatePhysicalMath(items);
  const graph = evalResults.conflictGraph || {};

  console.log(`\n⚡ Phase 2: Modular 6-Aspect Physical Pre-Checks Completed:`);
  console.log(`  1. Compute & Thermal : ${evalResults.cpuCount} CPUs (Max TDP: ${evalResults.maxCpuTdpWatts}W) | High-Perf Fans: ${evalResults.hasHighPerfFans ? '✅' : '❌'}`);
  console.log(`  2. Memory & Channels : ${evalResults.memoryCount} DIMMs (${evalResults.totalMemoryGb} GB Total)`);
  console.log(`  3. Storage & Tri-Mode: ${evalResults.driveCount} Drives | Controller Battery: ${evalResults.hasSmartBattery ? '✅' : '❌'}`);
  console.log(`  4. Networking & OCP  : OCP Adapter Present: ${evalResults.hasOcpAdapter ? '✅' : '❌'}`);
  console.log(`  5. Power & Ambient   : -48VDC PSU: ${evalResults.hasDcPowerSupply ? 'YES' : 'NO'} | Lug Kit: ${evalResults.hasDcLugKit ? '✅' : '❌'}`);
  console.log(`  6. Support Services  : Tech Care Support Present: ${evalResults.hasSupportService ? '✅' : '❌'}`);

  console.log(`\n🕸️ Phase 2.5: 5-Level Dependency Conflict Graph Validation:`);
  console.log(`  Chassis Variant    : ${graph.chassisInfo ? graph.chassisInfo.model : 'DL380 Gen12 SFF'}`);
  console.log(`  Rules Evaluated    : ${graph.totalRulesEvaluated || 33} across VENDOR, CHASSIS, CATEGORY, SUBCATEGORY, SKU levels`);
  console.log(`  Rules Source       : ${graph.rulesSource || 'DL380_Gen12_SFF_Catalog.json'} ${graph.isFallbackSource ? '(Fallback Safety Net)' : '(Dual Safety Net)'}`);
  console.log(`  Whole Solution     : ${graph.isWholeSolutionValid ? '✅ PASSED (No cross-aspect conflicts)' : '❌ CONFLICTS DETECTED'}`);

  if (graph.resolvedFixes && graph.resolvedFixes.length > 0) {
    console.log(`  Cascading Fixes    : ${graph.resolvedFixes.length} fix(es) validated without downstream conflicts.`);
  }

  console.log(`\n  📊 Quantitative Confidence Score: ${evalResults.confidence.score} / 1.00`);
  console.log(`  ${evalResults.confidence.summary}`);

  if (evalResults.errors.length > 0) {
    console.log(`\n❌ CRITICAL PHYSICAL VIOLATIONS:`);
    evalResults.errors.forEach(e => console.log(`   - ${e}`));
  }
  if (evalResults.warnings.length > 0) {
    console.log(`\n⚠️ PHYSICAL WARNINGS:`);
    evalResults.warnings.forEach(w => console.log(`   - ${w}`));
  }

  // Helper to check if nlm CLI is installed and available in PATH
  function checkNlmAvailable() {
    try {
      const envPath = process.platform === 'win32' ? '' : `export PATH="$HOME/.local/bin:$PATH"; `;
      execSync(`${envPath} nlm --version`, { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch (_) {
      return false;
    }
  }

  // Step 3: Format Payload & Query Gemini Notebook
  const queryPayload = formatNotebookQueryPayload(items, evalResults);
  const isNlmAvailable = checkNlmAvailable();

  let ragAnswer = '';
  if (isNlmAvailable) {
    console.log(`\n🤖 Phase 3: Querying Gemini Notebook RAG (${notebookId})...`);
    const tmpOutFile = path.join(os.tmpdir(), 'boq_rag_response.json');
    const tmpPromptFile = path.join(os.tmpdir(), 'boq_prompt_clean.txt');
    fs.writeFileSync(tmpPromptFile, queryPayload.replace(/"/g, "'"), 'utf-8');

    try {
      const cleanPrompt = queryPayload.replace(/["$`\\]/g, ' ');
      const envPath = process.platform === 'win32' ? '' : `export PATH="$HOME/.local/bin:$PATH"; `;
      const cmd = `${envPath} nlm notebook query ${notebookId} "${cleanPrompt}" --json`;
      const execOut = execSync(cmd, { encoding: 'utf-8', timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
      fs.writeFileSync(tmpOutFile, execOut, 'utf-8');

      if (execOut) {
        try {
          const parsed = JSON.parse(execOut);
          if (parsed.answer) ragAnswer = parsed.answer;
          else if (execOut.trim()) ragAnswer = execOut.trim();
        } catch (_) {
          if (execOut.trim()) ragAnswer = execOut.trim();
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Notebook RAG query execution error: ${err.message}`);
    }
  } else {
    console.log(`\n⚠️ Phase 3: 'nlm' CLI not detected in PATH. Skipping Gemini Notebook RAG query.`);
  }

  if (!ragAnswer || ragAnswer.includes('ETIMEDOUT')) {
    ragAnswer = `### Pre-Flight Physical Validation Matrix (RAG Query Unavailable)

> ⚠️ **Notice**: Gemini Notebook RAG synthesis was skipped or unavailable (requires \`nlm\` CLI installed and authenticated). Below is the ungrounded pre-flight physical math validation.

#### Physical Validation Summary
- **Errors Identified**: ${evalResults.errors.length} critical physical violation(s)
- **Warnings Identified**: ${evalResults.warnings.length} physical warning(s)
- **Quantitative Confidence Score**: ${evalResults.confidence.score} / 1.00

#### Physical Validation Actions:
${evalResults.errors.length === 0 ? '- ✅ No critical physical violations detected in input BOQ.' : evalResults.errors.map(e => `- ❌ Violation: ${e}`).join('\n')}
${evalResults.warnings.length === 0 ? '' : evalResults.warnings.map(w => `- ⚠️ Advisory: ${w}`).join('\n')}`;
  }

  // Step 4: Budget Optimization Analysis (Golden Rule Assurance)
  let targetBudgetUsd = 0;
  const bIdx = args.indexOf('--budget');
  if (bIdx !== -1 && args[bIdx + 1]) {
    targetBudgetUsd = parseFloat(args[bIdx + 1]) || 0;
  }

  const { optimizeForBudget } = require('./lib/budget_optimizer');
  const budgetOpt = optimizeForBudget(items, evalResults, targetBudgetUsd);

  // Step 5: Synthesize Final Markdown Report
  const reportDir = path.dirname(outputPath);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  let reportContent = `# HPE Pre-Flight BOQ Evaluation & Validation Report\n\n`;
  reportContent += `**Target BOQ File**: \`${inputFile}\`  \n`;
  reportContent += `**Target Gemini Notebook**: \`Dl 380 Spec Gen 12\` (\`${notebookId}\`)  \n`;
  reportContent += `**Evaluation Date**: ${new Date().toISOString()}  \n`;
  reportContent += `**Quantitative Confidence Score**: \`${evalResults.confidence.score} / 1.00\` (${evalResults.confidence.isHitlTriggered ? '🚨 HITL Review Required' : '✅ Certified Buildable'})  \n`;
  if (targetBudgetUsd > 0) {
    reportContent += `**Target CapEx Budget**: \`$${targetBudgetUsd.toLocaleString()} USD\`  \n`;
  }
  reportContent += `\n---\n\n`;

  reportContent += `## 📋 1. Consolidated BOQ Hardware Items (${items.length})\n\n`;
  reportContent += `| # | Product # (SKU) | Consolidated Qty | Description | Est. Unit Price (USD) | Extended Price (USD) |\n`;
  reportContent += `|---|---|---|---|---|---|\n`;
  items.forEach((it, idx) => {
    reportContent += `| ${idx + 1} | \`${it.sku}\` | ${it.quantity} | ${it.description} | \$${(it.unitPriceUsd || 0).toLocaleString()} | \$${(it.extendedPriceUsd || 0).toLocaleString()} |\n`;
  });
  reportContent += `\n**Current Baseline BOM Total**: \`$${budgetOpt.currentBomCostUsd.toLocaleString()} USD\`\n\n`;
  reportContent += `---\n\n`;

  reportContent += `## ⚡ 2. Modular 6-Aspect Physical Pre-Checks\n\n`;
  reportContent += `- **Aspect 1: Compute & Thermal**: ${evalResults.cpuCount} CPUs (Max TDP: ${evalResults.maxCpuTdpWatts}W) | High-Perf Fans: ${evalResults.hasHighPerfFans ? '✅ Present' : '❌ Missing'}\n`;
  reportContent += `- **Aspect 2: Memory & Channels**: ${evalResults.memoryCount} DIMMs (${evalResults.totalMemoryGb} GB Total)\n`;
  reportContent += `- **Aspect 3: Storage & Tri-Mode**: ${evalResults.driveCount} Drives | Controller Battery: ${evalResults.hasSmartBattery ? '✅ Present' : '❌ Missing'}\n`;
  reportContent += `- **Aspect 4: Networking & OCP**: OCP Adapter Present: ${evalResults.hasOcpAdapter ? '✅ Present' : '❌ Missing'}\n`;
  reportContent += `- **Aspect 5: Power & Environment**: -48VDC PSU: ${evalResults.hasDcPowerSupply ? 'YES' : 'NO'} | Lug Kit: ${evalResults.hasDcLugKit ? '✅ Present' : '❌ Missing'}\n`;
  reportContent += `- **Aspect 6: Support Services**: Support Service Present: ${evalResults.hasSupportService ? '✅ Present' : '❌ Missing'}\n\n`;

  if (evalResults.missingDependencies.length > 0) {
    reportContent += `### 🚨 Missing Physical Dependencies Detected\n\n`;
    reportContent += `| # | Rule Name | Direct SKU Fix | Required Qty | Description |\n`;
    reportContent += `|---|---|---|---|---|\n`;
    evalResults.missingDependencies.forEach((dep, idx) => {
      reportContent += `| ${idx + 1} | ${dep.rule} | \`${dep.sku}\` | ${dep.quantity} | ${dep.description} |\n`;
    });
    reportContent += `\n`;
  }

  reportContent += `### 🕸️ 2.5 Cross-Aspect Dependency & 5-Level Rule Audit Log\n\n`;
  reportContent += `- **Detected Chassis Variant**: \`${graph.chassisInfo ? graph.chassisInfo.model : 'DL380 Gen12 SFF'}\`  \n`;
  reportContent += `- **Whole-Solution Buildability**: \`${graph.isWholeSolutionValid ? '✅ PASSED' : '❌ CONFLICTS DETECTED'}\`  \n`;
  reportContent += `- **Rules Loaded Source**: \`${graph.rulesSource || 'DL380_Gen12_SFF_Catalog.json'}\` ${graph.isFallbackSource ? '(Fallback Safety Net)' : '(Dual Safety Net)'}  \n\n`;

  if (graph.auditLog && graph.auditLog.length > 0) {
    reportContent += `| Hierarchy Level | Evaluated Rule Text | Status | Technical Audit Details |\n`;
    reportContent += `|---|---|---|---|\n`;
    graph.auditLog.forEach(al => {
      const statusIcon = al.status === 'PASS' ? '✅ PASS' : (al.status === 'FAIL' ? '❌ FAIL' : '⚠️ WARNING');
      reportContent += `| **${al.level}** | ${al.ruleText} | ${statusIcon} | ${al.details} |\n`;
    });
    reportContent += `\n`;
  }

  reportContent += `### 🏆 2.6 Workload DNA Profile & Top 5 Strategic Resolution Matrix\n\n`;
  const dna = graph.workloadDna || {};
  reportContent += `- **Inferred Workload DNA Profile**: \`${dna.workloadDescription || 'Balanced Enterprise'}\`  \n`;
  reportContent += `- **CPU / Core Density**: \`${dna.totalCores || 0} Total Cores\` (Max Freq: \`${dna.maxFreqGhz || 0} GHz\`)  \n`;
  reportContent += `- **Memory Density Ratio**: \`${dna.totalMemoryGb || 0} GB Total RAM\` (\`${dna.gbPerCore || 0} GB/Core\`)  \n`;
  reportContent += `- **Storage I/O Profile**: \`${dna.storageWorkload || 'READ_INTENSIVE'} (${dna.storageType || 'SATA/NVMe'})\`  \n\n`;

  if (graph.rankedSolutions && graph.rankedSolutions.length > 0) {
    reportContent += `| Rank | Solution Tier Name | Score | Est. Cost (USD) | Workload Match | SKU Mods | Technical Tradeoff Rationale |\n`;
    reportContent += `|---|---|---|---|---|---|---|\n`;
    graph.rankedSolutions.forEach(rs => {
      reportContent += `| **Rank ${rs.rank}** | ${rs.name} | \`${rs.score}\` | \$${rs.estimatedCostUsd.toLocaleString()} | ${rs.workloadDnaMatch} | ${rs.changesCount} | ${rs.reasoning} |\n`;
    });
    reportContent += `\n`;
  }

  reportContent += `---\n\n`;
  reportContent += `## 💰 3. Budget-Constrained Optimization & Golden Rule Assurance\n\n`;
  reportContent += `${budgetOpt.goldenRuleSummary}\n\n`;
  reportContent += `- **Mandatory Buildable Cost**: \`$${budgetOpt.mandatoryBomCostUsd.toLocaleString()} USD\` (Includes all direct SKU fixes)\n`;
  if (budgetOpt.isBudgetExceeded) {
    reportContent += `- **Minimum Budget Overrun Delta**: \`+$${budgetOpt.budgetOverrunUsd.toLocaleString()} USD\`\n`;
    reportContent += `> **Engineering Rationale**: The Golden Rule mandates that solution validation must eliminate 100% of unbuildable errors. Budget caps cannot override mandatory thermal cooling, power terminal safety, or write-cache lithium-ion battery requirements.\n\n`;
  } else if (targetBudgetUsd > 0) {
    reportContent += `- **Remaining Budget Surplus**: \`$${budgetOpt.remainingBudgetUsd.toLocaleString()} USD\`\n\n`;
    if (budgetOpt.recommendedUpgrades.length > 0) {
      reportContent += `### 🌟 Recommended Surplus Budget Performance Upgrades\n\n`;
      reportContent += `| Component Upgrade | Recommended SKU | Qty | Cost (USD) | Performance Benefit |\n`;
      reportContent += `|---|---|---|---|---|\n`;
      budgetOpt.recommendedUpgrades.forEach(upg => {
        reportContent += `| ${upg.upgrade} | \`${upg.sku}\` | ${upg.qty} | \$${upg.costUsd.toLocaleString()} | ${upg.benefit} |\n`;
      });
      reportContent += `\n`;
    }
  }

  reportContent += `---\n\n`;
  const ragSectionTitle = ragAnswer.includes('RAG Query Unavailable')
    ? '## 🤖 4. Pre-Flight Physical Validation (RAG Unavailable)'
    : '## 🤖 4. Grounded Gemini Notebook RAG Solution Validation';
  reportContent += `${ragSectionTitle}\n\n`;
  reportContent += `${ragAnswer}\n\n`;
  reportContent += `---\n\n`;
  reportContent += `*Report generated automatically by HPE BOQ Evaluation Engine.*  \n`;

  fs.writeFileSync(outputPath, reportContent, 'utf-8');

  // Record Pipeline Telemetry for Observability Dashboard
  const { recordEvaluationTelemetry } = require('./lib/telemetry');
  recordEvaluationTelemetry(evalResults, inputFile, Date.now() - startTime);

  console.log(`\n===============================================================`);
  console.log(`✅ EVALUATION COMPLETE! Report saved to: ${outputPath}`);
  console.log(`===============================================================\n`);
}

main().catch(err => {
  console.error('Fatal evaluation error:', err);
  process.exit(1);
});
