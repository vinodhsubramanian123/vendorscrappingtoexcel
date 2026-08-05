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
    const filePath = path.join(dir, file);
    const stat     = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      results = results.concat(findXlsxFiles(filePath));
    } else if (file.endsWith('_OCA_Catalog.xlsx')) {
      results.push(filePath);
    }
  });

  return results;
}

function verifyAll() {
  console.log('================================================================');
  console.log('🚀 UNIVERSAL PORTFOLIO AUDIT & PIPELINE VERIFICATION SUITE');
  console.log('================================================================\n');

  const xlsxFiles = findXlsxFiles(OUTPUTS_ROOT);
  console.log(`Found ${xlsxFiles.length} scraped Excel workbook(s) in outputs/.\n`);

  let passCount = 0;
  let failCount = 0;

  xlsxFiles.sort().forEach((xlsxPath, idx) => {
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

      passCount++;
    } catch (err) {
      console.error(`❌ AUDIT FAILED for ${relPath}:`, err.message);
      failCount++;
    }
  });

  console.log('\n================================================================');
  console.log(`📊 PORTFOLIO AUDIT SUMMARY: ${passCount}/${xlsxFiles.length} PASSED`);
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
