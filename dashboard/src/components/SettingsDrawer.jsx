import React, { useState, useEffect } from 'react';
import { Settings, X, Save, Check, Loader, BookOpen, RefreshCw, Plus, Trash2 } from 'lucide-react';

export default function SettingsDrawer({ isOpen, onClose }) {
  const [config, setConfig] = useState({ defaultNotebookId: '', notebooks: {} });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newChassis, setNewChassis] = useState('');
  const [newNotebookId, setNewNotebookId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/config/notebooks')
      .then(r => r.json())
      .then(data => { setConfig(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/config/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Save failed:', err);
    }
    setSaving(false);
  };

  const handleAddMapping = () => {
    if (!newChassis.trim()) return;
    setConfig(prev => ({
      ...prev,
      notebooks: { ...prev.notebooks, [newChassis.trim()]: newNotebookId.trim() }
    }));
    setNewChassis('');
    setNewNotebookId('');
  };

  const handleRemoveMapping = (key) => {
    setConfig(prev => {
      const updated = { ...prev.notebooks };
      delete updated[key];
      return { ...prev, notebooks: updated };
    });
  };

  const handleUpdateMapping = (key, value) => {
    setConfig(prev => ({
      ...prev,
      notebooks: { ...prev.notebooks, [key]: value }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-600" />
            <h3 className="font-bold text-slate-900 text-base">System Settings</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-8 justify-center animate-pulse">
              <Loader className="w-4 h-4 animate-spin" /> Loading configuration...
            </div>
          ) : (
            <>
              {/* Default Notebook ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  Default NotebookLM Notebook ID
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Used as fallback when no chassis-specific mapping is found.
                </p>
                <input
                  type="text"
                  value={config.defaultNotebookId || ''}
                  onChange={e => setConfig(prev => ({ ...prev, defaultNotebookId: e.target.value }))}
                  placeholder="e.g. 1d190853-4e9c-48df-aa70-eae66c6f2c1f"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Chassis → Notebook ID Mapping */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                  Chassis → NotebookLM ID Registry
                </h4>
                <p className="text-[11px] text-slate-400 mb-3">
                  Map each scraped chassis folder name to its corresponding Gemini Notebook ID for RAG queries.
                </p>

                <div className="space-y-2">
                  {Object.entries(config.notebooks || {}).map(([chassis, nbId]) => (
                    <div key={chassis} className="flex gap-2 items-center">
                      <div className="shrink-0 w-36 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 truncate" title={chassis}>
                        {chassis}
                      </div>
                      <input
                        type="text"
                        value={nbId}
                        onChange={e => handleUpdateMapping(chassis, e.target.value)}
                        placeholder="Notebook ID"
                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button
                        onClick={() => handleRemoveMapping(chassis)}
                        className="shrink-0 text-slate-300 hover:text-red-500 transition-colors"
                        title="Remove mapping"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new mapping */}
                <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">Add New Mapping</p>
                  <input
                    type="text"
                    value={newChassis}
                    onChange={e => setNewChassis(e.target.value)}
                    placeholder="Chassis folder name (e.g. DL360_Gen12_LFF)"
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <input
                    type="text"
                    value={newNotebookId}
                    onChange={e => setNewNotebookId(e.target.value)}
                    placeholder="NotebookLM Notebook ID"
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <button
                    onClick={handleAddMapping}
                    disabled={!newChassis.trim()}
                    className="w-full btn-secondary justify-center text-xs disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Mapping
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Save */}
        <div className="border-t border-slate-100 px-6 py-4 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full btn-primary justify-center disabled:opacity-40"
          >
            {saved
              ? <><Check className="w-4 h-4" /> Saved!</>
              : saving
              ? <><Loader className="w-4 h-4 animate-spin" /> Saving...</>
              : <><Save className="w-4 h-4" /> Save Registry</>
            }
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-2">
            Changes are persisted to scripts/config/notebooks.json
          </p>
        </div>
      </div>
    </div>
  );
}
