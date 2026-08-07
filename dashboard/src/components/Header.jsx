import React, { useState } from 'react';
import { Cpu, Search, Sparkles, Server, CheckCircle2, AlertCircle, RefreshCw, MessageSquare, Terminal } from 'lucide-react';
import CdpHealthBadge from './CdpHealthBadge';

export default function Header({ 
  catalogs, 
  selectedChassis, 
  onSelectChassis, 
  activeTab, 
  setActiveTab,
  onSmartSearch,
  onOpenFeedbackDrawer
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    await onSmartSearch(searchQuery);
    setIsSearching(false);
  };

  return (
    <header className="glass-nav px-6 py-3 border-b border-slate-200">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand & Context Selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">HPE OCA Intelligence</h1>
              <p className="text-xs text-slate-500 font-medium">Real-Time BOQ Observability & Catalog Engine</p>
            </div>
          </div>

          {/* Global Chassis Selector */}
          <div className="h-6 w-[1px] bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-slate-400" />
            <select
              value={selectedChassis || ''}
              onChange={(e) => onSelectChassis(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {catalogs.length === 0 ? (
                <option value="">No Scraped Catalogs</option>
              ) : (
                catalogs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.chassis} ({c.totalSKUs} SKUs)
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Unified Async Smart Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md w-full">
          <div className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SKUs or type 'Please check in notebook'..."
              className="w-full pl-9 pr-24 py-1.5 text-xs bg-slate-100/80 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3" />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-1.5 px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
            >
              {isSearching ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <>
                  <Sparkles className="w-3 h-3" /> Search
                </>
              )}
            </button>
          </div>
        </form>

        {/* Right Section: CDP Health Indicator & Agent Feedback Drawer */}
        <div className="flex items-center gap-3">
          <CdpHealthBadge />
          
          <button
            onClick={onOpenFeedbackDrawer}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            Feedback Queue
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 overflow-x-auto">
        {[
          { id: 'overview', label: 'Executive Dashboard' },
          { id: 'catalog', label: 'Master Excel Catalog' },
          { id: 'boq', label: 'BOQ Evaluator & DNA' },
          { id: 'conflict', label: '6-Aspect Math & CLIC' },
          { id: 'matrix', label: '5-Tier Resolution Matrix' },
          { id: 'artifacts', label: 'Artifacts & Quality Audit' },
          { id: 'scraper', label: 'Live CDP Scraper' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
}
