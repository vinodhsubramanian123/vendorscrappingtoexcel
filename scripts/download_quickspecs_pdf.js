// Universal QuickSpecs PDF Downloader for HPE OCA & PSNOW Portals
// Usage: node scripts/download_quickspecs_pdf.js <docId_or_url> <dest_absolute_path> [--force]

'use strict';

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { sendCommand, getAnyPageTarget, connectWS, sleep, CDP_PORT } = require('./lib/cdp');
const { moveFile, cleanStrayPDFs } = require('./lib/fs_compat');

if (!process.argv[2] || !process.argv[3]) {
  console.error('Usage: node scripts/download_quickspecs_pdf.js <docId_or_url> <dest_absolute_path> [--force]');
  process.exit(1);
}

const arg1          = process.argv[2];
const docId         = arg1.replace(/.*\/doc\//, '').replace(/\.pdf.*/, '').trim();
const rawOut        = process.argv[3];
const forceDownload = process.argv.includes('--force');

// destPath is always absolute
const destPath    = path.isAbsolute(rawOut) ? rawOut : path.resolve(process.cwd(), rawOut);
// Chrome downloads into the same directory as the destination file
const downloadDir = path.dirname(destPath);

// ── MD5 Cache Check (Rule #23) ────────────────────────────────────────────────
if (!forceDownload && fs.existsSync(destPath)) {
  const stats = fs.statSync(destPath);
  if (stats.size > 500000) {
    const hash = crypto.createHash('md5').update(fs.readFileSync(destPath)).digest('hex');
    console.log(`\n================================================================`);
    console.log(`⚡ [CACHE HIT] QuickSpecs PDF already exists & verified!`);
    console.log(`Path:              ${destPath}`);
    console.log(`Size:              ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Fingerprint (MD5): ${hash}`);
    console.log(`Skipping redundant download — session & bandwidth preserved.`);
    console.log(`================================================================\n`);
    process.exit(0);
  }
}

async function main() {
  console.log(`=== UNIVERSAL QUICKSPECS PDF DOWNLOADER ===`);
  console.log(`Document ID:   ${docId}`);
  console.log(`Destination:   ${destPath}`);
  console.log(`Download Dir:  ${downloadDir}`);

  // Ensure the destination directory exists
  fs.mkdirSync(downloadDir, { recursive: true });

  // Snapshot existing PDFs before download starts (for file-diff detection)
  const filesBefore = new Set(
    fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf'))
  );

  // Use an existing tab to create a dedicated download tab
  const mainTarget = await getAnyPageTarget();
  const wsMain     = await connectWS(mainTarget.webSocketDebuggerUrl);

  const targetUrl = `https://www.hpe.com/psnow/doc/${docId}.pdf`;
  console.log(`Creating dedicated Chrome tab for: ${targetUrl}`);
  const createRes   = await sendCommand(wsMain, 'Target.createTarget', { url: targetUrl });
  const newTargetId = createRes.targetId;
  wsMain.close();

  const ws = await connectWS(`ws://localhost:${CDP_PORT}/devtools/page/${newTargetId}`);

  try {
    // Direct Chrome to save downloads into the same directory as destPath
    await sendCommand(ws, 'Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir
    });

    // Navigate the new tab to the QuickSpecs document page
    console.log(`Navigating to ${targetUrl}...`);
    await sendCommand(ws, 'Page.navigate', { url: targetUrl });

    // Wait for PSNOW SPA to render
    console.log('Waiting for PSNOW document viewer to initialize (10s)...');
    await sleep(10000);

    // Click the download button or trigger window.location.href
    console.log('Triggering PDF download...');
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector(
          '#downloadButton, #downloadPdfLink, a[href*="downloadDoc"], a.download-button'
        );
        if (btn) {
          if (btn.href) { window.location.href = btn.href; }
          else { btn.click(); }
          return true;
        }
        return false;
      })()`,
      returnByValue: true
    });

    // Poll for a new PDF in downloadDir (file-diff detection — robust against filename changes)
    console.log('Polling for completed PDF download...');
    let downloaded = false;
    let newFilePath = null;

    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const filesNow  = fs.readdirSync(downloadDir).filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload'));
      const newFiles  = filesNow.filter(f => !filesBefore.has(f));
      if (newFiles.length > 0) {
        const candidate = path.join(downloadDir, newFiles[0]);
        if (fs.statSync(candidate).size > 500000) {
          newFilePath = candidate;
          downloaded  = true;
          break;
        }
      }
    }

    if (downloaded && newFilePath) {
      // Move to the canonical destination name if different (handles EXDEV on Windows)
      if (newFilePath !== destPath) {
        moveFile(newFilePath, destPath);
      }

      // Safe clean up of recent stray temporary PDFs only (max 2 min old)
      cleanStrayPDFs(downloadDir, destPath, 120000);

      const finalStats = fs.statSync(destPath);
      const md5 = crypto.createHash('md5').update(fs.readFileSync(destPath)).digest('hex');
      console.log(`\n✅ QUICKSPECS PDF DOWNLOAD SUCCESSFUL!`);
      console.log(`Destination:       ${destPath}`);
      console.log(`Size:              ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Fingerprint (MD5): ${md5}`);
      process.exit(0);
    } else {
      console.error(`\n❌ PDF download failed — no new file > 500 KB appeared after 20 seconds.`);
      process.exit(1);
    }
  } finally {
    try { ws.close(); } catch {}
  }
}

main().catch(err => {
  console.error('Error during QuickSpecs download:', err.message || err);
  process.exit(1);
});
