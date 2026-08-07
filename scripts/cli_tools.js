'use strict';
/**
 * scripts/cli_tools.js — Master Command CLI Gateway
 * Maps normalized npm commands to backend REST APIs or local scripts.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const command = process.argv[2];
const args = process.argv.slice(3);

function request(method, pathUrl, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: pathUrl,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  switch (command) {
    case 'probe:cdp':
      console.log('📡 Probing CDP State...');
      const cdp = await request('GET', '/api/cdp-status');
      console.log(cdp);
      break;

    case 'scrape:auto':
      console.log('🚀 Triggering automatic scrape...');
      const scrapeMode = args.includes('--storage') ? 'storage' : 'solution';
      const scrape = await request('POST', '/api/scrape', { mode: scrapeMode });
      console.log(scrape);
      console.log('💡 Watch progress in the Dashboard UI or via SSE /api/stream-logs');
      break;

    case 'resolve:ambiguity':
      const [chassis, affectedSku, ruleUpdate] = args;
      if (!ruleUpdate) {
        console.error('Usage: npm run resolve:ambiguity <chassis> <affectedSku> "<ruleUpdate>"');
        process.exit(1);
      }
      const res = await request('POST', '/api/resolve-ambiguity', { chassis, affectedSku, ruleUpdate });
      console.log(res);
      break;

    case 'trace:view':
      const runId = args[0];
      if (!runId) {
        console.log('Available recent runs:');
        const runs = await request('GET', '/api/history/runs');
        runs.forEach(r => console.log(`- ${r.runId} (${r.taskType}) - ${r.exitCode===0?'✅':'❌'}`));
        console.log('\nUsage: npm run trace:view <runId>');
        process.exit(0);
      }
      const trace = await request('GET', `/api/history/runs/${runId}`);
      if (trace.error) return console.error(trace.error);
      console.log(`\n=== TRACE: ${runId} ===\n`);
      trace.logs.forEach(l => {
        const color = l.stream === 'stderr' ? '\x1b[31m' : '\x1b[32m';
        console.log(`${color}[${l.timestamp.split('T')[1].slice(0,-1)}] ${l.text}\x1b[0m`);
      });
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Error executing CLI command. Is the Dashboard Express backend running (npm run dev)?');
  console.error(err.message);
});
