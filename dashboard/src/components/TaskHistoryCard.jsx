import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, RefreshCw, Server, FileText, Sparkles, Terminal, ChevronRight, XCircle } from 'lucide-react';

export default function TaskHistoryCard({ tasks = [], activeProgress = null, isTaskRunning = false }) { // Still accepts real-time tasks from props
  const [historyRuns, setHistoryRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [traceLogs, setTraceLogs] = useState([]);
  const [isLoadingTrace, setIsLoadingTrace] = useState(false);

  // Fetch historical runs on mount
  useEffect(() => {
    fetch('/api/history/runs')
      .then(res => res.json())
      .then(data => setHistoryRuns(data))
      .catch(console.error);
  }, [tasks]); // Re-fetch when a new task completes

  const handleViewTrace = async (runId) => {
    setIsLoadingTrace(true);
    setSelectedRun(runId);
    setTraceLogs([]);
    try {
      const res = await fetch(`/api/history/runs/${runId}`);
      const data = await res.json();
      setTraceLogs(data.logs || []);
    } catch (err) {
      setTraceLogs([{ text: 'Error loading trace logs.', stream: 'stderr' }]);
    } finally {
      setIsLoadingTrace(false);
    }
  };

  const getTaskIcon = (type = '') => {
    if (type.includes('SCRAPE')) return <Server className="w-4 h-4 text-emerald-600" />;
    if (type.includes('EVAL')) return <FileText className="w-4 h-4 text-blue-600" />;
    if (type.includes('KNOWLEDGE') || type.includes('SYNC')) return <Sparkles className="w-4 h-4 text-purple-600" />;
    return <RefreshCw className="w-4 h-4 text-slate-600" />;
  };

  // Merge real-time volatile tasks and persistent history runs
  const combinedTasks = [...historyRuns];

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          Pipeline Task Execution Log &amp; Audit Timeline
        </h3>
        <span className="mono text-[11px] text-slate-400">{combinedTasks.length} Run(s)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Side: Run Ledger */}
        <div className="space-y-4 max-h-[30rem] overflow-y-auto pr-1">
          
          {/* Active Running Task Tracker */}
          {isTaskRunning && activeProgress && (
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-700 ease-out" style={{ width: `${activeProgress.totalSteps ? (activeProgress.currentStep / activeProgress.totalSteps) * 100 : 10}%` }}></div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                  <span className="animate-pulse">Active Pipeline Task</span>
                </h4>
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  Step {activeProgress.currentStep || 0} / {activeProgress.totalSteps || '?'}
                </span>
              </div>
              <p className="text-sm text-blue-800 font-medium">{activeProgress.action || 'Initializing pipeline engine...'}</p>
              {activeProgress.detail && (
                <p className="text-[11px] text-blue-600/80 mt-1">{activeProgress.detail}</p>
              )}
            </div>
          )}

          {/* Historical Runs */}
          <div className="space-y-2">
            {combinedTasks.length === 0 && !isTaskRunning ? (
              <div className="text-center text-slate-400 py-8">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">No Recent Pipeline Tasks Executed</p>
                <p className="text-[11px] text-slate-400">Trigger a scrape, BOQ evaluation, or knowledge sync.</p>
              </div>
            ) : (
            combinedTasks.map((task, idx) => (
              <div 
                key={idx} 
                className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${selectedRun === task.runId ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'}`}
                onClick={() => handleViewTrace(task.runId)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    {getTaskIcon(task.taskType)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{task.taskType}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{task.startTime ? new Date(task.startTime).toLocaleString() : 'Recent'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className={`badge ${task.exitCode === 0 || task.status === 'COMPLETED' ? 'badge-emerald' : 'badge-amber'}`}>
                      {task.exitCode === 0 ? 'SUCCESS' : task.status || `CODE ${task.exitCode}`}
                    </span>
                    {task.durationMs && (
                      <span className="mono text-[10px] text-slate-500 mt-1">{(task.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 ${selectedRun === task.runId ? 'text-blue-600' : 'text-slate-300'}`} />
                </div>
              </div>
            ))
          )}
          </div>
        </div>

        {/* Right Side: Trace Terminal */}
        <div className="bg-slate-900 rounded-xl p-4 h-80 flex flex-col shadow-inner">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-700">
            <h4 className="text-xs font-mono font-semibold text-slate-300 flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" /> 
              {selectedRun ? `Trace: ${selectedRun}` : 'Select a run to view trace'}
            </h4>
            {selectedRun && (
              <button onClick={() => setSelectedRun(null)} className="text-slate-500 hover:text-slate-300">
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto text-[10px] font-mono whitespace-pre-wrap">
            {!selectedRun ? (
              <div className="text-slate-600 flex h-full items-center justify-center">No trace selected.</div>
            ) : isLoadingTrace ? (
              <div className="text-blue-400 flex h-full items-center justify-center animate-pulse">Loading trace logs...</div>
            ) : traceLogs.length === 0 ? (
              <div className="text-slate-500">No logs recorded for this run.</div>
            ) : (
              traceLogs.map((log, i) => {
                const isPass = log.text?.includes('PASS') || log.text?.includes('SUCCESS') || log.text?.includes('✅');
                const isErr = log.stream === 'stderr' || log.text?.includes('FAIL') || log.text?.includes('ERROR') || log.text?.includes('❌');
                const colorClass = isPass ? 'text-emerald-400' : isErr ? 'text-rose-400' : 'text-slate-300';
                
                return (
                  <div key={i} className={`mb-1 ${colorClass}`}>
                    <span className="text-slate-600 select-none mr-2">[{log.timestamp ? log.timestamp.split('T')[1].slice(0,-1) : '--'}]</span>
                    {log.text}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
