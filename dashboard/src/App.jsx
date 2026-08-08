import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import Header from './components/Header';
import CatalogExplorer from './components/CatalogExplorer';
import ScraperTriggerCard from './components/ScraperTriggerCard';
import BoqUploader from './components/BoqUploader';
import WorkloadDnaCard from './components/WorkloadDnaCard';
import ConflictGraphInspector from './components/ConflictGraphInspector';
import ResolutionMatrix from './components/ResolutionMatrix';
import NotebookRagDrawer from './components/NotebookRagDrawer';
import ArtifactInspector from './components/ArtifactInspector';
import TelemetryCard from './components/TelemetryCard';
import CatalogOverviewCard from './components/CatalogOverviewCard';
import TaskHistoryCard from './components/TaskHistoryCard';
import AmbiguityInbox from './components/AmbiguityInbox';
import UserFeedbackDrawer from './components/UserFeedbackDrawer';
import FeedbackModal from './components/FeedbackModal';
import SettingsDrawer from './components/SettingsDrawer';

export default function App() {
  const [catalogs, setCatalogs] = useState([]);
  const [selectedChassis, setSelectedChassis] = useState('');
  const [catalogData, setCatalogData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Real-time SSE Log Stream State
  const [logStream, setLogStream] = useState([]);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [taskHistory, setTaskHistory] = useState([]);
  const [activeProgress, setActiveProgress] = useState(null);
  
  // BOQ & Evaluation State
  const [evalResults, setEvalResults] = useState(null);
  
  // NotebookLM RAG Drawer State
  const [isRagOpen, setIsRagOpen] = useState(false);
  const [ragData, setRagData] = useState(null);
  const [isQueryingRag, setIsQueryingRag] = useState(false);
  
  // Agent Feedback Queue Drawer State
  const [isFeedbackDrawerOpen, setIsFeedbackDrawerOpen] = useState(false);

  // Settings Drawer State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Portal Feedback Modal State
  const [selectedCardForFeedback, setSelectedCardForFeedback] = useState(null);

  // 1. Fetch available catalogs on mount
  const fetchAvailableCatalogs = async () => {
    try {
      const res = await fetch('/api/available-catalogs');
      const data = await res.json();
      setCatalogs(data.catalogs || []);
      if (data.catalogs && data.catalogs.length > 0 && !selectedChassis) {
        setSelectedChassis(data.catalogs[0].id);
      }
    } catch (err) {
      console.error('Error fetching catalogs:', err);
    }
  };

  const fetchRunHistory = async () => {
    try {
      const res = await fetch('/api/history/runs');
      const runs = await res.json();
      if (Array.isArray(runs) && runs.length > 0) {
        setTaskHistory(runs.map(r => ({
          type: r.taskType || 'PIPELINE_ACTION',
          status: r.exitCode === 0 ? 'COMPLETED' : 'FAILED',
          timestamp: r.startTime || new Date().toISOString()
        })).slice(0, 15));
      }
    } catch (err) {
      console.error('Error fetching run history:', err);
    }
  };

  useEffect(() => {
    fetchAvailableCatalogs();
    fetchRunHistory();
  }, []);

  // 2. Fetch active catalog JSON data when selectedChassis changes
  //    Also clear stale eval/RAG state (Fix G8: prevents ProLiant results showing on Alletra)
  useEffect(() => {
    if (!selectedChassis) return;
    setEvalResults(null);
    setRagData(null);
    setLogStream([]);
    const cat = catalogs.find(c => c.id === selectedChassis);
    if (cat && cat.jsonPath) {
      fetch(`/api/catalog-data?path=${encodeURIComponent(cat.jsonPath)}`)
        .then(res => res.json())
        .then(data => setCatalogData(data))
        .catch(err => console.error('Error fetching catalog data:', err));
    }
  }, [selectedChassis, catalogs]);

  // 3. Connect to Server-Sent Events (SSE) Stream
  useEffect(() => {
    const eventSource = new EventSource('/api/stream-logs');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'TASK_STARTED') {
          setIsTaskRunning(true);
          setActiveProgress({ task: payload.task, currentStep: 0, totalSteps: 0, action: 'Starting...', status: 'started' });
        } else if (payload.type === 'TASK_COMPLETED') {
          setIsTaskRunning(false);
          setActiveProgress(null);
          fetchAvailableCatalogs(); // Refresh catalog registry after scrape/rebuild
          setTaskHistory(prev => [{
            type: payload.task || 'PIPELINE_ACTION',
            status: payload.code === 0 ? 'COMPLETED' : 'FAILED',
            timestamp: new Date().toISOString()
          }, ...prev.slice(0, 15)]);
          if (payload.task?.includes('SCRAPE') || payload.task?.includes('REBUILD')) {
            setActiveTab('catalog'); // G2+G3: Auto-navigate to Master Catalog tab
          }
        } else if (payload.type === 'PROGRESS') {
          setActiveProgress({
            task: payload.task || 'RUNNING',
            currentStep: payload.step,
            totalSteps: payload.total,
            action: payload.action,
            status: payload.status,
            detail: payload.detail
          });
          setLogStream(prev => [...prev.slice(-200), payload]);
        } else if (payload.type === 'LOG') {
          setLogStream(prev => [...prev.slice(-200), payload]);
        } else if (payload.type === 'EVAL_RESULT') {
          // The async BOQ evaluation completed successfully!
          setIsTaskRunning(false);
          setActiveProgress(null);
          
          if (payload.data) {
            setEvalResults(payload.data);
            setActiveTab('overview'); // Flip to 5-Tier Matrix
            
            // Decoupled RAG: Dispatch parallel RAG query now that matrix is rendered
            if (payload.data.notebookPayload) {
              fetch('/api/notebook-query-async', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: payload.data.notebookPayload, chassis: selectedChassis })
              })
              .then(res => res.json())
              .then(jobInfo => {
                if (jobInfo.status === 'COMPLETED') {
                  setEvalResults(prev => ({...prev, ragAnswer: jobInfo.result.answer}));
                } else if (jobInfo.jobId) {
                  // Poll for matrix RAG result
                  let polls = 0;
                  const maxPolls = 35; // 70 seconds max
                  const matrixPoll = setInterval(async () => {
                    polls++;
                    if (polls > maxPolls) {
                      clearInterval(matrixPoll);
                      setEvalResults(prev => ({...prev, ragAnswer: '⚠️ NotebookLM Query Timeout: RAG verification took too long.'}));
                      return;
                    }
                    try {
                      const stRes = await fetch(`/api/notebook-query-status/${jobInfo.jobId}`);
                      const stData = await stRes.json();
                      if (stData.status === 'COMPLETED') {
                        clearInterval(matrixPoll);
                        setEvalResults(prev => ({...prev, ragAnswer: stData.result.answer}));
                      } else if (stData.status === 'FAILED') {
                        clearInterval(matrixPoll);
                        setEvalResults(prev => ({...prev, ragAnswer: `⚠️ NotebookLM Query Failed: ${stData.error}`}));
                      }
                    } catch (e) {
                      console.error('Matrix RAG poll error:', e);
                    }
                  }, 2000);
                }
              })
              .catch(err => console.error('Failed to dispatch background RAG query:', err));
            }
            
          } else if (payload.error) {
            setEvalResults({ status: 'ERROR', error: payload.error.error || 'Evaluation failed' });
          }
        }
      } catch (err) {
        console.error('SSE Error:', err);
      }
    };

    return () => eventSource.close();
  }, []);

  // Handler: Smart Search (FlexSearch + NotebookLM RAG)
  const handleSmartSearch = async (query) => {
    if (query.toLowerCase().includes('notebook') || query.toLowerCase().includes('rag') || query.length > 25) {
      setIsRagOpen(true);
      setIsQueryingRag(true);
      setRagData({ query, answer: 'Querying Gemini NotebookLM... This may take up to 30-60 seconds to consult the QuickSpecs.', citations: [], source: 'PENDING' });
      try {
        const initRes = await fetch('/api/notebook-query-async', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, chassis: selectedChassis })
        });
        const jobInfo = await initRes.json();
        
        if (jobInfo.status === 'COMPLETED') {
          // Instant fallback was returned
          setRagData(jobInfo.result);
          setIsQueryingRag(false);
          return;
        }

        const jobId = jobInfo.jobId;
        let pollCount = 0;
        const maxPolls = 35; // 70 seconds limit
        
        const pollInterval = setInterval(async () => {
          pollCount++;
          if (pollCount > maxPolls) {
            clearInterval(pollInterval);
            setRagData({ query, answer: '⚠️ NotebookLM Query Timeout: No response received after 70 seconds.', citations: [], source: 'ERROR' });
            setIsQueryingRag(false);
            return;
          }
          try {
            const statusRes = await fetch(`/api/notebook-query-status/${jobId}`);
            const statusData = await statusRes.json();
            
            if (statusData.status === 'COMPLETED') {
              clearInterval(pollInterval);
              setRagData(statusData.result);
              setIsQueryingRag(false);
            } else if (statusData.status === 'FAILED') {
              clearInterval(pollInterval);
              setRagData({ query, answer: `NotebookLM Query Failed: ${statusData.error}`, citations: [], source: 'ERROR' });
              setIsQueryingRag(false);
            }
          } catch (pollErr) {
            console.error('Polling error:', pollErr);
          }
        }, 2000); // Poll every 2 seconds
        
      } catch {
        setRagData({ query, answer: 'Failed to initiate RAG Query.', citations: [], source: 'ERROR' });
        setIsQueryingRag(false);
      }
    } else {
      setActiveTab('catalog');
    }
  };

  // Handler: Trigger Scrape
  const handleTriggerScrape = async (mode) => {
    setLogStream([]);
    setActiveTab('scraper');
    setEvalResults(null); // Clear stale cache
    try {
      await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Trigger Rebuild
  const handleTriggerRebuild = async () => {
    setLogStream([]);
    setActiveTab('scraper');
    setEvalResults(null); // Clear stale cache
    try {
      await fetch('/api/rebuild', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Sync Knowledge to NotebookLM
  const handleTriggerSyncKnowledge = async () => {
    setLogStream([]);
    setActiveTab('scraper');
    setEvalResults(null); // Clear stale cache
    try {
      await fetch('/api/sync-knowledge', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Download QuickSpecs PDF (Fix B4)
  const handleTriggerDownloadPdf = async () => {
    setLogStream([]);
    setActiveTab('scraper');
    setEvalResults(null);
    try {
      await fetch('/api/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chassisId: selectedChassis })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Kill Active Task (Enhancement U3)
  const handleTriggerKillTask = async () => {
    try {
      await fetch('/api/kill-task', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Auto-Navigate to OCA
  const handleTriggerNavigate = async () => {
    setLogStream([]);
    setActiveTab('scraper');
    setEvalResults(null);
    try {
      await fetch('/api/navigate-oca', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  // Handler: Evaluate BOQ (Now Async SSE Driven)
  const handleEvaluateBoq = async (boqInput) => {
    setLogStream([]);
    setActiveTab('scraper'); // Flip to terminal view while waiting
    setEvalResults(null);
    try {
      const currentCat = catalogs.find(c => c.id === selectedChassis);
      const res = await fetch('/api/eval-boq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...boqInput, chassisDir: currentCat?.chassisDir || currentCat?.id })
      });
      
      const data = await res.json();
      if (!res.ok) {
        setEvalResults({ status: 'ERROR', error: data.error });
      }
      // If ok (202), we don't return data immediately. The SSE stream will broadcast EVAL_RESULT.
    } catch (err) {
      console.error(err);
      setEvalResults({ status: 'ERROR', error: err.message });
    }
  };

  const currentCatObj = catalogs.find(c => c.id === selectedChassis);

  return (
    <div className="min-h-screen pb-16">
      {/* Header Bar */}
      <Header
        catalogs={catalogs}
        selectedChassis={selectedChassis}
        onSelectChassis={setSelectedChassis}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onSmartSearch={handleSmartSearch}
        onOpenFeedbackDrawer={() => setIsFeedbackDrawerOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isTaskRunning={isTaskRunning}
      />

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-6 mt-6 space-y-6">
        
        {/* Executive Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {currentCatObj && (
              <CatalogOverviewCard
                catalog={currentCatObj}
                catalogData={catalogData}
                onNavigate={setActiveTab}
              />
            )}

            {evalResults ? (
              <>
                <WorkloadDnaCard dnaData={evalResults.workloadDna} />
                <ResolutionMatrix
                  evalResults={evalResults}
                  onOpenPortalFeedback={setSelectedCardForFeedback}
                  selectedChassis={selectedChassis}
                />
                <ConflictGraphInspector
                  evalResults={evalResults}
                  chassisName={currentCatObj?.chassis}
                />
              </>
            ) : (
              <div className="glass-card p-6 border-l-4 border-l-blue-500 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    Unlock 5-Tier Resolution &amp; 6-Aspect Verification
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Upload a customer BOQ quote (.xlsx, .csv, .json) or paste raw text to extract Workload DNA, audit physical rules, and rank buildable solutions.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('boq')}
                  className="btn-primary text-xs shrink-0"
                >
                  Evaluate BOQ Quote &rarr;
                </button>
              </div>
            )}

            <TaskHistoryCard tasks={taskHistory} activeProgress={activeProgress} isTaskRunning={isTaskRunning} />
          </div>
        )}

        {/* Master Catalog Explorer Tab */}
        {activeTab === 'catalog' && (
          <CatalogExplorer
            catalogData={catalogData}
            chassisName={currentCatObj?.chassis}
          />
        )}

        {/* BOQ Evaluator Tab */}
        {activeTab === 'boq' && (
          <div className="space-y-6">
            <BoqUploader 
              onEvaluateBoq={handleEvaluateBoq} 
              evalResults={evalResults} 
              logStream={logStream} 
            />
            {evalResults && <WorkloadDnaCard dnaData={evalResults.workloadDna} />}
          </div>
        )}

        {/* 6-Aspect Math & CLIC Tab */}
        {activeTab === 'conflict' && (
          <div className="space-y-6">
            <AmbiguityInbox 
              evalResults={evalResults} 
              chassisContext={evalResults?.chassisDetection?.chassisDir?.split('/').pop() || 'Unknown'} 
            />
            <ConflictGraphInspector
              evalResults={evalResults}
              chassisName={currentCatObj?.chassis}
            />
          </div>
        )}

        {/* 5-Tier Matrix Tab */}
        {activeTab === 'matrix' && (
          <ResolutionMatrix
            evalResults={evalResults}
            onOpenPortalFeedback={setSelectedCardForFeedback}
            selectedChassis={selectedChassis}
            onTriggerDemoBoq={handleEvaluateBoq}
          />
        )}

        {/* Artifacts & Quality Audit Tab */}
        {activeTab === 'artifacts' && (
          <ArtifactInspector
            currentCatalog={currentCatObj}
            onAuditCatalog={() => {}}
          />
        )}

        {/* System Telemetry & Observability Tab */}
        {activeTab === 'telemetry' && (
          <TelemetryCard />
        )}

        {/* Live Scraper & SSE Terminal Tab */}
        {activeTab === 'scraper' && (
          <ScraperTriggerCard
            logStream={logStream}
            isTaskRunning={isTaskRunning}
            onTriggerScrape={handleTriggerScrape}
            onTriggerRebuild={handleTriggerRebuild}
            onTriggerDownloadPdf={handleTriggerDownloadPdf}
            onTriggerSyncKnowledge={handleTriggerSyncKnowledge}
            onTriggerKillTask={handleTriggerKillTask}
            onTriggerNavigate={handleTriggerNavigate}
          />
        )}

      </main>

      {/* Drawers & Modals */}
      <NotebookRagDrawer
        isOpen={isRagOpen}
        onClose={() => setIsRagOpen(false)}
        ragData={ragData}
        isQuerying={isQueryingRag}
      />

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <UserFeedbackDrawer
        isOpen={isFeedbackDrawerOpen}
        onClose={() => setIsFeedbackDrawerOpen(false)}
      />

      <FeedbackModal
        isOpen={!!selectedCardForFeedback}
        onClose={() => setSelectedCardForFeedback(null)}
        resolutionCard={selectedCardForFeedback}
      />
    </div>
  );
}
