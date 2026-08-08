import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Send, CheckCircle2, Clock } from 'lucide-react';

export default function UserFeedbackDrawer({ isOpen, onClose }) {
  const [feedbackText, setFeedbackText] = useState('');
  const [category, setCategory] = useState('feature_request');
  const [queueItems, setQueueItems] = useState([]);
  const [copiedPrompt, setCopiedPrompt] = useState('');

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/feedback-list');
      const data = await res.json();
      setQueueItems(data);
    } catch {}
  };

  useEffect(() => {
    if (isOpen) fetchQueue();
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    try {
      const res = await fetch('/api/feedback-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: feedbackText, category })
      });
      const data = await res.json();
      setCopiedPrompt(data.agentPrompt);
      setFeedbackText('');
      fetchQueue();
    } catch {}
  };

  const handleMarkAllCompleted = async () => {
    try {
      await fetch('/api/feedback-mark-completed', { method: 'POST' });
      fetchQueue();
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 p-6 overflow-y-auto transition-all">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-slate-900 text-base">Feedback & Agent Task Dispatch</h3>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Category:</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-800"
          >
            <option value="feature_request">Feature Request</option>
            <option value="ui_tweak">UI / Aesthetic Tweak</option>
            <option value="bug_report">Data Bug Report</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Feedback & Instructions:</label>
          <textarea
            rows={4}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Type your dashboard feedback or requested feature here..."
            className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        <button type="submit" className="w-full btn-primary justify-center text-xs">
          <Send className="w-3.5 h-3.5" /> Submit to Feedback Queue
        </button>
      </form>

      {copiedPrompt && (
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 mb-6 text-xs">
          <p className="font-bold text-emerald-900 flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Queued for Antigravity AI!
          </p>
          <p className="text-[11px] text-emerald-800">
            Task logged into <span className="mono">user_feedback_queue.json</span>.
          </p>
        </div>
      )}

      {/* Queue Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Pending Tasks Queue:</h4>
          {queueItems.length > 0 && (
            <button
              onClick={handleMarkAllCompleted}
              className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-md hover:bg-emerald-100 font-bold flex items-center gap-1 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" /> Resolve All
            </button>
          )}
        </div>
        <div className="space-y-2">
          {queueItems.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No feedback items in queue.</p>
          ) : (
            queueItems.map(item => (
              <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="mono text-[10px] font-bold text-slate-700">{item.id}</span>
                  <span className="badge badge-amber">{item.status}</span>
                </div>
                <p className="text-slate-700 font-medium">{item.text}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
