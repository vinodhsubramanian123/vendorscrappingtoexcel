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

  // FB-1: Extract Chassis Variant & Portfolio Price Matrix
  const baseVariants = [];
  catalogData.entries?.forEach(entry => {
    const parentLower = (entry.parentCategory || '').toLowerCase();
    const subLower = (entry.subCategory || '').toLowerCase();
    
    // Look for Base Configuration, Server, Compute Module, System, or Chassis
    if (parentLower.includes('server') || parentLower.includes('base') || parentLower.includes('compute module') || parentLower.includes('system') || subLower.includes('base')) {
      entry.skus?.forEach(sku => {
        const priceStr = sku['Unit Price (USD)'] || '0';
        const priceNum = parseFloat(priceStr.replace(/,/g, ''));
        // Filter out cheap accessories that might be grouped under 'base', focus on main chassis
        if (priceNum > 500 && !baseVariants.find(v => v.sku === sku['Product #'])) {
          // Additional filter to ensure it's a server/chassis by looking at description
          const desc = (sku.Description || '').toLowerCase();
          if (desc.includes('server') || desc.includes('chassis') || desc.includes('node') || desc.includes('system') || desc.includes('module')) {
            baseVariants.push({
              sku: sku['Product #'],
              desc: sku.Description,
              price: priceStr
            });
          }
        }
      });
    }
  });

  // Sort by price ascending and take top 4
  baseVariants.sort((a, b) => parseFloat(a.price.replace(/,/g, '')) - parseFloat(b.price.replace(/,/g, '')));
  const displayVariants = baseVariants.slice(0, 4);

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

      {/* FB-1: Chassis Variant & Portfolio Price Matrix */}
      {displayVariants.length > 0 && (
        <div className="pt-2">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Server className="w-4 h-4 text-blue-600" /> Chassis Variant &amp; Portfolio Price Matrix
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {displayVariants.map((variant, idx) => (
              <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-bold text-blue-600 mb-0.5">{variant.sku}</p>
                  <p className="text-[11px] font-semibold text-slate-700 line-clamp-3 mb-2" title={variant.desc}>
                    {variant.desc}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between items-center mt-auto">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase">Base Price</span>
                  <span className="text-sm font-bold text-emerald-700">${variant.price}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
