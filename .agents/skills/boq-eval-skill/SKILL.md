---
name: boq-eval-skill
description: Pre-Flight BOQ (Bill of Quantities) Evaluation, 6-Aspect Physical Validation & Closed-Loop Portal Feedback Skill. Use this skill whenever users provide a customer BOQ, hardware list, bill of materials, multi-sheet Excel quote, or proposal requiring validation against HPE server specs (DL380 Gen12, Gen11, Alletra, Synergy). Performs pre-cleanup, multi-sheet ingestion, chassis multiplier consolidation, modular 6-aspect physical pre-checks (Compute/Thermal, Memory/Channels, Storage/Tri-Mode, Networking/OCP, Power/Environment, Support/Services), quantitative confidence scoring, Gemini Notebook RAG query resolution, and outputs structured 5-Tier Strategic Resolution Reports with exact SKU fixes.
---

# Pre-Flight BOQ Evaluation & Closed-Loop Feedback Skill (`boq-eval-skill`)

---

## 1. Overview & Workflow Lifecycle

This skill provides an automated, agentic workflow for ingesting raw customer BOQs, pre-cleaning input data, running deterministic 6-aspect physical math assertions, querying Gemini Notebook RAG (`Dl 380 Spec Gen 12` - ID: `1d190853-4e9c-48df-aa70-eae66c6f2c1f`), and capturing closed-loop feedback from HPE OCA portal rejections.

```
[1. CUSTOMER BOQ] (CSV / Excel Multi-Sheet / PDF / Image / Text)
       │
       ▼
[2. BOQ INGESTION & CONSOLIDATION PARSER] (`scripts/lib/boq_evaluator.js`)
   ├── Multi-Sheet Excel Workbook Inspection (`xlsx` sheet enumeration)
   ├── Config Separator Normalization (`/`, `|`, `;`, `+`, `--`, tab columns)
   └── Multiplier Engine (`serverQty * chassisMultiplier = totalConsolidatedQty`)
       │
       ▼
[3. MODULAR 6-ASPECT SOLUTION PRE-CHECK ENGINE] (`scripts/lib/boq_evaluator.js`)
   ├── 1. Compute & Thermal: CPU TDP vs Heatsinks (`P74792-B21`), High-Perf Fan Kits (`P48820-B21`)
   ├── 2. Memory & Channel: 32 DIMM max, 8 channels/CPU socket, 96GB/128GB/3DS/bit-width rules
   ├── 3. Storage & Tri-Mode: EDSFF vs SFF/LFF cages, Box 1/2 cables (`P76453-B21`), Battery (`P01366-B21`)
   ├── 4. Networking & OCP: OCP 3.0 NIC slots A/B, rear OCP cable enablement kits (`P72201-B21`)
   ├── 5. Power & Ambient: -48VDC Lug Kits (`P36877-B21`), Titanium 96% PSUs, AC/DC cord filtering
   └── 6. Support & Services: CTO `-B21` option suffixes, OS FIO rules, Tech Care 3Y/5Y tiers
       │
       ▼
[4. ATTRIBUTE & WORKLOAD GEMINI NOTEBOOK RAG] (`nlm-skill` / `1d190853-4e9c-48df-aa70-eae66c6f2c1f`)
   ├── Dynamic Attribute Queries (`Memory > 32GB` -> 64GB, 96GB, 128GB; `CPU Cores >= 32`, `NVMe U.3`)
   ├── Workload-to-BOQ Construction (Translates natural language workload specs into validated SKUs)
   └── 5-Tier Strategic Resolution Hierarchy (Rank 1: Intent to Rank 5: Dense I/O)
       │
       ▼
[5. CONFIDENCE SCORING & HUMAN-IN-THE-LOOP (HITL) CLARIFICATION]
   ├── Base Score 1.0; deducts for missing cables, unverified SKUs, or thermal mismatches
   └── Triggers explicit HITL prompt when confidence < 0.75 or when rule contradictions occur
       │
       ▼
[6. HPE OCA PORTAL AUTOMATION] (`oca-catalog-scraper` / `scripts/lib/cdp.js`)
   ├── 100% Hands-Free CDP Automation (Permission Suppression, Dialog Interception)
   └── Configuration Quote Validation & Unbuildable Error Extraction
       │
       ▼
[7. CLOSED-LOOP FEEDBACK & KNOWLEDGE DELTA LOGGING] (`scripts/lib/feedback_loop.js`)
   ├── Classify Portal Errors (Temporary Supply vs Permanent Physical Incompatibility)
   ├── Log `KnowledgeDeltas` in `history/catalog_deltas.json`
   └── Auto-Update Pre-Flight Math, Rules CSV, & Gemini Notebook Sources
```

---

## 2. Ingestion & Multiplier Mechanics

### Multi-Sheet Excel & Multiplier Parsing
- Customer BOQs often present multi-tab Excel workbooks (`Server_Nodes`, `Storage_Shelves`, `Network_Switches`). `parseAndConsolidateBOQ(rawInput, filePath)` enumerates all tabs using `xlsx`.
- **Multiplier Calculation**: Calculates consolidated order totals using node multipliers (e.g. `2x Server Nodes x 6x DIMMs = 12 total DIMMs`).
- **Separator Normalization**: Replaces delimiters (`/`, `|`, `;`, `+`, `--`) to isolate valid HPE part numbers (`cleanBaseSKU`).

---

## 3. Quantitative Confidence Scoring & HITL Clarification

### Confidence Formula
$$C = 1.0 - \sum \text{Deductions}$$

- **High-TDP Thermal Violation**: `-0.30`
- **Missing Mandatory Cable / Lug Kit**: `-0.20`
- **Unbalanced Memory Population**: `-0.15`
- **Unverified SKU**: `-0.25`

### HITL Safeguard Trigger
- **Score $\ge 0.75$**: Auto-certified buildable.
- **Score $< 0.75$**: Trigger explicit Human-in-the-Loop review modal. Highlight flagged contradictions to the user with exact SKU fixes.

---

## 4. Execution Command Reference

```bash
# Standard Pre-Flight Evaluation & Report Synthesis
node scripts/eval_boq.js test_boq_dl380_gen12.csv

# Multi-Sheet Excel Evaluation
node scripts/eval_boq.js customer_proposal.xlsx --output outputs/reports/Proposal_Eval.md

# Simulate Partner Portal Error & Log KnowledgeDelta
node scripts/eval_boq.js test_boq_dl380_gen12.csv --simulate-portal-error "ERR_STORAGE_CABLE_REQUIRED: Controller MR416i-p requires P76453-B21 Box 1/2 Cable Kit."
```
