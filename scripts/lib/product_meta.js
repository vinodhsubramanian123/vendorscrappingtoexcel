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
  const modelMatch = fullText.match(/\b(DL\d{3}|ML\d{3}|RL\d{3}|SY\d{3}|GX\d{4}|MicroServer|MSL\d{4}|Alletra\s*\d{4}|Nimble\s*[A-Z0-9]+|StoreOnce\s*\d{4}|MSA\s*\d{4}|2060|2062|1060|2050|5010|5030|5050|6000|9000)\b/i);
  const formFactorMatch = fullText.match(/\b(SFF|LFF|NHP|CTO|Compute|Storage|Enclosure|Frame|Rack)\b/i);

  let cleanName = '';
  if (modelMatch) {
    const model = modelMatch[0].replace(/\s+/g, '_');
    const ff    = formFactorMatch ? formFactorMatch[0].toUpperCase() : '';
    cleanName   = `${model}_${gen}${ff ? '_' + ff : ''}`;
  } else {
    cleanName = rawText
      .replace(/Collapse All|Expand All|Expand Subsections|Undo Selection|Remove Defaults|View HPE Recommended only/gi, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  // Ensure cleanName is valid
  cleanName = cleanName.replace(/^HPE_/i, '').replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');

  return { family, gen, cleanName };
}

module.exports = { parseProductMeta };
