import React, { useState } from 'react';
import { ShieldCheck, Upload, AlertTriangle, CheckCircle2, RefreshCw, X, ArrowRight, FileText } from 'lucide-react';

export default function VendorBomVerificationModal({ isOpen, onClose, selectedRank, selectedChassis, evalResults }) {
  const [vendorText, setVendorText] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [auditReport, setAuditReport] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isScraping, setIsScraping] = useState(false);

  if (!isOpen) return null;

  const handleVerify = async () => {
    if (!vendorText.trim()) return;
    setIsVerifying(true);
    setAuditReport(null);
    setErrorMessage(null);

    try {
      // Parse pasted text (CSV/JSON/SKU lines) into item objects
      let items = [];
      try {
        items = JSON.parse(vendorText);
      } catch (_) {
        // Fallback: parse lines like "P47777-B21, 1, HPE Controller"
        const lines = vendorText.split('\n');
        lines.forEach(line => {
          const match = line.match(/\b([A-Z0-9]{5,6}-[A-Z0-9]{2,3})\b/i);
          if (match) {
            const sku = match[1].toUpperCase();
            const qtyMatch = line.match(/\b(\d+)\b/);
            const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
            items.push({ sku, quantity, description: line.trim() });
          }
        });
      }

      if (items.length === 0) {
        setErrorMessage('No valid HPE SKUs (e.g., P47777-B21) detected in uploaded input.');
        setIsVerifying(false);
        return;
      }

      const proposedRankSolution = evalResults?.conflictGraph?.rankedSolutions?.find(s => s.rank === (selectedRank || 1)) || {
        rank: selectedRank || 1,
        skuList: (evalResults?.items || []).map(it => ({ sku: it.sku, quantity: it.quantity, description: it.description }))
      };

      const res = await fetch('/api/verify-vendor-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorItems: items,
          proposedRankSolution,
          chassis: selectedChassis
        })
      });

      const data = await res.json();
      if (res.ok) {
        setAuditReport(data);
      } else {
        setErrorMessage(data.error || 'Failed to verify Vendor BOM');
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTriggerFreshScrape = async () => {
    setIsScraping(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'solution', chassis: selectedChassis })
      });
      const data = await res.json();
      alert(`Fresh CDP catalog scrape initiated for ${selectedChassis}. Watch logs in Dashboard timeline.`);
    } catch (err) {
      alert(`Failed to launch fresh scrape: ${err.message}`);
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Post-Build Vendor BOM Cross-Verification</h2>
              <p className="text-xs text-slate-500">Cross-verify official HPE Partner Portal Quote BOM against Rank {selectedRank || 1} proposal</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {!auditReport ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                Paste or upload the official quote BOM exported from the HPE Partner Portal (OCA/CLIC). The engine will bi-directionally cross-verify SKUs, prices, auto-inserted vendor parts, and check if fresh catalog scraping is required.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Vendor Quote BOM (Paste JSON, CSV, or SKU lines)</label>
                <textarea
                  value={vendorText}
                  onChange={e => setVendorText(e.target.value)}
                  placeholder={`P47777-B21, 1, HPE MR416i-p Gen11 Storage Controller\nP76471-B21, 1, HPE DL380 Gen12 Riser Cable Kit\nP38997-B21, 2, HPE 1600W Power Supply`}
                  className="w-full h-40 font-mono text-xs p-3 border border-slate-300 rounded-xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  {errorMessage}
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={isVerifying || !vendorText.trim()}
                className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 text-xs font-bold"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Cross-Verifying Vendor BOM...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Verify Against Rank {selectedRank || 1} Solution
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Audit Report Results */
            <div className="space-y-6">
              {/* Summary Status Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                auditReport.is100PercentMatch
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className="flex items-center gap-3">
                  {auditReport.is100PercentMatch ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  )}
                  <div>
                    <h3 className="font-bold text-sm">
                      {auditReport.is100PercentMatch ? '100% Match Certified' : 'Vendor Portal Discrepancies Detected'}
                    </h3>
                    <p className="text-xs opacity-80">
                      Chassis: {auditReport.chassisModel} | Proposed: {auditReport.totalProposedSkus} SKUs \| Vendor Quote: {auditReport.totalVendorSkus} SKUs
                    </p>
                  </div>
                </div>
                <span className={`badge ${auditReport.is100PercentMatch ? 'badge-emerald' : 'badge-amber'}`}>
                  {auditReport.is100PercentMatch ? 'VERIFIED_CLEAN' : 'DELTAS_LEARNED'}
                </span>
              </div>

              {/* Uncataloged SKUs Warning Banner */}
              {auditReport.requiresFreshScrape && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3 text-rose-900">
                    <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-xs">Uncataloged Live SKUs Detected in Vendor Quote</h4>
                      <p className="text-[11px] text-rose-700">Vendor portal returned SKUs missing from local catalog JSON. Fresh CDP scrape recommended.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleTriggerFreshScrape}
                    disabled={isScraping}
                    className="btn-primary bg-rose-600 hover:bg-rose-700 text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin' : ''}`} />
                    {isScraping ? 'Scraping...' : 'Trigger CDP Scrape'}
                  </button>
                </div>
              )}

              {/* Added By Vendor */}
              {auditReport.discrepancies.addedByVendor.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 text-indigo-600 flex items-center gap-1.5">
                    <Upload className="w-4 h-4" /> Auto-Inserted SKUs by HPE Partner Portal ({auditReport.discrepancies.addedByVendor.length})
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Qty</th>
                          <th className="px-3 py-2">Description / Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditReport.discrepancies.addedByVendor.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-indigo-700">{item.sku}</td>
                            <td className="px-3 py-2">{item.quantity}</td>
                            <td className="px-3 py-2 text-slate-600">{item.reason || item.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Price Deltas */}
              {auditReport.discrepancies.priceDeltas.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 text-amber-600 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> List Price Variances ({auditReport.discrepancies.priceDeltas.length})
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2">Proposed Price</th>
                          <th className="px-3 py-2">Vendor Quote Price</th>
                          <th className="px-3 py-2">Price Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {auditReport.discrepancies.priceDeltas.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono font-bold text-slate-800">{item.sku}</td>
                            <td className="px-3 py-2">${item.proposedPriceUsd}</td>
                            <td className="px-3 py-2 font-bold text-amber-700">${item.vendorPriceUsd}</td>
                            <td className="px-3 py-2 text-amber-600 font-semibold">{item.percentChange} (${item.priceDeltaUsd})</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <button
                  onClick={() => setAuditReport(null)}
                  className="btn-secondary text-xs"
                >
                  Verify Another BOM
                </button>
                <button
                  onClick={onClose}
                  className="btn-primary text-xs"
                >
                  Close & Continue
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
