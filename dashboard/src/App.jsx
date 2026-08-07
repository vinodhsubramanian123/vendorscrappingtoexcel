import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import CatalogExplorer from './components/CatalogExplorer';
import ScraperTriggerCard from './components/ScraperTriggerCard';
import BoqUploader from './components/BoqUploader';
import WorkloadDnaCard from './components/WorkloadDnaCard';
import ConflictGraphInspector from './components/ConflictGraphInspector';
import ResolutionMatrix from './components/ResolutionMatrix';
import NotebookRagDrawer from './components/NotebookRagDrawer';
import ArtifactInspector from './components/ArtifactInspector';
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

  useEffect(() => {
    fetchAvailableCatalogs();
  }, []);

  // 2. Fetch active catalog JSON data when selectedChassis changes
  useEffect(() => {
    if (!selectedChassis) return;
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
        } else if (payload.type === 'TASK_COMPLETED') {
          setIsTaskRunning(false);
          fetchAvailableCatalogs(); // Refresh catalog registry after scrape/rebuild
        } else if (payload.type === 'LOG') {
          setLogStream(prev => [...prev.slice(-200), payload]);
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
      try {
        const res = await fetch('/api/notebook-query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, chassis: selectedChassis })
        });
        const data = await res.json();
        setRagData(data);
      } catch {
        setRagData({ query, answer: 'RAG Query Failed.', citations: [] });
      }
      setIsQueryingRag(false);
    } else {
      setActiveTab('catalog');
    }
  };

  // Handler: Trigger Scrape
  const handleTriggerScrape = async (mode) => {
    setLogStream([]);
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

  // Handler: Evaluate BOQ
  const handleEvaluateBoq = async (boqInput) => {
    try {
      const currentCat = catalogs.find(c => c.id === selectedChassis);
      const res = await fetch('/api/eval-boq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...boqInput, chassisDir: currentCat?.id })
      });
      const data = await res.json();
      setEvalResults(data);
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
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
            <WorkloadDnaCard dnaData={evalResults?.workloadDna} />
            <ResolutionMatrix
              evalResults={evalResults}
              onOpenPortalFeedback={setSelectedCardForFeedback}
              selectedChassis={selectedChassis}
            />
            <ConflictGraphInspector
              evalResults={evalResults}
              chassisName={currentCatObj?.chassis}
            />
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
            <BoqUploader onEvaluateBoq={handleEvaluateBoq} evalResults={evalResults} />
            {evalResults && <WorkloadDnaCard dnaData={evalResults.workloadDna} />}
          </div>
        )}

        {/* 6-Aspect Math & CLIC Tab */}
        {activeTab === 'conflict' && (
          <ConflictGraphInspector
            evalResults={evalResults}
            chassisName={currentCatObj?.chassis}
          />
        )}

        {/* 5-Tier Matrix Tab */}
        {activeTab === 'matrix' && (
          <ResolutionMatrix
            evalResults={evalResults}
            onOpenPortalFeedback={setSelectedCardForFeedback}
            selectedChassis={selectedChassis}
          />
        )}

        {/* Artifacts & Quality Audit Tab */}
        {activeTab === 'artifacts' && (
          <ArtifactInspector
            currentCatalog={currentCatObj}
            onAuditCatalog={() => {}}
          />
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
