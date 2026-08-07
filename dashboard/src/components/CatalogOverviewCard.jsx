import React from 'react';
import { FileSpreadsheet, TrendingUp, PlusCircle, MinusCircle, AlertCircle, FileText, Download, Sparkles, Server } from 'lucide-react';

export default function CatalogOverviewCard({ catalog, catalogData, onNavigate }) {
  if (!catalog || !catalogData) return null;

  const metadata = catalogData.metadata || {};
  
  // Calculate diff status breakdown
  let added = 0;
  let removed = 0;
  let priceChanged = 0;
  let totalSkus = 0;

  catalogData.entries?.forEach(entry => {
    entry.skus?.forEach(sku => {
      totalSkus++;
      const status = sku.diffStatus || sku['Diff Status'] || 'UNCHANGED';
      if (status === 'ADDED') added++;
      else if (status === 'REMOVED') removed++;
      else if (status === 'PRICE_CHANGED') priceChanged++;
    });
  });

  const uniqueSkus = metadata.totalUniqueSKUs || catalog.totalSKUs || totalSkus;
  const scrapeDate = metadata.scrapeDate || catalog.scrapeDate || 'Latest Scrape';

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
        <div>
          <span className="badge badge-blue mb-1">{catalog.family} &bull; {catalog.gen}</span>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-5 h-5 text-emerald-600" />
            {catalog.chassis}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Scraped on <span className="font-semibold text-slate-700">{scrapeDate}</span> | Catalog Directory: <span className="font-mono text-slate-600">{catalog.chassisDir}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {catalog.xlsxPath && (
            <a
              href={catalog.xlsxPath}
              download
              className="btn-primary text-xs"
            >
              <Download className="w-3.5 h-3.5" /> Download Excel
            </a>
          )}
          {catalog.pdfPath && (
            <a
              href={catalog.pdfPath}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs"
            >
              <FileText className="w-3.5 h-3.5 text-amber-600" /> QuickSpecs PDF
            </a>
          )}
        </div>
      </div>

      {/* Catalog Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unique SKUs</p>
          <p className="text-lg font-bold text-slate-900">{uniqueSkus}</p>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sub-Categories</p>
          <p className="text-lg font-bold text-slate-900">{metadata.totalSubcategories || catalogData.subcategories?.length || 0}</p>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Catalog Tables</p>
          <p className="text-lg font-bold text-slate-900">{metadata.totalTables || catalogData.entries?.length || 0}</p>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scrape Date</p>
          <p className="text-xs font-bold text-slate-900 mt-1 truncate">{scrapeDate}</p>
        </div>
      </div>

      {/* Catalog Diff Summary Card (Fix G26) */}
      <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-slate-900">Historical Snapshot &amp; Diff Summary</h4>
            <p className="text-[11px] text-slate-500">Tracked changes against previous catalog snapshot</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" /> +{added} Added
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
            <MinusCircle className="w-3.5 h-3.5 text-rose-600" /> -{removed} Removed
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> {priceChanged} Price Delta
          </span>
          <button
            onClick={() => onNavigate('catalog')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline ml-2"
          >
            Explore SKUs &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
