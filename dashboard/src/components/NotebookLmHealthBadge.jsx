import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

export default function NotebookLmHealthBadge() {
  const [status, setStatus] = useState({ state: 'CHECKING', raw: '' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkHealth = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/test-notebooklm');
      const data = await res.json();
      if (data.status === 'HEALTHY' || (data.notebooks && data.notebooks.length > 0) || (Array.isArray(data) && data.length > 0)) {
        setStatus({ state: 'HEALTHY', raw: data });
      } else {
        setStatus({ state: 'DEGRADED', raw: data.error || data.raw || 'MCP Offline or nlm CLI failed' });
      }
    } catch (err) {
      setStatus({ state: 'OFFLINE', raw: err.message });
    }
    setIsRefreshing(false);
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s to not overwhelm the CLI
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onClick={checkHealth}
      title={status.state === 'OFFLINE' || status.state === 'DEGRADED' ? typeof status.raw === 'string' ? status.raw : 'Error connecting to Gemini NotebookLM' : 'NotebookLM RAG Engine Online'}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
        status.state === 'HEALTHY'
          ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
          : status.state === 'CHECKING'
          ? 'bg-slate-50 text-slate-500 border-slate-200'
          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
      }`}
    >
      {status.state === 'CHECKING' || isRefreshing ? (
        <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
      ) : status.state === 'HEALTHY' ? (
        <CheckCircle className="w-3 h-3 text-blue-600" />
      ) : (
        <AlertTriangle className="w-3 h-3 text-rose-600" />
      )}
      <span>
        {status.state === 'CHECKING' 
          ? 'Checking MCP...' 
          : status.state === 'HEALTHY' 
          ? 'NotebookLM MCP Ready' 
          : 'NotebookLM Offline'}
      </span>
    </button>
  );
}
