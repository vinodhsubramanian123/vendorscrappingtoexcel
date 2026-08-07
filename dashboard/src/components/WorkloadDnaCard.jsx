import React from 'react';
import { Cpu, Database, Zap, Layers, Activity } from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts';

export default function WorkloadDnaCard({ dnaData }) {
  if (!dnaData) {
    return (
      <div className="glass-card p-6 text-center text-slate-400">
        <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-xs font-semibold text-slate-600">No BOQ Evaluated Yet</p>
        <p className="text-[11px] text-slate-400">Upload a BOQ above to extract live Workload DNA profiling metrics.</p>
      </div>
    );
  }

  const {
    totalCores = 64,
    coresPerSocket = 32,
    ramPerCoreGb = 16,
    gpuCount = 0,
    storageIoType = 'NVMe Read Intensive',
    workloadIntent = 'In-Memory Analytics / SAP HANA'
  } = dnaData;

  const chartData = [
    { name: 'RAM/Core (GB)', value: Math.min(ramPerCoreGb * 2, 100), fill: '#2563EB' },
    { name: 'Core Density', value: Math.min(coresPerSocket * 2, 100), fill: '#01A781' },
    { name: 'GPU Acceleration', value: gpuCount > 0 ? 100 : 20, fill: '#D97706' }
  ];

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Workload DNA Profiler
          </h3>
          <p className="text-xs text-slate-500">Detected Customer Workload Intent: <span className="font-semibold text-blue-600">{workloadIntent}</span></p>
        </div>

        <span className="badge badge-emerald">DNA Confidence 96%</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Core Density */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase">CPU Core Density</p>
            <p className="text-sm font-bold text-slate-900">{totalCores} Cores ({coresPerSocket}/sock)</p>
          </div>
        </div>

        {/* RAM Density Ratio */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase">Memory Density</p>
            <p className="text-sm font-bold text-slate-900">{ramPerCoreGb} GB / Core</p>
          </div>
        </div>

        {/* GPU Accelerator */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase">GPU Acceleration</p>
            <p className="text-sm font-bold text-slate-900">{gpuCount > 0 ? `${gpuCount}x Enterprise GPU` : 'Standard Compute'}</p>
          </div>
        </div>

        {/* Storage IO Profile */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase">Storage I/O Tier</p>
            <p className="text-xs font-bold text-slate-900 truncate">{storageIoType}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
