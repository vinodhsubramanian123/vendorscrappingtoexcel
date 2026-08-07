import React, { useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';

export default function BoqUploader({ onEvaluateBoq, evalResults }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [evalError, setEvalError] = useState(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!file && !rawText.trim()) return;
    setLoading(true);
    setEvalError(null);

    try {
      let filepath = null;
      if (file) {
        const formData = new FormData();
        formData.append('boqFile', file);
        const uploadRes = await fetch('/api/upload-boq', {
          method: 'POST',
          body: formData
        });
        const uploadData = await uploadRes.json();
        filepath = uploadData.filepath;
      }

      const res = await onEvaluateBoq({ filepath, rawText });
      if (res?.error) {
        setEvalError(res.error);
      }
    } catch (err) {
      setEvalError(err.message || 'Failed to evaluate BOQ quote');
    }
    setLoading(false);
  };

  const lowConfidence = evalResults?.requiresUserChassisConfirmation || (evalResults?.chassisConfidence < 0.75);

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="border-b border-slate-100 pb-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-blue-600" />
          BOQ Quote Upload &amp; Text Paste
        </h2>
        <p className="text-xs text-slate-500">
          Upload customer Excel quotes (.xlsx, .csv, .json) or paste raw BOM text for real-time 6-aspect evaluation.
        </p>
      </div>

      {/* Evaluation Error Alert (Fix B5) */}
      {evalError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">BOQ Evaluation Failed</p>
            <p className="text-[11px] text-rose-800 mt-0.5">{evalError}</p>
          </div>
        </div>
      )}

      {/* Low-Confidence Chassis Prompt (Enhancement U5) */}
      {lowConfidence && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Low Chassis Auto-Detection Confidence ({Math.round((evalResults?.chassisConfidence || 0.6) * 100)}%)</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              The evaluator inferred chassis: <span className="font-bold">{evalResults?.chassis || 'DL380 Gen12 SFF'}</span>. Select a different chassis in the header dropdown if this is incorrect.
            </p>
          </div>
        </div>
      )}

      {/* Drag and Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          isDragging ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50'
        }`}
      >
        <input
          type="file"
          id="boqFileInput"
          className="hidden"
          accept=".xlsx,.csv,.json,.txt"
          onChange={handleFileChange}
        />
        <label htmlFor="boqFileInput" className="cursor-pointer block">
          <UploadCloud className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-800">
            {file ? file.name : 'Click to select or drag and drop BOQ quote file'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Supports .xlsx, .csv, .json, or .txt</p>
        </label>
      </div>

      {/* Raw Text Paste Zone */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Or paste raw SKU text BOM:
        </label>
        <textarea
          rows={3}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="e.g. 1x P49057-B21, 2x P38620-B21, 16x P00424-B21..."
          className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || (!file && !rawText.trim())}
        className="w-full btn-primary justify-center text-xs disabled:opacity-50"
      >
        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        Run 6-Aspect Pre-Flight BOQ Check
      </button>
    </div>
  );
}
