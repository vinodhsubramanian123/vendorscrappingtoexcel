'use strict';
/**
 * scripts/eval_multi_boq.js — Scalable Multi-Config Parallel Evaluation Engine
 * 
 * Capable of discovering multiple independent configurations within a single BOQ 
 * (e.g. multiple Excel sheets) and spawning parallel evaluation child processes.
 * Ensures zero rigidity and maximum scalability.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

try {
  require.resolve('xlsx');
} catch (e) {
  console.error('❌ ERROR: Missing required dependency "xlsx". Run: npm install xlsx');
  process.exit(1);
}
const XLSX = require('xlsx');

const args = process.argv.slice(2);
const inputFile = args.find(a => !a.startsWith('--'));
const JSON_MODE = args.includes('--json');

if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('❌ ERROR: Please provide a valid BOQ file path.');
  console.log('Usage: npm run eval:multi <path/to/boq.xlsx> [--json]');
  process.exit(1);
}

async function evaluateSheetParallel(filePath, sheetName) {
  return new Promise((resolve) => {
    const evalScript = path.join(__dirname, 'eval_boq.js');
    const child = spawn('node', [evalScript, filePath, '--json', '--sheet', sheetName], {
      env: { ...process.env, STRUCTURED_PROGRESS: '0' } // Suppress progress spam in parallel
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', data => stdoutData += data.toString());
    child.stderr.on('data', data => stderrData += data.toString());

    child.on('close', (code) => {
      try {
        // Find the last complete JSON object in stdout (eval_boq outputs structured JSON at the end)
        const lines = stdoutData.split('\n').filter(l => l.trim().startsWith('{'));
        const lastJsonLine = lines[lines.length - 1];
        
        if (lastJsonLine) {
          const result = JSON.parse(lastJsonLine);
          resolve({ sheetName, status: 'SUCCESS', result });
        } else {
          resolve({ sheetName, status: 'ERROR', error: 'No JSON payload returned', stderr: stderrData });
        }
      } catch (err) {
        resolve({ sheetName, status: 'ERROR', error: err.message, stderr: stderrData });
      }
    });
  });
}

async function main() {
  if (!JSON_MODE) {
    console.log(`\n================================================================`);
    console.log(`🚀 HPE OCA MULTI-CONFIG PARALLEL EVALUATION ENGINE`);
    console.log(`================================================================`);
    console.log(`📄 Analyzing BOQ: ${path.basename(inputFile)}`);
  }

  const ext = path.extname(inputFile).toLowerCase();
  
  if (ext !== '.xlsx') {
    // If not Excel, it's just a single config text/json file. Run normally.
    if (!JSON_MODE) console.log(`⏩ Not a multi-sheet workbook. Spawning single evaluation...`);
    const res = await evaluateSheetParallel(inputFile, 'Default');
    if (JSON_MODE) {
      process.stdout.write(JSON.stringify([res]));
    } else {
      console.log(`✅ Evaluation complete. Status: ${res.status}`);
    }
    return;
  }

  // Parse Excel to find sheets
  const workbook = XLSX.readFile(inputFile);
  const sheetNames = workbook.SheetNames;
  
  if (!JSON_MODE) {
    console.log(`📑 Discovered ${sheetNames.length} sheet(s): ${sheetNames.join(', ')}`);
    console.log(`⚡ Spawning ${sheetNames.length} parallel evaluators...`);
  }

  const startTime = Date.now();
  
  // Spawn parallel evaluations
  const promises = sheetNames.map(sheet => evaluateSheetParallel(inputFile, sheet));
  const results = await Promise.all(promises);

  const durationMs = Date.now() - startTime;

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify(results));
  } else {
    console.log(`\n================================================================`);
    console.log(`🎉 PARALLEL EVALUATION COMPLETE in ${(durationMs / 1000).toFixed(2)}s`);
    console.log(`================================================================`);
    
    results.forEach(r => {
      if (r.status === 'SUCCESS') {
        const chassis = r.result.data?.chassisDetection?.chassisDir?.split('/').pop() || 'Unknown';
        const rank1 = r.result.data?.conflictGraph?.rankedSolutions?.[0];
        console.log(`✅ Sheet: [${r.sheetName}] -> Auto-detected: ${chassis}`);
        if (rank1) {
          console.log(`     Rank 1 Alignment: ${rank1.tradeoffMetrics.intentAlignment}`);
        }
      } else {
        console.log(`❌ Sheet: [${r.sheetName}] -> FAILED: ${r.error}`);
      }
    });
    console.log(`\n`);
  }
}

main().catch(err => {
  if (JSON_MODE) {
    process.stdout.write(JSON.stringify([{ status: 'FATAL_ERROR', error: err.message }]));
  } else {
    console.error('Fatal multi-eval error:', err);
  }
  process.exit(1);
});
