# Master Scraped HPE Product Catalogs Registry

This document is the **single source of truth** for all HPE product catalog intelligence scraped from the OCA portal.
Update this file after every successful scrape or rebuild by running `npm run registry:sync`.

---

## Scraped Product Catalogs

| Date | Solution / Quote | Family | Gen | Chassis Shorthand | SKUs | Excel Workbook | Companion JSON | QuickSpecs PDF Status | Output Directory |
| :--- | :--- | :--- | :--- | :--- | ---: | :--- | :--- | :--- | :--- |
| 2026-08-05 | Alletra Storage System | Alletra | Storage | `Alletra_Storage_System` | **92** | [Alletra_Storage_System_OCA_Catalog.xlsx](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/Alletra/Storage/Alletra_Storage_System/Alletra_Storage_System_OCA_Catalog.xlsx) | [Alletra_Storage_System_Catalog.json](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/Alletra/Storage/Alletra_Storage_System/Alletra_Storage_System_Catalog.json) | [PDF](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/Alletra/Storage/Alletra_Storage_System/HPE_Alletra_Storage_System_QuickSpecs.pdf) | `outputs/Alletra/Storage/Alletra_Storage_System/` |
| 2026-08-05 | GX5000 General RACK | Cray | General | `GX5000_General_RACK` | **46** | [GX5000_General_RACK_OCA_Catalog.xlsx](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/Cray/General/GX5000_General_RACK/GX5000_General_RACK_OCA_Catalog.xlsx) | [GX5000_General_RACK_Catalog.json](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/Cray/General/GX5000_General_RACK/GX5000_General_RACK_Catalog.json) | Advisory (No QS Link) | `outputs/Cray/General/GX5000_General_RACK/` |
| 2026-08-05 | DL380 Gen11 | ProLiant | Gen11 | `DL380_Gen11` | **1253** | [DL380_Gen11_OCA_Catalog.xlsx](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/ProLiant/Gen11/DL380_Gen11/DL380_Gen11_OCA_Catalog.xlsx) | [DL380_Gen11_Catalog.json](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/ProLiant/Gen11/DL380_Gen11/DL380_Gen11_Catalog.json) | [PDF](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/ProLiant/Gen11/DL380_Gen11/HPE_DL380_Gen11_QuickSpecs.pdf) | `outputs/ProLiant/Gen11/DL380_Gen11/` |
| 2026-08-05 | DL380 Gen12 SFF | ProLiant | Gen12 | `DL380_Gen12_SFF` | **951** | [DL380_Gen12_SFF_OCA_Catalog.xlsx](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_OCA_Catalog.xlsx) | [DL380_Gen12_SFF_Catalog.json](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/ProLiant/Gen12/DL380_Gen12_SFF/DL380_Gen12_SFF_Catalog.json) | [PDF](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/ProLiant/Gen12/DL380_Gen12_SFF/HPE_DL380_Gen12_SFF_QuickSpecs.pdf) | `outputs/ProLiant/Gen12/DL380_Gen12_SFF/` |
| 2026-08-05 | MSL3040 Tape | StoreEver | Tape | `MSL3040_Tape` | **85** | [MSL3040_Tape_OCA_Catalog.xlsx](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/StoreEver/Tape/MSL3040_Tape/MSL3040_Tape_OCA_Catalog.xlsx) | [MSL3040_Tape_Catalog.json](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/StoreEver/Tape/MSL3040_Tape/MSL3040_Tape_Catalog.json) | [PDF](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/StoreEver/Tape/MSL3040_Tape/HPE_MSL3040_Tape_QuickSpecs.pdf) | `outputs/StoreEver/Tape/MSL3040_Tape/` |
| 2026-08-05 | SY100Gb F32 Module | Synergy | General | `SY100Gb_F32_Module` | **141** | [SY100Gb_F32_Module_OCA_Catalog.xlsx](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/Synergy/General/SY100Gb_F32_Module/SY100Gb_F32_Module_OCA_Catalog.xlsx) | [SY100Gb_F32_Module_Catalog.json](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/Synergy/General/SY100Gb_F32_Module/SY100Gb_F32_Module_Catalog.json) | [PDF](file:///Users/macbookaira1466/Downloads/booktoSkill/outputs/Synergy/General/SY100Gb_F32_Module/HPE_Synergy_12000_Frame_QuickSpecs.pdf) | `outputs/Synergy/General/SY100Gb_F32_Module/` |

---

## Portfolio Summary Metrics

- **Certified Product Lines**: **6 product chassis / modules** across 5 distinct HPE families (`ProLiant`, `Alletra`, `StoreEver`, `Cray`, `Synergy`)
- **Total Extracted Catalog Intelligence**: **2,568 unique SKUs**
- **Verified QuickSpecs PDFs**: **5 PDF documents** (MD5 fingerprints cached, up to 2.06 MB each)
- **Post-Flight Quality Audit Status**: ✅ **100% PASS** on all audits via `npm test` (`scripts/verify_all.js`)

---

## Directory Organization Standard

All outputs live under `outputs/` and are organized by **Family → Generation → Model_FormFactor**.
No output files ever go to the project root.

```
outputs/
├── SCRAPED_CATALOGS.md                    ← this file (master registry)
├── ProLiant/
│   ├── Gen12/
│   │   └── DL380_Gen12_SFF/               ← HPE ProLiant DL380 Gen12 SFF (951 SKUs)
│   └── Gen11/
│       └── DL380_Gen11/                   ← HPE ProLiant DL380 Gen11 (1,253 SKUs)
├── Alletra/
│   └── Storage/
│       └── Alletra_Storage_System/        ← HPE Alletra Storage System (92 SKUs)
├── StoreEver/
│   └── Tape/
│       └── MSL3040_Tape/                  ← HPE StoreEver MSL3040 Tape Library (85 SKUs)
├── Cray/
│   └── General/
│       └── GX5000_General_RACK/           ← HPE Cray Supercomputing GX5000 Rack (46 SKUs)
└── Synergy/
    └── General/
        └── SY100Gb_F32_Module/            ← HPE Synergy VC 100Gb F32 Module (141 SKUs + QuickSpecs PDF)
```

---

## CTO vs Base SKU Normalization Standard (Rule #30)

- **Base SKU Extraction**: Suffixes `CTO` (Configure-To-Order), `BTO` (Build-To-Order), and `FIO` (Factory Integrated Option) are automatically stripped from part numbers.
- **Option Type Schema Column**: Every SKU row records `Option Type` = `CTO`, `BTO`, `FIO`, or `Standard`.
- **Example**: `S2S05ACTO` → `Product #`: `S2S05A`, `Option Type`: `CTO`.
