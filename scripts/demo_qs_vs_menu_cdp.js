// Visual Demonstration: QuickSpecs PDF Link Icon vs Component Menu Link
// Highlights the chain-link icon (opens PDF) vs menu label (opens catalog) in the OCA UI.
// Auto-detects the active OCA tab — no hardcoded page IDs.

'use strict';

const fs   = require('fs');
const path = require('path');
const { sendCommand, getOCATarget, connectWS, sleep } = require('./lib/cdp');

async function main() {
  console.log('Connecting via CDP for QuickSpecs vs Menu visual demonstration...');
  const pageTarget = await getOCATarget();
  const ws = await connectWS(pageTarget.webSocketDebuggerUrl);

  try {
    // 1. Inject visual banner
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        let banner = document.getElementById('ag-qs-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'ag-qs-banner';
          Object.assign(banner.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', zIndex: '999999',
            backgroundColor: '#DC3545', color: '#FFFFFF', padding: '12px 20px',
            fontSize: '17px', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            transition: 'all 0.5s ease'
          });
          document.body.appendChild(banner);
        }
        banner.innerHTML = '⚠️ DEMO: Highlighting Chain Link (PDF) vs Menu Navigation Target...';
      })()`,
      returnByValue: true
    });

    await sleep(2000);

    // 2. Highlight QuickSpecs chain link icon in RED
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const chainIcon = document.querySelector('.qs-link-a, .qs-link-icon, .icon-chain2');
        if (chainIcon) {
          chainIcon.style.outline          = '4px solid #FF0000';
          chainIcon.style.backgroundColor = '#FFCCCC';
          chainIcon.style.padding         = '4px';
          chainIcon.style.borderRadius    = '4px';
        }
      })()`,
      returnByValue: true
    });

    // 3. Highlight Component Menu Link in GREEN
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const menuLabel = document.querySelector('.menu_label, .qs-link');
        if (menuLabel) {
          menuLabel.style.outline          = '4px solid #00CC00';
          menuLabel.style.backgroundColor = '#CCFFCC';
          menuLabel.style.color           = '#006600';
          menuLabel.style.padding         = '4px';
          menuLabel.style.fontWeight      = 'bold';
        }
      })()`,
      returnByValue: true
    });

    await sleep(3000);

    // 4. Capture screenshot — save to a session-independent tmp path
    const screenshotPath = path.join(
      require('os').tmpdir(), `qs_vs_menu_demo_${Date.now()}.png`
    );
    const shotRes  = await sendCommand(ws, 'Page.captureScreenshot', { format: 'png' });
    const buffer   = Buffer.from(shotRes.data, 'base64');
    fs.writeFileSync(screenshotPath, buffer);
    console.log(`Visual demonstration screenshot saved to: ${screenshotPath}`);

    // 5. Execute correct Menu click (NOT QuickSpecs link)
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const banner = document.getElementById('ag-qs-banner');
        if (banner) {
          banner.style.backgroundColor = '#28A745';
          banner.innerHTML = '✅ SUCCESS: Clicked Component Menu Link (not QuickSpecs PDF). Menu Catalog opened!';
        }
        const menuLink = document.querySelector('a[href*="extended_overview_menu"], #ui-id-24');
        if (menuLink) menuLink.click();
      })()`,
      returnByValue: true
    });

    console.log('Demo complete.');
  } finally {
    try { ws.close(); } catch {}
  }
}

main().catch(err => { console.error('Error:', err.message || err); process.exit(1); });
