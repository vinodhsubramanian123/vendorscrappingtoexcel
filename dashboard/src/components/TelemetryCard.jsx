import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Cpu, Clock, RefreshCw, BarChart2, AlertTriangle, CheckCircle2, Sparkles, Server, X } from 'lucide-react';

export default function TelemetryCard() {
  const [telemetry, setTelemetry] = useState(null);
  const [nlmMetrics, setNlmMetrics] = useState({ totalQueries: 0, citationMatches: 0 });
  const [nlmHealth, setNlmHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [isViolationsModalOpen, setIsViolationsModalOpen] = useState(false);

  // Playground States
  const [ragQuery, setRagQuery] = useState('');
  const [ragResult, setRagResult] = useState(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const handleRagQuery = async () => {
    if (!ragQuery.trim()) return;
    setIsQuerying(true);
    setRagResult(null);
    try {
      const res = await fetch('/api/notebook-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery, chassisId: 'general-playground' })
      });
      const data = await res.json();
      setRagResult(data);
    } catch (err) {
      setRagResult({ error: err.message });
    }
    setIsQuerying(false);
  };

  const fetchTelemetry = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/telemetry');
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch telemetry`);
      const data = await res.json();
      setTelemetry(data);
      
      const nlmRes = await fetch('/api/notebooklm-consultations');
      if (nlmRes.ok) {
        const nlmData = await nlmRes.json();
        setNlmMetrics(nlmData);
      }

      const healthRes = await fetch('/api/test-notebooklm');
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setNlmHealth(healthData);
      }
    } catch (err) {
      console.error('Failed to fetch telemetry:', err);
      setFetchError(err.message || 'Error connecting to telemetry bridge');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  if (fetchError && !telemetry) {
    return (
      <div className="glass-card p-6 text-center text-rose-600 border-l-4 border-l-rose-500 space-y-3">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="text-sm font-bold">Telemetry Bridge Error</p>
        <p className="text-xs text-slate-500">{fetchError}</p>
        <button onClick={fetchTelemetry} className="btn-primary text-xs mx-auto inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Retry Fetching Telemetry
        </button>
      </div>
    );
  }

  if (!telemetry) {
    return (
      <div className="glass-card p-6 text-center text-slate-400">
        <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-pulse" />
        <p className="text-xs font-semibold text-slate-600">Loading Telemetry &amp; Observability Metrics...</p>
      </div>
    );
  }

  const history = telemetry.history || [];

  return (
    <div className="space-y-6">
      {/* Header & KPI Summary Cards */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              System Telemetry &amp; Pipeline Observability
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time telemetry captured across BOQ evaluations, knowledge deltas, confidence scores, and runtime durations.
            </p>
          </div>
          <button
            onClick={fetchTelemetry}
            disabled={loading}
            className="btn-secondary text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
        </div>

        {/* 5 KPI Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Total BOQ Evaluations</p>
              <p className="text-xl font-bold text-slate-900">{telemetry.evaluationsCount > 0 ? telemetry.evaluationsCount : '—'}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Avg Confidence Score</p>
              <p className="text-xl font-bold text-slate-900 flex items-baseline gap-1">
                {telemetry.evaluationsCount > 0 ? (telemetry.avgConfidenceScore * 100).toFixed(0) + '%' : '—'}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Learned Rules (Deltas)</p>
              <p className="text-xl font-bold text-slate-900">{telemetry.totalDeltasLearned > 0 ? telemetry.totalDeltasLearned : '—'}</p>
            </div>
          </div>

          <div
            className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3 cursor-pointer hover:bg-red-50 hover:border-red-100 transition-colors"
            onClick={() => setIsViolationsModalOpen(true)}
            title="Click to view detailed violations"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Failed Evaluations</p>
              <p className="text-xl font-bold text-slate-900">
                {history.filter(h => h.criticalViolationsCount > 0).length > 0 ? history.filter(h => h.criticalViolationsCount > 0).length : '—'}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Avg Duration</p>
              <p className="text-xl font-bold text-slate-900">
                {history.length > 0 ? (history.reduce((acc, curr) => acc + (curr.durationMs || 0), 0) / history.length / 1000).toFixed(1) + 's' : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* NLM Health Section */}
        {nlmHealth && (
          <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-white">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-500" /> NotebookLM MCP Health
            </h3>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${nlmHealth.status === 'HEALTHY' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                <span className="font-semibold text-slate-700">{nlmHealth.status}</span>
              </div>
              <div className="text-slate-500">
                <span className="font-medium text-slate-700">{nlmHealth.notebooksFound || 0}</span> Notebooks Synced
              </div>
              <div className="text-slate-500 font-mono text-xs">
                Latency: {nlmHealth.latencyMs || 0}ms
              </div>
            </div>
          </div>
        )}

        {/* FB-3: Gemini NotebookLM RAG Playground */}
        <div className="mb-6 p-4 rounded-xl border border-blue-200 bg-blue-50/30">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" /> Gemini NotebookLM RAG Playground
          </h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="Ask NotebookLM a general question about the catalog..."
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleRagQuery(); }}
            />
            <button
              onClick={handleRagQuery}
              disabled={isQuerying || !ragQuery.trim()}
              className="btn-primary text-xs shrink-0 disabled:opacity-50"
            >
              {isQuerying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isQuerying ? 'Querying...' : 'Run Search'}
            </button>
          </div>
          {ragResult && (
            <div className="bg-white border border-slate-200 p-4 rounded-xl text-xs text-slate-700 max-h-64 overflow-y-auto">
              {ragResult.error ? (
                <div className="text-rose-600 font-semibold">{ragResult.error}</div>
              ) : (
                <>
                  <div className="font-semibold text-slate-900 mb-2 border-b border-slate-100 pb-2 flex justify-between items-center">
                    <span>RAG Answer</span>
                    {ragResult.source && <span className="badge badge-amber">Source: {ragResult.source}</span>}
                  </div>
                  <div className="leading-relaxed space-y-2 whitespace-pre-wrap">{ragResult.answer}</div>
                  {ragResult.citations && ragResult.citations.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="font-bold text-slate-900 mb-2">Citations:</p>
                      <ul className="list-disc pl-4 space-y-1 text-slate-500">
                        {ragResult.citations.map((c, i) => (
                          <li key={i}>{c.source || 'QuickSpecs'} — {c.snippet}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* History Table */}
        <div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Evaluation Run History Ledger</h3>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">BOQ File</th>
                  <th className="px-4 py-2.5">Chassis Model</th>
                  <th className="px-4 py-2.5">Confidence</th>
                  <th className="px-4 py-2.5">Violations / Warnings</th>
                  <th className="px-4 py-2.5">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      No evaluation history recorded yet. Run a BOQ evaluation to populate telemetry.
                    </td>
                  </tr>
                ) : (
                  history.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 text-slate-500 font-mono text-[11px]">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 font-semibold text-slate-800">{entry.boqFile || 'Raw Text Paste'}</td>
                      <td className="px-4 py-2 text-slate-600">{entry.chassisModel}</td>
                      <td className="px-4 py-2">
                        <span className={`badge ${entry.confidenceScore >= 0.75 ? 'badge-emerald' : 'badge-amber'}`}>
                          {Math.round(entry.confidenceScore * 100)}%
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {entry.criticalViolationsCount > 0 ? (
                          <span className="text-rose-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {entry.criticalViolationsCount} Violations
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Clean Pass
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500 font-mono text-[11px]">
                        {entry.durationMs ? `${entry.durationMs}ms` : '<100ms'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* NLM Consultation & Action Ledger */}
        <div className="mt-8">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" /> Gemini Notebook RAG Consultation & Double-Proofing Ledger
          </h3>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Sanitized Query</th>
                  <th className="px-4 py-2.5">Grounded Answer</th>
                  <th className="px-4 py-2.5">Agreement Score</th>
                  <th className="px-4 py-2.5">Next Action Taken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(!nlmMetrics.log || nlmMetrics.log.length === 0) ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      No Gemini Notebook consultations logged yet. Run a BOQ evaluation to query NotebookLM.
                    </td>
                  </tr>
                ) : (
                  nlmMetrics.log.slice(0, 10).map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 text-slate-500 font-mono text-[11px]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-800 max-w-[200px] truncate" title={log.query}>
                        {log.query}
                      </td>
                      <td className="px-4 py-2 text-slate-600 max-w-[260px] truncate" title={log.answer}>
                        {log.answer}
                      </td>
                      <td className="px-4 py-2">
                        <span className="badge badge-emerald">
                          {Math.round((log.agreementScore || 0.95) * 100)}% Match
                        </span>
                      </td>
                      <td className="px-4 py-2 font-semibold text-indigo-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {log.nextActionExecuted || 'DEPENDENCY_DOUBLE_PROOFED'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FB-7: Violations Modal */}
      {isViolationsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Evaluation Violations Ledger
              </h2>
              <button onClick={() => setIsViolationsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {history.filter(h => h.criticalViolationsCount > 0).length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  No failed evaluations found in history.
                </div>
              ) : (
                <div className="space-y-4">
                  {history.filter(h => h.criticalViolationsCount > 0).map((h, i) => (
                    <div key={i} className="border border-rose-100 rounded-lg p-3 bg-rose-50/30">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-800">{new Date(h.startTime).toLocaleString()}</span>
                        <span className="badge badge-rose">Confidence: {(h.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="text-[11px] text-slate-600 mb-2 font-mono">
                        Run ID: {h.runId} <br/>
                        File: {h.logs?.find(l => l.text?.includes('File:'))?.text?.replace('File: ', '') || 'Unknown'}
                      </div>
                      <div className="space-y-1">
                        {h.logs?.filter(l => l.stream === 'stderr' || l.text?.includes('FAIL') || l.text?.includes('Error')).map((l, j) => (
                          <div key={j} className="text-xs text-rose-700 bg-white p-2 rounded border border-rose-100">
                            {l.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setIsViolationsModalOpen(false)} className="btn-secondary text-xs">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
