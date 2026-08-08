'use strict';
/**
 * scripts/verify_all.js — Universal Portfolio Audit & Verification Suite
 * Usage: node scripts/verify_all.js
 *
 * Automatically discovers all .xlsx files in outputs/ and executes both
 * verify_excel_tally.js and test_pipeline_evals.js (--post-flight-only) on each.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUTS_ROOT = path.join(PROJECT_ROOT, 'outputs');

function findXlsxFiles(dir) {
  let results = [];
  const list  = fs.readdirSync(dir);

  list.forEach(file => {
    if (file.startsWith('.') || file.startsWith('.~')) return; // Skip dotfiles & Excel lock files
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findXlsxFiles(filePath));
      } else if (file.endsWith('_OCA_Catalog.xlsx')) {
        results.push(filePath);
      }
    } catch {}
  });

  return results;
}

function verifyAll() {
  console.log('================================================================');
  console.log('🚀 UNIVERSAL PORTFOLIO AUDIT & PIPELINE VERIFICATION SUITE');
  console.log('================================================================\n');

  // --- Phase 0: Module Load & Export Smoke Test ---
  console.log('--- Phase 0: System Module Load & Export Smoke Test ---');
  const libDir = path.join(__dirname, 'lib');
  if (fs.existsSync(libDir)) {
    const libFiles = fs.readdirSync(libDir).filter(f => f.endsWith('.js'));
    libFiles.forEach(file => {
      const modPath = path.join(libDir, file);
      try {
        require(modPath);
        console.log(`  ✅ Module loaded cleanly: scripts/lib/${file}`);
      } catch (err) {
        console.error(`  ❌ MODULE LOAD CRASH in scripts/lib/${file}:`, err.message);
        throw new Error(`Module load smoke test failed for scripts/lib/${file}: ${err.message}`);
      }
    });
  }
  console.log('  🎉 All pipeline library modules verified clean.\n');

  const xlsxFiles = findXlsxFiles(OUTPUTS_ROOT);
  console.log(`Found ${xlsxFiles.length} scraped Excel workbook(s) in outputs/.\n`);

  if (xlsxFiles.length === 0) {
    console.log('⚠️ NO DATA: 0 product catalogs found. Pipeline evaluation not applicable.');
    console.log('================================================================\n');
    return;
  }

  let passCount = 0;
  let failCount = 0;

  const suiteStart = Date.now();
  xlsxFiles.sort().forEach((xlsxPath, idx) => {
    const itemStart = Date.now();
    const relPath = path.relative(PROJECT_ROOT, xlsxPath);
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${idx + 1}/${xlsxFiles.length}] Auditing: ${relPath}`);
    console.log(`----------------------------------------------------------------`);

    try {
      // 1. Run Excel Tally Audit
      execSync(`node "${path.join(__dirname, 'verify_excel_tally.js')}" "${xlsxPath}"`, {
        stdio: 'inherit',
        cwd: PROJECT_ROOT
      });

      // 2. Run Pipeline Evals in --post-flight-only mode
      execSync(`node "${path.join(__dirname, 'test_pipeline_evals.js')}" "${xlsxPath}" --post-flight-only`, {
        stdio: 'inherit',
        cwd: PROJECT_ROOT
      });

      const itemDuration = ((Date.now() - itemStart) / 1000).toFixed(2);
      console.log(`  ⏱️ Verified ${relPath} in ${itemDuration}s`);
      passCount++;
    } catch (err) {
      console.error(`❌ AUDIT FAILED for ${relPath}:`, err.message);
      failCount++;
    }
  });

  const totalDuration = ((Date.now() - suiteStart) / 1000).toFixed(2);
  console.log('\n================================================================');
  console.log(`📊 PORTFOLIO AUDIT SUMMARY: ${passCount}/${xlsxFiles.length} PASSED in ${totalDuration}s`);
  if (failCount === 0) {
    console.log('🎉 100% PORTFOLIO CERTIFICATION PASSED!');
  } else {
    console.log(`⚠️ ${failCount} product catalog(s) failed evaluation.`);
  }
  console.log('================================================================\n');

  if (failCount > 0) process.exit(1);
}

if (require.main === module) {
  verifyAll();
}

module.exports = { verifyAll };
