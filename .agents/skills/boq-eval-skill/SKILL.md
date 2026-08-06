---
name: boq-eval-skill
description: "Pre-Flight BOQ (Bill of Quantities) Evaluation & Validation Skill. Use this skill whenever users provide a customer BOQ, hardware list, bill of materials, Excel quote, or proposal requiring validation against HPE server specs (DL380 Gen12, Gen11, Alletra, Synergy). Performs pre-cleanup, consolidated quantity calculation, physical thermal/fan/riser/power dependency validation, queries Gemini Notebook for grounded RAG resolution, and outputs structured 5-Tier Strategic Resolution Reports with exact SKU fixes."
version: "1.0.0"
---

# Pre-Flight BOQ Evaluation & Validation Skill

This skill provides a standardized 4-phase workflow to ingest, pre-clean, mathematically validate, and RAG-verify customer Bill of Materials (BOQ) requests against official HPE server catalog specifications.

---

## 🎯 When to Use This Skill

Trigger this skill whenever a user provides:
- A raw customer hardware BOQ (Excel `.xlsx`, `.csv`, `.tsv`, pasted text, or image descriptions)
- A request to validate a hardware configuration or bill of materials
- A request to detect missing cables, heatsinks, high-performance fans, riser cards, or power supplies
- A request for 5-tier strategic resolution options (Rank 1: Customer Intent, Rank 2: Performance, Rank 3: CapEx, Rank 4: Eco/Green, Rank 5: Dense I/O Cluster)

---

## 🔄 4-Phase Execution Pipeline

```
Raw Customer BOQ (CSV / TSV / JSON / Text)
       │
       ▼
Phase 1: Pre-Flight Parsing & Normalization (`scripts/lib/boq_evaluator.js`)
   • Extract Product # (SKUs), descriptions, raw quantities
   • Standardize HPE part numbers (CTO/BTO mode suffixes, service SKUs)
   • Consolidate duplicate rows into clean `Current Qty` sums
       │
       ▼
Phase 2: Physical Dependency & Mathematical Validation
   • Compute CPU Thermal TDP (Watts) vs Heatsink & Fan Requirements (TDP > 250W -> High Perf Fan P48820-B21)
   • Validate Memory Population Math (32 DIMMs max, 8 channels/socket, 1DPC vs 2DPC, x4 vs x8, 3DS vs non-3DS)
   • Validate PCIe Riser Slot Allocation & Storage Controller Enablement
   • Validate Power Supply Redundancy & Matching Power Cord / Lug Kits
       │
       ▼
Phase 3: Grounded Gemini Notebook RAG Query (`nlm notebook query`)
   • Pass pre-cleaned BOQ summary payload to active Gemini Notebook (`Dl 380 Spec Gen 12` or target notebook)
   • Fetch exact missing SKU fixes and zero-hallucination unit pricing
   • Formulate 5-Tier Strategic Resolution Hierarchy
       │
       ▼
Phase 4: Consolidated Report Synthesis (`scripts/eval_boq.js`)
   • Generate Markdown & JSON evaluation report
   • Highlight explicit errors, warnings, missing parts, and SKU direct fixes
```

---

## 🛠️ CLI Quickstart

Run the automated BOQ evaluation engine directly from terminal:

```bash
# Evaluate a CSV or TSV BOQ file against active Gemini Notebook:
node scripts/eval_boq.js test_boq_dl380_gen12.csv

# Custom notebook ID and custom output report path:
node scripts/eval_boq.js path/to/customer_boq.csv \
  --notebook-id 1d190853-4e9c-48df-aa70-eae66c6f2c1f \
  --output outputs/reports/customer_boq_eval_report.md
```

---

## 🏆 5-Tier Strategic Resolution Hierarchy

When resolving BOQ errors or missing physical dependencies, format resolution options in this exact hierarchy:

1. 🏆 **Rank 1: Customer Intent Preserved (Highest Priority)**
   - Keep exact requested CPU core count, memory capacity, and storage density.
   - Resolve blocks solely by adding mandatory physical dependencies (High-Performance Fan Kit `P48820-B21`, No-Drive FIO Kit `873763-B21`, Controller Cable Kits `P76453-B21`).

2. 🥈 **Rank 2: Performance & Bandwidth Optimized Alternate**
   - Symmetrically balance memory across 8 channels per CPU socket (6000MT/s @ 2DPC).
   - Upgrade PCIe risers to x16/x16/x16 primary/secondary kits (`P48803-B21` / `P51083-B21`) to eliminate electrical bottlenecks.

3. 🥉 **Rank 3: CapEx Budget Saver Alternate**
   - Offer cost optimizations for over-configured quotes, swapping high-TDP CPUs for mainline options to eliminate high-performance fan or Titanium power supply requirements.

4. 🌿 **Rank 4: Sustainability & Eco-Efficiency (Green) Alternate**
   - Enforce 96% efficient Titanium power supplies, Direct Liquid Cooling (DLC), and ASHRAE A3/A4 high-ambient temperature operation.

5. ⚡ **Rank 5: Dense I/O Database Cluster Alternate**
   - Restructure build for extreme database speeds using high-cache controllers (MR416i-p / MR932i-p), direct-attach NVMe trigger kits, and Smart Storage Batteries (`P01366-B21`) for write-cache protection.
