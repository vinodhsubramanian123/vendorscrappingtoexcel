# Technical Implementation Plan: Phase 7 — HPE OCA Catalog Intelligence & BOQ Observability Dashboard

This document details the validated, end-to-end technical specification for the **HPE OCA Catalog Intelligence & Real-Time BOQ Observability Dashboard**. Every component has been audited for architectural feasibility, performance, backend communication routing, and alignment with the HPE OCA pipeline.

---

## 🎨 1. Design System & Aesthetics (Ultra-Sleek Porcelain Light Mode)

- **Theme & Palette**: Ultra-Sleek Porcelain Light Mode (`#F8FAFC` soft porcelain background) with translucent white glassmorphism cards (`rgba(255, 255, 255, 0.85)` backdrop blur, `1px solid #E2E8F0` subtle borders, and ambient drop shadows `0 10px 30px -10px rgba(15, 23, 42, 0.05)`).
- **Accents**:
  - **HPE Emerald Green**: `#01A781` (Rank 1 Intent Match badge, success indicators, primary action buttons).
  - **Royal Electric Blue**: `#2563EB` (Telemetry streaming gauges, active navigation tabs, interactive links).
  - **Vibrant Amber**: `#D97706` (Price change deltas, advisory warnings).
  - **Rose Red**: `#DC2626` (Tombstone removed SKUs, error alerts).
  - **Deep Slate Typography**: `#0F172A` for primary headers, `#475569` for body text.
- **UX Paradigm**: 100% Non-blocking, asynchronous execution. All long-running tasks use elegant skeleton loaders and pulsing indicators, ensuring the UI remains ultra-responsive at all times.

---

## 🏗️ 2. Technical Architecture & Key Modules

> **Zero External API Key Architecture**: The web dashboard connects to a local Express/Node.js server bridge (`dashboard/server.js`). UI actions trigger native CLI workflows via `child_process.spawn` and stream output live using **Server-Sent Events (SSE)**.

### Core Backend Implementations (`server.js`)
1. **Port Mapping & CORS**: `server.js` runs on port `3001`. The UI (Vite) runs on `5173`. `vite.config.js` uses a proxy to route all `/api/*` requests to `http://localhost:3001`, eliminating CORS issues.
2. **Static File Serving**: `server.js` exposes the parent `outputs/` directory via `app.use('/artifacts', express.static(path.join(__dirname, '../outputs')))`.
3. **Multipart BOQ Uploads**: Uses `multer` on `/api/upload-boq` to save dragged-and-dropped BOQ files to a temporary `outputs/temp/` folder before passing the absolute path to `npm run eval:boq`.
4. **Task Mutex (Locking)**: Implements a global lock (`isScraping = true`) in memory to prevent concurrent CDP Port 9222 collisions.
5. **Unified Startup**: The root `package.json` will include a single `npm run dashboard` script using `concurrently` to spin up both the Vite frontend and Express backend synchronously.

---

## 📋 3. Detailed Component Specifications

### ✅ Component 0: Live CDP Session Health & Observability (`Header.jsx`)
- **Global Context**: Dropdown fetches available catalogs from `/api/available-catalogs` to switch context (e.g., from `DL380_Gen12_SFF` to `Synergy_Compute`).
- **Deep Session Observability**: Clickable CDP health badge polls `http://localhost:9222/json` and uses `observability_status.js` to display the exact OCA Session state in a sleek popover.

### ✅ Component 1: Unified Async Smart Search & Catalog Explorer (`CatalogExplorer.jsx`)
- **Multi-Sheet Catalog Viewer**: Renders full scraped Excel catalogs directly in the UI.
- **Historical Price Trend Visualizer**: Clicking any SKU with an amber `PRICE_CHANGED` badge opens a Recharts line graph parsing `price_history.json` to visualize historical price elasticity.
- **Universal Smart Search Bar (Non-Blocking UI)**:
  - **Instant Local Filtering**: Types text for sub-millisecond client-side filtering via FlexSearch.
  - **Agentic Deep Search**: If you type *"Please check in notebook"*, the UI triggers an asynchronous, non-blocking background request to NotebookLM and Antigravity, displaying skeleton loaders until rich results slide in.

### ✅ Component 2: Pipeline Execution & Scraper Controls (`ScraperTriggerCard.jsx`)
- **Live Scrape Triggers**: Mutex-protected buttons to launch E2E scraper or storage wizard scraper with a real-time SSE Log Terminal.
- **Offline Catalog Rebuild**: A button to instantly trigger `rebuild_all.js`.
- **QuickSpecs Fetcher**: A dedicated action to trigger `download_quickspecs_pdf.js`.

### ✅ Component 3: BOQ Upload & Workload DNA Profiler (`BoqUploader.jsx` & `WorkloadDnaCard.jsx`)
- Uploads `.xlsx`, `.csv`, `.json` to `/api/upload-boq`.
- Live Workload DNA extraction cards (CPU Core Density, Memory Density Ratio, GPU Accelerator Class, Storage I/O density meter).

### ✅ Component 4: 6-Aspect Math & CLIC Error Inspector (`ConflictGraphInspector.jsx`)
- **Physical Math Gauges**: Animated Recharts verifying all 6 physical aspect assertions.
- **Live CLIC Portal Error Inspector**: Integrates `parse_clic_modal.js` to asynchronously fetch and display native HPE OCA configuration errors directly alongside our own Conflict Graph.

### ✅ Component 5: 5-Tier Strategic Resolution Matrix Cards (`ResolutionMatrix.jsx`)
- Interactive candidate solution cards covering Ranks 1 to 5.

### ✅ Component 6: Token-Efficient Gemini NotebookLM RAG Engine (`NotebookRagDrawer.jsx`)
- **Dynamic Config Binding**: Maps the active chassis to its Notebook ID via `scripts/config/notebooks.json`.
- Displays a dedicated slide-out drawer for deep RAG citations.

### ✅ Component 7: Artifact Inspector & Data Quality Audit (`ArtifactInspector.jsx`)
- **Artifact Transparency**: Dedicated tab to view raw scrape data, intermediate TSVs, and catalog diffs securely fetched over `/artifacts`.
- **Data Quality Audit Badge**: A one-click action that triggers `verify_excel_tally.js` and displays a 100% Certified Pass/Fail checklist.

### ✅ Component 8: User Feedback & Task Dispatch Queue (`UserFeedbackDrawer.jsx`)
- Slide-out drawer to log UI tweaks or feature requests to `outputs/history/user_feedback_queue.json` without blocking the UI.

### ✅ Component 9: Closed-Loop Knowledge Sync & HITL Portal Deltas (`FeedbackModal.jsx`)
- Interactive "Log Portal Feedback" modal on resolution cards for marking portal rejections or manual overrides.
- Triggers `scripts/lib/feedback_loop.js` and `scripts/lib/knowledge_sync.js` asynchronously.

---

## 🧪 4. Step-by-Step Verification & Certification Protocol

1. **Backend API Audit**: Run `npm test` in the root folder to verify pipeline evaluation tests pass 100%.
2. **Dashboard Dev Server Launch**:
   - Run `npm run dashboard` from the root directory to instantly boot both the UI and backend server.
3. **End-to-End Workflow Verification**:
   - **Context Selection**: Pick a chassis from the Global Chassis Selector.
   - **Smart Search**: Enter an agentic NotebookLM query and verify the non-blocking skeleton loader.
   - **Price Elasticity**: Click a price-changed SKU to view the Recharts trend line.
   - **Artifact & Quality Audit**: Open Artifact Inspector and run the Data Quality Audit.
