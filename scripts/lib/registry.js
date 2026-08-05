'use strict';
/**
 * scripts/lib/registry.js — Shared Master Catalog Registry Updater
 *
 * Maintains outputs/SCRAPED_CATALOGS.md table of scraped product catalogs.
 * Imported by scrape_oca_solution.js and scrape_oca_storage_solution.js (DRY).
 */

const fs   = require('fs');
const path = require('path');
const { toForwardSlash } = require('./fs_compat');

const PROJECT_ROOT  = path.resolve(__dirname, '..', '..');
const OUTPUTS_ROOT  = path.join(PROJECT_ROOT, 'outputs');
const REGISTRY_PATH = path.join(OUTPUTS_ROOT, 'SCRAPED_CATALOGS.md');

/**
 * Update outputs/SCRAPED_CATALOGS.md with a new scrape entry.
 * @param {object} info - Scrape details object
 */
function updateScrapedRegistry(info) {
  let content = '';

  if (fs.existsSync(REGISTRY_PATH)) {
    content = fs.readFileSync(REGISTRY_PATH, 'utf-8');
  } else {
    content =
      `# Master Scraped HPE Product Catalogs Registry\n\n` +
      `## Scraped Product Catalogs\n\n` +
      `| Date | Solution Name | Family | Gen | Chassis (prefix) | Total SKUs | Excel | JSON | PDF | Output Folder |\n` +
      `| :--- | :--- | :--- | :--- | :--- | ---: | :--- | :--- | :--- | :--- |\n`;
  }

  const dateStr  = (info.timestamp || new Date().toISOString()).substring(0, 10);
  const pdfPath  = info.pdfPath ? toForwardSlash(info.pdfPath) : null;
  const xlsxPath = toForwardSlash(info.xlsxPath);
  const jsonPath = toForwardSlash(info.jsonPath);
  const pdfStr   = pdfPath ? `[PDF](${pdfPath})` : 'Advisory (No QS Link)';

  const normOutputDir = toForwardSlash(info.outputDir);
  const relOutputDir  = normOutputDir.replace(/.*\/outputs\//, 'outputs/');

  const skuDisplayCount = info.skuCount !== undefined ? info.skuCount : (info.tablesCount || 0);

  const newRow =
    `| ${dateStr} | ${info.solutionName || 'OCA Solution'} | ${info.family} | ` +
    `${info.gen} | \`${info.chassisName}\` | **${skuDisplayCount}** | ` +
    `[${path.basename(xlsxPath)}](${xlsxPath}) | [${path.basename(jsonPath)}](${jsonPath}) | ` +
    `${pdfStr} | \`${relOutputDir}/\` |\n`;

  // Dedup by relative output folder cell match
  const isDuplicate = content.includes(`\`${relOutputDir}/\``) || content.includes(normOutputDir);

  if (!isDuplicate) {
    const divider = '| :--- | :--- | :--- | :--- | :--- | ---: | :--- | :--- | :--- | :--- |\n';
    if (content.includes(divider)) {
      content = content.replace(divider, divider + newRow);
    } else {
      content += newRow;
    }
    fs.writeFileSync(REGISTRY_PATH, content);
    console.log(`Updated Master Registry: ${REGISTRY_PATH}`);
  } else {
    console.log(`Registry already has entry for: ${relOutputDir} — skipping duplicate.`);
  }
}

module.exports = { updateScrapedRegistry, REGISTRY_PATH };
