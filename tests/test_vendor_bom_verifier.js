'use strict';
/**
 * tests/test_vendor_bom_verifier.js
 *
 * Verification suite for Post-Build Vendor Partner Portal BOM Re-Ingestion & Bi-Directional Cross-Verification.
 */

const path = require('path');
const { verifyVendorBOM } = require('../scripts/lib/vendor_bom_verifier');

function runTests() {
  console.log('===============================================================');
  console.log('🚀 VENDOR PARTNER PORTAL BOM VERIFICATION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, detail = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
    }
  }

  const chassisDir = path.join(__dirname, '..', 'outputs', 'ProLiant', 'Gen12', 'DL380_Gen12_SFF');

  const proposedRank1 = {
    rank: 1,
    name: 'Rank 1: Customer Workload Intent Preserved',
    skuList: [
      { sku: 'P47777-B21', quantity: 1, description: 'HPE MR416i-p Gen11 Storage Controller', unitPriceUsd: 5999 },
      { sku: 'P74775-B21', quantity: 1, description: 'HPE MR408i-p Gen11 Storage Controller', unitPriceUsd: 4699 },
      { sku: 'P76471-B21', quantity: 1, description: 'HPE DL380 Gen12 Riser Cable Kit', unitPriceUsd: 89, isFix: true }
    ]
  };

  // Test Case 1: Exact Match Vendor BOM
  const exactVendorBom = [
    { sku: 'P47777-B21', quantity: 1, description: 'HPE MR416i-p Gen11 Storage Controller', unitPriceUsd: 5999 },
    { sku: 'P74775-B21', quantity: 1, description: 'HPE MR408i-p Gen11 Storage Controller', unitPriceUsd: 4699 },
    { sku: 'P76471-B21', quantity: 1, description: 'HPE DL380 Gen12 Riser Cable Kit', unitPriceUsd: 89 }
  ];

  const report1 = verifyVendorBOM(exactVendorBom, proposedRank1, chassisDir);
  assert(
    report1.is100PercentMatch && report1.discrepancies.addedByVendor.length === 0,
    'Test 1: 100% Match between proposed Rank 1 and Vendor Portal BOM',
    `Report: ${JSON.stringify(report1.discrepancies)}`
  );

  // Test Case 2: Vendor Portal auto-inserted a new power cord SKU
  const vendorBomWithAdditions = [
    ...exactVendorBom,
    { sku: 'P38997-B21', quantity: 2, description: 'HPE 1600W Flex Slot Power Supply', unitPriceUsd: 450 }
  ];

  const report2 = verifyVendorBOM(vendorBomWithAdditions, proposedRank1, chassisDir);
  assert(
    !report2.is100PercentMatch && report2.discrepancies.addedByVendor.length === 1 && report2.discrepancies.addedByVendor[0].sku === 'P38997-B21',
    'Test 2: Detect Vendor Portal auto-inserted SKU (addedByVendor)',
    `Added: ${report2.discrepancies.addedByVendor[0]?.sku}`
  );

  // Test Case 3: Vendor BOM contains an uncataloged new live SKU
  const vendorBomUncataloged = [
    ...exactVendorBom,
    { sku: 'P99999-B21', quantity: 1, description: 'HPE Live Portal Uncataloged Adapter', unitPriceUsd: 1200 }
  ];

  const report3 = verifyVendorBOM(vendorBomUncataloged, proposedRank1, chassisDir);
  assert(
    report3.requiresFreshScrape && report3.discrepancies.uncatalogedSkus.length > 0,
    'Test 3: Flag uncataloged live SKU and recommend fresh CDP scrape',
    `Requires Fresh Scrape: ${report3.requiresFreshScrape}`
  );

  console.log(`\n===============================================================`);
  console.log(`📊 VENDOR BOM AUDIT TEST SUMMARY: ${passed}/${total} assertions passed (${Math.round(passed / total * 100)}%)`);
  console.log(`===============================================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
