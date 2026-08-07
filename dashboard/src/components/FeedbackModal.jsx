import React, { useState } from 'react';
import { MessageSquare, X, Send, AlertTriangle } from 'lucide-react';

export default function FeedbackModal({ isOpen, onClose, resolutionCard }) {
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen || !resolutionCard) return null;

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    try {
      await fetch('/api/portal-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rank: resolutionCard.rank,
          title: resolutionCard.title,
          feedbackText: feedback
        })
      });
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 1500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            Log HPE Portal Feedback
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Logging portal feedback for <span className="font-semibold text-slate-800">{resolutionCard.title}</span>:
        </p>

        <textarea
          rows={4}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g. Portal rejected Tri-Mode Cable P76453-B21 due to slot 2 conflict..."
          className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 mb-4"
        />

        {submitted ? (
          <div className="p-3 bg-emerald-50 rounded-xl text-center text-xs font-bold text-emerald-700">
            Knowledge Delta Logged!
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 btn-secondary justify-center text-xs">
              Cancel
            </button>
            <button onClick={handleSubmit} className="flex-1 btn-primary justify-center text-xs">
              <Send className="w-3.5 h-3.5" /> Submit Delta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
