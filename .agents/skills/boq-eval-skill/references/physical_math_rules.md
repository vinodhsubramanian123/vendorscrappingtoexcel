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
