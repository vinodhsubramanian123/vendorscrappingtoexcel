'use strict';
/**
 * scripts/lib/registry.js — Shared Master Catalog Registry Updater
 *
 * Maintains outputs/SCRAPED_CATALOGS.md table of scraped product catalogs.
 * Imported by scrape_oca_solution.js, scrape_oca_storage_solution.js, and sync_registry.js (DRY).
 */

const fs   = require('fs');
const path = require('path');
const { toForwardSlash } = require('./fs_compat');

const PROJECT_ROOT  = path.resolve(__dirname, '..', '..');
const OUTPUTS_ROOT  = path.join(PROJECT_ROOT, 'outputs');
const REGISTRY_PATH = path.join(OUTPUTS_ROOT, 'SCRAPED_CATALOGS.md');

/**
 * Update outputs/SCRAPED_CATALOGS.md with a new or updated scrape entry.
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

  // Convert all paths to clean repository-relative paths
  const relXlsx = toForwardSlash(path.relative(PROJECT_ROOT, info.xlsxPath));
  const relJson = toForwardSlash(path.relative(PROJECT_ROOT, info.jsonPath));
  const relPdf  = info.pdfPath ? toForwardSlash(path.relative(PROJECT_ROOT, info.pdfPath)) : null;
  const pdfStr  = relPdf ? `[PDF](${relPdf})` : 'Advisory (No QS Link)';

  const normOutputDir = toForwardSlash(info.outputDir);
  const relOutputDir  = normOutputDir.replace(/.*\/outputs\//, 'outputs/').replace(/\/+$/, '') + '/';

  const skuDisplayCount = info.skuCount !== undefined ? info.skuCount : (info.tablesCount || 0);

  const newRow =
    `| ${dateStr} | ${info.solutionName || 'OCA Solution'} | ${info.family} | ` +
    `${info.gen} | \`${info.chassisName}\` | **${skuDisplayCount}** | ` +
    `[${path.basename(relXlsx)}](${relXlsx}) | [${path.basename(relJson)}](${relJson}) | ` +
    `${pdfStr} | \`${relOutputDir}\` |\n`;

  // Check if an existing row matches this output folder
  const lines = content.split('\n');
  const existingLineIndex = lines.findIndex(line => line.includes(`\`${relOutputDir}\``));

  if (existingLineIndex > -1) {
    // Update row in place
    lines[existingLineIndex] = newRow.trim();
    content = lines.join('\n');
    fs.writeFileSync(REGISTRY_PATH, content);
    console.log(`Updated existing row in Master Registry for: ${relOutputDir}`);
  } else {
    // Append new row
    const divider = '| :--- | :--- | :--- | :--- | :--- | ---: | :--- | :--- | :--- | :--- |\n';
    if (content.includes(divider)) {
      content = content.replace(divider, divider + newRow);
    } else {
      content += newRow;
    }
    fs.writeFileSync(REGISTRY_PATH, content);
    console.log(`Added new row to Master Registry: ${relOutputDir}`);
  }
}

module.exports = { updateScrapedRegistry, REGISTRY_PATH };
