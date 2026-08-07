import React from 'react';
import { BookOpen, X, Sparkles, ExternalLink, ShieldCheck } from 'lucide-react';

export default function NotebookRagDrawer({ isOpen, onClose, ragData, isQuerying }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 p-6 overflow-y-auto transition-all">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-900 text-base">Gemini NotebookLM RAG Drawer</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {isQuerying ? (
        <div className="space-y-4 py-8">
          <div className="flex items-center gap-2 text-xs text-blue-600 font-semibold animate-pulse">
            <Sparkles className="w-4 h-4" /> Querying NotebookLM RAG via nlm CLI...
          </div>
          <div className="h-6 skeleton w-3/4"></div>
          <div className="h-20 skeleton w-full"></div>
          <div className="h-12 skeleton w-5/6"></div>
        </div>
      ) : ragData ? (
        <div className="space-y-4">
          <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100">
            <p className="text-xs font-semibold text-blue-900">Query:</p>
            <p className="text-xs text-blue-800 italic mt-0.5">"{ragData.query}"</p>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> RAG Answer & Spec Rationale:
            </h4>
            <div className="text-xs text-slate-700 space-y-2 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
              {ragData.answer}
            </div>
          </div>

          {ragData.citations && ragData.citations.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Citations & References:</h4>
              <div className="space-y-2">
                {ragData.citations.map((cite, i) => (
                  <div key={i} className="text-[11px] p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 text-slate-600">
                    <p className="font-semibold text-slate-800">{cite.source || `QuickSpecs Citation ${i+1}`}</p>
                    <p className="text-slate-500 mt-0.5">{cite.snippet || cite.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-12 text-center text-slate-400">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">No RAG Query Executed</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Type a query in the header search bar or click "Query NotebookLM" to view citations.
          </p>
        </div>
      )}
    </div>
  );
}
