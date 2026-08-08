import React, { useState } from 'react';
import { HelpCircle, BrainCircuit, Sparkles, PlusCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function AmbiguityInbox({ evalResults, chassisContext }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isQuerying, setIsQuerying] = useState(false);
  const [notebookResponse, setNotebookResponse] = useState('');
  
  // Resolution form state
  const [ruleUpdate, setRuleUpdate] = useState('');
  const [humanReasoning, setHumanReasoning] = useState('');
  const [scopeTaxonomy, setScopeTaxonomy] = useState('CHASSIS_SPECIFIC');
  const [affectedSku, setAffectedSku] = useState('');
  const [requiredDependencySku, setRequiredDependencySku] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  if (!evalResults || !evalResults.confidence) return null;

  // Only show if confidence < 75% or explicitly triggered
  const isTriggered = evalResults.confidence.isHitlTriggered || evalResults.confidence.score < 0.75;
  if (!isTriggered) return null;

  const handleQueryNotebookLM = async () => {
    setIsQuerying(true);
    setNotebookResponse('');
    setSubmitStatus(null);
    try {
      // Craft a prompt based on the specific errors
      const errorsStr = evalResults.errors?.join('\n') || 'Unknown conflict';
      const prompt = `I have a hardware configuration conflict for ${chassisContext} that I need to resolve. The evaluation failed with these errors:\n${errorsStr}\n\nBased on your QuickSpecs knowledge, what is the exact physical rule missing here? Does one SKU require another? Return a concise technical rule.`;
      
      const res = await fetch('/api/ask-notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, chassis: chassisContext })
      });
      const data = await res.json();
      setNotebookResponse(data.answer || 'No response received.');
      
      // Try to extract SKUs if they look like typical HPE SKUs (e.g. P12345-B21)
      const skuRegex = /[A-Z0-9]{5,6}-[A-Z0-9]{2,3}/g;
      const foundSkus = data.answer?.match(skuRegex) || [];
      if (foundSkus.length > 0) setAffectedSku(foundSkus[0]);
      if (foundSkus.length > 1) setRequiredDependencySku(foundSkus[1]);
      
      setRuleUpdate(data.answer);
      setHumanReasoning(`Validated via NotebookLM QuickSpecs grounding for ${chassisContext}`);

    } catch (err) {
      setNotebookResponse(`Error querying NotebookLM: ${err.message}`);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);
    try {
      const payload = {
        ruleUpdate,
        humanReasoning,
        scopeTaxonomy,
        chassis: chassisContext,
        affectedSku,
        requiredDependencySku
      };
      
      const res = await fetch('/api/resolve-ambiguity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setSubmitStatus({ type: 'success', msg: `Resolution logged [${data.deltaId}]` });
      } else {
        setSubmitStatus({ type: 'error', msg: data.error });
      }
    } catch (err) {
      setSubmitStatus({ type: 'error', msg: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="glass-card border-amber-200 shadow-sm mb-6 overflow-hidden">
      <div 
        className="bg-gradient-to-r from-amber-50 to-amber-100/50 p-4 border-b border-amber-200 flex justify-between items-center cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 text-amber-900">
          <HelpCircle className="w-5 h-5 text-amber-600" />
          <h3 className="font-bold">Ambiguity Resolution Inbox</h3>
          <span className="badge badge-amber ml-2">Human-In-The-Loop Required</span>
        </div>
        <button className="text-amber-600 hover:bg-amber-200/50 p-1 rounded transition-colors">
          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {isOpen && (
        <div className="p-5 space-y-6 bg-white">
          <div className="text-sm text-slate-600">
            <p className="mb-2"><strong>Confidence Score:</strong> <span className="text-amber-600 font-bold">{evalResults.confidence.score} / 1.00</span></p>
            <p>{evalResults.confidence.summary}</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-purple-600" /> Step 1: Consult NotebookLM MCP
            </h4>
            <p className="text-[11px] text-slate-500 mb-3">Query the Gemini Notebook agent directly to interpret the unresolved errors using the grounded QuickSpecs documents.</p>
            
            <button 
              onClick={handleQueryNotebookLM}
              disabled={isQuerying}
              className="btn-secondary w-full sm:w-auto text-xs bg-white hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 transition-all"
            >
              {isQuerying ? <><Sparkles className="w-3.5 h-3.5 animate-spin text-purple-500" /> Querying MCP...</> : <><Sparkles className="w-3.5 h-3.5 text-purple-600" /> Auto-Query NotebookLM</>}
            </button>

            {notebookResponse && (
              <div className="mt-4 p-3 bg-purple-50/50 border border-purple-100 rounded text-sm text-purple-900 font-medium whitespace-pre-wrap">
                {notebookResponse}
              </div>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-600" /> Step 2: Inject Learned Rule
            </h4>
            <p className="text-[11px] text-slate-500 mb-4">Validate the resolution and inject it into the pipeline's Master Knowledge Registry. It will automatically apply to future BOQs.</p>
            
            <form onSubmit={handleResolve} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rule Update / Technical Rule</label>
                <textarea 
                  required
                  value={ruleUpdate}
                  onChange={e => setRuleUpdate(e.target.value)}
                  className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows="2"
                  placeholder="e.g. Storage Controller MR416i-p requires P76453-B21 Box 1/2 Cable Kit..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Human Engineer Reasoning & Context</label>
                <input 
                  type="text"
                  value={humanReasoning}
                  onChange={e => setHumanReasoning(e.target.value)}
                  className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Explain why this fix is necessary (e.g. Controller backplane SAS expander routing requirement)..."
                />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Scope Taxonomy</label>
                  <select 
                    value={scopeTaxonomy}
                    onChange={e => setScopeTaxonomy(e.target.value)}
                    className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="CHASSIS_SPECIFIC">Chassis Specific (e.g. DL380 Gen12 SFF)</option>
                    <option value="FAMILY_GEN">Family & Gen (e.g. ProLiant Gen12)</option>
                    <option value="SOLUTION_TYPE">Solution Type (e.g. Storage / Multi-Node)</option>
                    <option value="UNIVERSAL_VENDOR">Universal Vendor (All HPE)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Affected SKU</label>
                  <input 
                    type="text"
                    value={affectedSku}
                    onChange={e => setAffectedSku(e.target.value)}
                    className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="P47777-B21"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Required Dependency SKU</label>
                  <input 
                    type="text"
                    value={requiredDependencySku}
                    onChange={e => setRequiredDependencySku(e.target.value)}
                    className="w-full text-sm border-slate-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="P76453-B21"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button 
                  type="submit" 
                  disabled={isSubmitting || !ruleUpdate}
                  className="btn-primary text-xs"
                >
                  {isSubmitting ? 'Saving...' : 'Resolve & Learn Rule'}
                </button>
                
                {submitStatus && (
                  <span className={`text-xs font-semibold flex items-center gap-1 ${submitStatus.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {submitStatus.type === 'success' ? <CheckCircle className="w-3 h-3" /> : null}
                    {submitStatus.msg}
                  </span>
                )}
              </div>
            </form>
          </div>
          
        </div>
      )}
    </div>
  );
}
