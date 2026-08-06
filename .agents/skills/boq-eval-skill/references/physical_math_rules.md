# Modular 6-Aspect Physical Math & 5-Level Conflict Graph Reference Guide

## 1. Physical Math Formulas

### Aspect 1: Compute & Thermal Math
- **TDP Threshold Rule**: $\text{Max CPU TDP Watts} \ge 240\text{W} \implies \text{High-Performance Fan Kit mandatory}$ (`P48820-B21`).
- **Heatsink Rule**: Each CPU socket requires a high-performance or standard heatsink (`P74792-B21`).

### Aspect 2: Memory & Channel Math
- **Population Rule**: $\text{Total DIMMs} \le 32$ per 2-socket server node.
- **Symmetric Channel Rule**: 8 memory channels per CPU socket; recommended population is 8 or 16 DIMMs per socket (1DPC / 2DPC).

### Aspect 3: Storage & Tri-Mode Interconnect Math
- **Box 1/2 Cable Rule**: $\text{Tri-Mode Controller} + \text{Front Drive Box 1/2} \implies \text{Dedicated Cable Kit mandatory}$ (`P76453-B21`).
- **Smart Storage Battery Rule**: Storage controller write-cache requires Smart Battery (`P01366-B21`).

### Aspect 4: PCIe Slot Capacity & Riser Math
- **Riser Expansion Rule**: $\text{Required PCIe Cards} > \text{Available Base Slots} \implies \text{Secondary/Tertiary Riser mandatory}$.
- **CPU 2 Allocation**: Secondary/Tertiary risers require 2nd CPU socket populated.

### Aspect 5: Power & Environmental Math
- **DC Power Terminal Rule**: $\text{-48VDC Power Supply} \implies \text{DC Power Cable Lug Kit mandatory}$ (`P36877-B21`).

---

## 2. 5-Level Rule Hierarchy Taxonomy

| Level | Scope | Example Rule |
|---|---|---|
| **VENDOR** | Partner portal & account restrictions | `BTO products are not allowed in CTO Base Model.` |
| **CHASSIS** | Form-factor gates (SFF/LFF/EDSFF) | `Supported with EDSFF CTO Server only.` |
| **CATEGORY** | Category-wide mutual exclusions | `Mixing of x4 and x8 memory is not allowed.` |
| **SUBCATEGORY** | Slot limits and required components | `max 32` DIMMs, `required` Support Service |
| **SKU** | Direct part pairings | `Lug Kit P36877-B21 required for -48VDC PSU P17023-B21` |

---

## 3. Pointnext Support SKU & Suffix Code Taxonomy

### Modular SKU Construction
$$\text{Product \# (SKU)} = \text{Parent Service Family Code} + \text{Chassis Product Suffix Code}$$

- **Parent Service Family Code**: `HU4A6A5` (5Y Tech Care Essential), `H7J34A3` (3Y Tech Care Basic), `HS7Y7E` (5Y Tech Care Basic), `H67B8E` (4Y Tech Care Critical), `H30ZCE` (3Y Complete Care).
- **Chassis Product Suffix Matrix**:
  - `00DJ` = HPE ProLiant DL360 Gen11 (1U Rack) ➔ `HU4A6A500DJ`
  - `00DK` = HPE ProLiant DL380 Gen11 (2U Rack) ➔ `HU4A6A500DK`
  - `0C4U` = HPE ProLiant DL360 Gen12 (1U Rack) ➔ `HU4A6A50C4U`
  - `0C4V` = HPE ProLiant DL380 Gen12 (2U Rack) ➔ `HU4A6A50C4V`

### Dynamic Support Pricing Scaling Formula
$$\text{Support List Price} = \text{Base Chassis Support} + (\text{CPU TDP Factor} \times N_{\text{CPU}}) + (\text{RAM GB Factor} \times \text{RAM}_{\text{GB}}) + \text{Storage Factor}$$

