---
name: oca-catalog-scraper
description: Scrapes the HPE OCA (Online Configuration Application) portal to extract complete server, storage, networking, composable, and supercomputing catalog data including all categories, subcategories, SKUs, pricing, quantity constraints, configuration rules, and compatibility notes. Generates structured Excel workbooks for Google Notebook LM import and BOM intelligence. Supports historical diff tracking and color-coded price delta reporting.
---

# OCA Catalog Scraper Skill

## Purpose
Extract complete product catalog intelligence from the HPE OCA portal for any HPE product line (ProLiant, Synergy Composable, Alletra/Nimble/StoreOnce Storage, Aruba Networking, Cray Supercomputing). Produces a classified multi-sheet Excel workbook + JSON companion stored under `outputs/{Family}/{Gen}/{Model}_{FormFactor}/`, suitable for Google Notebook LM, BOM comparison engines, and configuration intelligence.

---

## Current State & Certified Products (as of 2026-08-06)

| Product | Family | Output Prefix | SKUs | Audit | QuickSpecs PDF |
|---------|--------|---------------|------|-------|----------------|
| HPE ProLiant DL380 Gen12 SFF | ProLiant | `DL380_Gen12_SFF` | 951 | ✅ 100% | ✅ Verified (2.06 MB) |
| HPE Alletra Storage System | Alletra | `Alletra_Storage_System` | 92 | ✅ 100% | ✅ Verified (2.06 MB) |
| HPE ProLiant DL380 Gen11 | ProLiant | `DL380_Gen11` | 1,253 | ✅ 100% | ✅ Verified (2.06 MB) |
| HPE StoreEver MSL3040 Tape Library | StoreEver | `MSL3040_Tape` | 85 | ✅ 100% | ✅ Verified (2.06 MB) |
| HPE Cray Supercomputing GX5000 Rack | Cray | `GX5000_General_RACK` | 46 | ✅ 100% | ⚠️ Advisory |
| HPE Synergy VC 100Gb F32 Module | Synergy | `SY100Gb_F32_Module` | 141 | ✅ 100% | ✅ Verified (0.89 MB) |

**Total Portfolio Intelligence**: **2,568 unique SKUs** across 6 product lines in 5 families.

**WebLogic & Legacy UI Modal Handling**: Automated JS dialog listener (`setupDialogAutoHandler`) + DOM session extension handler (`dismissDOMModals`) integrated into all scrapers.
**Catalog Diff & Price Tracking Engine**: Production-ready (`scripts/lib/diff_catalog.js`) — saves date-stamped snapshots under `history/` and outputs color-coded diff sheets (`xlsx-js-style`).
**Master Catalog Registry Auto-Synchronizer**: Production-ready (`scripts/lib/sync_registry.js` / `npm run registry:sync`) — auto-indexes all outputs in `outputs/SCRAPED_CATALOGS.md`.
**Standalone Post-Flight Audit Mode**: Production-ready (`test_pipeline_evals.js --post-flight-only`) — verifies JSON schemas, Excel tallies, and PDF size without requiring active CDP browser attachment.
**Centralized HPE SKU Normalization Utility**: Production-ready (`scripts/lib/sku.js`) — provides unified validation for hyphenated hardware SKUs (`P73282-B21`), 6-char hardware SKUs (`C0H28A`, `Q2R32A`), and service SKUs (`H7J34A3`).

---

## Prerequisites
- User must be logged in to the HPE Partner Portal in the Antigravity browser (OCA requires HPE Partner credentials)
- OCA page must be open on a specific chassis or solution configuration
- Node.js with `ws`, `xlsx`, and `xlsx-js-style` packages installed (`npm install ws xlsx xlsx-js-style`)
- All scripts live in `scripts/` (with shared CDP connection helper in `scripts/lib/cdp.js`) — **never write output files to root**

---

## Critical Distinction: QuickSpecs Link vs Menu Link

| Element | Selector | Action | Purpose |
|---------|----------|--------|---------|
| Chain link icon 🔗 | `a.qs-link-a`, `i.icon-chain2.qs-link-icon` | **DO NOT CLICK for navigation** | Downloads/opens QuickSpecs PDF |
| Menu tab label | `.menu_label`, `a[href*="extended_overview_menu"]` | **CLICK FOR CATALOG SCRAPING** | Opens component Menu tab in OCA |

This distinction is critical — clicking the chain link opens a PDF in a new tab and does NOT navigate into the component catalog.

---

## Two Scraping Protocols

### Protocol A: Server / Compute / Composable Products
**Script**: `scripts/scrape_oca_solution.js` (`npm run scrape`)
**Applies to**: ProLiant (DL380, DL360, ML350), Synergy (SY480, SY660), Edgeline, Superdome, Cray

**Flow**: Solution Root → Product Node → Menu Tab → Expand All → Extract Tables + Text → Build Catalog → Excel → Audit

**Key characteristics**:
- Uses standard single-page `Menu` tab with expandable sections
- Text length typically 60-120K chars after expansion
- `scrollHeight >= 15,000px` assertion applies
- Subcategories parsed from text using regex: `\n{Name} (max N)\n`

### Protocol B: Storage Solution Wizard Products
**Script**: `scripts/scrape_oca_storage_solution.js` (`npm run scrape:storage`)
**Applies to**: Alletra 5000/6000/9000, Nimble, StoreOnce, MSA, SimpliVity

**Flow**: Storage Node → Solution Wizard Tab → Iterate Sub-Tabs → Extract `<select>` + `<table>` → Build Catalog → Excel → Audit

**Key characteristics**:
- Uses step-by-step wizard UI (`#tabs_alletra_5000_wizard` or `[class*="wizard_tabs"]`)
- Sub-tabs: `Array Selection`, `Base Array Components`, `Add-on Storage`, `MISC Hardware`
- Configuration options are `<select>` dropdowns (not expandable table rows)
- Part numbers extracted from option text via regex: `/(R6F55A)/ or /\b([A-Z0-9]{3}[A-Z0-9\-]{2,20}[A-Z0-9])\b/`
- Dropdown options are converted to synthetic table rows for `build_catalog.js` compatibility
- Text length typically 5-15K chars (much shorter than server scrapes)

---

## Step-by-Step Workflow

### Step 1 — Find the OCA Page Target (CDP)
```bash
# List all browser tabs with their IDs and URLs
curl -s http://localhost:9222/json | \
  python3 -c "import json,sys; [print(t['id'], t['url']) for t in json.load(sys.stdin) if t.get('type')=='page']"
```
All Node.js scripts in `scripts/` automatically discover the active `oca.ext.hpe.com` page using `getOCATarget()` from `scripts/lib/cdp.js`.

### Step 2 — Navigate to Solution Root (Solution Traversal Protocol)
Before any scraping on complex quotes (e.g. Synergy frames or multi-node solutions), verify you are at the top level:
```javascript
// In CDP Runtime.evaluate — click the Up arrow to reach Solution Root
document.querySelector('#nav_up, .icon-arrow-up3')?.click();
// Then inspect Components tab to discover all Icons and Product Nodes
document.querySelector('#extended_overview_components')?.click();
```
**NEVER start scraping from a mid-tree Product Node** — you will miss other components.

### Step 3 — Navigate to Product Node Menu or Solution Wizard Tab
For ProLiant server nodes, click the `Menu` tab (`a[href*="extended_overview_menu"]`).
For storage solutions (Alletra 5000/6000/9000, Nimble, StoreOnce, MSA), click the `Solution Wizard` tab (`#extended_overview_solutionWizard` / `a[href*="solutionWizard"]`).

### Step 3.5 — Storage Solution Wizard Extraction (`scrape_oca_storage_solution.js`)
Storage systems render component options inside step-by-step UI wizards (`#tabs_alletra_5000_wizard` or `[class*="wizard_tabs"]`):
1. **Iterate Wizard Sub-Tabs**: Sequentially click each wizard step (`Array Selection`, `Base Array Components`, `Add-on Storage`, `MISC Hardware`).
2. **Extract Dropdown Options (`<select>`)**: Parse part numbers from parens (e.g. `(R6F55A) HPE Alletra 2120...`), labels, and parent step contexts into synthetic SKU tables.
3. **Extract Tables (`<table>`)**: Extract standard HTML tables from accessory/spare steps (`MISC Hardware`).
4. **Build & Audit**: Automatically invoke `build_catalog.js`, `generate_xlsx.js`, `download_quickspecs_pdf.js`, and `verify_excel_tally.js`.

### Step 4 — Expand All Sections (Server Protocol Only)
```javascript
// Click Expand All button
document.querySelectorAll('button, a').forEach(el => {
  if (el.textContent.trim() === 'Expand All') el.click();
});
// Click Expand Subsections button  
document.querySelectorAll('button, a').forEach(el => {
  if (el.textContent.trim() === 'Expand Subsections') el.click();
});
// Check all "Show more" toggles
document.querySelectorAll('input[id*="showmore"]').forEach(inp => {
  if (!inp.checked) inp.click();
});
```
**Assert**: `document.body.scrollHeight >= 15000` — retry expansion if height is below threshold (Rule #19).

### Step 5 — Extract Raw Data (Row Arrays)
```javascript
// Extract full text in ≤50K-char chunks (CDP payload limit)
const text = document.body.innerText;
const chunk1 = text.substring(0, 50000);
const chunk2 = text.substring(50000, 100000);

// Extract all tables as structured row arrays (NOT raw HTML strings)
const tables = Array.from(document.querySelectorAll('table')).map((table, idx) => {
  const rows = [];
  table.querySelectorAll('tr').forEach(tr => {
    const cells = [];
    tr.querySelectorAll('td, th').forEach(cell => cells.push(cell.innerText.trim()));
    if (cells.length > 0) rows.push(cells);
  });
  return { tableIndex: idx, rowCount: rows.length, rows };
});
```
Save combined output to `outputs/{Family}/{Gen}/{Model}_{FormFactor}/raw_data/oca_raw_data_full.json`.

### Step 6 — Run the Build Pipeline
```bash
# Parse raw data → catalog JSON + TSV intermediates
node scripts/build_catalog.js \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/raw_data/oca_raw_data_full.json \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_Catalog.json

# Generate Excel workbook from TSVs
node scripts/generate_xlsx.js \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx
```
> Replace `DL380_Gen12_SFF` with the appropriate `{Model}_{FormFactor}` prefix for any other chassis.

### Step 7 — Download QuickSpecs PDF (with MD5 cache)
```bash
node scripts/download_quickspecs_pdf.js \
  a00073551enw \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/HPE_DL380_Gen12_SFF_QuickSpecs.pdf
```
The script checks MD5 fingerprint first — if file exists and size > 500 KB, returns `⚡ [CACHE HIT]` without re-downloading.

### Step 8 — Run Post-Flight Audit (all 7 checks)
```bash
node scripts/verify_excel_tally.js \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx
```
All 7 audit checks must pass:
- ✅ File existence + PDF size > 500 KB (advisory when PDF absent)
- ✅ All required Excel sheets present
- ✅ `All SKUs` row count equals JSON `totalUniqueSKUs`
- ✅ `Current Qty` passes `/^\d+$/` on 100% of rows
- ✅ `Hierarchy Path` has ≥ 3 `>` delimiters on 100% of rows (4-level path)
- ✅ All category-specific sheets contain > 0 SKUs
- ✅ Historical diff & price tracking verified

### Step 9 — Update Registry
Add or update a row in `outputs/SCRAPED_CATALOGS.md` with `npm run registry:sync`.

---

## Integrated One-Command E2E Solution Scraper
To run all of Steps 1–9 automatically for the active browser session:
```bash
npm run scrape          # Server / Compute products
npm run scrape:storage  # Storage Solution Wizard products
npm run rebuild         # Rebuild all catalogs from raw_data
npm test                # Run 100% portfolio audit suite
```

---

## Scripts Reference

| Script | CLI Signature | Purpose |
|--------|---------------|---------|
| `scripts/lib/cdp.js` | N/A (module) | Shared CDP utilities (`sendCommand`, `getOCATarget`, `connectWS`, `sleep`) |
| `scripts/lib/sku.js` | N/A (module) | Centralized HPE SKU regex, option suffix cleaning, and validation |
| `scripts/lib/product_meta.js` | N/A (module) | Universal product family, generation, and physical form factor parser |
| `scripts/lib/catalog_formatter.js` | N/A (module) | Loosely coupled catalog TSV & multi-sheet formatter (high maintainability) |
| `scripts/lib/diff_catalog.js` | N/A (module) | Historical catalog diff & price history engine (tombstone injection) |
| `scripts/lib/registry.js` | N/A (module) | Shared registry table updater (`updateScrapedRegistry`) |
| `scripts/lib/sync_registry.js` | `npm run registry:sync` | Auto-scans `outputs/` and syncs `SCRAPED_CATALOGS.md` |
| `scripts/observability_status.js` | `npm run status` | **Unified Pipeline Observability Dashboard** (CDP status, catalogs, KnowledgeDeltas, script wiring) |
| `scripts/scrape_oca.js` | `node scripts/scrape_oca.js <raw_json_out>` | Initial CDP raw data extractor |
| `scripts/expand_and_rescrape.js` | `node scripts/expand_and_rescrape.js <raw_json_out>` | Expand all DOM sections then re-scrape |
| `scripts/scrape_oca_solution.js` | `npm run scrape` | Generic E2E solution scraper (extracts DOM section landmarks) |
| `scripts/scrape_oca_storage_solution.js` | `npm run scrape:storage` | Storage wizard scraper (Alletra/Nimble/MSA) |
| `scripts/build_catalog.js` | `node scripts/build_catalog.js <raw.json> <catalog.json>` | Parse raw JSON → classified catalog JSON + TSVs + diffs |
| `scripts/generate_xlsx.js` | `node scripts/generate_xlsx.js <output.xlsx>` | TSVs → multi-sheet Excel workbook (`xlsx-js-style` colors + freeze panes + autofilters) |
| `scripts/download_quickspecs_pdf.js` | `node scripts/download_quickspecs_pdf.js <docId> <dest_pdf_path>` | Download + MD5-cache QuickSpecs PDF |
| `scripts/eval_boq.js` | `npm run eval:boq <file.csv>` | Pre-flight BOQ evaluator & 6-aspect physical check engine |
| `scripts/verify_excel_tally.js` | `node scripts/verify_excel_tally.js <output.xlsx>` | Post-flight 7-check audit (includes diff verification) |
| `scripts/test_pipeline_evals.js` | `node scripts/test_pipeline_evals.js <output.xlsx> [--post-flight-only]` | Pre/in/post-flight eval suite (supports standalone post-flight mode) |
| `scripts/verify_all.js` | `npm test` | One-shot portfolio audit suite across all outputs |
| `scripts/rebuild_all.js` | `npm run rebuild` | Rebuild all product catalogs and Excel workbooks from raw_data |
| `scripts/inspect_oca_session.js` | `npm run inspect:session` | CDP browser session inspector utility |
| `scripts/visual_clic_inspector.js` | `npm run inspect:clic` | Visual CLIC check inspector utility |
| `scripts/parse_clic_modal.js` | `npm run parse:clic` | CLIC modal error parser utility |
| `scripts/test_all_aspects.js` | `npm run test:aspects` | 6-Aspect solution pre-check test runner |
| `scripts/test_live_clic.js` | `npm run test:clic` | Live CLIC check integration test |
| `scripts/demo_qs_vs_menu_cdp.js` | `npm run demo:qs` | QuickSpecs vs Menu link visual demo |
| `scripts/live_visual_demo_cdp.js` | `npm run demo:live` | Live browser banner demo |
