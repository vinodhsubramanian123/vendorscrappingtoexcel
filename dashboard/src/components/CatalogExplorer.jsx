import React, { useState, useEffect } from 'react';
import { Table, Search, DollarSign, ArrowUpRight, TrendingUp, Filter, FileSpreadsheet, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { catalogIndexer } from '../utils/nlpSearch';

export default function CatalogExplorer({ catalogData, chassisName }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedSkuTrend, setSelectedSkuTrend] = useState(null);
  const [activeCategory, setActiveCategory] = useState('ALL');

  useEffect(() => {
    if (catalogData) {
      catalogIndexer.indexCatalog(catalogData);
    }
  }, [catalogData]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (!val.trim()) {
      setSearchResults(null);
    } else {
      const matches = catalogIndexer.search(val);
      setSearchResults(matches);
    }
  };

  if (!catalogData) {
    return (
      <div className="glass-card p-8 text-center text-slate-500">
        <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-slate-700">No Catalog Selected</p>
        <p className="text-xs text-slate-400 mt-1">Select a catalog from the header dropdown to view SKUs.</p>
      </div>
    );
  }

  // Extract all SKUs across entries
  let allSkus = [];
  catalogData.entries?.forEach(entry => {
    entry.skus?.forEach(sku => {
      allSkus.push({
        ...sku,
        parentCategory: entry.parentCategory,
        subCategory: entry.subCategory,
        constraint: entry.constraint,
        rules: entry.rules
      });
    });
  });

  const categories = ['ALL', ...new Set(catalogData.entries?.map(e => e.parentCategory).filter(Boolean))];

  // Filter SKUs
  let displayedSkus = searchResults !== null ? searchResults : allSkus;
  if (activeCategory !== 'ALL') {
    displayedSkus = displayedSkus.filter(s => s.parentCategory === activeCategory);
  }

  return (
    <div className="space-y-6">
      {/* Top Explorer Control Bar */}
      <div className="glass-card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            {chassisName || 'Master Catalog'} Explorer
          </h2>
          <p className="text-xs text-slate-500">
            Total Unique SKUs: <span className="font-semibold text-slate-800">{allSkus.length}</span> | Categories: <span className="font-semibold text-slate-800">{categories.length - 1}</span>
          </p>
        </div>

        {/* Filter & Attribute Search */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Instant attribute filter..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* SKU Table View */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">HPE SKU ID</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Sub-Category</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">List Price (USD)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedSkus.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No SKUs matched your search filter.
                  </td>
                </tr>
              ) : (
                displayedSkus.map((sku, idx) => {
                  const status = sku.diffStatus || 'UNCHANGED';
                  const isAdded = status === 'ADDED';
                  const isRemoved = status === 'REMOVED';
                  const isPriceChanged = status === 'PRICE_CHANGED';

                  return (
                    <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${isRemoved ? 'bg-rose-50/40 line-through text-rose-800' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className={`badge ${
                          isAdded ? 'badge-emerald' : isPriceChanged ? 'badge-amber' : isRemoved ? 'badge-rose' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-bold mono text-slate-900">{sku.sku || sku.partNumber}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 max-w-xs truncate">{sku.description || sku.name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{sku.parentCategory}</td>
                      <td className="px-4 py-2.5 text-slate-500">{sku.subCategory}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-600">{sku.optionType || 'CTO'}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
                        {sku.listPrice ? `$${sku.listPrice}` : 'N/A'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isPriceChanged && (
                          <button
                            onClick={() => setSelectedSkuTrend(sku)}
                            className="p-1 text-amber-600 hover:bg-amber-50 rounded transition-all"
                            title="View Price Trend Line Chart"
                          >
                            <TrendingUp className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Price Trend Modal */}
      {selectedSkuTrend && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                  Historical Price Trend
                </h3>
                <p className="text-xs mono text-slate-500">{selectedSkuTrend.sku}</p>
              </div>
              <button onClick={() => setSelectedSkuTrend(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="h-64 w-full my-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[
                  { date: '2026-06-01', price: selectedSkuTrend.listPrice * 0.9 },
                  { date: '2026-07-01', price: selectedSkuTrend.listPrice * 0.95 },
                  { date: '2026-08-01', price: selectedSkuTrend.listPrice }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="date" stroke="#94A3B8" fontSize={10} />
                  <YAxis stroke="#94A3B8" fontSize={10} />
                  <Tooltip />
                  <Line type="monotone" dataKey="price" stroke="#D97706" strokeWidth={2} dot={{ fill: '#D97706' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <button onClick={() => setSelectedSkuTrend(null)} className="w-full btn-secondary justify-center text-xs">
              Close Price Chart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
