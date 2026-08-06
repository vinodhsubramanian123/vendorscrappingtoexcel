# Canonical Engineering Knowledge Base & Solution Ontology

---

## 1. Overview & Single Source of Truth Philosophy

This document serves as the **Compact Canonical Engineering Knowledge Base** for the HPE OCA Catalog & Solution Engineering Engine. It compacts all engineering ontologies, physical dependency rules, confidence scoring algorithms, and closed-loop learning protocols into a self-contained baseline.

### Core Guiding Principles
1. **Single Source of Truth**: Every engineering rule, part number constraint, and physical dependency exists in exactly one canonical location.
2. **Evidence vs. Knowledge**: Documents (QuickSpecs PDFs, OCA raw DOM JSONs, customer BOQs) serve as raw *evidence*. Standardized rules (`*.csv`, `catalog_deltas.json`) represent canonical *knowledge*.
3. **Deterministic Physical Math First**: LLMs provide generative RAG reasoning, but deterministic physical math (TDP thermal limits, 8-channel socket memory balance, PCIe lane limits, DC power lug kits) MUST be verified in-memory BEFORE querying the model.

---

## 2. Engineering Ontology & Component Information Model

```
                    ┌───────────────────────────────┐
                    │       Solution Domain         │ (e.g., Enterprise Compute / Storage)
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │        Product Family         │ (ProLiant / Alletra / Synergy / Cray)
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │          Generation           │ (Gen12 / Gen11 / Storage)
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │      Model & Form Factor      │ (DL380_Gen12_SFF / SY480_Gen11)
                    └───────────────┬───────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼───────┐           ┌───────▼───────┐           ┌───────▼───────┐
│ Base Chassis  │           │ Option SKUs   │           │ Rules & Math  │
│ (P73282-B21)  │           │ (CTO/BTO/FIO) │           │ (TDP, Memory) │
└───────────────┘           └───────────────┘           └───────────────┘
```

### Component Categories & Classification Matrix

| Category ID | Category Name | Key SKUs / Examples | Mandatory Physical Dependencies |
|---|---|---|---|
| `CAT_COMPUTE` | Processors & Cooling | `P74573-B21` (Xeon 6730P 250W) | TDP >= 240W requires High-Perf Fan Kit (`P48820-B21`) + Heatsink (`P74792-B21`) |
| `CAT_MEMORY` | DDR5 Smart Memory | `P69728-B21` (64GB RDIMM) | Max 32 DIMMs/chassis; 8 channels/socket; 1DPC (16 DIMMs) optimal |
| `CAT_STORAGE` | Controllers & Cages | `P47777-B21` (MR416i-p), `P75741-B21` | Requires Smart Storage Battery (`P01366-B21`) + Box 1/2 Cable (`P76453-B21`) |
| `CAT_NETWORK` | OCP 3.0 & Standup NICs| `P51181-B21` (1Gb 4p), `P26269-B21` (10/25Gb) | "NC" base chassis requires OCP NIC + Cable Kit (`P72203-B21` / `P72201-B21`) |
| `CAT_POWER` | Flex Slot PSUs & Cables | `P17023-B21` (-48VDC 1600W), `P03178-B21` | -48VDC requires Cable Lug Kit (`P36877-B21`); AC requires C13-C14 cord |
| `CAT_SERVICES` | Support & Warranty | `HU4A6A50C4V` (5Y Tech Care) | Mandatory OS selection / FIO tracking |

---

## 3. Quantitative Confidence Scoring & HITL Thresholds

Every proposed solution is assigned a **Quantitative Confidence Score ($C$)** between `0.0` and `1.0`.

### Formula
$$C = 1.0 - \sum \text{Deductions}$$

| Condition / Violation | Deduction ($\Delta C$) | Severity | Action |
|---|:---:|---|---|
| Unverified / Non-HPE SKU in BOQ | `-0.25` | High | Tag SKU for human verification |
| Missing Mandatory Cable or Enablement Kit | `-0.20` | High | Inject direct SKU fix automatically |
| Unbalanced Memory Population across channels | `-0.15` | Medium | Warn customer; propose Rank 2 balanced alternate |
| Missing Thermal/Fan Kit for High TDP Processor | `-0.30` | Critical | Block order build; enforce Rank 1 fix |
| Unbuildable Error from Partner Portal | `-0.40` | Critical | Trigger Closed-Loop Feedback & HITL review |

### Human-in-the-Loop (HITL) Threshold Rule
- **If $C \ge 0.75$**: Solution is certified buildable. Proceed to automated quote generation.
- **If $C < 0.75$**: Trigger explicit HITL clarification modal. Present flagged contradictions to the user with recommended direct SKU fixes.

---

## 4. 5-Tier Strategic Resolution Hierarchy

Every BOQ evaluation outputs a structured 5-tier recommendation matrix:

1. **🏆 Rank 1: Customer Intent Preserved (Highest Priority)**
   - Preserves customer's chosen CPU cores, memory capacity, and storage choices.
   - Automatically injects the minimum mandatory physical, thermal, electrical, and cabling dependencies required to make the proposal 100% buildable in HPE OCA.
2. **🥈 Rank 2: Performance & Bandwidth Optimized Alternate**
   - Optimizes DDR5 memory channel population (1DPC symmetrical 16-DIMM layout across dual sockets) and upgrades networking to 10/25GbE OCP 3.0.
3. **🥉 Rank 3: CapEx Budget Saver Alternate**
   - Swaps high-TDP processors for mainline 200W/225W CPUs to eliminate high-performance fan kit costs while preserving total core count.
4. **🌿 Rank 4: Sustainability & Eco-Efficiency (Green) Alternate**
   - Replaces standard PSUs with 96% efficient Titanium Flex Slot supplies compliant with EU ErP Lot 9 standards.
5. **⚡ Rank 5: Dense I/O Database Cluster Alternate**
   - Configures physical Tri-Mode drive cages (`P75741-B21`), MCIO Box 1/2 cables (`P76453-B21`), and high-speed NVMe U.3 SSDs (`P63829-B21`).

---

## 5. Closed-Loop Portal Feedback & Knowledge Delta Engine

```
[HPE OCA Partner Portal Validation]
               │
               ▼ (Rejection / Unbuildable Error Message)
[Error Classification]
 ├── Temporary Supply Constraint  ──► Log Advisory Warning
 └── Permanent Physical Conflict  ──► Generate KnowledgeDelta
                                            │
                                            ▼
                               [history/catalog_deltas.json]
                                            │
                                            ▼
                    ┌───────────────────────┴───────────────────────┐
                    │                                               │
┌───────────────────▼───────────────────┐       ┌───────────────────▼───────────────────┐
│ Update boq_evaluator.js In-Memory Math │       │ Update DL380_Gen12_SFF_Rules.csv      │
└───────────────────────────────────────┘       └───────────────────┬───────────────────┘
                                                                    │
                                                                    ▼
                                                        [Re-sync NotebookLM Source]
```

### KnowledgeDelta Data Schema (`catalog_deltas.json`)
```json
{
  "deltaId": "DELTA-2026-08-06-001",
  "timestamp": "2026-08-06T16:15:00Z",
  "chassis": "DL380_Gen12_SFF",
  "sourceError": "ERR_STORAGE_CABLE_REQUIRED: Controller MR416i-p requires P76453-B21 Box 1/2 Cable Kit.",
  "errorType": "PERMANENT_PHYSICAL_DEPENDENCY",
  "affectedSku": "P47777-B21",
  "requiredDependencySku": "P76453-B21",
  "ruleUpdate": "If P47777-B21 is present with SFF drive cage, P76453-B21 is mandatory.",
  "status": "APPLIED_TO_PRECHECKS_AND_RAG"
}
```
