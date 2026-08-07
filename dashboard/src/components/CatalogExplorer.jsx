import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, FileSpreadsheet, X, Filter } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { catalogIndexer } from '../utils/nlpSearch';

export default function CatalogExplorer({ catalogData, chassisName }) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedSkuTrend, setSelectedSkuTrend] = useState(null);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [activeSubCategory, setActiveSubCategory] = useState('ALL');
  const [activeType, setActiveType] = useState('ALL');

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
        sku: sku.sku || sku['Product #'] || sku.partNumber || sku.id || 'CTO-OPTION',
        description: sku.description || sku['Description'] || sku.name || sku.subCategory || 'Configuration Option',
        optionType: sku.optionType || sku['Option Type'] || sku.Type || 'CTO',
        listPrice: sku.listPrice || sku['Price (USD)'] || sku['List Price (USD)'] || sku['List Price'] || 'N/A',
        diffStatus: sku.diffStatus || sku['Diff Status'] || 'UNCHANGED',
        parentCategory: entry.parentCategory || 'Uncategorized',
        subCategory: entry.subCategory || 'General',
        constraint: entry.constraint,
        rules: entry.rules
      });
    });
  });

  const categories = ['ALL', ...new Set(allSkus.map(e => e.parentCategory).filter(Boolean))];
  
  // Available sub-categories based on selected category
  const availableSubCategories = activeCategory === 'ALL'
    ? ['ALL', ...new Set(allSkus.map(e => e.subCategory).filter(Boolean))]
    : ['ALL', ...new Set(allSkus.filter(e => e.parentCategory === activeCategory).map(e => e.subCategory).filter(Boolean))];

  const types = ['ALL', 'CTO', 'BTO', 'FIO', 'Service'];

  // Filter SKUs
  let displayedSkus = searchResults !== null ? searchResults : allSkus;
  if (activeCategory !== 'ALL') {
    displayedSkus = displayedSkus.filter(s => s.parentCategory === activeCategory);
  }
  if (activeSubCategory !== 'ALL') {
    displayedSkus = displayedSkus.filter(s => s.subCategory === activeSubCategory);
  }
  if (activeType !== 'ALL') {
    displayedSkus = displayedSkus.filter(s => s.optionType === activeType);
  }

  // Price formatting helper
  const formatPrice = (priceVal) => {
    if (priceVal === undefined || priceVal === null || priceVal === '' || priceVal === 'N/A') return 'N/A';
    const num = parseFloat(String(priceVal).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return 'N/A';
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const [realPriceTrail, setRealPriceTrail] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleOpenTrend = async (sku) => {
    setSelectedSkuTrend(sku);
    setLoadingHistory(true);
    const skuId = sku.sku || sku.partNumber;
    try {
      const res = await fetch(`/api/price-history?sku=${encodeURIComponent(skuId)}&chassis=${encodeURIComponent(chassisName || '')}`);
      const data = await res.json();
      if (data.history && data.history.length > 0) {
        setRealPriceTrail(data.history);
      } else {
        // Baseline single point
        setRealPriceTrail([{ date: 'Current', price: parseFloat(sku.listPrice) || 0, status: 'BASELINE' }]);
      }
    } catch {
      setRealPriceTrail([{ date: 'Current', price: parseFloat(sku.listPrice) || 0, status: 'BASELINE' }]);
    }
    setLoadingHistory(false);
  };

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
            Total SKUs: <span className="font-semibold text-slate-800">{allSkus.length}</span> | Filtered: <span className="font-semibold text-blue-600">{displayedSkus.length}</span>
          </p>
        </div>

        {/* Filter & Attribute Search Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Instant Search input */}
          <div className="relative flex-1 md:w-56">
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search SKU ID, attribute, rules..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>

          {/* Main Category Filter */}
          <select
            value={activeCategory}
            onChange={(e) => { setActiveCategory(e.target.value); setActiveSubCategory('ALL'); }}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none max-w-[140px] truncate"
          >
            <option value="ALL">All Categories</option>
            {categories.filter(c => c !== 'ALL').map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Sub-Category Filter */}
          <select
            value={activeSubCategory}
            onChange={(e) => setActiveSubCategory(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none max-w-[140px] truncate"
          >
            <option value="ALL">All Sub-Categories</option>
            {availableSubCategories.filter(s => s !== 'ALL').map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={activeType}
            onChange={(e) => setActiveType(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="CTO">CTO</option>
            <option value="BTO">BTO</option>
            <option value="FIO">FIO</option>
            <option value="Service">Service</option>
          </select>
        </div>
      </div>

      {/* SKU Table View */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Vendor SKU ID / Part #</th>
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
                      <td className="px-4 py-2.5 font-bold mono text-slate-900">{sku.sku || sku.partNumber || sku.id || 'CTO-OPTION'}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 max-w-xs truncate">{sku.description || sku.name || sku.subCategory || 'Configuration Option'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{sku.parentCategory}</td>
                      <td className="px-4 py-2.5 text-slate-500">{sku.subCategory}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-600">{sku.optionType || 'CTO'}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
                        {formatPrice(sku.listPrice)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleOpenTrend(sku)}
                          className="p-1 text-amber-600 hover:bg-amber-50 rounded transition-all"
                          title="View Real Price History Trail"
                        >
                          <TrendingUp className="w-4 h-4" />
                        </button>
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
                  Historical Price Elasticity &amp; Trend Trail
                </h3>
                <p className="text-xs mono text-slate-500">{selectedSkuTrend.sku || selectedSkuTrend.partNumber}</p>
              </div>
              <button onClick={() => setSelectedSkuTrend(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="h-64 flex items-center justify-center text-xs text-slate-400">Loading price history...</div>
            ) : (
              <div className="h-64 w-full my-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={realPriceTrail}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="date" stroke="#94A3B8" fontSize={10} />
                    <YAxis stroke="#94A3B8" fontSize={10} />
                    <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                    <Line type="monotone" dataKey="price" stroke="#D97706" strokeWidth={2} dot={{ fill: '#D97706' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <button onClick={() => setSelectedSkuTrend(null)} className="w-full btn-secondary justify-center text-xs">
              Close Price Chart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
