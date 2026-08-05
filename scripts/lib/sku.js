'use strict';
/**
 * scripts/lib/sku.js — Centralized HPE SKU Normalization & Validation Utility
 *
 * Provides authoritative regexes and methods for extracting, validating,
 * and categorizing HPE hardware SKUs, option suffixes, and service SKUs.
 */

// Universal HPE SKU Regex
// Matches:
// 1. Hyphenated hardware SKUs: P73282-B21, 867796-B21, P07646-B21
// 2. 6-character hardware SKUs: C0H28A, Q2R32A, BC002A, N9X06A, TC480A
// 3. Service SKUs: H7J34A3, HA114A1, HU4A6E, U4391E, R4H12A, S2S05A
const HPE_SKU_REGEX = /^([A-Z0-9]{3,8}-[A-Z0-9]{3,4}|[A-Z0-9]{6}|[HURS][A-Z0-9]{4,7})$/i;

// Match SKU within text with optional CTO/BTO/FIO suffix
const HPE_SKU_EXTRACT_REGEX = /\b([A-Z0-9]{3,8}-[A-Z0-9]{3,4}(?:CTO|BTO|FIO)?|[A-Z0-9]{6}(?:CTO|BTO|FIO)?|[HURS][A-Z0-9]{4,7}(?:CTO|BTO|FIO)?)\b/i;

/**
 * Validate whether a string is a valid HPE SKU.
 * @param {string} skuStr
 * @returns {boolean}
 */
function isValidHpeSKU(skuStr) {
  if (!skuStr) return false;
  const clean = cleanBaseSKU(skuStr).trim();
  // Filter out internal DOM pattern IDs (e.g. pat0, 00300)
  if (/pat0|00300/i.test(clean)) return false;
  return HPE_SKU_REGEX.test(clean);
}

/**
 * Strip CTO / BTO / FIO suffix from SKU string.
 * @param {string} skuStr e.g. "P73282-B21CTO" -> "P73282-B21"
 * @returns {string}
 */
function cleanBaseSKU(skuStr) {
  if (!skuStr) return '';
  return String(skuStr).trim().replace(/(CTO|BTO|FIO)$/i, '');
}

/**
 * Determine Option Type based on SKU suffix.
 * @param {string} skuStr
 * @returns {'CTO' | 'BTO' | 'FIO' | 'Standard'}
 */
function classifyOptionType(skuStr) {
  const str = String(skuStr || '').trim().toUpperCase();
  if (str.endsWith('CTO')) return 'CTO';
  if (str.endsWith('BTO')) return 'BTO';
  if (str.endsWith('FIO')) return 'FIO';
  return 'Standard';
}

module.exports = {
  HPE_SKU_REGEX,
  HPE_SKU_EXTRACT_REGEX,
  isValidHpeSKU,
  cleanBaseSKU,
  classifyOptionType
};
