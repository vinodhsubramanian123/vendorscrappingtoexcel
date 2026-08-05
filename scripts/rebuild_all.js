'use strict';
/**
 * scripts/rebuild_all.js — Rebuild all catalogs from raw_data files
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUTS_ROOT = path.join(PROJECT_ROOT, 'outputs');

function findCatalogJsonFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    if (file.startsWith('.')) return;
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findCatalogJsonFiles(filePath));
      } else if (file.endsWith('_Catalog.json') && !filePath.includes('raw_data')) {
        results.push(filePath);
      }
    } catch {}
  });

  return results;
}

function rebuildAll() {
  console.log('================================================================');
  console.log('🔄 REBUILDING ALL PRODUCT CATALOGS & EXCEL WORKBOOKS');
  console.log('================================================================\n');

  const jsonFiles = findCatalogJsonFiles(OUTPUTS_ROOT);
  console.log(`Found ${jsonFiles.length} catalog JSON companion file(s) in outputs/.\n`);

  jsonFiles.sort().forEach(jsonPath => {
    const dir       = path.dirname(jsonPath);
    const rawPath   = path.join(dir, 'raw_data', 'oca_raw_data_full.json');
    const fileBase  = path.basename(jsonPath, '_Catalog.json');
    const xlsxPath  = path.join(dir, `${fileBase}_OCA_Catalog.xlsx`);

    if (!fs.existsSync(rawPath)) {
      console.warn(`  ⚠️ Skipping ${fileBase}: raw data file not found at ${rawPath}`);
      return;
    }

    console.log(`\nRebuilding ${fileBase}...`);
    try {
      execSync(`node "${path.join(__dirname, 'build_catalog.js')}" "${rawPath}" "${jsonPath}"`, { stdio: 'inherit', cwd: PROJECT_ROOT });
      execSync(`node "${path.join(__dirname, 'generate_xlsx.js')}" "${xlsxPath}"`, { stdio: 'inherit', cwd: PROJECT_ROOT });
      console.log(`  ✅ Rebuilt: ${fileBase}`);
    } catch (err) {
      console.error(`  ❌ Failed rebuilding ${fileBase}:`, err.message);
    }
  });

  console.log('\n================================================================');
  console.log('🎉 REBUILD COMPLETE!');
  console.log('================================================================\n');
}

if (require.main === module) {
  rebuildAll();
}

module.exports = { rebuildAll };
