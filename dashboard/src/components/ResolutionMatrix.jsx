import React, { useState } from 'react';
import { Award, Check, MessageSquare, Download, AlertTriangle, X, Loader, Sparkles, ShieldCheck } from 'lucide-react';
import VendorBomVerificationModal from './VendorBomVerificationModal';

export default function ResolutionMatrix({ evalResults, onOpenPortalFeedback, selectedChassis, onTriggerDemoBoq }) {
  const [exportingRank, setExportingRank] = useState(null);
  const [exportedFiles, setExportedFiles] = useState({});
  const [exportError, setExportError] = useState(null);
  const [rejectionModal, setRejectionModal] = useState(null);
  const [vendorVerificationModal, setVendorVerificationModal] = useState(null);
  const [rejectionText, setRejectionText] = useState('');
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);
  const [rejectionConfirmed, setRejectionConfirmed] = useState(null);
  const [rejectionError, setRejectionError] = useState(null);

  const rankedFromEval = evalResults?.conflictGraph?.rankedSolutions;

  const tiers = (rankedFromEval && rankedFromEval.length > 0)
    ? rankedFromEval.map(sol => {
        const resolvedFixes = evalResults?.conflictGraph?.resolvedFixes || [];
        const detailedSwaps = resolvedFixes.length > 0
          ? resolvedFixes.map(f => `${f.sku}: ${f.reasoning || f.action}`)
          : [
              `Modifications: ${sol.tradeoffMetrics?.skuModifications || '0 fixes'}`,
              `Cost Delta: ${sol.tradeoffMetrics?.costDeltaUsd || '$0'}`,
              `Expansion: ${sol.tradeoffMetrics?.capacityExpansion || 'Standard'}`
            ];

        return {
          rank: sol.rank,
          title: sol.name,
          subtitle: sol.workloadDnaMatch || `Rank ${sol.rank} Solution`,
          intentMatch: sol.tradeoffMetrics?.intentAlignment || `${Math.round(sol.score * 100)}%`,
          capex: sol.estimatedCostUsd ? `$${sol.estimatedCostUsd.toLocaleString()}` : 'Pricing N/A',
          badgeClass: sol.rank === 1 ? 'badge-emerald' : sol.rank <= 3 ? 'badge-blue' : 'badge-amber',
          rationale: sol.reasoning,
          ragSecondOpinion: sol.rank === 1 && evalResults.ragAnswer ? evalResults.ragAnswer : sol.ragSecondOpinion,
          swaps: detailedSwaps
        };
      })
    : [];

  const handleExport = async (tier) => {
    setExportingRank(tier.rank);
    setExportError(null);
    try {
      const res = await fetch('/api/export-boq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evalResults, chassisId: selectedChassis, rankTier: tier.rank })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: Export request failed`);
      const data = await res.json();
      if (data.downloadPath) {
        setExportedFiles(prev => ({ ...prev, [tier.rank]: data }));
        const a = document.createElement('a');
        a.href = data.downloadPath;
        a.download = data.filename;
        a.click();
      } else {
        throw new Error(data.error || 'Server did not return a valid download path');
      }
    } catch (err) {
      console.error('Export failed:', err);
      setExportError(`Export failed for Rank ${tier.rank}: ${err.message}`);
    }
    setExportingRank(null);
  };

  const handleRejectionSubmit = async () => {
    if (!rejectionText.trim()) return;
    setIsSubmittingRejection(true);
    setRejectionError(null);
    try {
      const res = await fetch('/api/simulate-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorMessage: rejectionText, chassis: selectedChassis })
      });
      const data = await res.json();
      if (res.ok && data.delta) {
        setRejectionConfirmed(data.delta?.id || 'LOGGED');
        setTimeout(() => {
          setRejectionModal(null);
          setRejectionText('');
          setRejectionConfirmed(null);
        }, 2500);
      } else {
        setRejectionError(data.error || 'Failed to record rejection delta');
      }
    } catch (err) {
      console.error('Rejection submit failed:', err);
      setRejectionError(err.message || 'Network error submitting rejection');
    }
    setIsSubmittingRejection(false);
  };

  return (
    <div className="space-y-6 animate-fade-in-up delay-300">
      {exportError && (
        <div className="bg-rose-50 border-l-4 border-l-rose-500 p-4 rounded-xl text-xs text-rose-700 font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>{exportError}</span>
          </div>
          <button onClick={() => setExportError(null)} className="text-rose-400 hover:text-rose-600">Close</button>
        </div>
      )}
      <div className="glass-card p-6">
        <div className="border-b border-slate-100 pb-3 mb-4 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-600" />
              5-Tier Strategic Resolution Matrix
            </h2>
            <p className="text-xs text-slate-500">
              Multi-tiered buildable candidates. Apply fixes and export a corrected BOQ, or report a portal rejection to train the engine.
            </p>
          </div>
          {evalResults?.confidence && (
            <div className="group relative flex items-center">
              <div className={`px-3 py-1.5 rounded-full border text-xs font-bold cursor-help ${
                evalResults.confidence.isHitlTriggered 
                  ? 'bg-amber-50 border-amber-200 text-amber-700' 
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                Confidence: {Math.round(evalResults.confidence.score * 100)}%
              </div>
              
              {/* Tooltip / Popover */}
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <p className="text-xs font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">Score Breakdown</p>
                <div className="space-y-1.5">
                  <p className="text-[11px] flex justify-between text-emerald-600">
                    <span>Base Intent Match</span>
                    <span className="font-mono">1.00</span>
                  </p>
                  {(evalResults.confidence.deductions || []).map((deduction, i) => (
                    <p key={i} className="text-[11px] flex justify-between text-amber-600">
                      <span className="truncate pr-2">{deduction.replace(/ \(-[0-9.]+\)$/, '')}</span>
                      <span className="font-mono">
                        {deduction.match(/\((-[0-9.]+)\)$/) ? deduction.match(/\((-[0-9.]+)\)$/)[1] : ''}
                      </span>
                    </p>
                  ))}
                  <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between font-bold text-xs">
                    <span className="text-slate-800">Final Score</span>
                    <span className="font-mono text-slate-900">{evalResults.confidence.score.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.length === 0 ? (
            <div className="col-span-full p-8 text-center text-slate-500 bg-slate-50/50 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
              <Award className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-600 mb-2">No Synthesis Available</p>
              <p className="text-xs text-slate-400 mb-4 max-w-md mx-auto">
                Run a BOQ Evaluation with conflicting rules to view the 5-Tier Strategic Resolution Matrix.
              </p>
              {onTriggerDemoBoq && (
                <button
                  onClick={() => onTriggerDemoBoq({
                    rawText: "1x P73282-B21\n1x P48820-B21\n2x P49610-B21\n1x P76449-B21\n4x P40502-B21\n1x P52019-B21",
                    chassisDir: selectedChassis
                  })}
                  className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all inline-flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" /> Load Sample Demo BOQ & Run 5-Tier Synthesis
                </button>
              )}
            </div>
          ) : tiers.map(tier => {
            const isRagFallback = tier.ragSecondOpinion && (
              tier.ragSecondOpinion.toLowerCase().includes('fallback') ||
              tier.ragSecondOpinion.toLowerCase().includes('unverified')
            );

            return (
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
                <p className="text-xs text-slate-500 mb-2">{tier.rationale}</p>

                {tier.ragSecondOpinion && (
                  <div className={`border rounded-lg p-2 mb-3 text-[11px] font-semibold flex items-center gap-1.5 shadow-sm ${
                    tier.ragSecondOpinion.includes('Pending')
                      ? 'bg-slate-50 border-slate-200 text-slate-600 animate-pulse'
                      : isRagFallback
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                  }`}>
                    {tier.ragSecondOpinion.includes('Pending') ? (
                      <Loader className="w-3.5 h-3.5 text-slate-400 shrink-0 animate-spin" />
                    ) : isRagFallback ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span>{tier.ragSecondOpinion}</span>
                  </div>
                )}

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
                className="w-full btn-secondary justify-center text-xs mb-2"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Report Portal Rejection
              </button>

              {/* Verify Official Vendor BOM */}
              <button
                onClick={() => setVendorVerificationModal(tier.rank)}
                className="w-full btn-secondary justify-center text-xs text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50 border-indigo-200"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                Verify Official Vendor BOM
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
          );
        })}
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
              <button onClick={() => { setRejectionModal(null); setRejectionText(''); setRejectionConfirmed(null); setRejectionError(null); }}>
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
                {rejectionError && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3 text-xs text-rose-700 font-medium">
                    {rejectionError}
                  </div>
                )}
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
                  <button onClick={() => { setRejectionModal(null); setRejectionText(''); setRejectionError(null); }} className="btn-secondary text-xs">
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

      {/* Vendor Partner Portal BOM Cross-Verification Modal */}
      <VendorBomVerificationModal
        isOpen={vendorVerificationModal !== null}
        onClose={() => setVendorVerificationModal(null)}
        selectedRank={vendorVerificationModal}
        selectedChassis={selectedChassis}
        evalResults={evalResults}
      />
    </div>
  );
}
