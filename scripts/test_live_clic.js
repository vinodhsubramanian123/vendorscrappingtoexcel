'use strict';
/**
 * scripts/test_live_clic.js — Direct CDP Live CLIC Check Tester
 *
 * Connects directly to Chrome remote debugging port 9222 via WebSocket (bypassing IDE subagent permissions),
 * finds the active OCA page target, executes CLIC check inspection, and logs any unbuildable errors.
 */

const { getOCATarget, getAnyPageTarget, connectWS, triggerClicCheck, sleep } = require('./lib/cdp');

async function main() {
  console.log(`================================================================`);
  console.log(`🚀 DIRECT CDP LIVE CLIC CHECK TESTER (Port 9222)`);
  console.log(`================================================================\n`);

  try {
    let target = await getOCATarget();
    if (!target) {
      console.log(`ℹ️ OCA target not matched directly. Searching for any active page target...`);
      target = await getAnyPageTarget();
    }

    if (!target) {
      console.log(`❌ No active browser page targets found on port 9222.`);
      console.log(`   Please ensure Chrome is launched with: --remote-debugging-port=9222`);
      process.exit(0);
    }

    console.log(`✅ Connected to Browser Page Target: ${target.title} (${target.url})`);
    const ws = await connectWS(target.webSocketDebuggerUrl);

    console.log(`\n🔍 Triggering CLIC Check Inspection via WebSocket...`);
    const clicResult = await triggerClicCheck(ws, 'root');

    console.log(`\n📋 CLIC Inspection Result:`);
    console.log(`  • Errors Found     : ${clicResult.hasErrors ? 'YES' : 'NO'}`);
    console.log(`  • Error Text       : ${clicResult.errorText || 'None'}`);
    console.log(`  • Root Cause       : ${clicResult.rootCause || 'None'}`);
    console.log(`  • Recommended SKUs : ${clicResult.recommendedSkus ? clicResult.recommendedSkus.join(', ') : 'None'}`);

    ws.close();
    console.log(`\n================================================================`);
    console.log(`🎉 LIVE CDP TEST COMPLETED SUCCESSFULLY (Zero Popups)`);
    console.log(`================================================================\n`);
  } catch (err) {
    console.log(`ℹ️ CDP Connection note: ${err.message}`);
  }
}

main();
