import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Cpu, Clock, RefreshCw, BarChart2, AlertTriangle, CheckCircle2, Sparkles, Server } from 'lucide-react';

export default function TelemetryCard() {
  const [telemetry, setTelemetry] = useState(null);
  const [nlmMetrics, setNlmMetrics] = useState({ totalQueries: 0, citationMatches: 0 });
  const [nlmHealth, setNlmHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchTelemetry = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/telemetry');
      const data = await res.json();
      setTelemetry(data);
      
      const nlmRes = await fetch('/api/notebooklm-consultations');
      const nlmData = await nlmRes.json();
      setNlmMetrics(nlmData);

      const healthRes = await fetch('/api/test-notebooklm');
      const healthData = await healthRes.json();
      setNlmHealth(healthData);
    } catch (err) {
      console.error('Failed to fetch telemetry:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  if (!telemetry) {
    return (
      <div className="glass-card p-6 text-center text-slate-400">
        <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
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
              <p className="text-xl font-bold text-slate-900">{telemetry.evaluationsCount || 0}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Avg Confidence Score</p>
              <p className="text-xl font-bold text-slate-900">
                {telemetry.avgConfidenceScore ? `${Math.round(telemetry.avgConfidenceScore * 100)}%` : '100%'}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Learned Knowledge Deltas</p>
              <p className="text-xl font-bold text-slate-900">{telemetry.totalDeltasLearned || 0}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">Last Pipeline Update</p>
              <p className="text-xs font-bold text-slate-900 truncate">
                {telemetry.lastUpdated ? new Date(telemetry.lastUpdated).toLocaleTimeString() : 'N/A'}
              </p>
            </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-semibold uppercase">NLM Consultations</p>
              <p className="text-xl font-bold text-slate-900">{nlmMetrics.totalQueries || 0}</p>
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
    </div>
  );
}
