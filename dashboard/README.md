# HPE OCA Catalog Intelligence — Control Center Dashboard

A modern, high-performance React + Express control center dashboard for managing scraping operations, inspecting catalog data, running BOQ evaluations, viewing 5-Tier solution matrix reports, querying NotebookLM RAG, and monitoring system telemetry.

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Express server bridge & Vite React frontend concurrently
npm run dev

# 3. Open dashboard in browser
http://localhost:5173
```

- **Frontend**: React 18 + Vite (Port 5173) with Tailwind/Glassmorphism styling
- **Backend Bridge**: Express.js (Port 3001) connecting UI to native Node.js pipeline scripts
- **Real-Time Streaming**: Server-Sent Events (SSE) via `/api/stream-logs`

---

## 🧭 Dashboard Tabs & Components

| Tab | Component | Description |
|-----|-----------|-------------|
| **Executive Dashboard** | [`CatalogOverviewCard`](src/components/CatalogOverviewCard.jsx), [`TaskHistoryCard`](src/components/TaskHistoryCard.jsx) | Selected chassis metadata, scrape date, historical diff breakdown (`+Added`, `-Removed`, `Price Delta`), interactive task history timeline |
| **Master Excel Catalog** | [`CatalogExplorer`](src/components/CatalogExplorer.jsx) | Client-side NLP FlexSearch, 3-tier category filters, color-coded status badges, real-time price trend modal |
| **BOQ Evaluator & DNA** | [`BoqUploader`](src/components/BoqUploader.jsx), [`WorkloadDnaCard`](src/components/WorkloadDnaCard.jsx) | Drag-and-drop BOQ upload (.xlsx, .csv, .json, .txt), Workload DNA profiler, live SSE stdout terminal |
| **6-Aspect Math & CLIC** | [`ConflictGraphInspector`](src/components/ConflictGraphInspector.jsx) | Physical pre-flight verification checklist + CLIC error inspector |
| **5-Tier Resolution Matrix** | [`ResolutionMatrix`](src/components/ResolutionMatrix.jsx) | Ranked buildable solutions, intent match %, per-SKU technical swap rationale, NotebookLM RAG Second Opinion badge |
| **Artifacts & Quality Audit** | [`ArtifactInspector`](src/components/ArtifactInspector.jsx) | Multi-sheet XLSX download, catalog JSON viewer, QuickSpecs PDF opener, master registry viewer, 7-check audit certificate |
| **System Telemetry** | [`TelemetryCard`](src/components/TelemetryCard.jsx) | Real-time KPI metrics (`GET /api/telemetry`), average confidence score, total learned deltas, run history ledger |
| **Live CDP Scraper** | [`ScraperTriggerCard`](src/components/ScraperTriggerCard.jsx) | Handshake over port 9222, task mutex lock with cancel button, live SSE terminal streaming |

---

## 📡 Server REST & SSE Endpoints (`server.cjs`)

- `GET /api/cdp-status` — Probes Chrome DevTools Protocol port 9222
- `GET /api/available-catalogs` — Enumerates scraped catalog JSONs in `outputs/`
- `GET /api/catalog-data?path=...` — Serves catalog JSON content
- `GET /api/telemetry` — Serves pipeline telemetry metrics and run history
- `GET /api/price-history?sku=...` — Serves cumulative SKU price history trail
- `GET /api/stream-logs` — Server-Sent Events stream for real-time process logs
- `POST /api/scrape` — Triggers `scrape_oca_solution.js` or `scrape_oca_storage_solution.js`
- `POST /api/rebuild` — Triggers `rebuild_all.js`
- `POST /api/eval-boq` — Runs `eval_boq.js` with stdout JSON unwrap
- `POST /api/notebook-query-async` — Initiates non-blocking NotebookLM RAG query (returns jobId)
- `GET /api/notebook-query-status/:jobId` — Polls status of async NotebookLM query
- `POST /api/export-boq` — Generates multi-sheet corrected BOQ Excel workbook
- `POST /api/sync-knowledge` — Pushes learned rules to NotebookLM RAG
- `POST /api/simulate-error` — Logs portal rejection as `KnowledgeDelta`
- `POST /api/kill-task` — Cancels running child process via SIGTERM
