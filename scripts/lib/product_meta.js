'use strict';
/**
 * scripts/lib/product_meta.js — Universal Product Meta Detection
 *
 * Consolidated parser for detecting product family, generation, and clean model shorthand
 * across ProLiant, Synergy, Alletra, Nimble, StoreOnce, MSA, StoreEver, Cray, etc.
 */

function parseProductMeta(rawText, pageTitle = '') {
  const fullText = `${rawText || ''} ${pageTitle || ''}`;

  // 1. Generation Detection
  const genMatch = fullText.match(/Gen\d+(?:Plus)?/i);
  let gen = genMatch ? genMatch[0] : 'General';
  if (gen === 'General' && /tape|msl|storeever/i.test(fullText)) gen = 'Tape';
  if (gen === 'General' && /alletra|nimble|storeonce|msa|simplivity/i.test(fullText)) gen = 'Storage';

  // 2. Family Detection
  let family = 'ProLiant';
  if (/synergy/i.test(fullText))                 family = 'Synergy';
  else if (/alletra/i.test(fullText))            family = 'Alletra';
  else if (/nimble/i.test(fullText))             family = 'Nimble';
  else if (/storeonce/i.test(fullText))          family = 'StoreOnce';
  else if (/msa/i.test(fullText))                family = 'MSA';
  else if (/msl|storeever|tape/i.test(fullText)) family = 'StoreEver';
  else if (/cray|gx\d/i.test(fullText))          family = 'Cray';
  else if (/superdome/i.test(fullText))          family = 'Superdome';
  else if (/edgeline/i.test(fullText))           family = 'Edgeline';
  else if (/simplivity/i.test(fullText))         family = 'SimpliVity';
  else if (/aruba/i.test(fullText))              family = 'Aruba';

  // 3. Model & Form Factor Detection
  const modelMatch = fullText.match(/\b(DL\d{3}|ML\d{3}|RL\d{3}|SY\d{3}|GX\d{4}|MicroServer|MSL\d{4}|Alletra\s*\d{4}|Nimble\s*[A-Z0-9]+|StoreOnce\s*\d{4}|MSA\s*\d{4}|2060|2062|1060|2050|5010|5030|5050|6000|9000|Virtual\s*Connect|VC\s*\d+Gb|100Gb\s*F32)\b/i);
  const formFactorMatch = fullText.match(/\b(SFF|LFF|NHP|CTO|Compute|Storage|Enclosure|Frame|Rack|Module)\b/i);

  let cleanName = '';
  if (modelMatch) {
    let model = modelMatch[0].replace(/\s+/g, '_');
    if (/100Gb|Virtual_Connect|F32/i.test(model)) model = 'SY100Gb_F32';
    const ff  = formFactorMatch ? formFactorMatch[0].toUpperCase() : '';
    cleanName = `${model}${gen && gen !== 'General' ? '_' + gen : ''}${ff ? '_' + ff : ''}`;
  } else {
    cleanName = rawText
      .replace(/Collapse All|Expand All|Expand Subsections|Undo Selection|Remove Defaults|View HPE Recommended only/gi, '')
      .replace(/\b[A-Z0-9]{3,8}-[A-Z0-9]{3,4}\b/gi, '') // Strip SKU IDs (Rule #15)
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  // Ensure cleanName is valid & free of verbose leading prefixes or stray trailing SKU IDs
  cleanName = cleanName
    .replace(/^HPE_/i, '')
    .replace(/_[A-Z0-9]{5,8}-[A-Z0-9]{3,4}$/i, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_');

  return { family, gen, cleanName };
}

/**
 * Dynamically classify component role from category name and item description.
 * Zero hardcoding — pattern matches across HPE ProLiant, Synergy, Alletra, StoreEver, Cray, etc.
 * @param {string} categoryName 
 * @param {string} itemDescription 
 * @returns {string} Dynamic component role
 */
function classifyComponentRole(categoryName = '', itemDescription = '') {
  const cat = String(categoryName).toLowerCase();
  const desc = String(itemDescription).toLowerCase();

  if (cat.includes('processor') || desc.includes('processor') || desc.includes('xeon') || desc.includes('epyc')) return 'Processor';
  if (cat.includes('memory') || desc.includes('memory') || desc.includes('rdimm') || desc.includes('ddr5')) return 'Memory';
  if (cat.includes('power') || desc.includes('power supply') || desc.includes('flex slot') || desc.includes('-48vdc')) return 'Power Supply';
  if (cat.includes('storage') || desc.includes('controller') || desc.includes('raid') || desc.includes('mr416i')) return 'Storage Controller';
  if (cat.includes('network') || desc.includes('ethernet') || desc.includes('ocp') || desc.includes('adapter')) return 'Network Adapter';
  if (cat.includes('drive') || desc.includes('cage') || desc.includes('hdd') || desc.includes('ssd')) return 'Drive Cage / Drive';
  if (cat.includes('fan') || cat.includes('cooling') || desc.includes('fan kit') || desc.includes('heatsink')) return 'Cooling / Thermal';
  if (cat.includes('support') || cat.includes('service') || desc.includes('tech care')) return 'Service & Support';

  return 'Option Component';
}

module.exports = {
  parseProductMeta,
  classifyComponentRole
};
