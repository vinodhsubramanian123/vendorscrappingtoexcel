import React, { useState } from 'react';
import { Award, Check, MessageSquare, Download, AlertTriangle, X, Loader } from 'lucide-react';

export default function ResolutionMatrix({ evalResults, onOpenPortalFeedback, selectedChassis }) {
  const [exportingRank, setExportingRank] = useState(null);
  const [exportedFiles, setExportedFiles] = useState({});
  const [rejectionModal, setRejectionModal] = useState(null);
  const [rejectionText, setRejectionText] = useState('');
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);
  const [rejectionConfirmed, setRejectionConfirmed] = useState(null);

  const rankedFromEval = evalResults?.conflictGraph?.rankedSolutions;

  const tiers = (rankedFromEval && rankedFromEval.length > 0)
    ? rankedFromEval.map(sol => ({
        rank: sol.rank,
        title: sol.name,
        subtitle: sol.workloadDnaMatch || `Rank ${sol.rank} Solution`,
        intentMatch: sol.tradeoffMetrics?.intentAlignment || `${Math.round(sol.score * 100)}%`,
        capex: sol.estimatedCostUsd ? `$${sol.estimatedCostUsd.toLocaleString()}` : 'Pricing N/A',
        badgeClass: sol.rank === 1 ? 'badge-emerald' : sol.rank <= 3 ? 'badge-blue' : 'badge-amber',
        rationale: sol.reasoning,
        swaps: sol.tradeoffMetrics ? [
          `Modifications: ${sol.tradeoffMetrics.skuModifications}`,
          `Cost Delta: ${sol.tradeoffMetrics.costDeltaUsd}`,
          `Expansion: ${sol.tradeoffMetrics.capacityExpansion}`
        ] : ['Standard physical fix injected']
      }))
    : [];

  const handleExport = async (tier) => {
    setExportingRank(tier.rank);
    try {
      const res = await fetch('/api/export-boq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evalResults, chassisId: selectedChassis, rankTier: tier.rank })
      });
      const data = await res.json();
      if (data.downloadPath) {
        setExportedFiles(prev => ({ ...prev, [tier.rank]: data }));
        const a = document.createElement('a');
        a.href = data.downloadPath;
        a.download = data.filename;
        a.click();
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExportingRank(null);
  };

  const handleRejectionSubmit = async () => {
    if (!rejectionText.trim()) return;
    setIsSubmittingRejection(true);
    try {
      const res = await fetch('/api/simulate-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorMessage: rejectionText, chassis: selectedChassis })
      });
      const data = await res.json();
      setRejectionConfirmed(data.delta?.id || 'LOGGED');
    } catch (err) {
      console.error('Rejection submit failed:', err);
    }
    setIsSubmittingRejection(false);
    setTimeout(() => {
      setRejectionModal(null);
      setRejectionText('');
      setRejectionConfirmed(null);
    }, 2500);
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <div className="border-b border-slate-100 pb-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-600" />
            5-Tier Strategic Resolution Matrix
          </h2>
          <p className="text-xs text-slate-500">
            Multi-tiered buildable candidates. Apply fixes and export a corrected BOQ, or report a portal rejection to train the engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-400">
              <Award className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600">No Resolution Tiers Available</p>
              <p className="text-xs text-slate-400 mt-1">Evaluate a BOQ quote in the BOQ Evaluator tab to generate ranked buildable candidates.</p>
            </div>
          ) : tiers.map(tier => (
            <div
              key={tier.rank}
              className={`rounded-2xl p-5 border transition-all glass-card ${
                tier.rank === 1 ? 'border-emerald-300 ring-2 ring-emerald-500/20 bg-emerald-50/10' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`badge ${tier.badgeClass}`}>{tier.subtitle}</span>
                <span className="text-xs font-bold text-slate-500">Match: {tier.intentMatch}</span>
              </div>

              <h3 className="font-bold text-slate-900 text-sm mb-1">{tier.title}</h3>
              <p className="text-xs text-slate-500 mb-3">{tier.rationale}</p>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Estimated CapEx:</span>
                  <span className="font-bold text-slate-900 text-sm">{tier.capex}</span>
                </div>
              </div>

              <div className="space-y-1 mb-4">
                <p className="text-[11px] font-semibold text-slate-600 uppercase">Key SKU Swaps:</p>
                {tier.swaps.map((swap, idx) => (
                  <p key={idx} className="mono text-[10px] text-slate-600 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                    {swap}
                  </p>
                ))}
              </div>

              {/* Apply & Export BOQ */}
              {exportedFiles[tier.rank] ? (
                <a
                  href={exportedFiles[tier.rank].downloadPath}
                  download={exportedFiles[tier.rank].filename}
                  className="w-full mb-2 flex items-center gap-1.5 justify-center btn-primary text-xs"
                  style={{ textDecoration: 'none' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Re-Download Rank {tier.rank}
                </a>
              ) : (
                <button
                  onClick={() => handleExport(tier)}
                  disabled={exportingRank !== null || !evalResults}
                  title={!evalResults ? 'Run a BOQ evaluation first to enable export' : ''}
                  className="w-full mb-2 btn-primary justify-center text-xs disabled:opacity-40"
                >
                  {exportingRank === tier.rank
                    ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Exporting...</>
                    : <><Download className="w-3.5 h-3.5" /> Apply &amp; Export Rank {tier.rank}</>
                  }
                </button>
              )}

              {/* Report Portal Rejection */}
              <button
                onClick={() => setRejectionModal(tier)}
                className="w-full btn-secondary justify-center text-xs"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Report Portal Rejection
              </button>

              {/* Log Feedback */}
              <button
                onClick={() => onOpenPortalFeedback(tier)}
                className="w-full mt-2 flex items-center gap-1.5 justify-center text-xs text-slate-400 hover:text-blue-600 transition-colors py-1"
              >
                <MessageSquare className="w-3 h-3" />
                Log Portal Feedback
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Portal Rejection Training Modal */}
      {rejectionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Report Portal Rejection — Rank {rejectionModal.rank}
              </h3>
              <button onClick={() => { setRejectionModal(null); setRejectionText(''); setRejectionConfirmed(null); }}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-700" />
              </button>
            </div>

            {rejectionConfirmed ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <Check className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="font-bold text-emerald-800 text-sm">KnowledgeDelta Logged!</p>
                <p className="text-xs text-emerald-600 mt-1">ID: {rejectionConfirmed}</p>
                <p className="text-[11px] text-slate-500 mt-2">Go to the Scraper tab and click "Sync Knowledge" to push this to NotebookLM.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-600 mb-4">
                  Describe the HPE portal rejection. This is logged as a <strong>KnowledgeDelta</strong> scoped to chassis{' '}
                  <span className="font-bold text-blue-600">{selectedChassis || 'Unknown'}</span>, permanently improving the evaluation engine.
                </p>
                <textarea
                  value={rejectionText}
                  onChange={e => setRejectionText(e.target.value)}
                  placeholder='e.g. "Portal rejected: Max 10 NVMe drives exceeded with Tri-Mode controller in SFF chassis."'
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-800 resize-none h-28 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => { setRejectionModal(null); setRejectionText(''); }} className="btn-secondary text-xs">
                    Cancel
                  </button>
                  <button
                    onClick={handleRejectionSubmit}
                    disabled={!rejectionText.trim() || isSubmittingRejection}
                    className="btn-primary text-xs disabled:opacity-40"
                  >
                    {isSubmittingRejection
                      ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Logging...</>
                      : <><AlertTriangle className="w-3.5 h-3.5" /> Log as KnowledgeDelta</>
                    }
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
