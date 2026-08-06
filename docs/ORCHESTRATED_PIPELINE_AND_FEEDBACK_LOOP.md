# Master Architecture: End-to-End Skill Orchestration & Closed-Loop Portal Feedback Engine

---

## 1. Executive Summary & Orchestration Blueprint

This document defines the complete end-to-end operational architecture connecting our three core agentic skills:
1. **`boq-eval-skill`**: Pre-flight BOQ ingestion (multi-sheet Excel, multiplier logic, line separators), modular 6-aspect physical math evaluation, confidence scoring, and HITL triggers.
2. **`nlm-skill`**: Gemini Notebook RAG query layer supporting natural language spec sheet searches, 5-tier resolution matrices, and technical attribute filters (`Memory > 32GB`, `CPU Cores >= 32`, `NVMe U.3`).
3. **`oca-catalog-scraper`**: 100% hands-free CDP browser scraper and partner portal configuration validator.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 Customer BOQ Intake                     │
                  │  (Multi-sheet Excel / CSV / PDF / Image / Text / Quote) │
                  └────────────────────────────┬────────────────────────────┘
                                               │
                                               ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │                   boq-eval-skill                        │
                  │  • Multipliers (serverQty * chassisMultiplier = Total) │
                  │  • Separators (/, |, ;, +, --) & Multi-Sheet Ingestion  │
                  │  • Modular 6-Aspect Solution Pre-Check Engine           │
                  │  • Quantitative Confidence Scoring (Base 1.0)           │
                  └────────────────────────────┬────────────────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       │ (Score >= 0.75)                               │ (Score < 0.75 or Contradiction)
                       ▼                                               ▼
  ┌───────────────────────────────────────────┐   ┌───────────────────────────────────────────┐
  │                 nlm-skill                 │   │      Human-in-the-Loop (HITL) Trigger     │
  │  • Attribute Queries (Memory > 32GB)      │   │  • Interactive Question / Clarification   │
  │  • Workload-to-BOQ Construction           │   │  • Resolution Approval Modal              │
  │  • 5-Tier Strategic Resolution Matrix     │   └─────────────────────┬─────────────────────┘
  └────────────────────┬──────────────────────┘                         │
                       │                                                │
                       └───────────────────────┬────────────────────────┘
                                               │
                                               ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │                oca-catalog-scraper                      │
                  │  • 100% Hands-Free CDP Automation on Port 9222          │
                  │  • Modal & Dialog Interception (Session Immunity)      │
                  │  • Partner Portal Quote Build & Validation             │
                  └────────────────────────────┬────────────────────────────┘
                                               │
                                               ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │              Closed-Loop Feedback Engine                │
                  │  • Unbuildable Error Classification                     │
                  │  • KnowledgeDelta Logger (catalog_deltas.json)          │
                  │  • Auto-Sync Pre-Checks & NotebookLM Sources            │
                  └─────────────────────────────────────────────────────────┘
```

---

## 2. Phase-by-Phase Skill Execution Details

### Phase 1: BOQ Ingestion & Multi-Aspect Pre-Check (`boq-eval-skill`)
- **Multi-Sheet Ingestion**: Uses `xlsx` library to enumerate all tabs (`Server_Nodes`, `Storage_Expansion`, `BOM_Summary`).
- **Multiplier Calculation**: Identifies node multipliers (e.g. `2x Chassis x 6x DIMM = 12 total DIMMs`).
- **Modular 6-Aspect Solution Pre-Checks**:
  1. *Compute & Thermal*: Verifies CPU TDP against heatsink & fan kits (`P48820-B21`).
  2. *Memory & Channels*: Asserts max 32 DIMMs, 8 channels/CPU socket, 1DPC vs 2DPC balance.
  3. *Storage & Tri-Mode*: Validates EDSFF/SFF drive cages, Box 1/2 cables (`P76453-B21`), battery (`P01366-B21`), No-Drive FIO Kit (`873763-B21`).
  4. *Networking & OCP 3.0*: Validates OCP 3.0 NIC slots A/B and rear OCP cable kits (`P72201-B21`).
  5. *Power & Environmental*: Validates -48VDC Lug Kits (`P36877-B21`), Titanium 96% PSU efficiency, AC vs DC power cords.
  6. *Support & Manufacturing*: Checks CTO `-B21` option suffixes, OS selection requirements, Tech Care 3Y/5Y service tiers.

### Phase 2: Attribute RAG & 5-Tier Resolution Matrix (`nlm-skill`)
- Executes grounded RAG queries against notebook `Dl 380 Spec Gen 12` (`1d190853-4e9c-48df-aa70-eae66c6f2c1f`).
- **Attribute Queries**: Allows searching for SKUs by technical filters (e.g. `Memory capacity > 32GB` returns 64GB `P69728-B21`, 96GB `P69730-B21`, 128GB `P69731-B21`).
- Synthesizes 5-tier recommendation report (Rank 1: Intent to Rank 5: Dense I/O).

### Phase 3: Partner Portal Build & Validation (`oca-catalog-scraper`)
- Connects to active HPE OCA session via CDP WebSocket (`scripts/lib/cdp.js`).
- Executes pre-flight popup suppression (`dismissDOMModals()`, `Page.handleJavaScriptDialog`).
- Validates proposal against live OCA quote builder.

### Phase 4: Closed-Loop Feedback & Knowledge Learning (`scripts/lib/feedback_loop.js`)
- Captures unbuildable errors or missing dependency alerts returned by the portal.
- Classifies error into **Temporary Supply Constraint** vs **Permanent Physical Incompatibility**.
- Persists `KnowledgeDelta` into `outputs/{Family}/{Gen}/{Model}/history/catalog_deltas.json`.
- Re-syncs pre-check rules and updates Google Sheet / NotebookLM sources automatically.

---

## 3. Multi-Vendor Expansion Architecture

To expand this framework to other server and storage vendors while keeping code clean, decoupled, and easy to maintain:

```
outputs/
├── HPE/
│   ├── ProLiant/Gen12/DL380_Gen12_SFF/
│   └── Alletra/Storage/Alletra_9000/
├── Dell/
│   └── PowerEdge/16G/R760_24SFF/
├── Lenovo/
│   └── ThinkSystem/V3/SR650_V3/
└── Cisco/
    └── UCS/M6/C220_M6/
```

- Each vendor directory follows the exact same 5-tier multi-sheet Excel, JSON companion, PDF quickspecs, catalog diff history, and pre-flight evaluation structure.
- Pre-flight rules modules inherit from a generic `BaseVendorEvaluator` interface, guaranteeing seamless cross-vendor portability.
