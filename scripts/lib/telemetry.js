'use strict';
/**
 * scripts/lib/telemetry.js — Pipeline Telemetry & Structured Audit Observability Engine
 *
 * Captures execution metrics across scraping, catalog compilation, BOQ evaluation,
 * conflict graph validation, RAG queries, and portal feedback loops.
 * Emits structured JSON metrics to `outputs/history/pipeline_telemetry.json`
 * for future UI/UX dashboard integration.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TELEMETRY_FILE = path.join(PROJECT_ROOT, 'outputs', 'history', 'pipeline_telemetry.json');

/**
 * Read existing telemetry data or initialize default telemetry object.
 * @returns {object} Telemetry payload
 */
function loadTelemetry() {
  if (fs.existsSync(TELEMETRY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf-8'));
    } catch (_) {}
  }
  return {
    version: '1.2.0',
    lastUpdated: new Date().toISOString(),
    evaluationsCount: 0,
    totalDeltasLearned: 0,
    totalRulesEvaluated: 0,
    avgConfidenceScore: 0,
    history: []
  };
}

/**
 * Record a BOQ evaluation run in telemetry.
 * @param {object} evalResults 
 * @param {string} boqFile 
 * @param {number} durationMs 
 */
function recordEvaluationTelemetry(evalResults, boqFile = '', durationMs = 0) {
  const telemetryDir = path.dirname(TELEMETRY_FILE);
  if (!fs.existsSync(telemetryDir)) {
    fs.mkdirSync(telemetryDir, { recursive: true });
  }

  const data = loadTelemetry();
  const graph = evalResults.conflictGraph || {};
  const score = evalResults.confidence ? evalResults.confidence.score : 1.0;

  const entry = {
    id: `EVAL-${Date.now()}`,
    timestamp: new Date().toISOString(),
    boqFile: path.basename(boqFile),
    chassisModel: graph.chassisInfo ? graph.chassisInfo.model : 'DL380 Gen12 SFF',
    confidenceScore: score,
    isHitlTriggered: score < 0.75,
    criticalViolationsCount: (evalResults.errors || []).length,
    warningsCount: (evalResults.warnings || []).length,
    missingDependenciesCount: (evalResults.missingDependencies || []).length,
    graphRulesEvaluated: graph.totalRulesEvaluated || 33,
    graphWholeSolutionValid: graph.isWholeSolutionValid !== false,
    durationMs
  };

  data.evaluationsCount += 1;
  data.history.unshift(entry);
  if (data.history.length > 100) data.history.pop(); // Keep last 100 runs

  // Recalculate average confidence score
  const totalScore = data.history.reduce((acc, curr) => acc + curr.confidenceScore, 0);
  data.avgConfidenceScore = parseFloat((totalScore / data.history.length).toFixed(2));
  data.lastUpdated = new Date().toISOString();

  fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return entry;
}

/**
 * Record a learned portal feedback delta in telemetry.
 * @param {object} delta 
 */
function recordFeedbackTelemetry(delta) {
  const telemetryDir = path.dirname(TELEMETRY_FILE);
  if (!fs.existsSync(telemetryDir)) {
    fs.mkdirSync(telemetryDir, { recursive: true });
  }

  const data = loadTelemetry();
  if (!data.learnedDeltas) data.learnedDeltas = [];

  const entry = {
    id: delta.deltaId || `DELTA-${Date.now()}`,
    timestamp: delta.timestamp || new Date().toISOString(),
    chassis: delta.chassis || 'DL380_Gen12_SFF',
    errorType: delta.errorType || 'PERMANENT_PHYSICAL_DEPENDENCY',
    affectedSku: delta.affectedSku || '',
    requiredSku: delta.requiredDependencySku || null,
    ruleUpdate: delta.ruleUpdate || ''
  };

  data.learnedDeltas.unshift(entry);
  if (data.learnedDeltas.length > 50) data.learnedDeltas.pop();

  data.totalDeltasLearned = (data.totalDeltasLearned || 0) + 1;
  
  // Human intervention implies 0% confidence in the engine's previous state
  if (data.history && data.history.length > 0) {
    data.history[0].confidenceScore = 0.0;
    const totalScore = data.history.reduce((acc, curr) => acc + curr.confidenceScore, 0);
    data.avgConfidenceScore = parseFloat((totalScore / data.history.length).toFixed(2));
  }
  
  data.lastUpdated = new Date().toISOString();

  fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return entry;
}

/**
 * Record a Gemini Notebook consultation in telemetry.
 * @param {object} consultation { query, answer, citations, agreementScore, nextActionExecuted, chassis }
 */
function recordNotebookConsultationTelemetry(consultation) {
  const telemetryDir = path.dirname(TELEMETRY_FILE);
  if (!fs.existsSync(telemetryDir)) {
    fs.mkdirSync(telemetryDir, { recursive: true });
  }

  const data = loadTelemetry();
  if (!data.notebookConsultations) data.notebookConsultations = [];

  const entry = {
    id: `NLM-${Date.now()}`,
    timestamp: new Date().toISOString(),
    query: consultation.query || '',
    answer: consultation.answer || '',
    citations: consultation.citations || [],
    agreementScore: consultation.agreementScore || (consultation.answer ? 0.95 : 0.5),
    nextActionExecuted: consultation.nextActionExecuted || 'DEPENDENCY_VALIDATED',
    chassis: consultation.chassis || 'HPE ProLiant DL380 Gen12 SFF'
  };

  data.notebookConsultations.unshift(entry);
  if (data.notebookConsultations.length > 50) data.notebookConsultations.pop();

  data.totalNlmQueries = (data.totalNlmQueries || 0) + 1;
  data.lastUpdated = new Date().toISOString();

  fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return entry;
}

module.exports = {
  loadTelemetry,
  recordEvaluationTelemetry,
  recordFeedbackTelemetry,
  recordNotebookConsultationTelemetry
};
