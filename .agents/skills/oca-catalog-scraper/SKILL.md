---
name: oca-catalog-scraper
description: Scrapes the HPE OCA (Online Configuration Application) portal to extract complete server, storage, networking, composable, and supercomputing catalog data including all categories, subcategories, SKUs, pricing, quantity constraints, configuration rules, and compatibility notes. Generates structured Excel workbooks for Google Notebook LM import and BOM intelligence. Supports historical diff tracking and color-coded price delta reporting.
---

# OCA Catalog Scraper Skill

## Purpose
Extract complete product catalog intelligence from the HPE OCA portal for any HPE product line (ProLiant, Synergy Composable, Alletra/Nimble/StoreOnce Storage, Aruba Networking, Cray Supercomputing). Produces a classified multi-sheet Excel workbook + JSON companion stored under `outputs/{Family}/{Gen}/{Model}_{FormFactor}/`, suitable for Google Notebook LM, BOM comparison engines, and configuration intelligence.

---

## Current State & Certified Products (as of 2026-08-05)

| Product | Family | Output Prefix | SKUs | Audit | QuickSpecs PDF |
|---------|--------|---------------|------|-------|----------------|
| HPE ProLiant DL380 Gen12 SFF | ProLiant | `DL380_Gen12_SFF` | 1,037 | ✅ 100% | ✅ Verified (2.06 MB) |
| HPE Alletra 5000 Storage | Alletra | `Alletra_Storage_System` | 404 | ✅ 100% | ✅ Verified (2.06 MB) |
| HPE ProLiant DL380 Gen11 | ProLiant | `DL380_Gen11` | 1,414 | ✅ 100% | ✅ Verified (2.06 MB) |
| HPE StoreEver MSL3040 Tape Library | StoreEver | `MSL3040_Tape` | 128 | ✅ 100% | ✅ Verified (2.06 MB) |
| HPE Cray Supercomputing GX5000 Rack | Cray | `GX5000_General_RACK` | 46 | ✅ 100% | ⚠️ Advisory |
| HPE Synergy VC 100Gb F32 Module | Synergy | `HPE_Virtual_Connect...` | 141 | ✅ 100% | ✅ Verified (0.89 MB) |

**Total Portfolio Intelligence**: **3,170 unique SKUs** across 6 product lines in 5 families.

**WebLogic & Legacy UI Modal Handling**: Automated JS dialog listener (`setupDialogAutoHandler`) + DOM session extension handler (`dismissDOMModals`) integrated into all scrapers.
**Catalog Diff & Price Tracking Engine**: Production-ready (`scripts/lib/diff_catalog.js`) — saves date-stamped snapshots under `history/` and outputs color-coded diff sheets (`xlsx-js-style`).
**Master Catalog Registry Auto-Synchronizer**: Production-ready (`scripts/lib/sync_registry.js` / `npm run registry:sync`) — auto-indexes all outputs in `outputs/SCRAPED_CATALOGS.md`.
**Standalone Post-Flight Audit Mode**: Production-ready (`test_pipeline_evals.js --post-flight-only`) — verifies JSON schemas, Excel tallies, and PDF size without requiring active CDP browser attachment.

---

## Prerequisites
- User must be logged in to the HPE Partner Portal in the Antigravity browser (OCA requires HPE Partner credentials)
- OCA page must be open on a specific chassis or solution configuration
- Node.js with `ws` and `xlsx` packages installed (`npm install ws xlsx`)
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

### Step 8 — Run Post-Flight Audit (all 6 checks)
```bash
node scripts/verify_excel_tally.js \
  outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx
```
All 6 audit checks must pass:
- ✅ File existence + PDF size > 500 KB (advisory when PDF absent)
- ✅ All required Excel sheets present
- ✅ `All SKUs` row count equals JSON `totalUniqueSKUs`
- ✅ `Current Qty` passes `/^\d+$/` on 100% of rows
- ✅ `Hierarchy Path` has ≥ 3 `>` delimiters on 100% of rows (4-level path)
- ✅ All category-specific sheets contain > 0 SKUs

### Step 9 — Update Registry
Add a row to `outputs/SCRAPED_CATALOGS.md` with the chassis details and links.

---

## Integrated One-Command E2E Solution Scraper
To run all of Steps 1–9 automatically for the active browser session:
```bash
npm run scrape          # Server / Compute products
npm run scrape:storage  # Storage Solution Wizard products
```

---

## Classification Engine Deep Dive (`build_catalog.js`)

### Internal Processing Steps
1. **Step 1 — Subcategory Extraction**: Regex `\n{Name} (max N|required|no max)\n` finds all subcategory headers with quantity constraints
2. **Step 2 — Parent Category Mapping**: Positions > `NAV_MENU_END` (1010) in `fullText`, augmented by dynamic `rawData.sections` discovery
3. **Step 3 — Table Parsing**: Identifies header rows (containing `Product #` or `Description`), extracts data rows, sanitizes part numbers (strips concatenated row-indexes), normalizes `Current Qty`
4. **Step 4 — Sub-Table Inheritance**: Tables without explicit subcategory headers inherit from the preceding matched subcategory by DOM table-index order
5. **Step 5 — TSV Generation**: `generateMainSheet()` (17 cols), `generateRulesSheet()` (rules + config notes), `generateSummarySheet()` (subcategory aggregation)
6. **Step 6 — Output**: Writes 3 TSVs to `intermittent_scraps/` + JSON companion

### Key Internal Constants
- `NAV_MENU_END = 1010` — text position threshold separating nav menu from content area
- `maxQty = -1` → Unlimited, `maxQty = -2` → Required, positive → numeric cap
- `chassisRoot` format: `{chassisLabel} [{baseSKU}]` (e.g. `DL380 Gen12 SFF [P73282-B21]`)

### Component Role Classifier (`getComponentRole`)
Assigns functional roles based on description keywords:
- `Base Chassis`, `Synergy Infrastructure`, `FIO Setting / Preset`
- `CPU / Processor`, `Memory`, `Storage Controller`, `Enablement / Cage`
- `Networking`, `Riser & Expansion`, `Power & Thermal`
- `Fabric & Interconnect`, `Interconnect / Cable`
- `Software & License`, `Hardware Component` (fallback)

---

## Complex Multi-Product Architecture Handling

| Product Family | Example Products | Component Categories & Roles Handled |
|----------------|------------------|---------------------------------------|
| **HPE ProLiant** | DL380, DL360, ML350 | Compute, Memory, Riser Cards, Smart Chassis, Power Supplies, Storage Controllers |
| **HPE Synergy** | 12000 Frame, SY480, SY660 | Frame Link Modules, Compute Modules, Virtual Connect Interconnects, SAS Switch, D3940 Storage Enclosures |
| **HPE Storage** | Alletra 9000/6000, Nimble, StoreOnce | Storage Controllers, Expansion Shelves, SSD/HDD Media Packs, Fibre Channel HBAs |
| **HPE Networking** | Aruba Switches, FlexFabric, Slingshot | Switch Chassis, Line Cards, Transceivers, DAC Cables, Network Management Software |
| **HPE Cray** | Cray EX Cabinets, Liquid Cooled | Cray EX Cabinet, Liquid Cooling Blades, Slingshot Switches, Power Distribution Units (PDUs) |

---

## SKU Data Schema (17 base fields + 5 diff fields planned)

### Base Fields (17)

| # | Field | Description | Example |
|---|-------|-------------|---------|
| 1 | Main Category | Top-level functional group | `Processor` |
| 2 | Sub-Category | Specific component group | `Heatsink Kit` |
| 3 | Hierarchy Path | Full tree path (≥ 3 `>` delimiters) | `HPE OCA > DL380 Gen12 SFF [P73282-B21] > Processor > Heatsink Kit` |
| 4 | Component Role | Functional classification | `Power & Thermal` |
| 5 | Constraint Text | Raw constraint label | `max 2` |
| 6 | Subcategory Max Qty | Numeric limit (`Unlimited`, `Required`, or integer string) | `2` |
| 7 | Table Rule/Note | Configuration rule for this table | `Mixing of Heat sink is not allowed` |
| 8 | Product # | HPE Part Number (extracted via regex) | `P74792-B21` |
| 9 | Description | Full product name | `HPE ProLiant DL380 Gen12 Performance Heat Sink Kit` |
| 10 | Current Qty | Clean integer string (always `/^\d+$/`) | `0` |
| 11 | Unit Price (USD) | List price | `316.00` |
| 12 | Price Delta (USD) | Price delta from baseline | `+18,243.00` |
| 13 | Extended Price (USD) | Qty × Unit Price | `632.00` |
| 14 | Price per GB (USD) | Memory-specific metric | `434.66` |
| 15 | HPE Recommended | HPE recommended flag | `Yes` |
| 16 | Start Date | Availability start | `02/24/2025` |
| 17 | Discontinued Date | End of availability | `06/30/2029` |

### Diff Fields (5 — PLANNED)

| # | Field | Description | Example |
|---|-------|-------------|---------|
| 18 | Diff Status | `ADDED`, `REMOVED`, `PRICE_CHANGED`, `UNCHANGED` | `PRICE_CHANGED` |
| 19 | Previous List Price (USD) | Price from last scrape | `300.00` |
| 20 | Price Change (USD) | Absolute delta | `+16.00` |
| 21 | Price Change (%) | Percentage delta | `+5.33%` |
| 22 | Price History Trail | Cumulative trail | `2026-08-05: $300 → 2026-09-01: $316 (+5.33%)` |

---

## Scripts Reference

| Script | CLI Signature | Purpose |
|--------|---------------|---------|
| `scripts/lib/cdp.js` | N/A (module) | Shared CDP utilities (`sendCommand`, `getOCATarget`, `connectWS`, `sleep`) |
| `scripts/scrape_oca.js` | `node scripts/scrape_oca.js <raw_json_out>` | Initial CDP raw data extractor |
| `scripts/expand_and_rescrape.js` | `node scripts/expand_and_rescrape.js <raw_json_out>` | Expand all DOM sections then re-scrape |
| `scripts/scrape_oca_solution.js` | `node scripts/scrape_oca_solution.js` | Generic E2E solution scraper (auto-detects chassis) |
| `scripts/scrape_oca_storage_solution.js` | `node scripts/scrape_oca_storage_solution.js` | Storage wizard scraper (Alletra/Nimble/MSA) |
| `scripts/build_catalog.js` | `node scripts/build_catalog.js <raw.json> <catalog.json>` | Parse raw JSON → classified catalog JSON + TSVs |
| `scripts/generate_xlsx.js` | `node scripts/generate_xlsx.js <output.xlsx>` | TSVs → multi-sheet Excel workbook |
| `scripts/download_quickspecs_pdf.js` | `node scripts/download_quickspecs_pdf.js <docId> <dest_pdf_path>` | Download + MD5-cache QuickSpecs PDF |
| `scripts/verify_excel_tally.js` | `node scripts/verify_excel_tally.js <output.xlsx>` | Post-flight 6-check audit |
| `scripts/test_pipeline_evals.js` | `node scripts/test_pipeline_evals.js <output.xlsx>` | Pre/in/post-flight eval suite |
| `scripts/demo_qs_vs_menu_cdp.js` | `node scripts/demo_qs_vs_menu_cdp.js` | QuickSpecs vs Menu link visual demo |
| `scripts/live_visual_demo_cdp.js` | `node scripts/live_visual_demo_cdp.js` | Live browser banner demo |

---

## Extending to New Chassis or Product Lines
1. User opens OCA and navigates to the target solution/chassis (authenticated session already open)
2. Determine protocol: **Server** → `npm run scrape` | **Storage Wizard** → `npm run scrape:storage`
3. Script auto-detects family/gen/model from DOM breadcrumbs
4. Run `node scripts/verify_excel_tally.js <output.xlsx>` — all checks must pass
5. Add a row to `outputs/SCRAPED_CATALOGS.md`
6. **No code changes required** — all scripts are fully generic across all HPE product families
