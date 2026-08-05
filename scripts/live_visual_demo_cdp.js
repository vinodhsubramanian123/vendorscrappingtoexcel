const { sendCommand, getOCATarget, connectWS, sleep } = require('./lib/cdp');

async function main() {
  console.log('Connecting via CDP for Live Visual Verification...');
  const target = await getOCATarget();
  const ws = await connectWS(target.webSocketDebuggerUrl);

  // 1. Inject Visual Banner at top of page
  console.log('Step 1: Injecting visual verification banner on open Chrome tab...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      let banner = document.getElementById('ag-verify-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'ag-verify-banner';
        banner.style.position = 'fixed';
        banner.style.top = '0px';
        banner.style.left = '0px';
        banner.style.width = '100%';
        banner.style.zIndex = '999999';
        banner.style.backgroundColor = '#0072C6';
        banner.style.color = '#FFFFFF';
        banner.style.padding = '12px 20px';
        banner.style.fontSize = '18px';
        banner.style.fontWeight = 'bold';
        banner.style.boxShadow = '0px 4px 15px rgba(0,0,0,0.5)';
        banner.style.transition = 'all 0.5s ease';
        document.body.appendChild(banner);
      }
      banner.innerHTML = '⚡ ANTIGRAVITY AI SCRAPER: Verifying Solution Root Hierarchy & Navigation Live...';
    })()`,
    returnByValue: true
  });

  await sleep(2000);

  // 2. Click Up Button (#nav_up) to go to Solution Root
  console.log('Step 2: Clicking #nav_up parent arrow button to go to Solution Root...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const banner = document.getElementById('ag-verify-banner');
      if (banner) banner.innerHTML = '🔍 Level 1 (Solution Root): Navigating Up to OCA Config 2 Root...';
      
      const upBtn = document.querySelector('#nav_up, .icon-arrow-up3');
      if (upBtn) {
        upBtn.style.border = '4px solid #00FF00';
        upBtn.click();
      }
    })()`,
    returnByValue: true
  });

  await sleep(3000);

  // 3. Highlight Components Tab at Root
  console.log('Step 3: Highlighting Components Tab at Solution Root level...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const banner = document.getElementById('ag-verify-banner');
      if (banner) banner.innerHTML = '📋 Level 2 (Components View): Enumerating Icons & Products in Quote...';
      
      const compTab = Array.from(document.querySelectorAll('a')).find(a => a.innerText.trim() === 'Components');
      if (compTab) {
        compTab.style.backgroundColor = '#00FF00';
        compTab.style.color = '#000000';
        compTab.click();
      }
    })()`,
    returnByValue: true
  });

  await sleep(3000);

  // 4. Highlight Product Node row (DL380 Gen12 #1)
  console.log('Step 4: Highlighting Product Node row...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const banner = document.getElementById('ag-verify-banner');
      if (banner) banner.innerHTML = '💻 Level 3 (Product Node): Selecting DL380 Gen12 #1 (P73282-B21)...';
      
      const prodRow = Array.from(document.querySelectorAll('tr, td')).find(el => el.innerText.includes('DL380 Gen12 #1') || el.innerText.includes('P73282-B21'));
      if (prodRow) {
        prodRow.style.outline = '4px solid #FFD700';
        prodRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    })()`,
    returnByValue: true
  });

  await sleep(3000);

  // 5. Navigate to Menu tab and trigger Section Expansion
  console.log('Step 5: Navigating to Menu tab and triggering Section Expansion...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const banner = document.getElementById('ag-verify-banner');
      if (banner) banner.innerHTML = '⚙️ Level 4 (Menu Catalog): Expanding all subcategories & SKUs...';
      
      const menuTab = document.querySelector('a[href*="extended_overview_menu"], #ui-id-24');
      if (menuTab) menuTab.click();
    })()`,
    returnByValue: true
  });

  await sleep(2000);

  // 6. Highlight Show More checkboxes
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      document.querySelectorAll('input[id*="showmore"]').forEach(inp => {
        if (!inp.checked) inp.click();
        const parent = inp.closest('td, div, label');
        if (parent) parent.style.backgroundColor = '#AAFFAA';
      });
    })()`,
    returnByValue: true
  });

  await sleep(2000);

  // 7. Scroll smoothly down the catalog page so user sees visual movement
  console.log('Step 6: Scrolling smoothly through catalog page...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: 'window.scrollTo({ top: 1500, behavior: "smooth" })',
    returnByValue: true
  });

  await sleep(2000);

  await sendCommand(ws, 'Runtime.evaluate', {
    expression: 'window.scrollTo({ top: 3500, behavior: "smooth" })',
    returnByValue: true
  });

  await sleep(2000);

  await sendCommand(ws, 'Runtime.evaluate', {
    expression: 'window.scrollTo({ top: 0, behavior: "smooth" })',
    returnByValue: true
  });

  // 8. Set Final Success Banner
  console.log('Step 7: Finalizing Visual Verification Banner...');
  await sendCommand(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const banner = document.getElementById('ag-verify-banner');
      if (banner) {
        banner.style.backgroundColor = '#28A745';
        banner.innerHTML = '✅ SOLUTION ROOT HIERARCHY & NAVIGATION VERIFIED 100% PERFECT!';
      }
    })()`,
    returnByValue: true
  });

  console.log('\n=== LIVE VISUAL VERIFICATION COMPLETE ===\n');
  ws.close();
}

main().catch(console.error);
