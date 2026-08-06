'use strict';
/**
 * scripts/lib/catalog_rules.js — Multi-Level Catalog Rules Parser & Dual Safety Net Loader
 *
 * Implements rule parsing and extraction across 5 explicit hierarchy levels:
 * 1. VENDOR      — Portal-wide rules, BTO vs CTO exclusions, customer account restrictions
 * 2. CHASSIS     — Form-factor constraints (SFF, LFF, EDSFF, Rack), thermal/ambient caps
 * 3. CATEGORY    — Category-wide mixing & mutual exclusion rules (Memory x4/x8, PSU AC/DC)
 * 4. SUBCATEGORY — Quantity constraints (max N, required), slot caps
 * 5. SKU         — Direct SKU-to-SKU dependencies and pairing requirements
 *
 * Dual Safety Net:
 * Loads `<prefix>_Catalog_Rules.json` first; if missing, falls back seamlessly to `<prefix>_Catalog.json`.
 */

const fs = require('fs');
const path = require('path');

/**
 * Classify a raw rule text into one of the 5 hierarchy levels and assign action type.
 * @param {string} ruleText 
 * @param {string} parentCategory 
 * @param {string} subCategory 
 * @returns {object} Rule structure
 */
function classifyRule(ruleText, parentCategory = '', subCategory = '') {
  const text = String(ruleText || '').trim();
  const lower = text.toLowerCase();

  let level = 'CATEGORY';
  let ruleType = 'MUTUAL_EXCLUSION';

  // Level classification
  if (lower.includes('bto') || lower.includes('cto base') || lower.includes('customer account') || lower.includes('supply constraints')) {
    level = 'VENDOR';
    ruleType = lower.includes('supply') ? 'SUPPLY_CONSTRAINT' : 'MODE_EXCLUSION';
  } else if (lower.includes('edsff') || lower.includes('8lff') || lower.includes('12lff') || lower.includes('8sff') || lower.includes('rack') || lower.includes('ambient temperature')) {
    level = 'CHASSIS';
    ruleType = 'CHASSIS_GATE';
  } else if (lower.includes('mixing') || lower.includes('cannot be selected together') || lower.includes('mixed with')) {
    level = 'CATEGORY';
    ruleType = 'MUTUAL_EXCLUSION';
  } else if (lower.includes('requires') || lower.includes('needed if') || lower.includes('supported only with')) {
    level = 'SKU';
    ruleType = 'DEPENDENCY_CHAIN';
  } else if (parentCategory || subCategory) {
    level = 'SUBCATEGORY';
    ruleType = 'SUBCATEGORY_RULE';
  }

  return {
    level,
    ruleType,
    parentCategory,
    subCategory,
    ruleText: text,
    isStrict: !lower.includes('recommended')
  };
}

/**
 * Load and parse all rules for a chassis directory using Dual Safety Net.
 * @param {string} targetDir E.g. "outputs/ProLiant/Gen12/DL380_Gen12_SFF"
 * @returns {object} { metadata, parsedRules: Array, subcategoryConstraints: Array, sourceFile, isFallback }
 */
function loadCatalogRules(targetDir) {
  const prefix = path.basename(targetDir);
  const rulesJsonPath = path.join(targetDir, `${prefix}_Catalog_Rules.json`);
  const catalogJsonPath = path.join(targetDir, `${prefix}_Catalog.json`);

  let rawData = null;
  let sourceFile = '';
  let isFallback = false;

  if (fs.existsSync(rulesJsonPath)) {
    try {
      rawData = JSON.parse(fs.readFileSync(rulesJsonPath, 'utf-8'));
      sourceFile = rulesJsonPath;
    } catch (_) {}
  }

  if (!rawData && fs.existsSync(catalogJsonPath)) {
    try {
      rawData = JSON.parse(fs.readFileSync(catalogJsonPath, 'utf-8'));
      sourceFile = catalogJsonPath;
      isFallback = true;
    } catch (_) {}
  }

  if (!rawData) {
    return {
      metadata: {},
      parsedRules: [],
      subcategoryConstraints: [],
      sourceFile: 'NONE',
      isFallback: false
    };
  }

  const parsedRules = [];

  // Extract from rules array if standalone Rules JSON
  if (Array.isArray(rawData.rules)) {
    rawData.rules.forEach(r => {
      parsedRules.push(classifyRule(r.rule || r.ruleText, r.parentCategory, r.subCategory));
    });
  } else if (Array.isArray(rawData.entries)) {
    // Extract from entries array if catalog JSON
    rawData.entries.forEach(e => {
      (e.rules || []).forEach(r => {
        parsedRules.push(classifyRule(r, e.parentCategory, e.subCategory));
      });
    });
  }

  const subcategoryConstraints = (rawData.subcategories || []).map(sc => ({
    parentCategory: sc.parentCategory,
    subCategory: sc.name,
    constraint: sc.constraint,
    maxQty: sc.maxQty,
    level: 'SUBCATEGORY'
  }));

  return {
    metadata: rawData.metadata || {},
    parsedRules,
    subcategoryConstraints,
    sourceFile,
    isFallback
  };
}

module.exports = {
  classifyRule,
  loadCatalogRules
};
