'use strict';
/**
 * scripts/lib/catalog_discovery.js — Catalog Discovery & Portfolio Listing API
 *
 * Provides reusable functions for enumerating scraped catalogs, reading catalog details,
 * collecting KnowledgeDeltas, and checking CDP health. Extracted from observability_status.js
 * to support programmatic access from dashboard server.js and --json CLI modes.
 */

const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUTS_ROOT = path.join(PROJECT_ROOT, 'outputs');

/**
 * Check if CDP port 9222 is alive and return list of open page targets.
 * @param {number} port
 * @returns {Promise<{ ok: boolean, pages: Array<object> }>}
 */
function checkCdpHealth(port = 9222) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const pages = targets.filter(t => t.type === 'page');
          const ocaPage = pages.find(p => (p.url || '').includes('oca.ext.hpe.com'));
          resolve({ ok: true, pages, hasActiveOca: !!ocaPage });
        } catch {
          resolve({ ok: false, pages: [], hasActiveOca: false });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, pages: [], hasActiveOca: false }));
    req.setTimeout(1500, () => { req.destroy(); resolve({ ok: false, pages: [], hasActiveOca: false }); });
  });
}

/**
 * Recursively find all *_Catalog.json files under a directory.
 * @param {string} dir
 * @returns {Array<string>} Absolute paths to catalog JSON files
 */
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

/**
 * List all available catalogs with summary metadata.
 * @param {string} outputsRoot Optional override for outputs directory
 * @returns {Array<object>} Array of catalog summary objects
 */
function listAllCatalogs(outputsRoot = OUTPUTS_ROOT) {
  const catalogJsons = findCatalogJsonFiles(outputsRoot);
  const catalogs = [];

  catalogJsons.sort().forEach(jsonPath => {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      const meta = data.metadata || {};
      const dir  = path.dirname(jsonPath);
      const fileBase = path.basename(jsonPath, '_Catalog.json');

      const xlsxPath = path.join(dir, `${fileBase}_OCA_Catalog.xlsx`);
      let pdfPath = path.join(dir, `HPE_${fileBase}_QuickSpecs.pdf`);
      if (!fs.existsSync(pdfPath)) {
        const pdfs = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
        pdfPath = pdfs.length > 0 ? path.join(dir, pdfs[0]) : null;
      }

      let pdfInfo = null;
      if (pdfPath && fs.existsSync(pdfPath)) {
        const pStat = fs.statSync(pdfPath);
        const md5 = crypto.createHash('md5').update(fs.readFileSync(pdfPath)).digest('hex').substring(0, 8);
        pdfInfo = {
          path: pdfPath,
          sizeMb: parseFloat((pStat.size / 1024 / 1024).toFixed(2)),
          md5Prefix: md5
        };
      }

      const historyDir = path.join(dir, 'history');
      const hasDiffHistory = fs.existsSync(historyDir) &&
        fs.readdirSync(historyDir).some(f => f.startsWith('catalog_') && f.endsWith('.json'));

      catalogs.push({
        id: fileBase,
        chassis: meta.chassis || fileBase,
        skuCount: meta.totalUniqueSKUs || 0,
        totalSubcategories: meta.totalSubcategories || 0,
        totalTables: meta.totalTables || 0,
        scrapeDate: meta.scrapeDate || null,
        catalogJsonPath: jsonPath,
        catalogDir: dir,
        relativeDir: path.relative(PROJECT_ROOT, dir),
        hasExcel: fs.existsSync(xlsxPath),
        xlsxPath: fs.existsSync(xlsxPath) ? xlsxPath : null,
        pdf: pdfInfo,
        hasDiffHistory
      });
    } catch {}
  });

  return catalogs;
}

/**
 * Read full catalog detail for a specific catalog JSON path.
 * @param {string} catalogJsonPath Absolute path to *_Catalog.json
 * @returns {object|null} Parsed catalog data or null
 */
function getCatalogDetail(catalogJsonPath) {
  if (!fs.existsSync(catalogJsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(catalogJsonPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Recursively collect all KnowledgeDeltas from catalog_deltas.json files.
 * @param {string} dir Starting directory
 * @returns {Array<object>} All deltas
 */
function collectKnowledgeDeltas(dir = OUTPUTS_ROOT) {
  let deltas = [];
  if (!fs.existsSync(dir)) return deltas;

  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (file.startsWith('.')) return;
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        deltas = deltas.concat(collectKnowledgeDeltas(filePath));
      } else if (file === 'catalog_deltas.json') {
        try {
          const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (Array.isArray(parsed)) deltas.push(...parsed);
        } catch {}
      }
    } catch {}
  });

  return deltas;
}

/**
 * Auto-detect the chassis output directory from BOQ items by matching base SKUs.
 * Returns detailed detection metadata including confidenceScore and user confirmation triggers.
 * @param {Array<object>} boqItems Consolidated BOQ items
 * @returns {object} { chassisDir, matchType, confidenceScore, requiresUserConfirmation, detectedVariant }
 */
function autoDetectChassisDetailed(boqItems = []) {
  try {
    const { detectChassisVariant } = require('./conflict_graph');
    const variant = detectChassisVariant(boqItems);

    const catalogs = listAllCatalogs();
    const modelClean = variant.model.replace(/\s+/g, '_').replace(/HPE_?/i, '');

    // 1. Try exact match by model or base SKU
    if (variant.baseSku && variant.baseSku !== 'CUSTOM_OVERRIDE' && variant.baseSku !== 'P73282-B21') {
      for (const cat of catalogs) {
        if (cat.id === modelClean || cat.chassis.includes(variant.model) || cat.catalogDir.includes(variant.model.replace(/\s+/g, '_'))) {
          return {
            chassisDir: cat.catalogDir,
            matchType: 'EXACT',
            confidenceScore: 0.95,
            requiresUserConfirmation: false,
            detectedVariant: variant
          };
        }
      }
    }

    // 2. Try exact model match
    for (const cat of catalogs) {
      if (cat.id === modelClean || cat.chassis.includes(variant.model)) {
        return {
          chassisDir: cat.catalogDir,
          matchType: 'EXACT',
          confidenceScore: 0.90,
          requiresUserConfirmation: false,
          detectedVariant: variant
        };
      }
    }

    // 3. Try fuzzy match by family + form factor
    for (const cat of catalogs) {
      const catLower = cat.id.toLowerCase();
      if (catLower.includes(variant.formFactor.toLowerCase()) &&
          catLower.includes(variant.family.toLowerCase().substring(0, 4))) {
        return {
          chassisDir: cat.catalogDir,
          matchType: 'FUZZY',
          confidenceScore: 0.70,
          requiresUserConfirmation: true, // Q2: Low confidence requires user confirmation
          detectedVariant: variant
        };
      }
    }
  } catch {}

  // 4. Ultimate fallback
  const catalogs = listAllCatalogs();
  const fallbackDir = catalogs.length > 0 ? catalogs[0].catalogDir : '';

  return {
    chassisDir: fallbackDir,
    matchType: 'FALLBACK',
    confidenceScore: 0.40,
    requiresUserConfirmation: true, // Q2: Fallback triggers user confirmation prompt
    detectedVariant: { model: 'Default Fallback Chassis', formFactor: 'SFF', family: 'ProLiant' }
  };
}

function autoDetectChassisDir(boqItems = []) {
  return autoDetectChassisDetailed(boqItems).chassisDir;
}

module.exports = {
  checkCdpHealth,
  findCatalogJsonFiles,
  listAllCatalogs,
  getCatalogDetail,
  collectKnowledgeDeltas,
  autoDetectChassisDir,
  autoDetectChassisDetailed
};
