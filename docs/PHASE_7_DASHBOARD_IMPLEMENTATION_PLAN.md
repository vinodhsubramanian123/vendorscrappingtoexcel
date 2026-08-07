# Comprehensive Technical Implementation Plan: Phase 7 — Real-Time Catalog Intelligence & BOQ Observability Dashboard

This plan provides an end-to-end audited technical blueprint for building the **HPE OCA Catalog Intelligence & Real-Time BOQ Observability Dashboard**. Every stage has been technical-feasibility audited and certified.

---

## 🎨 Design System & Aesthetics (Ultra-Sleek Porcelain Light Mode)

- **Theme & Palette**: Modern Light Mode (`#F8FAFC` soft porcelain background) with translucent pearl white glassmorphism cards (`rgba(255, 255, 255, 0.85)` backdrop blur, `1px solid #E2E8F0` subtle borders, and ambient drop shadows `0 10px 30px -10px rgba(15, 23, 42, 0.05)`).
- **Accents**:
  - **HPE Emerald Green**: `#01A781` (Rank 1 Intent Match badge, active success indicators, primary action buttons).
  - **Royal Electric Blue**: `#2563EB` (Telemetry streaming gauges, active navigation tabs, interactive links).
  - **Vibrant Amber**: `#D97706` (Price change indicators, advisory notices).
  - **Rose Red**: `#DC2626` (Removed tombstone SKUs, error alerts).
  - **Deep Slate Typography**: `#0F172A` for primary headers, `#475569` for secondary body text.
- **Typography**: Google Fonts Inter / Outfit with crisp hierarchy, monospaced SKU badges (`JetBrains Mono`).

---

## 🏗️ Technical Architecture & Key Modules

> **Zero External API Key Architecture**: The web dashboard connects to a local Express/Node.js server bridge (`server.js`). UI button clicks trigger the existing **Antigravity CLI workflows** (`npm run scrape`, `npm run eval:boq`, `nlm notebook query`, `npm run registry:sync`) using native process execution (`child_process.spawn`) and stream logs in real-time via **Server-Sent Events (SSE)**.

> **Frontend Isolation Architecture**: The dashboard UI is a completely isolated React/Vite project inside the `dashboard/` directory with its own `package.json`. This strict boundary ensures UI libraries (`react`, `recharts`, `lucide-react`) do not pollute the root offline scraping engine's dependencies (`ws`, `xlsx-js-style`).

├── package.json                       ← Root backend dependencies (ws, xlsx-js-style)
└── dashboard/
    ├── public/
    │   └── favicon.ico
    ├── src/
    │   ├── components/
    │   │   ├── Header.jsx                 ← Navigation & live CDP port 9222 health indicator
    │   │   ├── ScraperTriggerCard.jsx     ← Live trigger for npm run scrape with SSE log terminal
    │   │   ├── CatalogExplorer.jsx        ← Multi-sheet Excel viewer + FlexSearch NLP attribute search
    │   │   ├── BoqUploader.jsx            ← File drag-and-drop & text paste zone triggering eval:boq
    │   │   ├── WorkloadDnaCard.jsx        ← CPU core density, RAM/core ratio, GPU class gauges (via Recharts)
    │   │   ├── ConflictGraphInspector.jsx ← 5-level rule hierarchy & 6-aspect physical math gauge (via Recharts)
    │   │   ├── ResolutionMatrix.jsx       ← 5-tier strategic candidate cards (Rank 1-5)
    │   │   ├── NotebookRagDrawer.jsx      ← Gemini NotebookLM RAG citations & notes drawer
    │   │   └── FeedbackModal.jsx          ← Interactive HITL feedback & KnowledgeDelta logger
    │   ├── styles/
    │   │   └── index.css                  ← Light Mode design tokens, CSS variables, glassmorphism
    │   ├── utils/
    │   │   └── nlpSearch.js               ← FlexSearch client-side SKU attribute indexer
    │   ├── App.jsx                        ← Main dashboard orchestrator & SSE event listener
    │   └── main.jsx
    ├── server.js                          ← Express/SSE CLI bridge (spawns npm/nlm scripts & streams logs)
    ├── package.json                       ← Dashboard UI dependencies (react, vite, recharts, lucide-react)
    └── vite.config.js
```

---

## 📋 Comprehensive End-to-End Component Specifications

### ✅ Component 0: Live CDP Session Health Indicator
- Polls `http://localhost:9222/json` via `server.js` every 5 seconds.
- Displays green pulse badge when an active `oca.ext.hpe.com` session is detected.
- Warning badge when browser debugging port is offline.

### ✅ Component 1: Interactive Master Excel Catalog Viewer & NLP Attribute Search
- **Full Excel Sheet Renderer**: Renders complete multi-sheet Excel catalog (`*_OCA_Catalog.xlsx` / `*_Catalog.json`) directly in the UI for any selected chassis (`DL380_Gen12_SFF`, `DL380_Gen11`, `Alletra`, `Synergy`, `StoreEver`, `Cray`).
- **FlexSearch Client-Side NLP Indexer**: Fast sub-millisecond search across all 2,568 SKUs by attribute (e.g. *"210W CPUs"*, *"DDR5-6400 memory"*, *"5-year Tech Care Essential"*).
- **Color-Coded Historical Price Diffs**: Visualizes SKU additions (`ADDED` green), tombstones (`REMOVED` red strikethrough), and price deltas (`PRICE_CHANGED` amber).

### ✅ Component 2: Scraper Execution & Structured Real-Time Terminal Stream
- **One-Click Scrape Trigger**: Button triggers `npm run scrape` or `npm run scrape:storage`.
- **SSE Real-Time Terminal View**: Server-Sent Events (`/api/stream-logs`) stream console output. `server.js` intercepts raw stdout and wraps it in structured JSON (e.g., `{ type: "success", text: "✅ PASS:..." }`).
- **Dynamic Syntax Highlighting**: The terminal UI parses the JSON stream to dynamically color-code logs (Green for Guardrail passes, Red for errors, Blue for navigation) rather than displaying a monotone text block.

### ✅ Component 3: BOQ Upload & Workload DNA Profiler
- Drag-and-drop zone for `.xlsx`, `.csv`, `.json`, or raw text quotes.
- Live Workload DNA extraction cards:
  - **CPU Core Density**: Cores/socket ratio badge.
  - **Memory Density Ratio**: GB/core gauge (flags SAP HANA / In-Memory Database).
  - **GPU Accelerator Class**: VDI / AI Workload badge.
  - **Storage I/O**: NVMe RI vs MU vs WI density meter.

### ✅ Component 4: 6-Aspect Physical Math & 5-Level Conflict Inspector
- Animated pulse gauges and charts (rendered via **Recharts**) for 6 physical aspects:
  1. Compute & Thermal ($\text{TDP} \ge 240\text{W} \implies \text{High-Performance Fan}$).
  2. Memory & Channel ($\text{DIMMs} \pmod 8 == 0$).
  3. Storage & Interconnect (Tri-Mode Cable `P76453-B21`).
  4. PCIe Slot Capacity & Risers.
  5. Power & DC Lug Kits (`P36877-B21`).
  6. Pointnext Support Suffix Taxonomy (`HU4A6A50C4V` / `HU4A6A500DK`).

### ✅ Component 5: 5-Tier Strategic Resolution Matrix Cards
- Interactive candidate cards displaying:
  - **Rank 1**: Customer Workload Intent Match (Badge & Intent Alignment %).
  - **Rank 2**: Standardized CTO Baseline.
  - **Rank 3**: High-IOPS Storage Optimized.
  - **Rank 4**: Maximum Density & Expansion Headroom.
  - **Rank 5**: CapEx Minimized Buildable Tier.
- Displays unit cost, total CapEx, SKU modifications count, and rationale.

### ✅ Component 6: Token-Efficient Gemini NotebookLM MCP RAG Reasoning Engine
- **Delegated Deep Reasoning**: Server endpoint `/api/notebook-query` calls `nlm notebook query <notebook_id> "<query>" --json` via MCP. Offloads heavy spec sheet analysis to NotebookLM, saving agent LLM tokens while serving deep citations!
- **Interactive RAG Drawer**: Displays QuickSpecs citations, backplane cabling guides, and Rule #40 support taxonomy explanations side-by-side with evaluation steps.
- **Graceful Offline Fallback**: If the `nlm` CLI is unavailable or times out, the dashboard gracefully catches the `(RAG Query Unavailable)` status and displays the locally computed 5-level rule evaluation matrix as a fallback, preventing an empty UI state.

### ✅ Component 7: Antigravity Agent Orchestration & Interactive HITL Feedback Modal
- **Antigravity AI Presentation Layer**: Orchestrates UI/UX state, workflow transitions, and visual micro-animations ("icing on the cake").
- **Interactive Feedback Action**: Users click **"Log Vendor Portal Feedback"** on any resolution card.
- **Real-Time KnowledgeDelta Logging**: Triggers `scripts/lib/feedback_loop.js` directly from the UI, writing timestamped deltas to `catalog_deltas.json` and dynamically updating rule graphs without code changes.

### ✅ Component 8: In-Dashboard Agentic Feature Request & Self-Improving UI Loop
- **Direct UI Feedback Widget**: A slide-out **"Agent Feedback & Feature Request"** drawer in the dashboard where you can type UI tweaks, bug reports, or feature requests directly inside the app!
- **Feedback Queue Hook (`user_feedback_queue.json`)**: Button clicks in the UI post your feature requests directly to `server.js`, logging them into `outputs/history/user_feedback_queue.json`.
- **Closed-Loop Agent Pair-Programming**:
  1. You type feedback in the UI dashboard (e.g., *"Add a chart for power consumption"*, *"Fix alignment on PCIe Risers"*).
  2. The Antigravity AI Agent picks up the request from the queue, performs code edits in `dashboard/src/` or `scripts/lib/`, and runs automated verification tests.
  3. Displays visual loading progress in the dashboard UI.
  4. Upon 100% successful test pass, the dashboard automatically hot-reloads and prompts you to check the new feature live!

---

## 🧪 Step-by-Step Verification & Certification Protocol

1. **Backend API Audit**:
   - Run `npm run test:all` to certify all 5 test suites pass 100%.
2. **Dashboard Dev Server Launch**:
   - Run `node dashboard/server.js` and `npm run dev` inside `dashboard/`.
   - Verify zero console errors and clean SSE connection.
3. **End-to-End Workflow Verification**:
   - Click "Scrape Chassis" ➔ Confirm live log stream in SSE terminal.
   - Upload `test_boq_dl380_gen12.json` ➔ Verify Workload DNA card & 5-Tier Resolution Matrix cards populate.
   - Click "Query NotebookLM" ➔ Verify slide-out drawer displays NotebookLM RAG citations.
   - Submit HITL portal rejection feedback ➔ Verify `catalog_deltas.json` updates in place.
