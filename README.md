# HPE OCA Product Catalog Intelligence Pipeline

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org/)
[![CDP](https://img.shields.io/badge/Protocol-Chrome_DevTools_Protocol_9222-blue.svg)](https://chromedevtools.github.io/devtools-protocol/)
[![HPE OCA](https://img.shields.io/badge/Target-HPE_Online_Configuration_Application-orange.svg)](https://oca.ext.hpe.com)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20Mint%20%7C%20Windows-blue.svg)]()

A high-performance, zero-hardcoding scraper and intelligence classification engine for the **HPE Online Configuration Application (OCA)** portal.

Generates multi-sheet Excel workbooks, structured JSON companions, TSV intermediates, and QuickSpecs PDF archives for import into **Google Notebook LM** and the **Vendor BOM Comparison Engine**.

---

## ⚡ Quick Start & Cross-Platform Prerequisites

### 1. Prerequisites
- **Node.js ≥ 18**
- Run `npm install` (installs `ws`, `xlsx`, and `xlsx-js-style`)
- Chrome or Chromium browser running with Remote Debugging enabled on port 9222

### 2. Browser Launch Command (CDP Port 9222)

Before running scrapers, open your browser with remote debugging on port 9222:

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

**Linux Mint / Ubuntu / Fedora:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
# or for Chromium:
chromium-browser --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug
```

**Windows (PowerShell):**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-debug"
```

**Windows (cmd.exe):**
```cmd
chcp 65001
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-debug"
```

> **Note**: Log into the HPE Partner Portal (`https://partner.hpe.com`) in the launched browser window, then navigate to your target chassis configuration quote in OCA.

### 3. Single-Command Integrated Run
Navigate to the target chassis or solution in OCA, then run:

```bash
# For ProLiant / Synergy / Compute Server Solutions:
npm run scrape

# For Alletra / Nimble / StoreOnce / MSA Storage Solutions:
npm run scrape:storage
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
│           ├── history/                   ← PLANNED: diff snapshots
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

**Planned diff fields (18-22)**: `Diff Status`, `Previous List Price (USD)`, `Price Change (USD)`, `Price Change (%)`, `Price History Trail`

---

## 🛡️ Data Quality Guardrails & Audit Assertions

Run `node scripts/verify_excel_tally.js <output_xlsx_path>` to verify all post-flight assertions:

1. ✅ Excel workbook, JSON companion, and QuickSpecs PDF exist.
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
| `scripts/scrape_oca_solution.js` | **Integrated E2E solution scraper** | `npm run scrape` |
| `scripts/scrape_oca_storage_solution.js` | **Storage wizard E2E scraper** | `npm run scrape:storage` |
| `scripts/scrape_oca.js` | Raw CDP data extractor | `node scripts/scrape_oca.js <raw_out.json>` |
| `scripts/expand_and_rescrape.js` | Expand DOM sections + height assertion + rescrape | `node scripts/expand_and_rescrape.js <raw_out.json>` |
| `scripts/build_catalog.js` | Parse raw JSON → catalog JSON + TSVs | `node scripts/build_catalog.js <raw.json> <catalog.json> [--verbose]` |
| `scripts/generate_xlsx.js` | TSVs → multi-sheet Excel workbook | `node scripts/generate_xlsx.js <output.xlsx>` |
| `scripts/download_quickspecs_pdf.js` | Download + MD5-cache QuickSpecs PDF | `node scripts/download_quickspecs_pdf.js <docId> <pdf_dest>` |
| `scripts/verify_excel_tally.js` | Post-flight audit | `node scripts/verify_excel_tally.js <output.xlsx>` |
| `scripts/test_pipeline_evals.js` | Pre/in/post-flight evaluation suite | `node scripts/test_pipeline_evals.js <output.xlsx>` |
| `scripts/demo_qs_vs_menu_cdp.js` | QuickSpecs link vs Menu link visual demo | `npm run demo:qs` |
| `scripts/live_visual_demo_cdp.js` | Live visual verification browser demo | `npm run demo:live` |

---

## 🔗 Downstream Integration

This pipeline feeds into:
1. **Google Notebook LM**: Import `*_Catalog.json` for AI-powered product intelligence Q&A
2. **Vendor BOM Comparison Engine** (separate workspace): Import Excel workbooks for cross-vendor BOM validation, physical saturation audits, and DAG-based compatibility rule enforcement
3. **Price Tracking Dashboard** *(planned)*: Historical `price_history.json` enables trend analysis and procurement optimization
