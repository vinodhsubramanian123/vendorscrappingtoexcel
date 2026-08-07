import React, { useState } from 'react';
import { Play, RefreshCw, Terminal, Download, Server } from 'lucide-react';

export default function ScraperTriggerCard({ logStream, isTaskRunning, onTriggerScrape, onTriggerRebuild, onTriggerDownloadPdf }) {
  const [scrapeMode, setScrapeMode] = useState('solution');

  // Extract latest progress event if present
  const latestProgressLog = logStream.slice().reverse().find(l => {
    try {
      const parsed = JSON.parse(l.text);
      return parsed.type === 'PROGRESS';
    } catch {
      return false;
    }
  });

  let progressPercent = 0;
  let progressStage = 'IDLE';

  if (latestProgressLog) {
    try {
      const p = JSON.parse(latestProgressLog.text);
      progressPercent = p.percent || 0;
      progressStage = p.stage || 'PROCESSING';
    } catch {}
  } else if (isTaskRunning) {
    progressPercent = 45;
    progressStage = 'IN_PROGRESS';
  }

  return (
    <div className="space-y-6">
      {/* Control Actions Header Card */}
      <div className="glass-card p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-blue-600" />
              Live CDP Scraper & Pipeline Controls
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Execute live browser scrapes, rebuild catalogs offline, or fetch QuickSpecs PDFs over port 9222.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`badge ${isTaskRunning ? 'badge-amber animate-pulse' : 'badge-emerald'}`}>
              {isTaskRunning ? `Executing: ${progressStage}` : 'Pipeline Mutex Idle'}
            </span>
          </div>
        </div>

        {/* Visual Progress Bar when task is running */}
        {isTaskRunning && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
              <span>Pipeline Workflow Progress: <span className="text-blue-600">{progressStage}</span></span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(progressPercent, 10)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          {/* Live Scrape Action */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80">
            <h4 className="font-bold text-slate-800 text-xs mb-1 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-emerald-600" /> Live Scrape Portal
            </h4>
            <p className="text-[11px] text-slate-500 mb-3">Target active OCA browser session to extract full SKU catalog.</p>
            
            <div className="flex items-center gap-2 mb-3">
              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="scrapeMode"
                  value="solution"
                  checked={scrapeMode === 'solution'}
                  onChange={() => setScrapeMode('solution')}
                />
                Server E2E
              </label>
              <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="scrapeMode"
                  value="storage"
                  checked={scrapeMode === 'storage'}
                  onChange={() => setScrapeMode('storage')}
                />
                Storage Wizard
              </label>
            </div>

            <button
              onClick={() => onTriggerScrape(scrapeMode)}
              disabled={isTaskRunning}
              className="w-full btn-primary justify-center text-xs disabled:opacity-50"
            >
              {isTaskRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Start Scrape
            </button>
          </div>

          {/* Offline Rebuild Action */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80">
            <h4 className="font-bold text-slate-800 text-xs mb-1 flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 text-blue-600" /> Rebuild Catalogs Offline
            </h4>
            <p className="text-[11px] text-slate-500 mb-4">Re-parse existing raw JSON extractions into fresh Excel catalogs.</p>
            
            <button
              onClick={onTriggerRebuild}
              disabled={isTaskRunning}
              className="w-full btn-secondary justify-center text-xs disabled:opacity-50"
            >
              {isTaskRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 text-blue-600" />}
              Rebuild All
            </button>
          </div>

          {/* Download QuickSpecs PDF */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80">
            <h4 className="font-bold text-slate-800 text-xs mb-1 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-amber-600" /> Download QuickSpecs PDF
            </h4>
            <p className="text-[11px] text-slate-500 mb-4">Fetch official QuickSpecs PDF documentation for active chassis.</p>
            
            <button
              onClick={onTriggerDownloadPdf}
              disabled={isTaskRunning}
              className="w-full btn-secondary justify-center text-xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-amber-600" />
              Fetch PDF
            </button>
          </div>

        </div>
      </div>

      {/* Real-Time SSE Log Terminal */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-600" /> Real-Time Terminal Output Stream (SSE)
          </h3>
          <span className="mono text-[11px] text-slate-400">Streamed via /api/stream-logs</span>
        </div>

        <div className="terminal-view">
          {logStream.length === 0 ? (
            <p className="text-slate-500 italic">Terminal ready. Trigger an action above to view live logs...</p>
          ) : (
            logStream.map((log, i) => {
              const isPass = log.text?.includes('PASS') || log.text?.includes('SUCCESS') || log.text?.includes('✅');
              const isErr = log.text?.includes('FAIL') || log.text?.includes('ERROR') || log.text?.includes('❌');
              const isInfo = log.text?.includes('NAV') || log.text?.includes('STEP') || log.text?.includes('⚡');

              return (
                <div key={i} className={`terminal-line ${isPass ? 'pass' : isErr ? 'error' : isInfo ? 'info' : ''}`}>
                  {log.text}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
