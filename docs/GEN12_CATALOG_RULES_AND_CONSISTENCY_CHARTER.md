# HPE Gen12 Catalog Intelligence & Configuration Consistency Charter

This charter defines the master configuration rules, component precedence rankings, thermal saturation mathematics, support service pricing standards, and pre/post-flight quality assertions for HPE ProLiant Gen12 and sister product lines (Gen11, Synergy, Alletra, Cray).

It is designed to serve as both an **operational guide for catalog scrapers/auditors** and a **reusable System Prompt Template** to paste into new Gemini Notebooks to ensure 100% data consistency across product generations.

---

## 📋 1. Reusable System Prompt Template for New Gemini Notebooks

> **Copy and paste the block below into the System Instructions or Chat Goal of any new Gemini Notebook (Gen12, Gen11, Alletra, Synergy) to enforce grounded catalog intelligence:**

```markdown
# SYSTEM INSTRUCTIONS: HPE CATALOG INTELLIGENCE & BOM VALIDATION AGENT

You are an expert HPE Solutions Architect and BOM Compliance Engine. You operate strictly under a 5-Tier Priorities Charter:

RANK 1: CUSTOMER INTENT & MANDATORY WORKLOAD REQUIREMENTS
- Never suggest downgrading CPU core counts, memory capacity, or GPU acceleration requested by the user.

RANK 2: PHYSICAL & THERMAL SATURATION MATHEMATICS
- Dual-CPU systems must mirror heatsink types across CPU1 and CPU2.
- High TDP CPUs (> 250W) or GPU configurations REQUIRE High Performance Fan Kits and High Performance Heatsinks. Standard fans are strictly prohibited for high TDP / GPU configs.

RANK 3: STRICT GROUNDING SAFEGUARDS & ZERO HALLUCINATION
- Base all part numbers, unit prices, descriptions, and rules ONLY on uploaded catalog sources (*.csv, *.json, QuickSpecs PDF). Never invent non-existent HPE SKUs or prices.

RANK 4: MEMORY MIXING & CHANNEL BALANCING RULES
- Do NOT mix x4 and x8 DIMMs.
- Do NOT mix 3DS and non-3DS DIMMs.
- 96GB and 128GB DIMMs CANNOT be mixed with any other memory capacity.
- Memory must be populated symmetrically across all memory channels.

RANK 5: POWER SUPPLY REDUNDANCY & CABLE MATCHING
- Power supplies must be 100% identical in wattage and efficiency (no mixing AC/DC or different wattages).
- Selection of AC Power Supplies restricts cord options strictly to AC Power Cords.
- 48VDC Power Supply Kits require matching DC Lug Kits (e.g. P36877-B21 with P17023-B21).
```

---

## ⚙️ 2. Gen12 Configuration Rules & Compatibility Taxonomy

### A. Processor & Thermal Management Rules
| Subcategory | Constraint | Configuration Rule / Restriction | Operational Impact |
|---|---|---|---|
| **Processor** | `max 2` | Maximum 2 CPUs per dual-socket node. Single-CPU builds require Socket 1 population only. | Enforce CPU1 socket population prior to CPU2. |
| **Heatsink Kit** | `max 2` | `Mixing of Heat sink is not allowed.` Both sockets must use identical heatsink SKUs. | Prevent mixing standard performance and high-performance heatsinks. |
| **Cooling Fans** | `max 7` | High TDP processors (> 250W) and GPU accelerators require High Performance Fans. | Auto-upgrade fan selection when GPU or high TDP CPU is selected. |

### B. Memory Mixing & Channel Balance Rules
| Memory Capacity / Type | Constraint | Rule Text | Strict Validation Rule |
|---|---|---|---|
| **Memory General** | `max 32` | `These products are hidden due to Supply constraints` | Check active availability flags before selection. |
| **x4 vs x8 DIMMs** | `max 32` | `Mixing of x4 and x8 memory is not allowed` | Reject BOMs containing mixed bit-width DIMMs. |
| **96GB DIMMs** | `max 32` | `96GB Memory cannot be mixed with any other Memory.` | 96GB DIMMs must occupy 100% of populated slots. |
| **128GB DIMMs** | `max 32` | `128GB Memory cannot be mixed with any other Memory.` | 128GB DIMMs must occupy 100% of populated slots. |
| **3DS DIMMs** | `max 32` | `Mixing of 3DS and non 3DS memory is not allowed.` | Separate 3DS registered DIMMs from standard RDIMMs. |

### C. Chassis, Storage & Controller Rules
| Category | Subcategory | Rule Text | Enforcement |
|---|---|---|---|
| **Smart Chassis** | Drive Cage | `Supported with 8LFF and 12LFF CTO Server only.` | Validate drive cage choice against chassis form factor. |
| **Smart Chassis** | SAS Controller | `Supported with EDSFF CTO Server only.` | Prevent assigning EDSFF tri-mode controllers to standard LFF backplanes. |
| **Smart Chassis** | Ambient Temp | `Define connection for 8SFF x4 Cage only needed if cage is selected.` | Cable optional backplanes only when physical cage is present. |
| **Riser Cards** | Tertiary Riser | `Tertiary x8x16 Riser and OCPA x16/ CPU1 OCPB x8 cannot be selected together.` | Detect PCIe lane allocation conflicts on CPU1 bus. |

### D. Power & Ambient Temperature Rules
| Category | Rule Text | Resolution / Action |
|---|---|---|
| **Power Supplies** | `Mixing of Power supplies are not allowed.` | Force identical SKU for PS1 and PS2 redundancy. |
| **Power Cords** | `If AC Power Supply is selected then only AC Power Cords should be in the drop-down.` | Filter power cord dropdown dynamically based on power supply input type (AC vs DC). |
| **DC Cables** | `HPE 1600W -48VDC Pwr Cbl Lug Kit(P36877-B21) Supported only with HPE 1600W FS -48VDC Ht Plg PS Kit (P17023-B21).` | Require lug kit P36877-B21 whenever P17023-B21 DC power supply is configured. |
| **Thermal / GPU** | `RTX Pro 6000/ RTX Pro 6000D/ H200 NVL GPU and 30C Ambient Temperature cannot be selected together.` | Restrict max ambient operating temp to 25°C when enterprise GPU accelerators are present. |

### E. Manufacturing & Model Constraints
| Rule | Description | Impact |
|---|---|---|
| `BTO products are not allowed in CTO Base Model.` | BTO (Build-to-Order) fixed SKUs cannot be inserted into CTO (Configure-to-Order) dynamic chassis quotes. | Enforce `-B21` / `-B21#0D1` CTO option mode suffixes. |
| `Minimum 1 of any of the OS SKUs must be selected.` | Server quotes require an operating system choice or explicit OS-No-Selection tracking SKU. | Flag missing OS selection during pre-flight check. |

---

## 💰 3. Support Services & Chassis Pricing Taxonomy

1. **Chassis Base Models**:
   - Chassis SKUs carry base list prices (e.g. `DL380 Gen12 SFF CTO Server Base` or `DL380 Gen12 12EDSFF CTO Server`).
   - Standard shorthand formatting: `outputs/{Family}/{Gen}/{Model}_{FormFactor}/`.
2. **HPE Pointnext / Tech Care Support Services**:
   - **Basic Support**: 3-Year 9x5 Next Business Day (NBD).
   - **Essential Support**: 3-Year 24x7 4-Hour Onsite Response.
   - **Critical Support**: 3-Year 24x7 6-Hour Call-to-Repair (CTR).
   - Support service SKUs must be linked to the primary server hardware chassis node path (`HPE OCA > {Model} > Support Services`).

---

## 🛡️ 4. Pre & Post-Flight Quality Audit Rules (Pipeline Immunity)

To guarantee zero data corruption across scraping runs:

1. **Numeric Current Qty Assertion**:
   - `Current Qty` MUST pass `/^\d+$/` on 100% of SKUs (zero string pollution like `"90\n\t\tS0W16AAE"`).
2. **Hierarchy Path Assertion**:
   - Every SKU MUST contain a 4-level context path with at least 3 `>` delimiters (`HPE OCA > {Model} > {Category} > {Subcategory}`).
3. **Tombstone & Price Diff Tracking**:
   - SKUs removed in newer scrapes MUST persist as tombstones tagged `REMOVED` with red font strikethrough in Excel (`#FDE7E7`).
   - Price changes MUST be tagged `PRICE_CHANGED` with amber font (`#FFF3E0`) and logged in `history/price_history.json`.
4. **QuickSpecs PDF Integrity**:
   - QuickSpecs PDF must be > 500 KB with MD5 fingerprint caching to prevent unnecessary re-downloads.

---

## 🚀 5. Browser Automation & Popup Immunity (100% Hands-Free)

To prevent browser permission popups or "Allow" dialogs from slowing down scraping automation:

1. **Chrome CLI Launch Flags**:
   - `--deny-permission-prompts`
   - `--disable-notifications`
   - `--disable-popup-blocking`
   - `--no-first-run`
   - `--no-default-browser-check`
2. **CDP Automatic Dialog Interception (`scripts/lib/cdp.js`)**:
   - Listens for `Page.javascriptDialogOpening` and auto-accepts via `Page.handleJavaScriptDialog({ accept: true })`.
   - Automatically executes `dismissDOMModals()` to click session extension prompts (`"Continue session"`) and modal confirm buttons (`"Proceed"`, `"OK"`, `"Continue"`).
