# HPE OCA Product Catalog Intelligence Pipeline

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![CDP](https://img.shields.io/badge/Protocol-Chrome_DevTools_Protocol_9222-blue.svg)](https://chromedevtools.github.io/devtools-protocol/)
[![HPE OCA](https://img.shields.io/badge/Target-HPE_Online_Configuration_Application-orange.svg)](https://oca.ext.hpe.com)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20Mint%20%7C%20Windows-blue.svg)]()

A high-performance, zero-hardcoding scraper and intelligence classification engine for the **HPE Online Configuration Application (OCA)** portal.

Generates multi-sheet Excel workbooks, structured JSON companions, TSV intermediates, and QuickSpecs PDF archives for import into **Google Notebook LM** and the **Vendor BOM Comparison Engine**.

---

## 🏛️ Goals, Architecture, Tech Stack & Coding Approach

### 🎯 Primary Goals
1. **Zero-Hardcoding Agnosticism**: The pipeline must dynamically adapt to *any* product family (ProLiant, Synergy, Alletra, Cray) without code changes, deriving constraints purely from DOM taxonomy.
2. **SSO/MFA Security Bypass**: Avoid headless bots getting blocked by using Chrome DevTools Protocol (CDP) to piggyback on the user's authenticated session.
3. **Closed-Loop Intelligence**: Create a self-healing 6-stage lifecycle where physical math pre-checks, NotebookLM RAG verification, and human-in-the-loop portal trials feed rejected rules back into the local engine (`catalog_deltas.json`).

### 🏗️ Architecture Design & Approach
This project operates on a **Dual-Node Architecture**:
- **Core Engine (Scripts)**: A collection of purely functional, stateless Node.js scripts (`scripts/`). They use regex for SKU identification, DOM walking for table classification, and deterministic math graphs for BOQ (Bill of Materials) evaluation.
- **Control Center (Dashboard)**: A modern React UI that spawns these backend Node.js scripts as `child_process` instances. It uses Server-Sent Events (SSE) to stream live terminal outputs to the user, creating a transparent, real-time observability ledger.

### 💻 Tech Stack
- **Backend Pipeline**: Pure `Node.js` (≥ v18), `ws` (WebSockets for CDP port 9222 connection), `xlsx` / `xlsx-js-style` (Excel generation).
- **Frontend Dashboard**: `React 18`, `Vite`, `TailwindCSS` (Glassmorphism aesthetics).
- **Backend Bridge API**: `Express.js` (Task Mutex locking, child process spawning, async NotebookLM RAG polling).
- **AI Integration**: Gemini NotebookLM MCP Server (Asynchronous RAG polling architecture).

---

## ⚡ Quick Start & Cross-Platform Prerequisites

### 1. Prerequisites
- **Node.js ≥ 18**
- Run `npm install` (installs `ws`, `xlsx`, and `xlsx-js-style`)
- Chrome or Chromium browser running with Remote Debugging enabled on port 9222

### 2. Browser Launch Command (CDP Port 9222 — Hands-Free Automation)

Before running scrapers, open your browser with remote debugging on port 9222 and permission-suppression flags:

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug \
  --deny-permission-prompts --disable-notifications --disable-popup-blocking
```

**Linux Mint / Ubuntu / Fedora:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug \
  --deny-permission-prompts --disable-notifications --disable-popup-blocking
# or for Chromium:
chromium-browser --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug \
  --deny-permission-prompts --disable-notifications --disable-popup-blocking
```

**Windows (PowerShell or cmd.exe):**
```cmd
chcp 65001
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug" ^
  --deny-permission-prompts --disable-notifications --disable-popup-blocking
```

> **Note**: Log into the HPE Partner Portal (`https://partner.hpe.com`) in the launched browser window, then navigate to your target chassis configuration quote in OCA.

> [!WARNING]
> **Why do I need to do this manually? (Why does the Scraper get "Stuck"?)**
> This pipeline does **not** use headless bots or agent CLIs (like `agy`). Because HPE Partner Portal uses strict SSO and Multi-Factor Authentication (MFA), the scraper is designed to piggyback on *your* active session via the Chrome DevTools Protocol.
> If you click "Start Scraping" before launching the browser with port 9222 and navigating to the page, the script will hang or fail because it cannot find the active session. This is an intentional security bypass design!

### 3. Hands-Free Portal Auto-Navigator & Search Entry (CDP Port 9222)

Instead of fragile Playwright test scripts, use the lightweight **CDP Auto-Navigator** (`scripts/lib/navigate_oca.js`):
- Automates passage through `partner.hpe.com` SSO session cookies (retained in `--user-data-dir`).
- Searches target chassis (e.g. `DL380 Gen12`, `Alletra 9000`), extracts base chassis list prices, selects standard Non-TAA CTO variants, and enters the `Menu` components page hands-free.

```bash
# Auto-navigate to any chassis in OCA portal
node scripts/lib/navigate_oca.js "DL380 Gen12"
```

### 3. Single-Command Integrated Run
Navigate to the target chassis or solution in OCA, then run:

```bash
# For ProLiant / Synergy / Compute Server Solutions:
npm run scrape:auto

# For Alletra / Nimble / StoreOnce / MSA Storage Solutions:
npm run scrape:auto --storage

# For Multi-Sheet Parallel BOQ Evaluation:
npm run eval:multi outputs/your_boq.xlsx
```

**These single commands automatically:**
1. Connect to the active Chrome session via CDP on port 9222.
2. Traverse Solution Root and navigate to the Product Node Menu / Wizard tab.
3. Expand all sections and assert `scrollHeight >= 15,000px` (or iterate wizard steps).
4. Extract raw text chunks, DOM tables, and option dropdowns.
5. Auto-detect product family, generation, and chassis name (e.g. `DL380_Gen12_SFF` or `Alletra_Storage_System`).
6. Download and MD5-cache the QuickSpecs PDF.
7. Classify all components, subcategories, constraints, and rules.
8. Generate `outputs/{Family}/{Gen}/{Model}_{FormFactor}/` artifacts.
9. Run the post-flight quality audit.
10. Update `outputs/SCRAPED_CATALOGS.md`.

---

## 🧭 Choosing the Right Scraper

| Product Type | Examples | Script | npm Command | Key Differences |
|-------------|----------|--------|-------------|-----------------|
| **Server / Compute** | ProLiant DL380/DL360/ML350, Synergy SY480 | `scrape_oca_solution.js` | `npm run scrape` | Single-page Menu tab, expandable sections, 60-120K text |
| **Storage Wizard** | Alletra 5000/6000/9000, Nimble, MSA, StoreOnce | `scrape_oca_storage_solution.js` | `npm run scrape:storage` | Step-by-step wizard tabs, `<select>` dropdowns, 5-15K text |

---

## 🛠️ Individual Pipeline Commands

If you need to re-run specific steps (e.g. after modifying classification rules):

```bash
# 1. Scrape raw data from active browser session
node scripts/scrape_oca.js outputs/ProLiant/Gen12/DL380_Gen12_SFF/raw_data/oca_raw_data_full.json

# 2. Expand all sections & rescrape (with scrollHeight assertion)
node scripts/expand_and_rescrape.js outputs/ProLiant/Gen12/DL380_Gen12_SFF/raw_data/oca_raw_data_full.json

# 3. Parse raw JSON → classified catalog JSON + TSV intermediates
node scripts/build_catalog.js \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/raw_data/oca_raw_data_full.json \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_Catalog.json --verbose

# 4. Generate multi-sheet Excel workbook
node scripts/generate_xlsx.js \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx

# 5. Download & cache QuickSpecs PDF
node scripts/download_quickspecs_pdf.js \
  a00073551enw \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/HPE_DL380_Gen12_SFF_QuickSpecs.pdf

# 6. Run post-flight audit
node scripts/verify_excel_tally.js \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx

# 7. Run full eval test suite (pre/in/post-flight)
node scripts/test_pipeline_evals.js \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx
```

---

## ⚡ Master Command CLI (`cli_tools.js`)
These commands interact directly with the running Dashboard Backend:
- `npm run scrape:auto` - Trigger CDP handshake and autonomous scrape sequence.
- `npm run probe:cdp` - Check Chrome DevTools active target session.
- `npm run eval:multi <file.xlsx>` - Spawn parallel evaluation engines for multi-sheet config analysis.
- `npm run trace:view <runId>` - Open local terminal replay of any historical task's stdout/stderr.
- `npm run resolve:ambiguity <chassis> <sku> "<rule>"` - Direct injection of rules via NotebookLM MCP resolutions.

---

## 🔄 End-to-End Orchestrator Workflow

This workspace is governed by a macro-architecture known as the **6-Stage Continuous Learning Loop**, which coordinates three distinct AI Agent Skills (`oca-catalog-scraper`, `boq-eval-skill`, and `nlm-skill`):

1. **Ingestion (Live Scraping)**: `oca-catalog-scraper` extracts live data via CDP.
2. **Knowledge Sync & Delta Tracking**: JSON/Excel outputs are historically versioned and synced to Google Drive/NotebookLM (`nlm-skill`).
3. **BOQ Upload & Pre-Flight**: User uploads a BOM. The `boq-eval-skill` runs physical/math checks and handles ambiguous user intent loosely by generating Ranked Solutions with stated assumptions.
4. **Asynchronous Notebook Validations (RAG)**: The dashboard fires parallel, non-blocking background queries to NotebookLM to cross-reference constraints and provide a verified second opinion on the generated solutions.
5. **HITL Portal Trial**: The user manually tries the AI's top-ranked solution in the live vendor OCA portal.
6. **Feedback & Automation Learning**: If rejected, the user provides the error. The agent logs a `KnowledgeDelta` (`npm run eval:boq --simulate-portal-error`), closing the loop so the system autonomously learns the rule for next time.

---

## 📁 Output Folder Standard

```
outputs/
├── SCRAPED_CATALOGS.md                    ← master registry of all scrapes (committed)
├── ProLiant/
│   └── Gen12/
│       └── DL380_Gen12_SFF/
│           ├── raw_data/
│           │   └── oca_raw_data_full.json
│           ├── intermittent_scraps/
│           │   ├── DL380_Gen12_SFF_Catalog_SKUs.tsv
│           │   ├── DL380_Gen12_SFF_Catalog_Rules.tsv
│           │   └── DL380_Gen12_SFF_Catalog_Summary.tsv
│           ├── history/                   ← ACTIVE: diff snapshots & price trail
│           │   ├── catalog_2026-08-05.json
│           │   └── price_history.json
│           ├── DL380_Gen12_SFF_Catalog.json
│           ├── DL380_Gen12_SFF_OCA_Catalog.xlsx
│           └── HPE_DL380_Gen12_SFF_QuickSpecs.pdf
└── Alletra/
    └── Storage/
        └── Alletra_Storage_System/
            ├── raw_data/
            │   └── oca_raw_data_full.json
            ├── intermittent_scraps/
            │   └── ...
            ├── Alletra_Storage_System_Catalog.json
            ├── Alletra_Storage_System_OCA_Catalog.xlsx
            └── HPE_Alletra_Storage_System_QuickSpecs.pdf
```

### Naming Convention

```
outputs/{Family}/{Gen}/{Model}_{FormFactor}/
```

| Segment | Rule | ✅ Correct | ❌ Wrong |
|---------|------|-----------|---------| 
| `{Family}` | Product family | `ProLiant`, `Synergy`, `Alletra`, `Aruba`, `Cray` | `proliant`, `hpe-proliant` |
| `{Gen}` | Generation | `Gen12`, `Gen11`, `Gen10Plus`, `Storage` | `Generation12`, `g12` |
| `{Model}_{FormFactor}` | Model + form factor shorthand | `DL380_Gen12_SFF`, `SY480_Gen11_Compute` | `HPE_ProLiant_Compute_DL380_Gen12_SFF_NC_...` |

---

## 📊 SKU Data Schema (17 base fields + 5 diff fields planned)

| # | Field | Description | Example |
|---|-------|-------------|---------|
| 1 | Main Category | Top-level functional group | `Processor` |
| 2 | Sub-Category | Specific component group | `Heatsink Kit` |
| 3 | Hierarchy Path | Full context path (≥ 3 `>` delimiters) | `HPE OCA > DL380 Gen12 SFF [P73282-B21] > Processor > Heatsink Kit` |
| 4 | Component Role | Functional classification | `Power & Thermal` |
| 5 | Constraint Text | Raw constraint label | `max 2` |
| 6 | Subcategory Max Qty | Quantity limit (`Unlimited`, `Required`, or integer string) | `2` |
| 7 | Table Rule/Note | Configuration rule for this table | `Mixing of Heat sink is not allowed` |
| 8 | Product # | HPE Part Number (extracted via regex) | `P74792-B21` |
| 9 | Description | Full product description | `HPE ProLiant DL380 Gen12 Performance Heat Sink Kit` |
| 10 | Current Qty | Clean integer string (`/^\d+$/`) | `0` |
| 11 | Unit Price (USD) | List price | `316.00` |
| 12 | Price Delta (USD) | Price delta from baseline | `+18,243.00` |
| 13 | Extended Price (USD) | Qty × Unit Price | `632.00` |
| 14 | Price per GB (USD) | Memory-specific metric | `434.66` |
| 15 | HPE Recommended | HPE recommended flag | `Yes` |
| 16 | Start Date | Availability start | `02/24/2025` |
| 17 | Discontinued Date | End of availability | `06/30/2029` |

**Active Production Diff Fields (18-22)**: `Diff Status`, `Previous List Price (USD)`, `Price Change (USD)`, `Price Change (%)`, `Price History Trail`

---

## 💻 Web Intelligence Dashboard & Control Center

Launch the full interactive React + Express control center dashboard:

```bash
# 1. Start Express server bridge & Vite React frontend
cd dashboard && npm run dev

# 2. Open dashboard in browser
http://localhost:5173
```

### Dashboard Tabs & Features:
1. **Executive Dashboard**: Selected chassis metadata, scrape date, historical diff breakdown badges (`+Added`, `-Removed`, `Price Delta`), interactive task history timeline.
2. **Master Excel Catalog**: Client-side NLP FlexSearch, cascading category/type filters, color-coded status badges, real-time price trend modal.
3. **BOQ Evaluator & DNA**: File upload / text paste, 6-aspect physical checks, Workload DNA profiler, live SSE stdout terminal.
4. **6-Aspect Math & CLIC**: Physical pre-flight verification checklist + CLIC error inspector. **Includes Ambiguity Inbox** (NotebookLM MCP bridge) with **Human Engineer Rationale Capture** & **4-Level Scope Taxonomy Tagging** (`UNIVERSAL_VENDOR`, `FAMILY_GEN`, `SOLUTION_TYPE`, `CHASSIS_SPECIFIC`).
5. **5-Tier Resolution Matrix**: Ranked buildable solutions, workload intent match %, per-SKU technical swap rationale, NotebookLM RAG Second Opinion badge, and **Post-Build Vendor Partner Portal BOM Cross-Verification** button.
6. **Artifacts & Quality Audit**: Multi-sheet XLSX download, catalog JSON viewer, QuickSpecs PDF opener, master registry viewer, 7-check audit certificate.
7. **System Telemetry**: Real-time KPI metrics (`GET /api/telemetry`), average confidence score, total learned deltas, run history ledger, and **Gemini Notebook RAG Consultation & Double-Proofing Ledger**.
8. **Live CDP Scraper & Trace Ledger**: Handshake over port 9222, task mutex lock, and **Side-by-Side Trace Ledger** for replaying historical `run_id` logs.

---

## 🧪 Test Suite & Observability Commands

```bash
# 1. Post-Build Vendor Partner Portal BOM Cross-Verification Suite (3/3)
node tests/test_vendor_bom_verifier.js

# 2. Gemini Notebook Query Utilities & Async Job Engine Suite (7/7)
node scripts/test_notebook_query_utils.js

# 3. Comprehensive End-to-End Scenarios & Workload DNA Test (19/19)
node tests/test_end_to_end_scenarios.js

# 4. 5-Level Dependency Conflict Graph & Rules Engine Test (14/14)
node tests/test_conflict_graph.js

# 5. Full Portfolio Certification Audit (6/6 Product Lines 100% Certified)
npm test
```

# 4. Modular 6-Aspect Physical Math & Feedback Test (34/34)
npm run test:aspects

# 5. Master Portfolio Audit across all 6 chassis catalogs (6/6)
npm test

# 6. Unified Pipeline Telemetry & Health Dashboard
npm run status
```

---

## 🛡️ Data Quality Guardrails & Audit Assertions

Run `node scripts/verify_excel_tally.js <output_xlsx_path>` to verify all post-flight assertions:

1. ✅ Excel workbook, JSON companion, `*_Catalog_Rules.json` (Dual Safety Net), and QuickSpecs PDF exist.
2. ✅ QuickSpecs PDF size > 500 KB with valid MD5 fingerprint (advisory when absent).
3. ✅ All core Excel sheets present (`Category Summary`, `All SKUs`, `Rules & Constraints`, `Metadata`).
4. ✅ `All SKUs` row count in Excel ≥ JSON `metadata.totalUniqueSKUs`.
5. ✅ **100% of SKUs** pass numeric `Current Qty` regex (`/^\d+$/`).
6. ✅ **100% of SKUs** contain 4-level `Hierarchy Path` (≥ 3 `>` delimiters).
7. ⏳ *(Planned)* Diff status & price history validation when history exists.

---

## 📜 Script Reference

| Script | Purpose | Key Flags / CLI Signature |
|--------|---------|---------------------------|
| `scripts/lib/cdp.js` | Shared CDP connection & WebSocket module | Module (`sendCommand`, `getOCATarget`, `connectWS`) |
| `scripts/lib/product_meta.js` | Universal product family & form factor parser | Module (`parseProductMeta`, `classifyComponentRole`) |
| `scripts/lib/catalog_formatter.js` | Loosely coupled catalog TSV & sheet formatter | Module (`generateMainSheet`, `generateRulesSheet`) |
| `scripts/observability_status.js` | **Unified Pipeline Observability Dashboard** | `npm run status` |
| `scripts/scrape_oca_solution.js` | **Integrated E2E solution scraper** | `npm run scrape` |
| `scripts/scrape_oca_storage_solution.js` | **Storage wizard E2E scraper** | `npm run scrape:storage` |
| `scripts/scrape_oca.js` | Raw CDP data extractor | `node scripts/scrape_oca.js <raw_out.json>` |
| `scripts/expand_and_rescrape.js` | Expand DOM sections + height assertion + rescrape | `node scripts/expand_and_rescrape.js <raw_out.json>` |
| `scripts/build_catalog.js` | Parse raw JSON → catalog JSON + TSVs | `node scripts/build_catalog.js <raw.json> <catalog.json> [--verbose]` |
| `scripts/generate_xlsx.js` | TSVs → multi-sheet Excel workbook | `node scripts/generate_xlsx.js <output.xlsx>` |
| `scripts/download_quickspecs_pdf.js` | Download + MD5-cache QuickSpecs PDF | `node scripts/download_quickspecs_pdf.js <docId> <pdf_dest>` |
| `scripts/eval_boq.js` | **Pre-flight BOQ evaluator & 6-aspect check** | `npm run eval:boq <boq.csv>` |
| `scripts/verify_excel_tally.js` | Post-flight 7-check audit | `node scripts/verify_excel_tally.js <output.xlsx>` |
| `scripts/test_pipeline_evals.js` | Pre/in/post-flight evaluation suite | `node scripts/test_pipeline_evals.js <output.xlsx>` |
| `scripts/verify_all.js` | **Universal Portfolio Audit Suite** | `npm test` |
| `scripts/rebuild_all.js` | **Rebuild all product catalogs** | `npm run rebuild` |
| `scripts/inspect_oca_session.js` | CDP session inspector utility | `npm run inspect:session` |
| `scripts/visual_clic_inspector.js` | Visual CLIC check inspector utility | `npm run inspect:clic` |
| `scripts/parse_clic_modal.js` | CLIC error modal parser | `npm run parse:clic` |
| `scripts/test_all_aspects.js` | 6-Aspect solution pre-check test runner | `npm run test:aspects` |
| `scripts/test_live_clic.js` | Live CLIC check integration test | `npm run test:clic` |
| `scripts/demo_qs_vs_menu_cdp.js` | QuickSpecs link vs Menu link visual demo | `npm run demo:qs` |
| `scripts/live_visual_demo_cdp.js` | Live visual verification browser demo | `npm run demo:live` |

---

## 🔗 Downstream Integration & Gemini Notebook MCP

This pipeline feeds directly into:
1. **Google Notebook LM (Gemini Notebook)**: Import `*_Catalog.json` for AI-powered RAG product intelligence, grounded Q&A, and Studio generation (podcasts, reports, infographics, data tables).
2. **Vendor BOM Comparison Engine** (separate workspace): Import Excel workbooks for cross-vendor BOM validation, physical saturation audits, and DAG-based compatibility rule enforcement.
3. **Price Tracking Dashboard**: Historical `price_history.json` enables trend analysis and procurement optimization.

---

## 📚 Complete Project Documentation

- 📖 **[docs/GEMINI_NOTEBOOK_SETUP_GUIDE.md](docs/GEMINI_NOTEBOOK_SETUP_GUIDE.md)** — Comprehensive step-by-step setup guide for `notebooklm-mcp-cli` v0.9.6 across **macOS (Intel/Apple Silicon)**, **Linux Mint / Ubuntu**, and **Windows 10/11 (PowerShell)**.
- 🏛️ **[docs/PROJECT_ARCHITECTURE_AND_MD_FILES.md](docs/PROJECT_ARCHITECTURE_AND_MD_FILES.md)** — Architectural index and detailed breakdown of all project `.md` files (`AGENTS.md`, `SKILL.md`, `SCRAPED_CATALOGS.md`, `README.md`).

