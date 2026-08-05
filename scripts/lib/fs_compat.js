'use strict';
/**
 * scripts/lib/fs_compat.js — Cross-Platform Filesystem Helpers
 *
 * Safe file movement across drives (Windows EXDEV fallback), path normalization,
 * and safe directory cleanup.
 */

const fs   = require('fs');
const path = require('path');

/**
 * Move a file cross-platform. Handles EXDEV error when moving across drive boundaries on Windows.
 * @param {string} src
 * @param {string} dest
 */
function moveFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
}

/**
 * Normalize path to forward slashes for cross-platform regex matching and Markdown links.
 * @param {string} p
 * @returns {string}
 */
function toForwardSlash(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/');
}

/**
 * Safe PDF cleanup helper — only removes stray PDFs created within maxAgeMs (default: 2 minutes)
 * to avoid deleting unrelated user documents.
 * @param {string} dir
 * @param {string} destPath
 * @param {number} [maxAgeMs=120000]
 */
function cleanStrayPDFs(dir, destPath, maxAgeMs = 120000) {
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  const files = fs.readdirSync(dir);

  for (const file of files) {
    if (!file.endsWith('.pdf')) continue;
    const fullPath = path.join(dir, file);
    if (path.resolve(fullPath) === path.resolve(destPath)) continue;

    try {
      const stats = fs.statSync(fullPath);
      if (now - stats.mtimeMs <= maxAgeMs) {
        fs.unlinkSync(fullPath);
        console.log(`Cleaned stray temporary PDF: ${file}`);
      }
    } catch {}
  }
}

module.exports = { moveFile, toForwardSlash, cleanStrayPDFs };
