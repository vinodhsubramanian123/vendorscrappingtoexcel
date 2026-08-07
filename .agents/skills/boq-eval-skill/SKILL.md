---
name: boq-eval-skill
description: Use this skill for validating customer BOQs, hardware lists, Excel quotes, or proposals against vendor-agnostic product specs (HPE, Cisco, Dell, Alletra, etc.) and running 6-aspect physical pre-checks.
---

# Pre-Flight BOQ Evaluation & Closed-Loop Feedback Skill (`boq-eval-skill`)

---

## 1. Overview & Workflow Lifecycle (Workflow 2)

This skill provides an automated, agentic workflow representing **Workflow 2 (Pre-Flight Evaluation)** of the dual-workflow paradigm. It ingests raw customer BOQs, pre-cleans input data, runs deterministic 6-aspect physical math assertions, executes 5-level dependency conflict graph validation, profiles Workload DNA, dynamically routes to Gemini Notebook RAG via `notebooks.json`, and outputs the results to the dashboard and a dynamically generated **Corrected BOQ Excel workbook**.

```mermaid
graph TD
    A["Customer BOQ Intake (CSV / Excel Multi-Sheet / Quote)"] --> B["scripts/eval_boq.js"]
    B --> C["parseAndConsolidateBOQ() (boq_evaluator.js)"]
    C --> D["evaluatePhysicalMath() (6-Aspect Math)"]
    D --> E["validateConflictGraph() (conflict_graph.js)"]
    E --> F["extractWorkloadDna() (Compute, Memory & Storage IO Profile)"]
    F --> G["synthesize5TierRankedSolutions() (Rank 1: Intent Match)"]
    G --> H["formatNotebookQueryPayload() (nlm-skill Query)"]
    H --> I["outputs/{Family}/{Gen}/{Model}/reports/ (BOQ Report)"]
    I --> J["HITL Portal Build Trial"]
    J -- "Portal Error" --> K["processPortalFeedback() (feedback_loop.js)"]
    K --> L["outputs/history/catalog_deltas.json (KnowledgeDelta)"]
    L --> E
```

---

## 2. Phase-by-Phase Execution Engine

### Phase 1: Ingestion & Multi-Sheet Multiplier Engine
- **Module**: [`scripts/lib/boq_evaluator.js`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/boq_evaluator.js)
- **Functions**: `parseAndConsolidateBOQ(rawContent, filePath)`
- **Capabilities**:
  - Multi-sheet Excel workbook inspection using `xlsx`.
  - Line separator normalization (`/`, `|`, `;`, `+`, `--`, tab columns).
  - Multi-part inline SKU extraction via `isValidHpeSKU()` filtering.
  - Chassis multiplier math (`serverQty * chassisMultiplier = totalConsolidatedQty`).

### Phase 2: Modular 6-Aspect Physical Math Pre-Checks
- **Module**: [`scripts/lib/boq_evaluator.js`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/boq_evaluator.js)
- **Functions**: `evaluatePhysicalMath(consolidatedItems)`
- **6 Physical Aspects**:
  1. **Compute & Thermal**: CPU TDP vs Heatsinks ([`P74792-B21`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/boq_evaluator.js)), High-Perf Fan Kits ([`P48820-B21`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/boq_evaluator.js)).
  2. **Memory & Channel**: 32 DIMM max, 8 channels/socket population rules.
  3. **Storage & Tri-Mode**: EDSFF vs SFF/LFF drive cages, Box 1/2 cables ([`P76453-B21`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/boq_evaluator.js)), Smart Battery ([`P01366-B21`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/boq_evaluator.js)).
  4. **Networking & PCIe**: OCP 3.0 NIC slots, PCIe slot capacity vs Riser math.
  5. **Power & Ambient**: -48VDC Lug Kits ([`P36877-B21`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/boq_evaluator.js)), Titanium 96% PSUs, AC/DC cord filtering.
  6. **Support & Services**: Hardware SKUs vs mandatory Tech Care Support tiers.

### Phase 2.5: 5-Level Dependency Conflict Graph & Workload DNA Profiling
- **Module**: [`scripts/lib/conflict_graph.js`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/conflict_graph.js) & [`scripts/lib/catalog_rules.js`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/catalog_rules.js)
- **Functions**: `validateConflictGraph()`, `extractWorkloadDna()`, `synthesize5TierRankedSolutions()`
- **Dual Safety Net**: Loads `<prefix>_Catalog_Rules.json` first, falls back to `<prefix>_Catalog.json`.
- **5 Rule Levels**: `VENDOR`, `CHASSIS`, `CATEGORY`, `SUBCATEGORY`, `SKU`.
- **Workload DNA Extraction**: Infers `VDI_AI_GRAPHICS`, `DATABASE_IN_MEMORY`, `STORAGE_HIGH_IOPS`, or `VIRTUALIZATION_DENSE` profile.
- **Top 5 Resolution Matrix**: **Rank 1 strictly matches customer workload intent** (neither over- nor under-provisioned).

### Phase 3: Grounded Gemini Notebook RAG Validation
- **Module**: [`scripts/eval_boq.js`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/eval_boq.js)
- **Functions**: `formatNotebookQueryPayload(items, evalResults)`
- **Dynamic Routing**: Queries Gemini NotebookLM dynamically using the detected chassis variant to lookup the specific Notebook ID via `scripts/config/notebooks.json`. It guarantees cross-pollination of constraints does not occur across multi-vendor quotes.
- If `nlm` CLI is unreachable or times out (30s), it gracefully falls back and outputs a transparent ungrounded validation notice.

### Phase 4: Budget Optimization & Golden Rule Assurance
- **Module**: [`scripts/lib/budget_optimizer.js`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/budget_optimizer.js)
- Enforces the Golden Rule: Mandatory buildability fixes take precedence over budget caps.

### Phase 5 & 6: Dual Outputs & Closed-Loop Feedback Learning
- **Output 1 (Dashboard API)**: Submissions can be sent directly via `/api/eval-boq` and displayed in the React frontend.
- **Output 2 (Corrected BOQ Excel)**: Unlike Workflow 1 (which generates the *Catalog Excel*), Workflow 2 explicitly generates a multi-sheet **Corrected BOQ Excel** output (`/api/export-boq`) containing the NotebookLM Rationale Summary and the finalized, valid Bill of Materials.
- **Feedback Module**: [`scripts/lib/feedback_loop.js`](file:///Users/macbookaira1466/Downloads/booktoSkill/scripts/lib/feedback_loop.js)
- **Command**: `npm run eval:boq <boq_file> --simulate-portal-error "<error_text>"` or Dashboard modal.
- Logs permanent `KnowledgeDeltas` in `outputs/history/catalog_deltas.json` and updates `_Catalog_Rules.json`.

---

## 💻 CLI Commands & Usage Examples

```bash
# Run BOQ evaluation with default chassis report auto-derived
npm run eval:boq tests/fixtures/test_boq_dl380_gen12.csv

# Run BOQ evaluation with explicit chassis variant override
node scripts/eval_boq.js tests/fixtures/test_boq_dl380_gen12.csv --chassis-variant LFF

# Simulate partner portal rejection and log KnowledgeDelta
npm run eval:boq tests/fixtures/test_boq_dl380_gen12.csv --simulate-portal-error "ERR_STORAGE_CABLE: Controller MR416i-p requires Cable Kit P76453-B21"
```
