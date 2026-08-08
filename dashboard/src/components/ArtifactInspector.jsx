import React, { useState } from 'react';
import { FileCode, ShieldCheck, RefreshCw, FileText, CheckCircle2, AlertCircle, Eye, X, BookOpen, AlertTriangle } from 'lucide-react';

export default function ArtifactInspector({ currentCatalog, onAuditCatalog }) {
  const [auditResult, setAuditResult] = useState(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [viewFile, setViewFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [showRegistry, setShowRegistry] = useState(false);
  const [registryContent, setRegistryContent] = useState('');

  const handleRunAudit = async () => {
    if (!currentCatalog?.xlsxPath) return;
    setIsAuditing(true);
    setAuditResult(null);
    try {
      const res = await fetch('/api/audit-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xlsxPath: currentCatalog.xlsxPath })
      });
      const data = await res.json();
      setAuditResult(data);
    } catch (err) {
      setAuditResult({ passed: false, error: err.message || 'Audit execution failed' });
    }
    setIsAuditing(false);
  };

  const handleViewArtifact = async (artifactPath) => {
    setViewFile(artifactPath);
    try {
      const res = await fetch(artifactPath);
      const text = await res.text();
      setFileContent(text);
    } catch {
      setFileContent('Error loading artifact content.');
    }
  };

  const handleViewRegistry = async () => {
    setShowRegistry(true);
    try {
      const res = await fetch('/artifacts/SCRAPED_CATALOGS.md');
      const text = await res.text();
      setRegistryContent(text);
    } catch {
      setRegistryContent('Could not load SCRAPED_CATALOGS.md');
    }
  };

  // Derive intermittent scrap paths from catalog path
  const folderPath = currentCatalog?.jsonPath
    ? currentCatalog.jsonPath.substring(0, currentCatalog.jsonPath.lastIndexOf('/'))
    : null;

  const prefix = currentCatalog?.id || 'Catalog';
  const tsvSkusPath = folderPath ? `${folderPath}/intermittent_scraps/${prefix}_Catalog_SKUs.tsv` : null;
  const tsvRulesPath = folderPath ? `${folderPath}/intermittent_scraps/${prefix}_Catalog_Rules.tsv` : null;

  const [verifyAllStatus, setVerifyAllStatus] = useState(null);

  const handleVerifyAll = async () => {
    setVerifyAllStatus('LAUNCHING');
    try {
      const res = await fetch('/api/verify-all', { method: 'POST' });
      if (res.ok) {
        setVerifyAllStatus('STARTED');
        setTimeout(() => setVerifyAllStatus(null), 4000);
      } else {
        const data = await res.json();
        setVerifyAllStatus(`ERROR: ${data.error || 'Failed to start verification'}`);
      }
    } catch (err) {
      setVerifyAllStatus(`ERROR: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Quality Audit Trigger */}
      <div className="glass-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-purple-600" />
            Pipeline Artifact &amp; Data Quality Inspector
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full transparency into raw JSON extractions, TSVs, catalog diffs, and 7-check audit certificates.
          </p>
          {verifyAllStatus && (
            <p className={`text-xs font-semibold mt-1 flex items-center gap-1.5 ${verifyAllStatus.startsWith('ERROR') ? 'text-rose-600' : 'text-purple-600'}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {verifyAllStatus === 'STARTED' ? 'Portfolio verification suite launched! Watch the Scraper SSE Terminal for live logs.' : verifyAllStatus}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleViewRegistry}
            className="btn-secondary text-xs"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
            View Master Registry
          </button>
          <button
            onClick={handleVerifyAll}
            disabled={verifyAllStatus === 'LAUNCHING'}
            className="btn-secondary text-xs"
            title="Run 81-Assertion Verification Suite across all product lines"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
            {verifyAllStatus === 'LAUNCHING' ? 'Starting Suite...' : 'Run Portfolio Verification Suite'}
          </button>
          <button
            onClick={handleRunAudit}
            disabled={isAuditing || !currentCatalog?.xlsxPath}
            className="btn-primary text-xs disabled:opacity-50"
          >
            {isAuditing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Run 7-Check Audit
          </button>
        </div>
      </div>

      {/* Audit Checklist Card — Strict Fail-Closed Check */}
      {auditResult && (
        <div className={`glass-card p-6 border-l-4 ${auditResult.passed ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              {auditResult.passed
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                : <AlertCircle className="w-4 h-4 text-rose-600" />
              }
              Data Quality Audit Certificate Result
            </h3>
            <span className={`badge ${auditResult.passed ? 'badge-emerald' : 'badge-amber'}`}>
              {auditResult.passed ? '100% AUDIT PASS' : 'AUDIT ISSUES DETECTED'}
            </span>
          </div>

          {auditResult.checks ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {Object.entries(auditResult.checks).map(([checkName, checkVal]) => (
                <div key={checkName} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase truncate">{checkName}</span>
                  <span className={`font-bold ${checkVal?.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {checkVal?.passed ? 'PASS' : 'FAIL'}
                  </span>
                  {checkVal?.detail && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{checkVal.detail}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              {auditResult.error || JSON.stringify(auditResult)}
            </p>
          )}
        </div>
      )}

      {/* Artifact Files Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {currentCatalog?.jsonPath && (
          <div className="glass-card p-4 space-y-2">
            <h4 className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-blue-600" /> Master Catalog JSON
            </h4>
            <p className="text-[11px] text-slate-500">Structured companion JSON schema</p>
            <button
              onClick={() => handleViewArtifact(currentCatalog.jsonPath)}
              className="w-full btn-secondary justify-center text-xs"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" /> View JSON
            </button>
          </div>
        )}

        {currentCatalog?.xlsxPath && (
          <div className="glass-card p-4 space-y-2">
            <h4 className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-emerald-600" /> Multi-Sheet Excel Workbook
            </h4>
            <p className="text-[11px] text-slate-500">Classified Excel workbook artifact</p>
            <a
              href={currentCatalog.xlsxPath}
              download
              className="w-full btn-secondary justify-center text-xs"
            >
              Download .xlsx
            </a>
          </div>
        )}

        {currentCatalog?.pdfPath ? (
          <div className="glass-card p-4 space-y-2">
            <h4 className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-600" /> Technical QuickSpecs / Datasheet PDF
            </h4>
            <p className="text-[11px] text-slate-500">Official technical QuickSpecs document</p>
            <a
              href={currentCatalog.pdfPath}
              target="_blank"
              rel="noreferrer"
              className="w-full btn-secondary justify-center text-xs"
            >
              Open PDF
            </a>
          </div>
        ) : (
          <div className="glass-card p-4 space-y-2 opacity-60">
            <h4 className="font-semibold text-xs text-slate-700 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> QuickSpecs PDF
            </h4>
            <p className="text-[11px] text-slate-400">PDF not cached locally yet</p>
            <span className="text-[10px] text-slate-400 block italic">Use Scraper tab to download</span>
          </div>
        )}
      </div>

      {/* TSV Intermediary Files Section (Enhancement U6) */}
      {folderPath && (
        <div className="glass-card p-4 space-y-3">
          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Intermittent Scraping TSV Files:</h4>
          <div className="flex gap-3">
            {tsvSkusPath && (
              <button
                onClick={() => handleViewArtifact(tsvSkusPath)}
                className="btn-secondary text-xs"
              >
                <Eye className="w-3.5 h-3.5 text-purple-600" /> View SKUs TSV
              </button>
            )}
            {tsvRulesPath && (
              <button
                onClick={() => handleViewArtifact(tsvRulesPath)}
                className="btn-secondary text-xs"
              >
                <Eye className="w-3.5 h-3.5 text-purple-600" /> View Rules TSV
              </button>
            )}
          </div>
        </div>
      )}

      {/* Master Registry Preview Drawer/Modal */}
      {showRegistry && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" /> Master Portfolio Registry (SCRAPED_CATALOGS.md)
              </h3>
              <button onClick={() => setShowRegistry(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="terminal-view text-[11px] flex-1 overflow-y-auto p-4">
              {registryContent}
            </pre>
          </div>
        </div>
      )}

      {/* Artifact Content Viewer */}
      {viewFile && (
        <div className="glass-card p-4 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="mono text-xs font-semibold text-slate-800">{viewFile}</span>
            <button onClick={() => setViewFile(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
          </div>
          <pre className="terminal-view text-[11px] max-h-80 overflow-y-auto">
            {fileContent}
          </pre>
        </div>
      )}
    </div>
  );
}
