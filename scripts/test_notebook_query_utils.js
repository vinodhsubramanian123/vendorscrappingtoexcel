'use strict';
/**
 * scripts/test_notebook_query_utils.js
 *
 * Automated verification suite for Gemini Notebook Query Utilities.
 * Tests:
 * 1. Pre-processor sanitization of queries containing raw Node.js script code, const fs, require, stack traces, etc.
 * 2. Pre-processor preservation of HPE SKUs (P49025-B21, P76453-B21) and natural language intent.
 * 3. Post-processor ANSI stripping and JSON response parsing.
 * 4. Real end-to-end query execution via `executeNotebookQuery`.
 */

const { sanitizeNotebookQuery, postProcessNotebookResult, executeNotebookQuery } = require('./lib/notebook_query_utils');

async function testSuite() {
  console.log('===============================================================');
  console.log('🚀 GEMINI NOTEBOOK QUERY UTILITIES VERIFICATION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, detail = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
    }
  }

  // --- TEST 1: Sanitize query containing Node.js scripting logic (`const fs`, `require`) ---
  const badQuery1 = `const fs = require('fs'); let x = 10; function test() { return process.env; } Is P49025-B21 compatible with P76453-B21?`;
  const sanitized1 = sanitizeNotebookQuery(badQuery1, { chassis: 'HPE ProLiant DL380 Gen12 SFF' });
  assert(
    !sanitized1.includes('const fs') && !sanitized1.includes('require(') && sanitized1.includes('P49025-B21') && sanitized1.includes('P76453-B21'),
    'Test 1: Strip scripting keywords (const fs, require) and retain SKUs',
    `Result: "${sanitized1}"`
  );

  // --- TEST 2: Sanitize query with shell metacharacters and backticks ---
  const badQuery2 = '`nlm notebook query 123` "$PATH" $(whoami) What are the cable rules for P76453-B21?';
  const sanitized2 = sanitizeNotebookQuery(badQuery2);
  assert(
    !sanitized2.includes('$`') && !sanitized2.includes('$PATH') && sanitized2.includes('P76453-B21'),
    'Test 2: Strip shell metacharacters and backticks',
    `Result: "${sanitized2}"`
  );

  // --- TEST 3: Clean natural language query remains untouched except formatting ---
  const goodQuery = 'What are the memory channels and DIMM placement rules for HPE ProLiant DL380 Gen12 SFF?';
  const sanitized3 = sanitizeNotebookQuery(goodQuery);
  assert(
    sanitized3 === goodQuery,
    'Test 3: Clean natural language query is preserved',
    `Result: "${sanitized3}"`
  );

  // --- TEST 4: Post-processor handles raw JSON, ANSI codes, and citations ---
  const mockStdout = '\u001b[32m{"answer":"HPE ProLiant DL380 Gen12 supports up to 32 DIMMs per socket.","citations":["QuickSpecs Section 2"]}\u001b[0m';
  const processed = postProcessNotebookResult(mockStdout, goodQuery);
  assert(
    processed.answer.includes('32 DIMMs') && processed.citations.length === 1 && !processed.answer.includes('\u001b'),
    'Test 4: Post-processor cleans ANSI and parses JSON schema',
    `Result: ${JSON.stringify(processed)}`
  );

  // --- TEST 5: Live end-to-end query execution against Notebook ID 1d190853-4e9c-48df-aa70-eae66c6f2c1f ---
  console.log('\n🤖 Running live query execution test against Gemini Notebook (1d190853-4e9c-48df-aa70-eae66c6f2c1f)...');
  const targetNotebookId = '1d190853-4e9c-48df-aa70-eae66c6f2c1f';
  const liveQuery = 'const fs = require("fs"); What cable kit is required for storage controller MR416i-p in DL380 Gen12?';

  const liveResult = await executeNotebookQuery(targetNotebookId, liveQuery, {
    context: { chassis: 'HPE ProLiant DL380 Gen12 SFF' }
  });

  // --- TEST 6: Async Non-Blocking Query Job Launch & Status Polling ---
  console.log('\n⚡ Testing Async Non-Blocking Query Job Engine...');
  const { startAsyncNotebookQueryJob, getAsyncNotebookQueryJobStatus, diagnoseNotebookFailure } = require('./lib/notebook_query_utils');

  const asyncJob = startAsyncNotebookQueryJob(targetNotebookId, 'What are the power supply redundancy options for DL380 Gen12?', {
    context: { chassis: 'HPE ProLiant DL380 Gen12 SFF' }
  });

  assert(
    asyncJob.jobId && asyncJob.status === 'PROCESSING',
    'Test 6a: Async job launched non-blockingly with PROCESSING status',
    `Job ID: ${asyncJob.jobId}`
  );

  const initialStatus = getAsyncNotebookQueryJobStatus(asyncJob.jobId);
  assert(
    initialStatus && initialStatus.jobId === asyncJob.jobId,
    'Test 6b: Job status queryable via getAsyncNotebookQueryJobStatus',
    `Status: ${initialStatus.status}`
  );

  // --- TEST 7: Root-Cause Diagnostic Classification ---
  const mockAuthErr = new Error('401 UNAUTHENTICATED: Session token expired');
  const diag = diagnoseNotebookFailure(targetNotebookId, mockAuthErr);
  assert(
    diag.errorType === 'AUTH_EXPIRED' && diag.remediationAction.includes('nlm login'),
    'Test 7: Root-cause failure diagnostic classifies auth errors cleanly',
    `Diagnostic: ${JSON.stringify(diag)}`
  );

  console.log(`\n===============================================================`);
  console.log(`📊 TEST SUMMARY: ${passed}/${total} assertions passed (${Math.round(passed / total * 100)}%)`);
  console.log(`===============================================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testSuite().catch(err => {
  console.error('❌ Test suite fatal error:', err);
  process.exit(1);
});
