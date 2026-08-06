'use strict';
/**
 * tests/test_offline_pipeline.js — Offline Pipeline Regression Test
 *
 * Exercises the catalog compilation and Excel generation pipeline against
 * a committed fixture file (tests/fixtures/sample_oca_raw_data.json),
 * requiring NO live browser, CDP connection, or authenticated HPE session.
 *
 * Usage: node tests/test_offline_pipeline.js
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FIXTURE_JSON = path.join(__dirname, 'fixtures', 'sample_oca_raw_data.json');
const TMP_DIR      = path.join(require('os').tmpdir(), 'oca_offline_test_' + Date.now());
const CATALOG_JSON = path.join(TMP_DIR, 'Test_Fixture_Catalog.json');
const XLSX_OUTPUT  = path.join(TMP_DIR, 'Test_Fixture_OCA_Catalog.xlsx');

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
console.log('🧪 OFFLINE PIPELINE REGRESSION TEST');
console.log('================================================================\n');

// Ensure fixture exists
assert(fs.existsSync(FIXTURE_JSON), `Fixture file exists: ${path.relative(PROJECT_ROOT, FIXTURE_JSON)}`);

// Create temp output directory
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(path.join(TMP_DIR, 'intermittent_scraps'), { recursive: true });

// Step 1: Run build_catalog.js
console.log('\n--- Step 1: build_catalog.js ---');
try {
  execSync(
    `node "${path.join(PROJECT_ROOT, 'scripts', 'build_catalog.js')}" "${FIXTURE_JSON}" "${CATALOG_JSON}"`,
    { stdio: 'pipe', cwd: PROJECT_ROOT, timeout: 30000 }
  );
  assert(fs.existsSync(CATALOG_JSON), 'Catalog JSON was created');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_JSON, 'utf-8'));
  assert(catalog.metadata !== undefined, 'Catalog JSON has metadata field');
  assert(catalog.metadata.totalUniqueSKUs > 0, `Catalog has ${catalog.metadata.totalUniqueSKUs} SKUs (> 0)`);
  assert(Array.isArray(catalog.entries), 'Catalog has entries array');
} catch (err) {
  console.error(`  ❌ build_catalog.js threw an error: ${err.message}`);
  failed++;
}

// Step 2: Run generate_xlsx.js
console.log('\n--- Step 2: generate_xlsx.js ---');
try {
  execSync(
    `node "${path.join(PROJECT_ROOT, 'scripts', 'generate_xlsx.js')}" "${XLSX_OUTPUT}"`,
    { stdio: 'pipe', cwd: PROJECT_ROOT, timeout: 30000 }
  );
  assert(fs.existsSync(XLSX_OUTPUT), 'Excel workbook was created');

  const stats = fs.statSync(XLSX_OUTPUT);
  assert(stats.size > 1000, `Excel file is ${stats.size} bytes (> 1KB)`);
} catch (err) {
  console.error(`  ❌ generate_xlsx.js threw an error: ${err.message}`);
  failed++;
}

// Step 3: Run verify_excel_tally.js
console.log('\n--- Step 3: verify_excel_tally.js ---');
if (fs.existsSync(XLSX_OUTPUT)) {
  try {
    execSync(
      `node "${path.join(PROJECT_ROOT, 'scripts', 'verify_excel_tally.js')}" "${XLSX_OUTPUT}"`,
      { stdio: 'pipe', cwd: PROJECT_ROOT, timeout: 30000 }
    );
    assert(true, 'verify_excel_tally.js passed without errors');
  } catch (err) {
    console.error(`  ❌ verify_excel_tally.js threw an error: ${err.stderr ? err.stderr.toString().substring(0, 300) : err.message}`);
    failed++;
  }
} else {
  console.log('  ⏭️ Skipping — Excel file was not created in Step 2');
}

// Cleanup
try {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
} catch (_) {}

// Summary
console.log('\n================================================================');
console.log(`📊 OFFLINE TEST SUMMARY: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 ALL OFFLINE PIPELINE TESTS PASSED!');
} else {
  console.log('⚠️ Some offline tests failed — review output above.');
}
console.log('================================================================\n');

if (failed > 0) process.exit(1);
