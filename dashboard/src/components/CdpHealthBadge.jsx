import React, { useState, useEffect } from 'react';
import { Radio, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function CdpHealthBadge() {
  const [status, setStatus] = useState({ online: false, activeSession: false, target: null });
  const [showPopover, setShowPopover] = useState(false);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [loadingObs, setLoadingObs] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/cdp-status');
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ status: 'DISCONNECTED' });
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenObservability = async () => {
    setShowPopover(true);
    setLoadingObs(true);
    try {
      const res = await fetch('/api/session-observability');
      const data = await res.json();
      setSessionInfo(data);
    } catch {
      setSessionInfo({ error: 'Failed to connect to CDP observability endpoint' });
    }
    setLoadingObs(false);
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpenObservability}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
          status.status === 'READY'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            : ['NAVIGATING', 'AUTHENTICATING'].includes(status.status)
            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
        }`}
      >
        <Radio className={`w-3 h-3 ${status.status === 'READY' ? 'animate-pulse text-emerald-600' : ''}`} />
        <span>
          {status.status === 'READY' ? 'CDP 9222 Active' : status.status === 'AUTHENTICATING' ? 'CDP Ready (Authenticating)' : status.status === 'NAVIGATING' ? 'DOM Ready (No OCA Tab)' : 'CDP Offline'}
        </span>
      </button>

      {/* Observability Popover Modal */}
      {showPopover && (
        <div className="absolute right-0 top-10 z-50 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 transition-all">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Info className="w-4 h-4 text-blue-600" />
              <span>CDP Session Telemetry</span>
            </div>
            <button onClick={() => setShowPopover(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loadingObs ? (
            <div className="space-y-2 py-2">
              <div className="h-4 skeleton w-3/4"></div>
              <div className="h-4 skeleton w-1/2"></div>
            </div>
          ) : sessionInfo ? (
            (() => {
              const obs = sessionInfo.data || sessionInfo;
              const totalSkus = obs.totalSkusInPortfolio || (obs.catalogs ? obs.catalogs.reduce((a, c) => a + (c.skuCount || 0), 0) : 0);
              const catalogCount = obs.catalogs ? obs.catalogs.length : 0;
              const deltasCount = obs.deltas ? obs.deltas.length : (obs.knowledgeSync?.totalLearnedRules || 0);
              
              return (
                <div className="text-xs space-y-2.5 text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-800">CDP Target URL:</span>
                    <p className="mono text-[10px] break-all bg-slate-50 p-1.5 rounded border border-slate-100 mt-1">
                      {status.target?.url || 'No active OCA page'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Portfolio Intelligence</span>
                      <span className="font-bold text-slate-800">{totalSkus} SKUs</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Scraped Catalogs</span>
                      <span className="font-bold text-emerald-600">{catalogCount} Catalogs</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Learned Rules (Deltas)</span>
                      <span className="font-bold text-purple-600">{deltasCount} Deltas</span>
                    </div>
                    <div className="bg-slate-50 p-2 rounded">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">CDP Debugger</span>
                      <span className="font-bold text-blue-600">Port 9222</span>
                    </div>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-2 text-[10px]">
                    <span>Page Ready State:</span>
                    <span className={`font-semibold ${obs.cdp?.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {obs.cdp?.ok ? 'CDP Connected' : 'DOM Ready (No CDP)'}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="text-xs text-slate-500">No telemetry data available.</p>
          )}
        </div>
      )}
    </div>
  );
}
