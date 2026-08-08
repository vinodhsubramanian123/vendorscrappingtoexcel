'use strict';
/**
 * scripts/lib/navigate_oca.js — Smart HPE Partner Portal & OCA Auto-Navigator
 *
 * Automates passage through HPE Partner Portal (partner.hpe.com) SSO authentication,
 * WebLogic tools catalog navigation, chassis search, base price extraction, and menu entry
 * using lightweight CDP (port 9222) WebSocket commands — without Playwright/Selenium bloat.
 */

const http = require('http');
const path = require('path');
const { sendCommand, connectWS, getOCATarget } = require('./cdp');

const CDP_PORT = 9222;

/**
 * List all open page targets in Chrome on port 9222.
 */
function getPageTargets() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          resolve(targets.filter(t => t.type === 'page'));
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', (err) => {
      reject(new Error(`Chrome remote debugging port ${CDP_PORT} is not accessible (${err.message}). Ensure Chrome is running with --remote-debugging-port=${CDP_PORT}.`));
    });
  });
}

/**
 * Automate navigation from Partner Portal or OCA Search page into target chassis Menu tab.
 * @param {string} chassisQuery E.g. "DL380 Gen12", "Alletra 9000", "Synergy 12000"
 * @param {object} [options] { autoScrape: boolean }
 * @returns {object} { targetUrl, pageId, baseChassisPriceUsd }
 */
async function navigateToOCAChassis(chassisQuery, options = {}) {
  const query = String(chassisQuery || 'DL380 Gen12').trim();
  console.log(`\n===============================================================`);
  console.log(`🧭 SMART HPE OCA PORTAL AUTO-NAVIGATOR`);
  console.log(`   Target Chassis Query: "${query}"`);
  console.log(`===============================================================\n`);

  const pages = await getPageTargets();

  // 1. Check if active OCA configuration page is already at Menu tab
  let ocaTarget = pages.find(t => t.url && t.url.includes('oca.ext.hpe.com'));

  if (ocaTarget) {
    console.log(`✅ Found active OCA tab: [${ocaTarget.id}] ${ocaTarget.title}`);
    const ws = await connectWS(ocaTarget.webSocketDebuggerUrl);

    // Test if already inside configuration Menu page
    const checkState = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `Boolean(document.querySelector('#extended_overview_menu') || document.querySelector('.menu_label') || document.body.scrollHeight > 5000)`
    });

    if (checkState && checkState.result && checkState.result.value) {
      console.log(`⚡ [ACTIVE SESSION] Already inside target OCA configuration page! Ready for scraping.`);
      ws.close();
      return {
        targetUrl: ocaTarget.url,
        pageId: ocaTarget.id,
        status: 'READY_AT_MENU_TAB'
      };
    }

    // 2. If at OCA Product Search / Catalog page: search chassis and configure
    console.log(`🔍 At OCA Product Search page. Entering chassis query: "${query}"...`);
    const navExpr = `
      (async function() {
        // Find search input
        const searchInput = document.querySelector('#searchProductInput') || 
                            document.querySelector('input[type="search"]') ||
                            document.querySelector('input[placeholder*="Search"]');
        if (searchInput) {
          searchInput.value = ${JSON.stringify(query)};
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Trigger search button or Enter key
          const searchBtn = document.querySelector('#searchButton') || document.querySelector('button[aria-label*="Search"]');
          if (searchBtn) searchBtn.click();
          else searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        }

        // Wait 3s for catalog search cards to render
        await new Promise(r => setTimeout(r, 3000));

        // Extract base chassis list price from card
        let basePrice = 0;
        const priceEl = document.querySelector('.price-value') || document.querySelector('[class*="price"]');
        if (priceEl) {
          const pText = priceEl.innerText.replace(/[^0-9.]/g, '');
          basePrice = parseFloat(pText) || 0;
        }

        // Find standard non-TAA CTO chassis configure button
        const configBtns = Array.from(document.querySelectorAll('button, a')).filter(el => {
          const txt = (el.innerText || '').toLowerCase();
          return txt.includes('configure') || txt.includes('customize') || txt.includes('create quote');
        });

        if (configBtns.length > 0) {
          configBtns[0].click();
          return { success: true, basePrice, action: 'CONFIG_CLICKED' };
        }

        return { success: false, basePrice, message: 'Configure button not found on search results page' };
      })()
    `;

    const navResult = await sendCommand(ws, 'Runtime.evaluate', { expression: navExpr, awaitPromise: true });
    ws.close();

    console.log(`⏳ Waiting for OCA WebLogic DOM to fully load configuration Menu tab...`);
    await new Promise(r => setTimeout(r, 6000));

    // Re-verify target page
    const updatedPages = await getPageTargets();
    const activeOca = updatedPages.find(t => t.url && t.url.includes('oca.ext.hpe.com'));

    return {
      targetUrl: activeOca ? activeOca.url : ocaTarget.url,
      pageId: activeOca ? activeOca.id : ocaTarget.id,
      baseChassisPriceUsd: navResult?.result?.value?.basePrice || 0,
      status: 'NAVIGATED_TO_CONFIG_PAGE'
    };
  }

  // 3. Check if Partner Portal (partner.hpe.com) is open
  const partnerTarget = pages.find(t => t.url && (t.url.includes('partner.hpe.com') || t.url.includes('login') || t.url.includes('sso')));
  if (partnerTarget) {
    console.log(`🌐 Found active HPE Partner Portal tab at: ${partnerTarget.url}`);

    // Detect if session is expired or at login screen
    const isLoginPage = partnerTarget.url.includes('login') || partnerTarget.url.includes('sso') || partnerTarget.url.includes('auth');
    if (isLoginPage) {
      console.log(`🔒 [AUTH_REQUIRED] Session expired or SSO login required.`);
      console.log(`   Please log into partner.hpe.com in your browser window. Auto-navigator is watching...`);

      // Poll until user completes login
      let retries = 0;
      while (retries < 60) {
        await new Promise(r => setTimeout(r, 3000));
        retries++;
        const currentPages = await getPageTargets();
        const activeTarget = currentPages.find(t => t.url && t.url.includes('partner.hpe.com') && !t.url.includes('login') && !t.url.includes('sso'));
        if (activeTarget) {
          console.log(`🎉 [AUTH_SUCCESS] Re-login detected! Resuming navigation to "${query}"...`);
          return navigateToOCAChassis(query, options);
        }
      }
    }

    console.log(`💡 Launching OCA tool from Partner Portal navigation bar...`);
    const partnerWs = await connectWS(partnerTarget.webSocketDebuggerUrl);
    const launchExpr = `
      (function() {
        const ocaLink = Array.from(document.querySelectorAll('a')).find(a => 
          (a.innerText || '').includes('OCA') || (a.href || '').includes('oca.ext.hpe.com')
        );
        if (ocaLink) {
          ocaLink.click();
          return true;
        }
        window.location.href = 'https://oca.ext.hpe.com';
        return true;
      })()
    `;

    await sendCommand(partnerWs, 'Runtime.evaluate', { expression: launchExpr });
    partnerWs.close();

    console.log(`⏳ Waiting for newly created OCA tab to initialize...`);
    await new Promise(r => setTimeout(r, 5000));

    // Recursively enter search & config steps
    return navigateToOCAChassis(query, options);
  }

  // 4. Fallback: Prompt user to log into Partner Portal in Chrome window
  console.log(`🔒 [AUTH_REQUIRED] No active Partner Portal or OCA session found on CDP port ${CDP_PORT}.`);
  console.log(`   Please open Chrome and log into https://partner.hpe.com. Watching for session...`);

  let waitAttempts = 0;
  while (waitAttempts < 60) {
    await new Promise(r => setTimeout(r, 3000));
    waitAttempts++;
    try {
      const freshPages = await getPageTargets();
      const ocaOrPartner = freshPages.find(t => t.url && (t.url.includes('oca.ext.hpe.com') || t.url.includes('partner.hpe.com')));
      if (ocaOrPartner) {
        console.log(`🎉 Session detected! Resuming auto-navigation...`);
        return navigateToOCAChassis(query, options);
      }
    } catch (_) {}
  }

  throw new Error(
    `🔒 Timeout waiting for Partner Portal SSO login on CDP port ${CDP_PORT}.\n` +
    `   Please log into https://partner.hpe.com in your browser window and re-run navigation.`
  );
}

// CLI runner support
if (require.main === module) {
  const chassisArg = process.argv[2] || 'DL380 Gen12';
  navigateToOCAChassis(chassisArg)
    .then(res => {
      console.log('🎉 OCA Navigation Complete:', res);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ OCA Navigation Error:', err.message);
      process.exit(1);
    });
}

module.exports = {
  navigateToOCAChassis
};
